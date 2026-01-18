#!/usr/bin/env node

/**
 * Database initialization and migration script
 * Applies schema updates including per-second billing columns
 */

require("dotenv").config();
const { Pool } = require("pg");

const DB_URL = process.env.DATABASE_URL || "postgresql://ari_user:change_me@localhost:5432/ari_api";

const db = new Pool({
  connectionString: DB_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  const client = await db.connect();
  try {
    console.log('🔧 Starting database migrations...\n');

    // Migration 1: Add rate_per_second to api_keys if not exists
    console.log('📝 Migration 1: Adding rate_per_second column to api_keys...');
    try {
      await client.query(`
        ALTER TABLE api_keys
        ADD COLUMN rate_per_second NUMERIC(12,6) DEFAULT 0;
      `);
      console.log('✅ Added rate_per_second column to api_keys\n');
    } catch (err) {
      if (err.message.includes('column "rate_per_second" of relation "api_keys" already exists')) {
        console.log('ℹ️  rate_per_second column already exists in api_keys\n');
      } else {
        throw err;
      }
    }

    // Migration 2: Add bill_seconds to call_logs if not exists
    console.log('📝 Migration 2: Adding bill_seconds column to call_logs...');
    try {
      await client.query(`
        ALTER TABLE call_logs
        ADD COLUMN bill_seconds INTEGER;
      `);
      console.log('✅ Added bill_seconds column to call_logs\n');
    } catch (err) {
      if (err.message.includes('column "bill_seconds" of relation "call_logs" already exists')) {
        console.log('ℹ️  bill_seconds column already exists in call_logs\n');
      } else {
        throw err;
      }
    }

    // Migration 3: Add bill_cost to call_logs if not exists
    console.log('📝 Migration 3: Adding bill_cost column to call_logs...');
    try {
      await client.query(`
        ALTER TABLE call_logs
        ADD COLUMN bill_cost NUMERIC(14,6);
      `);
      console.log('✅ Added bill_cost column to call_logs\n');
    } catch (err) {
      if (err.message.includes('column "bill_cost" of relation "call_logs" already exists')) {
        console.log('ℹ️  bill_cost column already exists in call_logs\n');
      } else {
        throw err;
      }
    }

    // Migration 4: Ensure credits is NUMERIC in api_keys
    console.log('📝 Migration 4: Checking credits column type in api_keys...');
    try {
      const result = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'credits';
      `);
      if (result.rows.length > 0) {
        const dataType = result.rows[0].data_type;
        if (dataType !== 'numeric') {
          console.log(`⚠️  Credits column is ${dataType}, should be NUMERIC. Converting...`);
          await client.query(`
            ALTER TABLE api_keys
            ALTER COLUMN credits TYPE NUMERIC(14,6);
          `);
          console.log('✅ Converted credits column to NUMERIC(14,6)\n');
        } else {
          console.log('ℹ️  credits column is already NUMERIC\n');
        }
      }
    } catch (err) {
      console.error('⚠️  Error checking credits column:', err.message);
    }

    console.log('✨ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function createSipUsersTable() {
  const client = await db.connect();
  try {
    console.log('\n🔧 Creating sip_users table...\n');

    // Check if table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'sip_users'
      );
    `);

    if (tableExists.rows[0].exists) {
      console.log('ℹ️  sip_users table already exists\n');
      return;
    }

    // Create sip_users table
    await client.query(`
      CREATE TABLE sip_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        secret VARCHAR(100) NOT NULL,
        extension VARCHAR(20) NOT NULL,
        context VARCHAR(50) DEFAULT 'default',
        codecs VARCHAR(200) DEFAULT 'ulaw,alaw',
        max_contacts INTEGER DEFAULT 1,
        qualify_frequency INTEGER DEFAULT 30,
        transport VARCHAR(50) DEFAULT 'transport-udp',
        template_type VARCHAR(50) DEFAULT 'basic_user',
        callerid VARCHAR(100),
        voicemail VARCHAR(100),
        call_limit INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_template_type CHECK (template_type IN ('basic_user', 'advanced_user', 'mobile_user', 'webrtc_user'))
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX idx_sip_users_username ON sip_users(username);
      CREATE INDEX idx_sip_users_extension ON sip_users(extension);
      CREATE INDEX idx_sip_users_active ON sip_users(is_active);
    `);

    // Create trigger for updated_at
    await client.query(`
      CREATE TRIGGER update_sip_users_updated_at 
      BEFORE UPDATE ON sip_users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✅ sip_users table created successfully\n');
  } catch (error) {
    console.error('❌ Error creating sip_users table:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations and then create sip_users table
(async () => {
  try {
    await runMigrations();
    await createSipUsersTable();
    console.log('\n✨ Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:', error.message);
    process.exit(1);
  }
})();
