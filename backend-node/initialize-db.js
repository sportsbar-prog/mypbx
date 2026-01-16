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
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    db.end();
  }
}

runMigrations();
