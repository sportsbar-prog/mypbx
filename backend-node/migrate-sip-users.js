#!/usr/bin/env node

/**
 * Migration script to move existing SIP users from config files to database
 */

require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_URL = process.env.DATABASE_URL || "postgresql://ari_user:password@localhost/ari_api";
const ASTERISK_CONFIG_DIR = process.env.ASTERISK_CONFIG_DIR || '/etc/asterisk';

const db = new Pool({
  connectionString: DB_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Parse SIP users from pjsip.conf
function parsePjsipUsers(content) {
  const sectionsByName = {};
  let current = null;

  const pushSection = () => {
    if (!current) return;
    const { name, type, data } = current;
    if (!sectionsByName[name]) sectionsByName[name] = [];
    sectionsByName[name].push({ type, data });
  };

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      pushSection();
      current = { name: sectionMatch[1], type: 'unknown', data: {} };
      continue;
    }

    const kv = line.match(/^([^=]+)=(.*)$/);
    if (kv && current) {
      const key = kv[1].trim();
      const val = kv[2].trim();
      if (key === 'type') current.type = val.toLowerCase();
      current.data[key] = val;
    }
  }
  pushSection();

  const users = [];
  for (const name of Object.keys(sectionsByName)) {
    const entries = sectionsByName[name];
    const endpoint = entries.find(e => e.type === 'endpoint');
    if (!endpoint) continue;

    // Skip trunks
    const hasRegistration = entries.some(e => e.type === 'registration');
    if (hasRegistration) continue;

    const authName = endpoint.data.auth || `${name}-auth`;
    const aorNameRaw = endpoint.data.aors || endpoint.data.aor || `${name}`;
    const aorName = aorNameRaw.split(',')[0].trim();

    const authEntries = sectionsByName[authName] || [];
    const aorEntries = sectionsByName[aorName] || sectionsByName[name] || [];
    const auth = authEntries.find(e => e.type === 'auth')?.data || {};
    const aor = aorEntries.find(e => e.type === 'aor')?.data || {};

    users.push({
      username: auth.username || name,
      secret: auth.password || '',
      extension: name,
      context: endpoint.data.context || 'default',
      codecs: endpoint.data.allow || 'ulaw,alaw',
      max_contacts: parseInt(aor.max_contacts || '1') || 1,
      qualify_frequency: parseInt(aor.qualify_frequency || '30') || 30,
      transport: endpoint.data.transport || 'transport-udp',
      template_type: 'basic_user',
      callerid: endpoint.data.callerid || `${name} <${name}>`,
      voicemail: '',
      call_limit: 5,
      is_active: true
    });
  }

  return users;
}

async function migrateUsers() {
  const client = await db.connect();
  try {
    console.log('🔄 Starting SIP users migration...\n');

    // Read existing pjsip_users.conf
    const PJSIP_USERS = path.join(ASTERISK_CONFIG_DIR, 'pjsip_users.conf');
    let content = '';
    
    try {
      content = fs.readFileSync(PJSIP_USERS, 'utf8');
      console.log(`✅ Read ${PJSIP_USERS}\n`);
    } catch (err) {
      console.log(`ℹ️  No existing pjsip_users.conf found, skipping migration\n`);
      return;
    }

    const users = parsePjsipUsers(content);
    console.log(`📊 Found ${users.length} SIP users in config file\n`);

    if (users.length === 0) {
      console.log('✨ No users to migrate\n');
      return;
    }

    // Insert users into database
    let inserted = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        await client.query(
          `INSERT INTO sip_users (username, secret, extension, context, codecs, max_contacts, qualify_frequency, transport, template_type, callerid, voicemail, call_limit, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (username) DO NOTHING`,
          [
            user.username,
            user.secret,
            user.extension,
            user.context,
            user.codecs,
            user.max_contacts,
            user.qualify_frequency,
            user.transport,
            user.template_type,
            user.callerid,
            user.voicemail,
            user.call_limit,
            user.is_active
          ]
        );
        inserted++;
        console.log(`  ✅ Migrated: ${user.username}`);
      } catch (err) {
        if (err.message.includes('duplicate')) {
          skipped++;
          console.log(`  ⏭️  Skipped (already exists): ${user.username}`);
        } else {
          console.error(`  ❌ Error migrating ${user.username}:`, err.message);
        }
      }
    }

    console.log(`\n📈 Migration Summary:`);
    console.log(`   Total found: ${users.length}`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`\n✨ Migration complete!`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

migrateUsers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
