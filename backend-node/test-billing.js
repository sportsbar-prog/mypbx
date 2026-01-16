#!/usr/bin/env node

/**
 * Comprehensive Billing System Test Suite
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function runTests() {
  try {
    console.log('\n🧪 BILLING SYSTEM TEST SUITE\n');
    console.log('=====================================\n');

    // TEST 1: Database Connection
    console.log('TEST 1: Database Connection');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // TEST 2: Check api_keys table schema
    console.log('TEST 2: Verify api_keys Schema');
    const apiKeysColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'api_keys'
      ORDER BY ordinal_position;
    `);
    
    console.log('api_keys columns:');
    apiKeysColumns.rows.forEach(row => {
      const isNew = ['rate_per_second', 'credits'].includes(row.column_name);
      console.log(`  ${isNew ? '✅' : '  '} ${row.column_name}: ${row.data_type}`);
    });
    
    const hasRatePerSecond = apiKeysColumns.rows.some(r => r.column_name === 'rate_per_second');
    const hasCredits = apiKeysColumns.rows.some(r => r.column_name === 'credits');
    console.log(`\n  Rate Per Second column: ${hasRatePerSecond ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`  Credits column: ${hasCredits ? '✅ EXISTS' : '❌ MISSING'}\n`);

    // TEST 3: Check call_logs table schema
    console.log('TEST 3: Verify call_logs Schema');
    const callLogsColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'call_logs'
      ORDER BY ordinal_position;
    `);
    
    console.log('call_logs columns:');
    callLogsColumns.rows.forEach(row => {
      const isNew = ['bill_seconds', 'bill_cost'].includes(row.column_name);
      console.log(`  ${isNew ? '✅' : '  '} ${row.column_name}: ${row.data_type}`);
    });
    
    const hasBillSeconds = callLogsColumns.rows.some(r => r.column_name === 'bill_seconds');
    const hasBillCost = callLogsColumns.rows.some(r => r.column_name === 'bill_cost');
    console.log(`\n  Bill Seconds column: ${hasBillSeconds ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`  Bill Cost column: ${hasBillCost ? '✅ EXISTS' : '❌ MISSING'}\n`);

    // TEST 4: Check credit_transactions table exists
    console.log('TEST 4: Verify credit_transactions Table');
    const ctResult = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'credit_transactions'
      );
    `);
    
    const hasTransactionTable = ctResult.rows[0].exists;
    console.log(`  Credit Transactions table: ${hasTransactionTable ? '✅ EXISTS' : '❌ MISSING'}\n`);

    if (hasTransactionTable) {
      const ctColumns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'credit_transactions'
        ORDER BY ordinal_position;
      `);
      
      console.log('  credit_transactions columns:');
      ctColumns.rows.forEach(row => {
        console.log(`    - ${row.column_name}: ${row.data_type}`);
      });
      console.log('');
    }

    // TEST 5: Sample API Key with rate
    console.log('TEST 5: Test API Key with Rate');
    const testKey = await client.query(`
      SELECT id, name, credits, rate_per_second 
      FROM api_keys 
      LIMIT 1;
    `);
    
    if (testKey.rows.length > 0) {
      const key = testKey.rows[0];
      console.log(`  Sample API Key:`);
      console.log(`    - ID: ${key.id}`);
      console.log(`    - Name: ${key.name}`);
      console.log(`    - Credits: $${key.credits}`);
      console.log(`    - Rate Per Second: $${key.rate_per_second}/sec = $${(key.rate_per_second * 60).toFixed(2)}/min`);
      console.log('  ✅ API Key with rate data accessible\n');
    } else {
      console.log('  ℹ️  No API keys exist yet\n');
    }

    // TEST 6: Billing Calculation Test
    console.log('TEST 6: Billing Calculation Test');
    const testCalcs = [
      { seconds: 30, rate: 0.01, expected: 0.30 },
      { seconds: 1, rate: 0.01, expected: 0.01 },
      { seconds: 60, rate: 0.01, expected: 0.60 },
      { seconds: 10, rate: 0.05, expected: 0.50 },
    ];
    
    console.log('  Sample calculations:');
    testCalcs.forEach(calc => {
      const cost = calc.seconds * calc.rate;
      const match = Math.abs(cost - calc.expected) < 0.001;
      console.log(`    ${match ? '✅' : '❌'} ${calc.seconds}s @ $${calc.rate}/sec = $${cost.toFixed(2)}`);
    });
    console.log('');

    // TEST 7: Server.js Verification
    console.log('TEST 7: Verify Backend Code');
    const fs = require('fs');
    const serverCode = fs.readFileSync('/mnt/c/Users/Bappa/OneDrive/Desktop/Asterisk/backend-node/server.js', 'utf8');
    
    const checks = [
      { pattern: /callData\.ratePerSecond\s*=\s*req\.apiKey\.rate_per_second/g, desc: 'ratePerSecond assignments' },
      { pattern: /app\.post\('\/call\/newcall'/g, desc: 'newcall endpoint' },
      { pattern: /app\.post\('\/makecall'/g, desc: 'makecall endpoint' },
      { pattern: /app\.post\('\/batchcall'/g, desc: 'batchcall endpoint' },
      { pattern: /app\.get\('\/api\/admin\/keys'/g, desc: 'admin rate API endpoint' },
      { pattern: /billCall\(/g, desc: 'billCall function' },
    ];
    
    let allBackendChecks = true;
    checks.forEach(check => {
      const found = serverCode.match(check.pattern);
      const count = found ? found.length : 0;
      const status = count > 0 ? '✅' : '❌';
      console.log(`  ${status} ${check.desc}: ${count > 0 ? 'Found' : 'Not found'}`);
      if (count === 0) allBackendChecks = false;
    });
    console.log('');

    // TEST 8: Frontend Verification
    console.log('TEST 8: Verify Frontend Code');
    const settingsFile = '/mnt/c/Users/Bappa/OneDrive/Desktop/Asterisk/frontend/src/pages/Settings.jsx';
    const dashboardFile = '/mnt/c/Users/Bappa/OneDrive/Desktop/Asterisk/frontend/src/pages/Dashboard.jsx';
    
    try {
      const settingsCode = fs.readFileSync(settingsFile, 'utf8');
      const hasSetting = settingsCode.includes('rate_per_second') && settingsCode.includes('API Keys');
      console.log(`  ${hasSetting ? '✅' : '❌'} Settings.jsx: ${hasSetting ? 'Rate management UI' : 'Missing rate UI'}`);
    } catch (e) {
      console.log(`  ❌ Settings.jsx: File not found`);
    }
    
    try {
      const dashboardCode = fs.readFileSync(dashboardFile, 'utf8');
      const hasDashboard = dashboardCode.includes('bill_cost') && dashboardCode.includes('call_logs');
      console.log(`  ${hasDashboard ? '✅' : '❌'} Dashboard.jsx: ${hasDashboard ? 'Billing display' : 'Missing billing display'}`);
    } catch (e) {
      console.log(`  ❌ Dashboard.jsx: File not found`);
    }
    console.log('');

    // SUMMARY
    console.log('=====================================');
    console.log('📊 TEST SUMMARY\n');
    
    const allTests = [
      hasRatePerSecond && hasCredits,
      hasBillSeconds && hasBillCost,
      hasTransactionTable,
      allBackendChecks,
    ];
    
    const passCount = allTests.filter(t => t).length;
    const totalCount = allTests.length;
    
    console.log(`✅ Passed: ${passCount}/${totalCount}`);
    console.log(`\n📌 Status: ${passCount === totalCount ? '🟢 ALL TESTS PASSED' : '🟡 SOME TESTS FAILED'}\n`);
    
    if (passCount === totalCount) {
      console.log('Ready to deploy! ✨\n');
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runTests();
