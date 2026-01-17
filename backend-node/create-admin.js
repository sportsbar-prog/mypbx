#!/usr/bin/env node

/**
 * Create default admin user for Asterisk Backend
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const DB_URL = process.env.DATABASE_URL || "postgresql://ari_user:mypass@localhost:5432/ari_api";

const db = new Pool({
  connectionString: DB_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createAdminUser() {
  console.log('🔧 Creating default admin user...\n');
  
  const username = 'admin';
  const password = 'admin123';
  const email = 'admin@localhost';
  
  try {
    // Check if admin user already exists
    const existing = await db.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );
    
    if (existing.rows.length > 0) {
      console.log('ℹ️  Admin user already exists');
      console.log(`   Username: ${username}`);
      console.log(`   ID: ${existing.rows[0].id}`);
      console.log(`   Email: ${existing.rows[0].email}`);
      console.log(`   Active: ${existing.rows[0].is_active}`);
      console.log('');
      
      // Update password anyway
      console.log('🔄 Updating password to: admin123');
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE admins SET password_hash = $1, is_active = true WHERE username = $2',
        [hashedPassword, username]
      );
      console.log('✅ Password updated successfully\n');
    } else {
      // Create new admin user
      console.log('➕ Creating new admin user...');
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const result = await db.query(
        `INSERT INTO admins (username, email, password_hash, is_active) 
         VALUES ($1, $2, $3, true) 
         RETURNING id, username, email`,
        [username, email, hashedPassword]
      );
      
      console.log('✅ Admin user created successfully');
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Username: ${result.rows[0].username}`);
      console.log(`   Email: ${result.rows[0].email}`);
      console.log('');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ Admin Credentials:');
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

createAdminUser();
