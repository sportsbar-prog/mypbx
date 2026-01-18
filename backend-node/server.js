require("dotenv").config();

const Ari = require("ari-client");
const axios = require("axios");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const { exec } = require("child_process");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const gTTS = require("gtts");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const DB_URL = process.env.DATABASE_URL || "postgresql://ari_user:password@localhost/ari_api";

// Asterisk ARI Configuration
const ARI_HOST = process.env.ARI_HOST || "localhost";
const ARI_PORT = process.env.ARI_PORT || 8088;
const ARI_USER = process.env.ARI_USER || "ariuser";
const ARI_PASSWORD = process.env.ARI_PASSWORD || "aripassword";
const ARI_APP_NAME = process.env.ARI_APP_NAME || "asterisk-gui";

// Database connection
const db = new Pool({
  connectionString: DB_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
// Removed: app.use(express.static('public')); - Frontend is now on port 5173

// Active calls tracking
let activeCalls = {};
let ariClient = null;
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || '/var/spool/asterisk/recording';
const AST_SOUNDS_DIR = process.env.ASTERISK_SOUNDS_DIR || '/var/lib/asterisk/sounds';

// Try to create recordings directory, fallback to /tmp if permission denied
let actualRecordingsDir = RECORDINGS_DIR;
try {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Warning: unable to create recordings directory:', e.message);
  // Fallback to /tmp/asterisk-recordings
  actualRecordingsDir = '/tmp/asterisk-recordings';
  try {
    if (!fs.existsSync(actualRecordingsDir)) {
      fs.mkdirSync(actualRecordingsDir, { recursive: true });
    }
    console.log(`📁 Using fallback recordings directory: ${actualRecordingsDir}`);
  } catch (fallbackErr) {
    console.error('❌ Cannot create recordings directory:', fallbackErr.message);
  }
}

// Load provider templates
let providerTemplates = {};
try {
  providerTemplates = JSON.parse(fs.readFileSync(path.join(__dirname, 'provider_templates.json'), 'utf8'));
} catch (error) {
  console.warn('Warning: provider_templates.json not found, trunk management features limited');
}

// ===== In-memory trunk + settings state (persist to DB later if needed) =====
let trunks = [];
let trunkStats = {};
let trunkRoundRobinIndex = 0;
let systemSettings = {
  callerId: process.env.CALLER_ID || '1000',
  transportPort: process.env.PJSIP_PORT || 5060,
  googleTtsApiKey: process.env.GOOGLE_TTS_API_KEY || '',
  ttsEngine: process.env.TTS_ENGINE || 'google'
};

function renderTemplate(template, vars) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => vars[key] || '');
}

function getNextTrunkRoundRobin() {
  if (!trunks.length) return null;
  const trunk = trunks[trunkRoundRobinIndex % trunks.length];
  trunkRoundRobinIndex = (trunkRoundRobinIndex + 1) % trunks.length;
  return trunk;
}

function updateTrunkStats(trunkName, success, responseTime = 0) {
  if (!trunkStats[trunkName]) {
    trunkStats[trunkName] = { totalCalls: 0, successCalls: 0, failedCalls: 0, avgResponseTime: 0, lastUsed: null };
  }
  const stats = trunkStats[trunkName];
  stats.totalCalls += 1;
  stats.lastUsed = new Date().toISOString();
  if (success) {
    stats.successCalls += 1;
    if (responseTime > 0) {
      stats.avgResponseTime = stats.avgResponseTime === 0 ? responseTime : (stats.avgResponseTime * 0.8) + (responseTime * 0.2);
    }
  } else {
    stats.failedCalls += 1;
  }
}

function getTrunkStats() {
  return { trunks, stats: trunkStats, roundRobinIndex: trunkRoundRobinIndex };
}

function getOrderedTrunksFrom(startIndex = 0) {
  if (!trunks.length) return [];
  const n = trunks.length;
  const ordered = [];
  for (let i = 0; i < n; i++) {
    const idx = (startIndex + i) % n;
    ordered.push(trunks[idx].trunk_name || trunks[idx]);
  }
  return ordered;
}

function createCallData(channel, voiceName = 'en-US-Neural2-A') {
  return {
    channel,
    status: 'ringing',
    webhookUrl: null,
    amd: { status: 'UNKNOWN', cause: null, confidence: 0 },
    recording: { active: false, filename: null, recordingId: null, snoopChannel: null },
    gather: null,
    apiKeyId: null,
    creditDeducted: false,
    number: (channel && channel.caller && channel.caller.number) || null,
    callStartTime: Date.now(),
    answeredAt: null,
    ratePerSecond: null,
    voiceName,
    bridge: null,
    ringTimer: null
  };
}

function setupCallTimeout(callId, ringTimeoutSeconds = 30) {
  const callData = activeCalls[callId];
  if (!callData) return;
  if (callData.ringTimer) clearTimeout(callData.ringTimer);
  callData.ringTimer = setTimeout(async () => {
    try {
      if (callData.channel) await callData.channel.hangup();
      callData.status = 'no-answer';
      await logCall(callId, callData.apiKeyId, callData.number, 'no-answer');
    } catch (err) {
      console.warn(`Ring timeout hangup failed for ${callId}:`, err.message);
    }
  }, ringTimeoutSeconds * 1000);
}

function safeRecordingPath(filename) {
  const safeName = path.basename(filename);
  const p = path.normalize(path.join(actualRecordingsDir, safeName));
  if (!p.startsWith(actualRecordingsDir)) {
    throw new Error('Invalid path');
  }
  return p;
}

async function notifyWebhook(callId, payload) {
  const data = activeCalls[callId];
  if (!data || !data.webhookUrl) return;
  try {
    await require('axios').post(data.webhookUrl, { callId, timestamp: new Date().toISOString(), ...payload }, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Asterisk-ARI-API/2.0' }
    });
  } catch (err) {
    console.warn('Webhook notify failed:', err.message);
  }
}

async function synthesizeTTS(callId, text, suffix = '') {
  const callData = activeCalls[callId];
  const voiceName = (callData && callData.voiceName) || 'en-US-Neural2-A';
  const mp3File = `/tmp/${callId}${suffix}.mp3`;
  const ulawFile = `${AST_SOUNDS_DIR}/${callId}${suffix}.ulaw`;

  try {
    if (!text || !text.trim()) {
      throw new Error('TTS text is empty');
    }

    if (systemSettings.ttsEngine === 'gtts') {
      return await gsynthesizeTTS(callId, text, suffix);
    }

    const GOOGLE_TTS_API_KEY = systemSettings.googleTtsApiKey;
    if (!GOOGLE_TTS_API_KEY) {
      console.warn('Google TTS API key not configured, falling back to gTTS');
      return await gsynthesizeTTS(callId, text, suffix);
    }

    const languageCode = voiceName.split('-').slice(0, 2).join('-');
    const response = await require('axios').post(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      {
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 }
      },
      {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Goog-Api-Key': GOOGLE_TTS_API_KEY },
        timeout: 15000
      }
    );

    if (!response.data.audioContent) {
      throw new Error('No audioContent returned from Google TTS');
    }

    const audioBuffer = Buffer.from(response.data.audioContent, 'base64');
    fs.writeFileSync(mp3File, audioBuffer);

    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${mp3File}" -ar 8000 -ac 1 -f mulaw "${ulawFile}"`, (err, _stdout, stderr) => {
        if (err) {
          console.error(`FFmpeg error: ${stderr}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    try { fs.unlinkSync(mp3File); } catch (e) { console.warn(`Failed to cleanup ${mp3File}:`, e.message); }
    return `sound:${callId}${suffix}`;

  } catch (err) {
    try { fs.unlinkSync(mp3File); } catch {}
    try { fs.unlinkSync(ulawFile); } catch {}
    throw new Error(`TTS failed: ${err.message}`);
  }
}

async function gsynthesizeTTS(callId, text, suffix = '') {
  const mp3File = `/tmp/${callId}${suffix}.mp3`;
  const ulawFile = `${AST_SOUNDS_DIR}/${callId}${suffix}.ulaw`;

  try {
    if (!text || !text.trim()) {
      throw new Error('TTS text is empty');
    }

    await new Promise((resolve, reject) => {
      try {
        const gtts = new gTTS(text, 'en');
        gtts.save(mp3File, (err) => (err ? reject(err) : resolve()));
      } catch (err) {
        reject(err);
      }
    });

    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${mp3File}" -ar 8000 -ac 1 -f mulaw "${ulawFile}"`, (err, _stdout, stderr) => {
        if (err) {
          console.error(`FFmpeg error: ${stderr}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    try { fs.unlinkSync(mp3File); } catch {}
    return `sound:${callId}${suffix}`;

  } catch (err) {
    try { fs.unlinkSync(mp3File); } catch {}
    try { fs.unlinkSync(ulawFile); } catch {}
    throw new Error(`TTS failed: ${err.message}`);
  }
}

// ============== DATABASE HELPER FUNCTIONS ==============

async function getApiKeyDetails(apiKey) {
  try {
    const result = await db.query(
      'SELECT * FROM api_keys WHERE api_key = $1 AND is_active = true',
      [apiKey]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error getting API key details:', error);
    return null;
  }
}

async function deductCredit(apiKeyId, callId, amount = 1) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const keyResult = await client.query(
      'SELECT credits FROM api_keys WHERE id = $1',
      [apiKeyId]
    );
    
    if (keyResult.rows.length === 0) {
      throw new Error('API key not found');
    }
    
    const currentBalance = keyResult.rows[0].credits;
    
    if (currentBalance < amount) {
      throw new Error('Insufficient credits');
    }
    
    const newBalance = currentBalance - amount;
    
    await client.query(
      'UPDATE api_keys SET credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newBalance, apiKeyId]
    );
    
    await client.query(
      `INSERT INTO credit_transactions (api_key_id, call_id, transaction_type, amount, 
       balance_before, balance_after, description) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [apiKeyId, callId, 'debit', amount, currentBalance, newBalance, 'Call answered - credit deducted']
    );
    
    await client.query('COMMIT');
    return newBalance;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Bill a call based on per-second duration
async function billCall(apiKeyId, callId, billSeconds = 0, ratePerSecond = 0) {
  const client = await db.connect();
  const seconds = Math.max(0, Math.ceil(billSeconds || 0));
  const rps = Number(ratePerSecond || 0);
  const cost = seconds * rps;
  try {
    await client.query('BEGIN');

    const keyResult = await client.query(
      'SELECT credits, rate_per_second FROM api_keys WHERE id = $1 FOR UPDATE',
      [apiKeyId]
    );

    if (keyResult.rows.length === 0) {
      throw new Error('API key not found');
    }

    const currentBalance = Number(keyResult.rows[0].credits || 0);
    const effectiveRate = rps || Number(keyResult.rows[0].rate_per_second || 0) || 0;
    const billableSeconds = seconds;
    const chargeAmount = billableSeconds * effectiveRate;

    if (chargeAmount > 0) {
      if (currentBalance < chargeAmount) {
        throw new Error('Insufficient credits for billing');
      }

      const newBalance = currentBalance - chargeAmount;

      await client.query(
        'UPDATE api_keys SET credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newBalance, apiKeyId]
      );

      await client.query(
        `INSERT INTO credit_transactions (api_key_id, call_id, transaction_type, amount,
         balance_before, balance_after, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [apiKeyId, callId, 'debit', chargeAmount, currentBalance, newBalance, `Per-second billing: ${billableSeconds}s @ ${effectiveRate}/s`]
      );

      await client.query('COMMIT');
      return { billableSeconds, ratePerSecond: effectiveRate, cost: chargeAmount, balanceAfter: newBalance };
    }

    await client.query('ROLLBACK');
    return { billableSeconds, ratePerSecond: effectiveRate, cost: 0, balanceAfter: currentBalance };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function logApiUsage(apiKeyId, endpoint, ipAddress, userAgent, status, responseTime) {
  try {
    await db.query(
      `INSERT INTO api_usage (api_key_id, endpoint, ip_address, user_agent, 
       response_status, response_time) VALUES ($1, $2, $3, $4, $5, $6)`,
      [apiKeyId, endpoint, ipAddress, userAgent, status, responseTime]
    );
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}

async function logCall(callId, apiKeyId, number, status, amdStatus = null, opts = {}) {
  try {
    const callData = activeCalls[callId];
    const answeredAt = opts.answeredAt ? new Date(opts.answeredAt) : null;
    const endedAt = opts.endedAt ? new Date(opts.endedAt) : null;
    const durationSeconds = opts.durationSeconds != null ? opts.durationSeconds : (answeredAt && endedAt ? Math.max(0, Math.ceil((endedAt - answeredAt) / 1000)) : null);
    const billSeconds = opts.billSeconds != null ? opts.billSeconds : null;
    const billCost = opts.billCost != null ? opts.billCost : null;
    
    await db.query(
      `INSERT INTO call_logs (call_id, api_key_id, number, caller_id, status, amd_status, 
       recording_filename, webhook_url, created_at, answered_at, ended_at, duration, bill_seconds, bill_cost) 
       VALUES ($1, $2, $3, $4, $5::text, $6, $7, $8, CURRENT_TIMESTAMP, 
       CASE WHEN $10 IS NOT NULL THEN $10 ELSE CASE WHEN $5::text = 'answered' THEN CURRENT_TIMESTAMP ELSE NULL END END,
       CASE WHEN $11 IS NOT NULL THEN $11 ELSE CASE WHEN $5::text IN ('completed', 'failed', 'no-answer') THEN CURRENT_TIMESTAMP ELSE NULL END END,
       $9, $12, $13)
       ON CONFLICT (call_id) DO UPDATE SET 
       status = EXCLUDED.status, 
       amd_status = EXCLUDED.amd_status,
       answered_at = COALESCE(EXCLUDED.answered_at, call_logs.answered_at),
       ended_at = COALESCE(EXCLUDED.ended_at, call_logs.ended_at),
       duration = COALESCE(EXCLUDED.duration, call_logs.duration),
       bill_seconds = COALESCE(EXCLUDED.bill_seconds, call_logs.bill_seconds),
       bill_cost = COALESCE(EXCLUDED.bill_cost, call_logs.bill_cost)`,
      [
        callId, apiKeyId, number, (callData && callData.channel && callData.channel.caller && callData.channel.caller.number) || null,
        status, amdStatus, (callData && callData.recording && callData.recording.filename) || null, (callData && callData.webhookUrl) || null,
        durationSeconds,
        answeredAt,
        endedAt,
        billSeconds,
        billCost
      ]
    );
  } catch (error) {
    console.error('Failed to log call:', error);
  }
}

// ============== AUTHENTICATION MIDDLEWARE ==============

const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const startTime = Date.now();
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logApiUsage(null, req.path, req.ip, req.get('User-Agent'), 401, Date.now() - startTime);
    return res.status(401).json({ 
      success: false, 
      error: 'Missing or invalid Authorization header' 
    });
  }
  
  const apiKey = authHeader.substring(7);
  
  try {
    const keyDetails = await getApiKeyDetails(apiKey);
    
    if (!keyDetails) {
      await logApiUsage(null, req.path, req.ip, req.get('User-Agent'), 401, Date.now() - startTime);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid API key' 
      });
    }
    
    if (req.path === '/api/call/originate' && keyDetails.credits <= 0) {
      await logApiUsage(keyDetails.id, req.path, req.ip, req.get('User-Agent'), 402, Date.now() - startTime);
      return res.status(402).json({ 
        success: false, 
        error: 'Insufficient credits', 
        credits: keyDetails.credits 
      });
    }
    
    await db.query(
      'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = $1',
      [keyDetails.id]
    );
    
    req.apiKey = keyDetails;
    await logApiUsage(keyDetails.id, req.path, req.ip, req.get('User-Agent'), 200, Date.now() - startTime);
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    await logApiUsage(null, req.path, req.ip, req.get('User-Agent'), 500, Date.now() - startTime);
    res.status(500).json({ 
      success: false, 
      error: 'Authentication error' 
    });
  }
};

const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Verify JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(`✅ JWT verified for adminId: ${decoded.adminId}`);
    
    // Get admin username from database
    const admin = await db.query(
      'SELECT id, username FROM admins WHERE id = $1 AND is_active = true',
      [decoded.adminId]
    );
    
    if (admin.rows.length === 0) {
      console.warn(`❌ Admin not found or inactive: ${decoded.adminId}`);
      return res.status(401).json({ success: false, error: 'Admin not found' });
    }
    
    req.admin = { id: decoded.adminId, username: admin.rows[0].username };
    console.log(`✅ Admin authenticated: ${admin.rows[0].username}`);
    next();
  } catch (error) {
    console.error('❌ Admin authentication error:', error.message);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ============== RATE LIMITING ==============

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: async (req) => {
    return (req.apiKey && req.apiKey.rate_limit) || 100;
  },
  keyGenerator: (req) => (req.apiKey && req.apiKey.id) || req.ip,
  message: { success: false, error: 'Rate limit exceeded' }
});

// Protect call origination with API key + rate limiting (legacy parity)
app.use('/api/call/originate', authenticateApiKey, apiLimiter);
// Legacy-style protected routes
app.use('/makecall', authenticateApiKey, apiLimiter);
app.use('/batchcall', authenticateApiKey, apiLimiter);
app.use('/newcall', authenticateApiKey, apiLimiter);
app.use('/voice', authenticateApiKey, apiLimiter);
app.use('/play', authenticateApiKey, apiLimiter);
app.use('/gather', authenticateApiKey, apiLimiter);
app.use('/hangup', authenticateApiKey, apiLimiter);

// ============== ARI CLIENT INITIALIZATION ==============

async function initializeAri() {
  try {
    ariClient = await Ari.connect(
      `http://${ARI_HOST}:${ARI_PORT}`,
      ARI_USER,
      ARI_PASSWORD
    );
    
    console.log('✅ Connected to Asterisk ARI');
    
    // Start Stasis application
    ariClient.start(ARI_APP_NAME);
    
    // Handle StasisStart event
    ariClient.on('StasisStart', async (event, channel) => {
      console.log(`📞 Call started: ${channel.id}`);
      // Reuse existing callData if originate already tracked
      const existing = activeCalls[channel.id];
      const callData = existing || createCallData(channel);
      callData.channel = channel;
      callData.number = callData.number || (channel.caller && channel.caller.number);
      callData.status = callData.status || 'ringing';
      activeCalls[channel.id] = callData;

      // Parallel setup: bridge + recording, AMD snapshot
      const bridgePromise = (async () => {
        try {
          const bridge = await ariClient.bridges.create({ type: 'mixing', bridgeId: `bridge-${channel.id}` });
          callData.bridge = bridge;
          await bridge.addChannel({ channel: channel.id });

          // Start bridge recording immediately
          const recordingName = `call-${channel.id}-${Date.now()}`;
          try {
            const rec = await bridge.record({
              name: recordingName,
              format: 'wav',
              ifExists: 'overwrite',
              maxDurationSeconds: 3600,
              maxSilenceSeconds: 30
            });
            callData.recording = {
              recordingId: rec.name,
              filename: `${recordingName}.wav`,
              active: true,
              snoopChannel: null
            };
            notifyWebhook(channel.id, {
              event: 'recording.started',
              method: 'bridge',
              filename: callData.recording.filename,
              recordingId: rec.name
            });
          } catch (e) {
            console.error(`❌ Bridge recording failed for ${channel.id}:`, e.message);
          }

          return bridge;
        } catch (e) {
          console.error(`❌ Bridge setup failed for ${channel.id}:`, e.message);
          return null;
        }
      })();

      const amdPromise = (async () => {
        try {
          const amdStatusVar = await channel.getChannelVar({ variable: 'AMDSTATUS' });
          const amdCauseVar = await channel.getChannelVar({ variable: 'AMDCAUSE' });
          if (amdStatusVar && amdStatusVar.value && amdStatusVar.value !== 'UNKNOWN') {
            callData.amd.status = amdStatusVar.value;
          }
          if (amdCauseVar && amdCauseVar.value) {
            callData.amd.cause = amdCauseVar.value;
          }
          if (callData.amd.status === 'MACHINE') {
            callData.amd.confidence = 0.85;
          } else if (callData.amd.status === 'HUMAN') {
            callData.amd.confidence = 0.9;
          }
        } catch (amdError) {
          callData.amd.status = 'NOAMD';
        }
      })();

      // Auto-answer if configured (keep behavior)
      try {
        await channel.answer();
        callData.status = 'answered';
        callData.answeredAt = Date.now();
        console.log(`✅ Call answered: ${channel.id}`);
      } catch (error) {
        console.error('Error answering call:', error);
      }

      await Promise.allSettled([bridgePromise, amdPromise]);

      // Billing occurs at StasisEnd using per-second billing
    });
    
    // Handle StasisEnd event
    ariClient.on('StasisEnd', async (event, channel) => {
      console.log(`📴 Call ended: ${channel.id}`);
      
      const callData = activeCalls[channel.id];
      if (callData) {
        if (callData.ringTimer) clearTimeout(callData.ringTimer);
        if (callData.gather && callData.gather.timer) clearTimeout(callData.gather.timer);

        const endTimeMs = Date.now();
        const answeredMs = callData.answeredAt;
        const durationSeconds = answeredMs ? Math.max(1, Math.ceil((endTimeMs - answeredMs) / 1000)) : 0;

        let finalStatus = durationSeconds > 0 ? 'completed' : 'no-answer';
        let endReason = finalStatus === 'completed' ? 'answered_then_ended' : 'no_answer';
        let hangupCause = 'normal';

        try {
          const causeVar = await channel.getChannelVar({ variable: 'HANGUPCAUSE' });
          if (causeVar && causeVar.value) {
            hangupCause = causeVar.value;
            if (hangupCause === '17') { finalStatus = 'no-answer'; endReason = 'busy'; }
            if (hangupCause === '18' || hangupCause === '19') { finalStatus = 'no-answer'; endReason = 'no_answer'; }
            if (hangupCause === '21') { finalStatus = 'no-answer'; endReason = 'rejected'; }
            if (hangupCause === '16' && finalStatus === 'completed') { endReason = 'normal_hangup'; }
          }
        } catch (e) {
          // ignore
        }

        if (callData.bridge) {
          try { await callData.bridge.destroy(); } catch (e) { console.error('Bridge destroy error:', e.message); }
        }

        let billing = { billableSeconds: durationSeconds, cost: 0, ratePerSecond: callData.ratePerSecond || 0 };
        if (durationSeconds > 0 && callData.apiKeyId) {
          try {
            const billResult = await billCall(callData.apiKeyId, channel.id, durationSeconds, callData.ratePerSecond);
            billing = billResult;
            callData.creditDeducted = true;
          } catch (e) {
            console.error(`Billing failed for ${channel.id}:`, e.message);
            endReason = 'billing_failed';
          }
        }

        await logCall(
          channel.id,
          callData.apiKeyId,
          callData.number,
          finalStatus,
          (callData.amd && callData.amd.status) || null,
          {
            answeredAt: answeredMs,
            endedAt: endTimeMs,
            durationSeconds,
            billSeconds: billing.billableSeconds,
            billCost: billing.cost
          }
        );

        notifyWebhook(channel.id, {
          event: 'call.ended',
          status: finalStatus,
          endReason,
          hangupCause,
          wasAnswered: durationSeconds > 0,
          amd: callData.amd || null,
          recording: callData.recording ? {
            filename: callData.recording.filename,
            recordingId: callData.recording.recordingId,
            active: !!callData.recording.active
          } : null,
          callDuration: durationSeconds,
          billing
        });
        delete activeCalls[channel.id];
      }
    });
    
    // Handle channel state changes
    ariClient.on('ChannelStateChange', (event, channel) => {
      const callData = activeCalls[channel.id];
      if (callData) {
        console.log(`🔄 Channel state changed: ${channel.id} -> ${channel.state}`);
        if (channel.state === 'Up') {
          callData.status = 'answered';
          callData.answeredAt = Date.now();
          if (callData.ringTimer) clearTimeout(callData.ringTimer);
        }
      }
    });

    // Collect DTMF for gather flows
    ariClient.on('ChannelDtmfReceived', (event, channel) => {
      const callData = activeCalls[channel.id];
      if (!callData) return;

      // Always notify DTMF events
      notifyWebhook(channel.id, {
        event: 'dtmf.received',
        digit: event.digit,
        timestamp: Date.now()
      });

      if (!callData.gather) return;
      callData.gather.digits += event.digit;
      const g = callData.gather;
      notifyWebhook(channel.id, {
        event: 'gather.progress',
        digit: event.digit,
        collected: g.digits,
        remaining: g.numDigits - g.digits.length
      });

      if (g.timer) clearTimeout(g.timer);

      if (g.digits.length >= g.numDigits) {
        notifyWebhook(channel.id, {
          event: 'gather.complete',
          digits: g.digits,
          method: 'digits_complete'
        });
        callData.gather = null;
      } else {
        g.timer = setTimeout(() => {
          if (callData.gather) {
            notifyWebhook(channel.id, {
              event: 'gather.timeout',
              digits: callData.gather.digits,
              method: 'timeout'
            });
            callData.gather = null;
          }
        }, g.timeout || 10000);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to connect to ARI:', error);
    process.exit(1);
  }
}

// ============== API ROUTES ==============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'healthy',
    ari_connected: ariClient !== null,
    active_calls: Object.keys(activeCalls).length
  });
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await db.query(
      'SELECT * FROM admins WHERE username = $1 AND is_active = true',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ adminId: admin.id }, JWT_SECRET, { expiresIn: '24h' });
    
    await db.query(
      'INSERT INTO admin_sessions (admin_id, session_token, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL \'24 hours\')',
      [admin.id, token, req.ip, req.get('User-Agent')]
    );
    
    await db.query('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);
    
    res.json({ success: true, token, username: admin.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Admin dashboard stats
app.get('/api/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM api_keys WHERE is_active = true) as total_api_keys,
        (SELECT COALESCE(SUM(credits), 0) FROM api_keys) as total_credits,
        (SELECT COUNT(*) FROM call_logs WHERE created_at >= CURRENT_DATE) as calls_today,
        (SELECT COUNT(*) FROM call_logs WHERE status = 'completed' AND created_at >= CURRENT_DATE) as successful_calls_today,
        (SELECT COUNT(*) FROM call_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as calls_this_week
    `);
    
    const recentCalls = await db.query(
      `SELECT cl.*, ak.key_name 
       FROM call_logs cl 
       LEFT JOIN api_keys ak ON cl.api_key_id = ak.id 
       ORDER BY cl.created_at DESC 
       LIMIT 10`
    );
    
    res.json({ 
      success: true, 
      stats: stats.rows[0],
      recent_calls: recentCalls.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// Get call logs (admin)
app.get('/api/call-logs', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, page_size = 20, status } = req.query;
    const offset = (page - 1) * page_size;
    
    let whereClause = '';
    const params = [page_size, offset];
    
    if (status) {
      whereClause = 'WHERE cl.status = $3';
      params.push(status);
    }
    
    const logsQuery = `
      SELECT cl.*, ak.key_name 
      FROM call_logs cl 
      LEFT JOIN api_keys ak ON cl.api_key_id = ak.id 
      ${whereClause}
      ORDER BY cl.created_at DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM call_logs cl 
      ${whereClause}
    `;
    
    const logs = await db.query(logsQuery, params);
    const countParams = status ? [status] : [];
    const count = await db.query(countQuery, countParams);
    
    res.json({
      success: true,
      logs: logs.rows,
      total_count: parseInt(count.rows[0].total)
    });
  } catch (error) {
    console.error('Call logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to load call logs' });
  }
});

// Get API keys (admin only)
app.get('/api/admin/keys', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, key_name, api_key, credits, rate_per_second, rate_limit, is_active, created_at, last_used, total_calls, successful_calls FROM api_keys ORDER BY created_at DESC'
    );
    res.json({ success: true, keys: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch API keys' });
  }
});

// Create API key (admin only)
app.post('/api/admin/keys', authenticateAdmin, async (req, res) => {
  const { key_name, credits, rate_limit, rate_per_second } = req.body;
  
  try {
    const api_key = 'sk_' + require('crypto').randomBytes(32).toString('hex');
    
    const result = await db.query(
      'INSERT INTO api_keys (key_name, api_key, credits, rate_limit, rate_per_second) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [key_name, api_key, credits || 100, rate_limit || 100, rate_per_second || 0]
    );
    
    res.json({ success: true, key: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create API key' });
  }
});

// Update API key (including rate)
app.put('/api/admin/keys/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { key_name, credits, rate_limit, rate_per_second, is_active } = req.body;
  
  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (key_name !== undefined) {
      updates.push(`key_name = $${paramIndex++}`);
      values.push(key_name);
    }
    if (credits !== undefined) {
      updates.push(`credits = $${paramIndex++}`);
      values.push(credits);
    }
    if (rate_limit !== undefined) {
      updates.push(`rate_limit = $${paramIndex++}`);
      values.push(rate_limit);
    }
    if (rate_per_second !== undefined) {
      updates.push(`rate_per_second = $${paramIndex++}`);
      values.push(rate_per_second);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE api_keys SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }
    
    res.json({ success: true, key: result.rows[0] });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ success: false, error: 'Failed to update API key' });
  }
});

// Get API key by ID (admin)
app.get('/api/admin/keys/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'SELECT id, key_name, api_key, credits, rate_per_second, rate_limit, is_active, created_at, last_used, total_calls, successful_calls FROM api_keys WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }
    
    res.json({ success: true, key: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch API key' });
  }
});

// Set rate for API key (dedicated endpoint for rates)
app.post('/api/admin/keys/:id/rate', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { rate_per_second } = req.body;
  
  if (rate_per_second === undefined || rate_per_second === null) {
    return res.status(400).json({ success: false, error: 'rate_per_second is required' });
  }
  
  if (isNaN(rate_per_second) || rate_per_second < 0) {
    return res.status(400).json({ success: false, error: 'rate_per_second must be a non-negative number' });
  }
  
  try {
    const result = await db.query(
      'UPDATE api_keys SET rate_per_second = $1 WHERE id = $2 RETURNING id, key_name, rate_per_second',
      [rate_per_second, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }
    
    res.json({ success: true, key: result.rows[0], message: `Rate updated to $${rate_per_second}/sec` });
  } catch (error) {
    console.error('Update rate error:', error);
    res.status(500).json({ success: false, error: 'Failed to update rate' });
  }
});

// Originate call
app.post('/api/call/originate', authenticateApiKey, apiLimiter, async (req, res) => {
  const { endpoint, extension, context, caller_id, variables } = req.body;
  
  if (!endpoint || !extension) {
    return res.status(400).json({ success: false, error: 'endpoint and extension are required' });
  }
  
  try {
    const channel = ariClient.Channel();
    
    const channelData = await channel.originate({
      endpoint: endpoint,
      extension: extension,
      context: context || 'default',
      callerId: caller_id,
      app: ARI_APP_NAME,
      variables: variables
    });
    
    const callData = {
      channel: channelData,
      status: "ringing",
      apiKeyId: req.apiKey.id,
      number: extension,
      callStartTime: Date.now(),
      ratePerSecond: req.apiKey.rate_per_second || 0
    };
    
    activeCalls[channelData.id] = callData;
    
    res.json({ 
      success: true, 
      call_id: channelData.id,
      status: 'initiated'
    });
  } catch (error) {
    console.error('Originate error:', error);
    res.status(500).json({ success: false, error: 'Failed to originate call' });
  }
});

// Get active channels
app.get('/api/channels', authenticateAdmin, async (req, res) => {
  try {
    if (!ariClient) {
      return res.status(503).json({ success: false, error: 'ARI not connected', channels: [] });
    }
    const channels = await ariClient.channels.list();
    res.json({ success: true, channels: channels || [] });
  } catch (error) {
    console.error('Channels error:', error.message);
    res.json({ success: true, channels: [] });
  }
});

// Hangup channel
app.delete('/api/channels/:channelId', async (req, res) => {
  try {
    const channel = ariClient.Channel(req.params.channelId);
    await channel.hangup();
    res.json({ success: true, message: 'Channel hung up' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to hangup channel' });
  }
});

// Get call logs (admin only)
app.get('/api/admin/call-logs', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM call_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch call logs' });
  }
});

// Get Asterisk info
app.get('/api/asterisk/info', async (req, res) => {
  try {
    const asteriskVersion = await new Promise((resolve) => {
      setTimeout(() => resolve('Asterisk 20.x'), 100);
    });
    res.json({
      success: true,
      version: asteriskVersion,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch Asterisk info' });
  }
});

// Admin call history with filters
app.get('/api/admin/call-history', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 50, status, apiKeyId, dateFrom, dateTo, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);

    const where = [];
    const params = [];
    let i = 0;
    if (status) { params.push(status); where.push(`cl.status = $${++i}`); }
    if (apiKeyId) { params.push(parseInt(apiKeyId, 10)); where.push(`cl.api_key_id = $${++i}`); }
    if (dateFrom) { params.push(dateFrom); where.push(`cl.created_at >= $${++i}`); }
    if (dateTo) { params.push(dateTo); where.push(`cl.created_at <= $${++i}`); }
    if (search) { params.push(`%${search}%`); where.push(`(cl.call_id ILIKE $${++i} OR cl.number ILIKE $${i})`); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as total FROM call_logs cl ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total, 10) || 0;

    params.push(parseInt(pageSize, 10), offset);
    const callsQuery = `
      SELECT cl.call_id, cl.api_key_id, ak.key_name AS api_key_name, cl.number, cl.caller_id, cl.status, cl.amd_status,
             cl.duration, cl.recording_filename, cl.webhook_url, cl.created_at, cl.answered_at, cl.ended_at,
             EXTRACT(EPOCH FROM (cl.ended_at - cl.answered_at)) as call_duration_seconds
      FROM call_logs cl
      LEFT JOIN api_keys ak ON cl.api_key_id = ak.id
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT $${i + 1} OFFSET $${i + 2}
    `;
    const callsResult = await db.query(callsQuery, params);

    res.json({
      success: true,
      calls: callsResult.rows,
      pagination: {
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
        totalCount,
        totalPages: Math.ceil(totalCount / parseInt(pageSize, 10))
      }
    });
  } catch (error) {
    console.error('Call history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch call history' });
  }
});

// Export call history as CSV
app.get('/api/admin/call-history/export', authenticateAdmin, async (req, res) => {
  try {
    const { status, apiKeyId, dateFrom, dateTo, search } = req.query;

    const where = [];
    const params = [];
    let i = 0;
    if (status) { params.push(status); where.push(`cl.status = $${++i}`); }
    if (apiKeyId) { params.push(parseInt(apiKeyId, 10)); where.push(`cl.api_key_id = $${++i}`); }
    if (dateFrom) { params.push(dateFrom); where.push(`cl.created_at >= $${++i}`); }
    if (dateTo) { params.push(dateTo); where.push(`cl.created_at <= $${++i}`); }
    if (search) { params.push(`%${search}%`); where.push(`(cl.call_id ILIKE $${++i} OR cl.number ILIKE $${i})`); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const callsQuery = `
      SELECT cl.call_id, cl.api_key_id, ak.key_name AS api_key_name, cl.number, cl.caller_id, cl.status, cl.amd_status,
             cl.duration, cl.recording_filename, cl.webhook_url, cl.created_at, cl.answered_at, cl.ended_at,
             EXTRACT(EPOCH FROM (cl.ended_at - cl.answered_at)) as call_duration_seconds
      FROM call_logs cl
      LEFT JOIN api_keys ak ON cl.api_key_id = ak.id
      ${whereClause}
      ORDER BY cl.created_at DESC
    `;
    const result = await db.query(callsQuery, params);

    // Generate CSV
    const headers = ['Call ID', 'API Key', 'Number', 'Caller ID', 'Status', 'AMD Status', 'Duration', 'Recording', 'Created At', 'Answered At', 'Ended At'];
    const csvRows = [headers.join(',')];
    
    // Helper to escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Escape double quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    result.rows.forEach(row => {
      const values = [
        row.call_id,
        row.api_key_name || '',
        row.number,
        row.caller_id,
        row.status,
        row.amd_status || '',
        row.duration || '',
        row.recording_filename || '',
        row.created_at,
        row.answered_at || '',
        row.ended_at || ''
      ];
      csvRows.push(values.map(escapeCSV).join(','));
    });

    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=call-history-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export call history' });
  }
});

// Admin analytics
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days || 7, 10);

    const overallStats = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
        COUNT(CASE WHEN status = 'answered' THEN 1 END) as answered_calls,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
        COUNT(CASE WHEN status = 'no-answer' THEN 1 END) as no_answer_calls,
        COUNT(CASE WHEN amd_status = 'HUMAN' THEN 1 END) as human_calls,
        COUNT(CASE WHEN amd_status = 'MACHINE' THEN 1 END) as machine_calls,
        AVG(duration) as avg_duration,
        MAX(duration) as max_duration,
        COUNT(DISTINCT api_key_id) as unique_api_keys
      FROM call_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
    `);

    const dailyVolume = await db.query(`
      SELECT DATE(created_at) as date,
        COUNT(*) as total_calls,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'answered' THEN 1 END) as answered,
        COUNT(CASE WHEN status = 'no-answer' THEN 1 END) as no_answer
      FROM call_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    const hourlyDistribution = await db.query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as call_count
      FROM call_logs
      WHERE created_at >= CURRENT_DATE
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `);

    const statusBreakdown = await db.query(`
      SELECT status, COUNT(*) as count,
        ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 2) as percentage
      FROM call_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY status
      ORDER BY count DESC
    `);

    const amdBreakdown = await db.query(`
      SELECT COALESCE(amd_status, 'UNKNOWN') as amd_status, COUNT(*) as count,
        ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 2) as percentage
      FROM call_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY amd_status
      ORDER BY count DESC
    `);

    const topApiKeys = await db.query(`
      SELECT ak.id, ak.key_name as name,
        COUNT(cl.call_id) as total_calls,
        COUNT(CASE WHEN cl.status = 'completed' THEN 1 END) as completed_calls,
        ROUND(COUNT(CASE WHEN cl.status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as success_rate
      FROM call_logs cl
      JOIN api_keys ak ON cl.api_key_id = ak.id
      WHERE cl.created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY ak.id, ak.key_name
      ORDER BY total_calls DESC
      LIMIT 10
    `);

    const trunkUsage = getTrunkStats();

    const stats = overallStats.rows[0];
    const totalCalls = parseInt(stats.total_calls, 10) || 0;
    const completedCalls = parseInt(stats.completed_calls, 10) || 0;
    const successRate = totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      period: `Last ${days} days`,
      overview: {
        totalCalls,
        completedCalls,
        answeredCalls: parseInt(stats.answered_calls, 10) || 0,
        failedCalls: parseInt(stats.failed_calls, 10) || 0,
        noAnswerCalls: parseInt(stats.no_answer_calls, 10) || 0,
        humanCalls: parseInt(stats.human_calls, 10) || 0,
        machineCalls: parseInt(stats.machine_calls, 10) || 0,
        avgDuration: parseFloat(stats.avg_duration) || 0,
        maxDuration: parseInt(stats.max_duration, 10) || 0,
        successRate: parseFloat(successRate),
        uniqueApiKeys: parseInt(stats.unique_api_keys, 10) || 0
      },
      dailyVolume: dailyVolume.rows,
      hourlyDistribution: hourlyDistribution.rows,
      statusBreakdown: statusBreakdown.rows,
      amdBreakdown: amdBreakdown.rows,
      topApiKeys: topApiKeys.rows,
      trunkUsage
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// Get endpoints
app.get('/api/endpoints', authenticateAdmin, async (req, res) => {
  try {
    if (!ariClient) {
      return res.status(503).json({ success: false, error: 'ARI not connected', endpoints: [] });
    }
    const endpoints = await ariClient.endpoints.list();
    res.json({ success: true, endpoints: endpoints || [] });
  } catch (error) {
    console.error('Endpoints error:', error.message);
    res.json({ success: true, endpoints: [] });
  }
});

// Get specific endpoint
app.get('/api/endpoints/:tech/:resource', async (req, res) => {
  try {
    const { tech, resource } = req.params;
    const endpoint = await ariClient.endpoints.get({ techName: tech, resource });
    res.json({ success: true, endpoint });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
});

// Bridge operations
app.get('/api/bridges', authenticateAdmin, async (req, res) => {
  try {
    if (!ariClient) {
      return res.status(503).json({ success: false, error: 'ARI not connected', bridges: [] });
    }
    const bridges = await ariClient.bridges.list();
    res.json({ success: true, bridges: bridges || [] });
  } catch (error) {
    console.error('Bridges error:', error.message);
    res.json({ success: true, bridges: [] });
  }
});

app.post('/api/bridges', async (req, res) => {
  try {
    const { type = 'mixing' } = req.body;
    const bridge = await ariClient.bridges.create({ type });
    res.json({ success: true, bridge });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create bridge' });
  }
});

app.post('/api/bridges/:bridgeId/channels', async (req, res) => {
  try {
    const { bridgeId } = req.params;
    const { channel } = req.body;
    const bridge = ariClient.Bridge(bridgeId);
    await bridge.addChannel({ channel });
    res.json({ success: true, message: 'Channel added to bridge' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add channel to bridge' });
  }
});

app.delete('/api/bridges/:bridgeId/channels/:channelId', async (req, res) => {
  try {
    const { bridgeId, channelId } = req.params;
    const bridge = ariClient.Bridge(bridgeId);
    await bridge.removeChannel({ channel: channelId });
    res.json({ success: true, message: 'Channel removed from bridge' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to remove channel from bridge' });
  }
});

// Channel control operations
app.post('/api/channels/:channelId/answer', async (req, res) => {
  try {
    const channel = ariClient.Channel(req.params.channelId);
    await channel.answer();
    res.json({ success: true, message: 'Channel answered' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to answer channel' });
  }
});

app.post('/api/channels/:channelId/mute', async (req, res) => {
  try {
    const { direction = 'both' } = req.query;
    const channel = ariClient.Channel(req.params.channelId);
    await channel.mute({ direction });
    res.json({ success: true, message: 'Channel muted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mute channel' });
  }
});

app.post('/api/channels/:channelId/unmute', async (req, res) => {
  try {
    const { direction = 'both' } = req.query;
    const channel = ariClient.Channel(req.params.channelId);
    await channel.unmute({ direction });
    res.json({ success: true, message: 'Channel unmuted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unmute channel' });
  }
});

app.post('/api/channels/:channelId/hold', async (req, res) => {
  try {
    const channel = ariClient.Channel(req.params.channelId);
    await channel.hold();
    res.json({ success: true, message: 'Channel on hold' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to hold channel' });
  }
});

app.post('/api/channels/:channelId/unhold', async (req, res) => {
  try {
    const channel = ariClient.Channel(req.params.channelId);
    await channel.unhold();
    res.json({ success: true, message: 'Channel unhold' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to unhold channel' });
  }
});

app.get('/api/channels/:channelId', async (req, res) => {
  try {
    const channel = ariClient.Channel(req.params.channelId);
    const channelInfo = await channel.get();
    res.json({ success: true, channel: channelInfo });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Channel not found' });
  }
});

// ============== ADVANCED CHANNEL OPERATIONS ==============

// Play sound on channel
app.post('/api/channels/:channelId/play', async (req, res) => {
  try {
    const { media, language = 'en' } = req.body;
    if (!media) return res.status(400).json({ success: false, error: 'media parameter required' });
    
    const channel = ariClient.Channel(req.params.channelId);
    await channel.play({ media });
    res.json({ success: true, message: 'Playing media' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to play media' });
  }
});

// Stop playing
app.delete('/api/channels/:channelId/play', async (req, res) => {
  try {
    const channel = ariClient.Channel(req.params.channelId);
    await channel.stopSilence();
    res.json({ success: true, message: 'Stopped playing' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to stop playback' });
  }
});

// Record channel
app.post('/api/channels/:channelId/record', async (req, res) => {
  try {
    const { name, format = 'wav', ifExists = 'fail' } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name parameter required' });
    
    const channel = ariClient.Channel(req.params.channelId);
    const recording = await channel.record({
      name,
      format,
      ifExists
    });
    
    res.json({ success: true, recording });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to record channel' });
  }
});

// Send DTMF
app.post('/api/channels/:channelId/dtmf', async (req, res) => {
  try {
    const { dtmf } = req.body;
    if (!dtmf) return res.status(400).json({ success: false, error: 'dtmf parameter required' });
    
    const channel = ariClient.Channel(req.params.channelId);
    await channel.sendDTMF({ dtmf });
    res.json({ success: true, message: 'DTMF sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send DTMF' });
  }
});

// Dial another number from channel
app.post('/api/channels/:channelId/dial', async (req, res) => {
  try {
    const { endpoint, timeout = 30 } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, error: 'endpoint parameter required' });
    
    const channel = ariClient.Channel(req.params.channelId);
    await channel.dial({ endpoint, timeout });
    res.json({ success: true, message: 'Dialing' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to dial' });
  }
});

// Transfer channel
app.post('/api/channels/:channelId/transfer', async (req, res) => {
  try {
    const { extension } = req.body;
    if (!extension) return res.status(400).json({ success: false, error: 'extension parameter required' });
    
    const channel = ariClient.Channel(req.params.channelId);
    await channel.continueInDialplan({ extension });
    res.json({ success: true, message: 'Channel transferred' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to transfer' });
  }
});

// ============== DEVICE STATES ==============

app.get('/api/device-states', async (req, res) => {
  try {
    const states = await ariClient.deviceStates.list();
    res.json({ success: true, states: states || [] });
  } catch (error) {
    res.json({ success: true, states: [] });
  }
});

app.get('/api/device-states/:deviceName', async (req, res) => {
  try {
    const state = await ariClient.deviceStates.get({ deviceName: req.params.deviceName });
    res.json({ success: true, state });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Device state not found' });
  }
});

// ============== MAILBOXES ==============

app.get('/api/mailboxes', async (req, res) => {
  try {
    const mailboxes = await ariClient.mailboxes.list();
    res.json({ success: true, mailboxes: mailboxes || [] });
  } catch (error) {
    res.json({ success: true, mailboxes: [] });
  }
});

app.get('/api/mailboxes/:mailboxName', async (req, res) => {
  try {
    const mailbox = await ariClient.mailboxes.get({ mailboxName: req.params.mailboxName });
    res.json({ success: true, mailbox });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Mailbox not found' });
  }
});

app.put('/api/mailboxes/:mailboxName', async (req, res) => {
  try {
    const { oldMessages, newMessages } = req.body;
    const mailbox = ariClient.Mailbox(req.params.mailboxName);
    await mailbox.update({ oldMessages, newMessages });
    res.json({ success: true, message: 'Mailbox updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update mailbox' });
  }
});

// ============== SOUNDS/MEDIA ==============

app.get('/api/sounds', async (req, res) => {
  try {
    const { lang, format } = req.query;
    const sounds = await ariClient.sounds.list({ lang, format });
    res.json({ success: true, sounds: sounds || [] });
  } catch (error) {
    res.json({ success: true, sounds: [] });
  }
});

app.get('/api/sounds/:soundId', async (req, res) => {
  try {
    const sound = await ariClient.sounds.get({ soundId: req.params.soundId });
    res.json({ success: true, sound });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Sound not found' });
  }
});

// ============== PLAYBACK CONTROL ==============

app.get('/api/playbacks', async (req, res) => {
  try {
    const playbacks = Object.values(activeCalls).filter(c => c.playback);
    res.json({ success: true, playbacks });
  } catch (error) {
    res.json({ success: true, playbacks: [] });
  }
});

app.post('/api/playbacks/:playbackId/control', async (req, res) => {
  try {
    const { operation } = req.body; // play, pause, stop
    if (!operation) return res.status(400).json({ success: false, error: 'operation required' });
    
    const playback = ariClient.Playback(req.params.playbackId);
    if (operation === 'pause') await playback.pause();
    else if (operation === 'stop') await playback.stop();
    else if (operation === 'play') await playback.play();
    
    res.json({ success: true, message: `Playback ${operation}ed` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to control playback' });
  }
});

// ============== RECORDINGS ==============

app.get('/api/recordings', async (req, res) => {
  try {
    const recordings = await ariClient.recordings.listStored();
    res.json({ success: true, recordings: recordings || [] });
  } catch (error) {
    res.json({ success: true, recordings: [] });
  }
});

app.get('/api/recordings/:recordingName', async (req, res) => {
  try {
    const recording = await ariClient.recordings.getStored({ 
      recordingName: req.params.recordingName 
    });
    res.json({ success: true, recording });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Recording not found' });
  }
});

app.delete('/api/recordings/:recordingName', async (req, res) => {
  try {
    const recording = ariClient.StoredRecording(req.params.recordingName);
    await recording.delete();
    res.json({ success: true, message: 'Recording deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete recording' });
  }
});

// ============== APPLICATIONS ==============

app.get('/api/applications', async (req, res) => {
  try {
    const apps = await ariClient.applications.list();
    res.json({ success: true, applications: apps || [] });
  } catch (error) {
    res.json({ success: true, applications: [] });
  }
});

app.get('/api/applications/:applicationName', async (req, res) => {
  try {
    const app = await ariClient.applications.get({ 
      applicationName: req.params.applicationName 
    });
    res.json({ success: true, application: app });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Application not found' });
  }
});

// ============== LEGACY / TWILIO-PARITY CALL CONTROL ==============

// Enhanced single-trunk originate (legacy newcall)
app.post('/newcall', async (req, res) => {
  const {
    number,
    webhookUrl,
    callerId = process.env.CALLER_ID || '19172452367',
    useAmd = false,
    voiceName = 'en-US-Neural2-A',
    ringTimeout = 30
  } = req.body || {};

  if (!number) {
    return res.status(400).json({ success: false, error: 'Missing required parameter: number' });
  }
  if (req.apiKey.credits <= 0) {
    return res.status(402).json({ success: false, error: 'Insufficient credits', credits: req.apiKey.credits });
  }
  if (!trunks.length) {
    return res.status(503).json({ success: false, error: 'No trunks assigned. Please assign at least one trunk.', code: 'NO_TRUNKS_ASSIGNED' });
  }

  try {
    const context = useAmd ? 'internal_amd' : 'internal';
    const trunkEndpoint = getNextTrunkRoundRobin();
    const channel = ariClient.Channel();
    const channelData = await channel.originate({
      endpoint: `PJSIP/${number}@${trunkEndpoint}`,
      extension: number,
      context,
      callerId,
      app: ARI_APP_NAME,
      variables: {
        WEBHOOK_URL: webhookUrl || '',
        USE_AMD: useAmd ? '1' : '0'
      }
    });

    const callData = createCallData(channelData, voiceName);
    callData.webhookUrl = webhookUrl;
    callData.apiKeyId = req.apiKey.id;
    callData.number = number;
    callData.trunk = trunkEndpoint;
    callData.ratePerSecond = req.apiKey.rate_per_second || 0;

    activeCalls[channelData.id] = callData;
    setupCallTimeout(channelData.id, ringTimeout);
    await logCall(channelData.id, req.apiKey.id, number, 'ringing');

    notifyWebhook(channelData.id, {
      event: 'call.initiated',
      status: 'ringing',
      number,
      useAmd,
      ringTimeoutSeconds: ringTimeout,
      trunk: trunkEndpoint
    });

    res.json({
      success: true,
      callId: channelData.id,
      status: 'ringing',
      amdEnabled: useAmd,
      voiceName,
      credits: req.apiKey.credits,
      ringTimeoutSeconds: ringTimeout,
      trunk: trunkEndpoint,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Call origination error:', err.message);
    await logCall(null, req.apiKey.id, number, 'failed');
    res.status(500).json({ success: false, error: err.message, code: 'ORIGINATION_FAILED' });
  }
});

// PBX-style originate with ordered failover
app.post('/makecall', async (req, res) => {
  const {
    number,
    webhookUrl,
    callerId = process.env.CALLER_ID || '19172452367',
    useAmd = false,
    voiceName = 'en-US-Neural2-A',
    ringTimeout = 30
  } = req.body || {};

  if (!number) {
    return res.status(400).json({ success: false, error: 'Missing required parameter: number' });
  }
  if (req.apiKey.credits <= 0) {
    return res.status(402).json({ success: false, error: 'Insufficient credits', credits: req.apiKey.credits });
  }
  if (!trunks.length) {
    return res.status(503).json({ success: false, error: 'No trunks assigned. Please assign at least one trunk.', code: 'NO_TRUNKS_ASSIGNED' });
  }

  try {
    const context = useAmd ? 'internal_amd' : 'internal';
    const startIndex = trunkRoundRobinIndex;
    trunkRoundRobinIndex = (trunkRoundRobinIndex + 1) % trunks.length;
    const orderedTrunks = getOrderedTrunksFrom(startIndex);

    let channelData = null;
    let usedTrunk = null;
    let attempt = 0;
    let lastErr = null;
    const attemptedTrunks = [];

    for (const trunkEndpoint of orderedTrunks) {
      attempt++;
      attemptedTrunks.push(trunkEndpoint);
      const started = Date.now();
      try {
        const channel = ariClient.Channel();
        channelData = await channel.originate({
          endpoint: `PJSIP/${number}@${trunkEndpoint}`,
          extension: number,
          context,
          callerId,
          app: ARI_APP_NAME,
          variables: {
            WEBHOOK_URL: webhookUrl || '',
            USE_AMD: useAmd ? '1' : '0'
          }
        });
        usedTrunk = trunkEndpoint;
        updateTrunkStats(trunkEndpoint, true, Date.now() - started);
        break;
      } catch (err) {
        updateTrunkStats(trunkEndpoint, false);
        lastErr = err;
      }
    }

    if (!channelData) {
      await logCall(null, req.apiKey.id, number, 'failed');
      return res.status(500).json({
        success: false,
        error: lastErr ? lastErr.message : 'All trunk originate attempts failed',
        code: 'ORIGINATION_FAILED',
        attemptedTrunks,
        totalTrunks: trunks.length
      });
    }

    const callData = createCallData(channelData, voiceName);
    callData.webhookUrl = webhookUrl;
    callData.apiKeyId = req.apiKey.id;
    callData.number = number;
    callData.trunk = usedTrunk;
    callData.trunkAttempts = attempt;
    callData.ratePerSecond = req.apiKey.rate_per_second || 0;

    activeCalls[channelData.id] = callData;
    setupCallTimeout(channelData.id, ringTimeout);
    await logCall(channelData.id, req.apiKey.id, number, 'ringing');

    notifyWebhook(channelData.id, {
      event: 'call.initiated',
      status: 'ringing',
      number,
      useAmd,
      ringTimeoutSeconds: ringTimeout,
      trunk: usedTrunk,
      trunkAttempts: attempt,
      totalTrunks: trunks.length
    });

    res.json({
      success: true,
      callId: channelData.id,
      status: 'ringing',
      amdEnabled: useAmd,
      voiceName,
      credits: req.apiKey.credits,
      ringTimeoutSeconds: ringTimeout,
      trunk: usedTrunk,
      trunkAttempts: attempt,
      totalTrunks: trunks.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Call origination error:', err.message);
    await logCall(null, req.apiKey.id, number, 'failed');
    res.status(500).json({ success: false, error: err.message, code: 'ORIGINATION_FAILED' });
  }
});

// Batchcall mirrors makecall
app.post('/batchcall', async (req, res) => {
  const {
    number,
    webhookUrl,
    callerId = process.env.CALLER_ID || '19172452367',
    useAmd = false,
    voiceName = 'en-US-Neural2-A',
    ringTimeout = 30
  } = req.body || {};

  if (!number) {
    return res.status(400).json({ success: false, error: 'Missing required parameter: number' });
  }
  if (req.apiKey.credits <= 0) {
    return res.status(402).json({ success: false, error: 'Insufficient credits', credits: req.apiKey.credits });
  }
  if (!trunks.length) {
    return res.status(503).json({ success: false, error: 'No trunks assigned. Please assign at least one trunk.', code: 'NO_TRUNKS_ASSIGNED' });
  }

  try {
    const context = useAmd ? 'internal_amd' : 'internal';
    const startIndex = trunkRoundRobinIndex;
    trunkRoundRobinIndex = (trunkRoundRobinIndex + 1) % trunks.length;
    const orderedTrunks = getOrderedTrunksFrom(startIndex);

    let channelData = null;
    let usedTrunk = null;
    let attempt = 0;
    let lastErr = null;
    const attemptedTrunks = [];

    for (const trunkEndpoint of orderedTrunks) {
      attempt++;
      attemptedTrunks.push(trunkEndpoint);
      const started = Date.now();
      try {
        const channel = ariClient.Channel();
        channelData = await channel.originate({
          endpoint: `PJSIP/${number}@${trunkEndpoint}`,
          extension: number,
          context,
          callerId,
          app: ARI_APP_NAME,
          variables: {
            WEBHOOK_URL: webhookUrl || '',
            USE_AMD: useAmd ? '1' : '0'
          }
        });
        usedTrunk = trunkEndpoint;
        updateTrunkStats(trunkEndpoint, true, Date.now() - started);
        break;
      } catch (err) {
        updateTrunkStats(trunkEndpoint, false);
        lastErr = err;
      }
    }

    if (!channelData) {
      await logCall(null, req.apiKey.id, number, 'failed');
      return res.status(500).json({
        success: false,
        error: lastErr ? lastErr.message : 'All trunk originate attempts failed',
        code: 'ORIGINATION_FAILED',
        attemptedTrunks,
        totalTrunks: trunks.length
      });
    }

    const callData = createCallData(channelData, voiceName);
    callData.webhookUrl = webhookUrl;
    callData.apiKeyId = req.apiKey.id;
    callData.number = number;
    callData.trunk = usedTrunk;
    callData.trunkAttempts = attempt;
    callData.ratePerSecond = req.apiKey.rate_per_second || 0;

    activeCalls[channelData.id] = callData;
    setupCallTimeout(channelData.id, ringTimeout);
    await logCall(channelData.id, req.apiKey.id, number, 'ringing');

    notifyWebhook(channelData.id, {
      event: 'call.initiated',
      status: 'ringing',
      number,
      useAmd,
      ringTimeoutSeconds: ringTimeout,
      trunk: usedTrunk,
      trunkAttempts: attempt,
      totalTrunks: trunks.length
    });

    res.json({
      success: true,
      callId: channelData.id,
      status: 'ringing',
      amdEnabled: useAmd,
      voiceName,
      credits: req.apiKey.credits,
      ringTimeoutSeconds: ringTimeout,
      trunk: usedTrunk,
      trunkAttempts: attempt,
      totalTrunks: trunks.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Batchcall origination error:', err.message);
    await logCall(null, req.apiKey.id, number, 'failed');
    res.status(500).json({ success: false, error: err.message, code: 'ORIGINATION_FAILED' });
  }
});

// Hangup call
app.post('/hangup', async (req, res) => {
  const { callId } = req.body || {};
  const callData = activeCalls[callId];
  if (!callData) return res.status(404).json({ success: false, error: 'Call not found' });
  try {
    await callData.channel.hangup();
    res.json({ success: true, message: `Call ${callId} terminated`, callId });
  } catch (err) {
    console.error(`Hangup error for ${callId}:`, err.message);
    res.status(500).json({ success: false, error: 'Failed to hangup call' });
  }
});

// TTS playback
app.post('/voice', async (req, res) => {
  const { callId, text, playTo = 'bridge' } = req.body || {};
  const callData = activeCalls[callId];
  if (!callData) return res.status(404).json({ success: false, error: 'Call not found' });
  if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Text is required' });
  try {
    const media = await synthesizeTTS(callId, text);
    const playbackId = `tts-${callId}-${Date.now()}`;
    if (playTo === 'bridge' && callData.bridge) {
      await callData.bridge.play({ media, playbackId });
    } else {
      await callData.channel.play({ media, playbackId });
    }
    notifyWebhook(callId, { event: 'tts.played', text: text.substring(0, 100), method: playTo, playbackId });
    res.json({ success: true, message: 'TTS played successfully', text: text.substring(0, 50) + (text.length > 50 ? '...' : ''), playbackId, method: playTo });
  } catch (err) {
    console.error(`TTS error for ${callId}:`, err.message);
    res.status(500).json({ success: false, error: 'TTS playback failed', details: err.message });
  }
});

// Play existing audio
app.post('/play', async (req, res) => {
  const { callId, file, playTo = 'bridge' } = req.body || {};
  const callData = activeCalls[callId];
  if (!callData) return res.status(404).json({ success: false, error: 'Call not found' });
  try {
    const playbackId = `play-${callId}-${Date.now()}`;
    if (playTo === 'bridge' && callData.bridge) {
      await callData.bridge.play({ media: `sound:${file}`, playbackId });
    } else {
      await callData.channel.play({ media: `sound:${file}`, playbackId });
    }
    res.json({ success: true, message: `Audio file played: ${file}`, file, playbackId, method: playTo });
  } catch (err) {
    console.error(`Play error for ${callId}:`, err.message);
    res.status(500).json({ success: false, error: 'Audio playback failed' });
  }
});

// Gather digits with TTS prompt
app.post('/gather', async (req, res) => {
  const { callId, text, numDigits = 1, timeout = 10000, playTo = 'bridge' } = req.body || {};
  const callData = activeCalls[callId];
  if (!callData) return res.status(404).json({ success: false, error: 'Call not found' });
  try {
    if (callData.gather && callData.gather.timer) clearTimeout(callData.gather.timer);
    callData.gather = { digits: '', numDigits, timeout, timer: null, startTime: Date.now() };

    const media = await synthesizeTTS(callId, text, '-gather');
    const playbackId = `gather-${callId}-${Date.now()}`;
    if (playTo === 'bridge' && callData.bridge) {
      await callData.bridge.play({ media, playbackId });
    } else {
      await callData.channel.play({ media, playbackId });
    }

    callData.gather.timer = setTimeout(() => {
      if (callData.gather) {
        notifyWebhook(callId, {
          event: 'gather.timeout',
          digits: callData.gather.digits,
          expected: numDigits,
          duration: Date.now() - callData.gather.startTime
        });
        callData.gather = null;
      }
    }, timeout);

    notifyWebhook(callId, { event: 'gather.started', prompt: (text && text.substring(0, 100)) || '', expectedDigits: numDigits, timeoutMs: timeout });
    res.json({ success: true, message: `Gathering ${numDigits} digits with ${timeout}ms timeout`, callId, expectedDigits: numDigits, timeoutMs: timeout });
  } catch (err) {
    console.error(`Gather error for ${callId}:`, err.message);
    res.status(500).json({ success: false, error: 'Gather operation failed', details: err.message });
  }
});

// Call status list
app.get('/calls', authenticateApiKey, (req, res) => {
  const userCalls = Object.entries(activeCalls)
    .filter(([_, data]) => data.apiKeyId === req.apiKey.id)
    .map(([id, data]) => ({
      callId: id,
      status: data.status,
      number: data.number,
      answeredAt: data.answeredAt,
      callStartTime: data.callStartTime,
      amd: data.amd,
      gather: data.gather ? {
        collected: data.gather.digits,
        expected: data.gather.numDigits,
        remaining: data.gather.numDigits - data.gather.digits.length,
        timeRemaining: data.gather.timeout ? Math.max(0, data.gather.timeout - (Date.now() - data.gather.startTime)) : 0
      } : null,
      recording: {
        active: data.recording.active,
        filename: data.recording.filename,
        recordingId: data.recording.recordingId,
        method: data.recording.snoopChannel ? 'snoop' : 'bridge'
      },
      voiceName: data.voiceName,
      hasBridge: !!data.bridge
    }));

  res.json({ success: true, totalCalls: userCalls.length, activeCalls: userCalls.length, calls: userCalls, timestamp: new Date().toISOString() });
});

// Single call status
app.get('/calls/:callId', authenticateApiKey, (req, res) => {
  const { callId } = req.params;
  const data = activeCalls[callId];
  if (!data || data.apiKeyId !== req.apiKey.id) return res.status(404).json({ success: false, error: 'Call not found' });
  res.json({
    success: true,
    callId,
    status: data.status,
    number: data.number,
    answeredAt: data.answeredAt,
    callStartTime: data.callStartTime,
    amd: data.amd,
    gather: data.gather ? {
      collected: data.gather.digits,
      expected: data.gather.numDigits,
      remaining: data.gather.numDigits - data.gather.digits.length,
      timeRemaining: data.gather.timeout ? Math.max(0, data.gather.timeout - (Date.now() - data.gather.startTime)) : 0
    } : null,
    recording: {
      active: data.recording.active,
      filename: data.recording.filename,
      recordingId: data.recording.recordingId,
      method: data.recording.snoopChannel ? 'snoop' : 'bridge'
    },
    voiceName: data.voiceName,
    hasBridge: !!data.bridge,
    hasSnoop: !!data.recording.snoopChannel
  });
});

// Recording inventory (active + files)
app.get('/recordings', authenticateApiKey, async (req, res) => {
  try {
    const userCalls = Object.entries(activeCalls)
      .filter(([_, data]) => data.apiKeyId === req.apiKey.id)
      .map(([id, s]) => ({
        callId: id,
        filename: (s.recording && s.recording.filename) || null,
        recordingId: (s.recording && s.recording.recordingId) || null,
        active: !!(s.recording && s.recording.active)
      }));

    let files = [];
    try {
      const allFiles = fs.readdirSync(actualRecordingsDir).filter(f => f.endsWith('.wav'));
      for (const f of allFiles) {
        const full = path.join(actualRecordingsDir, f);
        const stat = fs.statSync(full);
        files.push({ filename: f, size: stat.size, createdAt: stat.birthtime || stat.ctime });
      }
    } catch (e) {
      console.warn('Recording dir read warning:', e.message);
    }

    res.json({ success: true, active: userCalls, files });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/recordings/:callId', authenticateApiKey, (req, res) => {
  const { callId } = req.params;
  const st = activeCalls[callId];
  if (!st || st.apiKeyId !== req.apiKey.id || !(st.recording && st.recording.recordingId)) {
    return res.status(404).json({ success: false, error: 'Recording not found for callId' });
  }
  res.json({ success: true, callId, recordingId: st.recording.recordingId, filename: st.recording.filename, active: !!st.recording.active });
});

app.get('/recordings/:callId/download', authenticateApiKey, (req, res) => {
  const { callId } = req.params;
  const st = activeCalls[callId];
  if (!st || st.apiKeyId !== req.apiKey.id || !(st.recording && st.recording.filename)) {
    return res.status(404).json({ success: false, error: 'Recording not found for callId' });
  }
  try {
    const filePath = safeRecordingPath(st.recording.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Recording file missing' });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${st.recording.filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/recordings/file/:filename/download', authenticateApiKey, (req, res) => {
  const { filename } = req.params;
  if (!filename || !filename.endsWith('.wav')) return res.status(400).json({ success: false, error: 'Invalid filename' });
  try {
    const filePath = safeRecordingPath(filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Recording file not found' });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/recordings/:callId/stop', authenticateApiKey, async (req, res) => {
  const { callId } = req.params;
  const callData = activeCalls[callId];
  if (!callData || callData.apiKeyId !== req.apiKey.id || !callData.recording.active) {
    return res.status(404).json({ success: false, error: 'No active recording found' });
  }
  try {
    callData.recording.active = false;
    notifyWebhook(callId, { event: 'recording.stopped', filename: callData.recording.filename, recordingId: callData.recording.recordingId });
    res.json({ success: true, message: 'Recording stopped successfully', filename: callData.recording.filename, recordingId: callData.recording.recordingId });
  } catch (err) {
    console.error(`Stop recording error for ${callId}:`, err.message);
    res.status(500).json({ success: false, error: 'Failed to stop recording' });
  }
});

// User dashboard endpoints (API-key scoped)
app.post('/api/dashboard', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyId = req.apiKey.id;
    const statsResult = await db.query(`
      SELECT 
        ak.credits as total_credits,
        ak.total_calls,
        ak.successful_calls,
        CASE WHEN ak.total_calls > 0 THEN ROUND((ak.successful_calls::decimal / ak.total_calls) * 100, 2) ELSE 0 END as success_rate,
        (SELECT COUNT(*) FROM call_logs WHERE api_key_id = $1 AND created_at >= CURRENT_DATE) as calls_today,
        (SELECT COUNT(*) FROM call_logs WHERE api_key_id = $1 AND status = 'completed' AND created_at >= CURRENT_DATE) as successful_calls_today,
        (SELECT COUNT(*) FROM call_logs WHERE api_key_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days') as calls_this_week
      FROM api_keys ak WHERE ak.id = $1
    `, [apiKeyId]);

    const recentCallsResult = await db.query(`
      SELECT call_id, number, status, amd_status, duration, created_at
      FROM call_logs WHERE api_key_id = $1
      ORDER BY created_at DESC LIMIT 10
    `, [apiKeyId]);

    const stats = statsResult.rows[0] || {};
    res.json({
      success: true,
      stats: {
        total_credits: parseInt(stats.total_credits) || 0,
        total_calls: parseInt(stats.total_calls) || 0,
        successful_calls: parseInt(stats.successful_calls) || 0,
        success_rate: parseFloat(stats.success_rate) || 0,
        calls_today: parseInt(stats.calls_today) || 0,
        successful_calls_today: parseInt(stats.successful_calls_today) || 0,
        calls_this_week: parseInt(stats.calls_this_week) || 0
      },
      recent_calls: recentCallsResult.rows
    });
  } catch (error) {
    console.error('User dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard data' });
  }
});

app.post('/api/call-logs', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyId = req.apiKey.id;
    const { page = 1, page_size = 20, status } = req.body;
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(page_size) || 20;
    const offset = (pageNum - 1) * pageSize;

    let query = `
      SELECT call_id, number, status, amd_status, duration, created_at
      FROM call_logs WHERE api_key_id = $1`;
    const queryParams = [apiKeyId];
    let paramCount = 1;
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }
    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(pageSize, offset);

    const logsResult = await db.query(query, queryParams);

    let countQuery = 'SELECT COUNT(*) FROM call_logs WHERE api_key_id = $1';
    const countParams = [apiKeyId];
    if (status) {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }
    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      logs: logsResult.rows,
      total_count: totalCount,
      pagination: {
        page: pageNum,
        page_size: pageSize,
        total_pages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    console.error('User call logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to load call logs' });
  }
});

app.post('/api/analytics', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyId = req.apiKey.id;
    const { days = 7 } = req.body;
    const daysInt = parseInt(days);

    const overallStats = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
        COUNT(CASE WHEN status = 'no-answer' THEN 1 END) as no_answer_calls,
        COUNT(CASE WHEN amd_status = 'HUMAN' THEN 1 END) as human_calls,
        COUNT(CASE WHEN amd_status = 'MACHINE' THEN 1 END) as machine_calls,
        AVG(duration) as avg_duration
      FROM call_logs WHERE api_key_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${daysInt} days'
    `, [apiKeyId]);

    const dailyVolume = await db.query(`
      SELECT DATE(created_at) as date, COUNT(*) as total_calls,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM call_logs WHERE api_key_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${daysInt} days'
      GROUP BY DATE(created_at) ORDER BY date DESC
    `, [apiKeyId]);

    const statusBreakdown = await db.query(`
      SELECT status, COUNT(*) as count,
        ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 2) as percentage
      FROM call_logs WHERE api_key_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${daysInt} days'
      GROUP BY status ORDER BY count DESC
    `, [apiKeyId]);

    const stats = overallStats.rows[0];
    const totalCalls = parseInt(stats.total_calls) || 0;
    const completedCalls = parseInt(stats.completed_calls) || 0;
    const successRate = totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      period: `Last ${daysInt} days`,
      overview: {
        totalCalls,
        completedCalls,
        failedCalls: parseInt(stats.failed_calls) || 0,
        noAnswerCalls: parseInt(stats.no_answer_calls) || 0,
        humanCalls: parseInt(stats.human_calls) || 0,
        machineCalls: parseInt(stats.machine_calls) || 0,
        avgDuration: parseFloat(stats.avg_duration) || 0,
        successRate: parseFloat(successRate)
      },
      dailyVolume: dailyVolume.rows,
      statusBreakdown: statusBreakdown.rows
    });
  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load analytics' });
  }
});

app.get('/api/me', authenticateApiKey, async (req, res) => {
  try {
    res.json({
      success: true,
      apiKey: {
        id: req.apiKey.id,
        keyId: req.apiKey.key_id || req.apiKey.api_key,
        name: req.apiKey.name,
        credits: req.apiKey.credits,
        totalCalls: req.apiKey.total_calls,
        successfulCalls: req.apiKey.successful_calls,
        rateLimit: req.apiKey.rate_limit,
        createdAt: req.apiKey.created_at,
        lastUsed: req.apiKey.last_used
      }
    });
  } catch (error) {
    console.error('User info error:', error);
    res.status(500).json({ success: false, error: 'Failed to load user info' });
  }
});

// ============== TRUNKS & PROVIDERS (from legacy project) ==============

// List supported providers and templates
app.get('/api/providers', (req, res) => {
  const providers = Object.keys(providerTemplates).filter(k => !['global', 'transport', '_info'].includes(k));
  res.json({ success: true, providers, info: providerTemplates._info || null });
});

// Preview rendered PJSIP config for a provider
app.post('/api/providers/:provider/render', (req, res) => {
  const { provider } = req.params;
  const data = req.body || {};
  const tpl = providerTemplates[provider];
  if (!tpl) return res.status(404).json({ success: false, error: 'Provider not found' });

  const rendered = {};
  ['registration', 'auth', 'aor', 'endpoint', 'identify'].forEach(section => {
    if (tpl[section]) rendered[section] = renderTemplate(tpl[section], data);
  });
  if (providerTemplates.transport && providerTemplates.transport.template) {
    rendered.transport = renderTemplate(providerTemplates.transport.template, {
      port: data.port || systemSettings.transportPort,
      external_ip: data.external_ip || '0.0.0.0',
      local_net: data.local_net || '192.168.1.0/24'
    });
  }
  if (providerTemplates.global && providerTemplates.global.template) {
    rendered.global = providerTemplates.global.template;
  }
  res.json({ success: true, rendered });
});

// Trunk CRUD - Now with database persistence
app.get('/api/trunks', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM sip_trunks ORDER BY created_at DESC'
    );
    res.json({ success: true, trunks: result.rows });
  } catch (error) {
    console.error('Error fetching trunks:', error);
    res.json({ success: true, trunks: [] });
  }
});

app.post('/api/trunks', authenticateAdmin, async (req, res) => {
  const { trunk_name, provider, username, password, sip_server, server, sip_port, port, context, codecs, registration_enabled, from_user } = req.body || {};
  
  // Accept either 'server' or 'sip_server' from frontend
  const serverAddr = server || sip_server;
  const serverPort = port || sip_port || 5060;
  
  if (!trunk_name || !serverAddr) {
    return res.status(400).json({ success: false, error: 'trunk_name and server are required' });
  }
  
  try {
    // Insert into database
    const result = await db.query(
      `INSERT INTO sip_trunks (trunk_name, provider, username, password, server, port, context, codecs, registration_enabled) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [trunk_name, provider || 'custom', username, password, serverAddr, serverPort, context || 'default', codecs || 'ulaw,alaw', registration_enabled !== false]
    );
    
    // Generate PJSIP config
    const trunk = result.rows[0];
    await generatePJSIPConfigForTrunk(trunk);
    
    res.json({ success: true, trunk: trunk, message: 'Trunk created. Reload Asterisk to apply changes.' });
  } catch (error) {
    console.error('Error creating trunk:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/trunks/:trunkName', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM sip_trunks WHERE trunk_name = $1 RETURNING *',
      [req.params.trunkName]
    );
    
    if (result.rows.length > 0) {
      await generatePJSIPConfigForTrunk(null, req.params.trunkName);
      res.json({ success: true, removed: true, message: 'Trunk deleted. Reload Asterisk to apply changes.' });
    } else {
      res.json({ success: false, removed: false, error: 'Trunk not found' });
    }
  } catch (error) {
    console.error('Error deleting trunk:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to generate PJSIP config
async function generatePJSIPConfigForTrunk(trunk, deleteTrunkName = null) {
  try {
    const PJSIP_CONF = '/etc/asterisk/pjsip.conf';
    
    // Read current config
    let config = '';
    try {
      config = fs.readFileSync(PJSIP_CONF, 'utf8');
    } catch (e) {
      console.warn('Could not read pjsip.conf:', e.message);
      return;
    }
    
    // Remove old trunk config if deleting
    if (deleteTrunkName) {
      const regex = new RegExp(`; === TRUNK: ${deleteTrunkName} ===[\\s\\S]*?; === END TRUNK: ${deleteTrunkName} ===\\n`, 'g');
      config = config.replace(regex, '');
    }
    
    // Add new trunk config if creating
    if (trunk) {
      const username = trunk.username || trunk.trunk_name;
      const password = trunk.password || '';
      const server = trunk.server;
      const port = trunk.port || 5060;
      const context = trunk.context || 'default';
      const codecs = trunk.codecs || 'ulaw,alaw';
      
      // Properly formatted PJSIP trunk configuration
      const trunkConfig = `
; === TRUNK: ${trunk.trunk_name} ===
[${trunk.trunk_name}-transport]
type=transport
protocol=udp
bind=0.0.0.0:5061

[${trunk.trunk_name}-registration]
type=registration
transport=${trunk.trunk_name}-transport
server_uri=sip:${server}:${port}
client_uri=sip:${username}@${server}:${port}
contact_uri=sip:${username}@${server}
retry_interval=60
expiration=3600
auth=${trunk.trunk_name}-auth

[${trunk.trunk_name}-auth]
type=auth
auth_type=userpass
username=${username}
password=${password}

[${trunk.trunk_name}-aor]
type=aor
max_contacts=10
contact=sip:${server}:${port}

[${trunk.trunk_name}-endpoint]
type=endpoint
context=${context}
disallow=all
allow=${codecs}
outbound_auth=${trunk.trunk_name}-auth
aors=${trunk.trunk_name}-aor
from_user=${username}
from_domain=${server}

[${trunk.trunk_name}-identify]
type=identify
endpoint=${trunk.trunk_name}-endpoint
match=${server}
; === END TRUNK: ${trunk.trunk_name} ===
`;
      
      config += trunkConfig;
    }
    
    // Write back to file
    try {
      fs.writeFileSync(PJSIP_CONF, config, 'utf8');
      console.log(`✅ Updated ${PJSIP_CONF} for trunk`);
      return true;
    } catch (e) {
      console.error('❌ Failed to write pjsip.conf:', e.message);
      return false;
    }
  } catch (error) {
    console.error('Error generating PJSIP config:', error);
    return false;
  }
}

// System settings (memory)
app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings: systemSettings });
});

app.put('/api/settings', (req, res) => {
  const { callerId, transportPort, googleTtsApiKey, ttsEngine } = req.body || {};
  if (callerId !== undefined) systemSettings.callerId = callerId;
  if (transportPort !== undefined) systemSettings.transportPort = transportPort;
  if (googleTtsApiKey !== undefined) systemSettings.googleTtsApiKey = googleTtsApiKey;
  if (ttsEngine !== undefined) systemSettings.ttsEngine = ttsEngine;
  res.json({ success: true, settings: systemSettings });
});

// ============== SYSTEM STATISTICS ==============

app.get('/api/stats', async (req, res) => {
  try {
    const channels = await ariClient.channels.list();
    const bridges = await ariClient.bridges.list();
    const endpoints = await ariClient.endpoints.list();
    
    res.json({ 
      success: true, 
      stats: {
        activeCalls: Object.keys(activeCalls).length,
        channels: (channels && channels.length) || 0,
        bridges: (bridges && bridges.length) || 0,
        endpoints: (endpoints && endpoints.length) || 0,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Get call statistics from database
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalCalls = await db.query('SELECT COUNT(*) as count FROM call_logs');
    const todayCalls = await db.query('SELECT COUNT(*) as count FROM call_logs WHERE DATE(created_at) = CURRENT_DATE');
    const totalDuration = await db.query('SELECT SUM(EXTRACT(EPOCH FROM (ended_at - created_at))) as total FROM call_logs WHERE ended_at IS NOT NULL');
    const topNumbers = await db.query('SELECT number, COUNT(*) as count FROM call_logs GROUP BY number ORDER BY count DESC LIMIT 10');
    
    res.json({
      success: true,
      stats: {
        totalCalls: parseInt(totalCalls.rows[0].count),
        todayCalls: parseInt(todayCalls.rows[0].count),
        totalDuration: totalDuration.rows[0].total || 0,
        topNumbers: topNumbers.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

// ============== ASTERISK CONFIG FILE MANAGEMENT ==============

const ASTERISK_CONFIG_DIR = process.env.ASTERISK_CONFIG_DIR || '/etc/asterisk';

// Helper to safely read Asterisk config files
async function readAsteriskConfig(filename) {
  const safeName = path.basename(filename);
  const filePath = path.join(ASTERISK_CONFIG_DIR, safeName);
  console.log(`📖 Reading config file: ${filePath}`);
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    console.log(`✅ Successfully read ${safeName} (${content.length} bytes)`);
    return { success: true, content, filename: safeName, path: filePath };
  } catch (error) {
    console.error(`❌ Failed to read ${filePath}: ${error.message}`);
    return { success: false, error: error.message, filename: safeName, path: filePath };
  }
}

// Helper to safely write Asterisk config files
async function writeAsteriskConfig(filename, content) {
  const safeName = path.basename(filename);
  const filePath = path.join(ASTERISK_CONFIG_DIR, safeName);
  console.log(`📝 Writing config file: ${filePath}`);
  try {
    // Create backup
    const backupPath = `${filePath}.backup.${Date.now()}`;
    let backupCreated = false;
    try {
      await fs.promises.copyFile(filePath, backupPath);
      backupCreated = true;
      console.log(`💾 Backup created: ${path.basename(backupPath)}`);
    } catch (e) { 
      console.log(`ℹ️  No existing file to backup: ${safeName}`);
    }
    
    await fs.promises.writeFile(filePath, content, 'utf8');
    console.log(`✅ Successfully wrote ${safeName} (${content.length} bytes)`);
    return { 
      success: true, 
      filename: safeName,
      path: filePath,
      backup: backupCreated ? path.basename(backupPath) : null
    };
  } catch (error) {
    console.error(`❌ Failed to write ${filePath}: ${error.message}`);
    return { success: false, error: error.message, filename: safeName, path: filePath };
  }
}

// Reload Asterisk configuration
async function reloadAsteriskConfig(module = 'all') {
  return new Promise((resolve) => {
    let reloadCmd;
    
    // Build the reload command based on module
    if (module === 'all') {
      reloadCmd = 'core reload';
    } else if (module === 'pjsip') {
      reloadCmd = 'pjsip reload';
    } else if (module === 'dialplan') {
      reloadCmd = 'dialplan reload';
    } else if (module === 'module') {
      reloadCmd = 'module reload';
    } else if (module === 'sip') {
      reloadCmd = 'sip reload';
    } else if (module === 'voicemail') {
      reloadCmd = 'voicemail reload';
    } else if (module === 'features') {
      reloadCmd = 'features reload';
    } else {
      reloadCmd = `${module} reload`;
    }
    
    // Execute via asterisk -rx
    const cmd = `asterisk -rx "${reloadCmd}"`;
    
    console.log(`[RELOAD-EXEC] Command: ${cmd}`);
    
    exec(cmd, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Log everything for debugging
      console.log(`[RELOAD-RESPONSE]`, { error: error ? error.code : 'none', stdout, stderr });

      const combinedOut = [stdout, stderr].filter(Boolean).join('\n');
      const exitCode = typeof (error && error.code) === 'number' ? error.code : null;
      const errorLower = (combinedOut || '').toLowerCase();
      const unableToConnect = errorLower.includes('unable to connect to remote') || errorLower.includes('asterisk.ctl');
      const notFound = exitCode === 127;
      
      // Success if:
      // 1. No error and has output
      // 2. Has output (even with error code - some modules return success but with non-zero exit)
      // 3. stderr contains success message
      const hasOutput = stdout && stdout.trim().length > 0;
      const hasStderr = stderr && stderr.trim().length > 0;
      const hasSuccessMessage = stdout && stdout.includes('reloaded successfully');
      const noError = !error;
      
      if (noError && hasOutput) {
        // Clean successful execution
        console.log(`[RELOAD-SUCCESS] Clean execution with output`);
        resolve({ success: true, output: combinedOut || stdout, command: cmd, exitCode });
      } else if (hasOutput || hasStderr || hasSuccessMessage) {
        // Has output indicating possible success despite exit code
        console.log(`[RELOAD-SUCCESS] Output indicates success despite error code`);
        resolve({ success: true, output: combinedOut || stdout || stderr, command: cmd, exitCode });
      } else if (error && error.killed) {
        // Timeout occurred
        console.error(`[RELOAD-TIMEOUT] Command timeout for ${module}`);
        resolve({ success: false, error: `Reload timeout - command took too long`, output: combinedOut, command: cmd, exitCode });
      } else if (notFound) {
        // Command not found
        console.error(`[RELOAD-NOTFOUND] asterisk command not found`);
        resolve({ success: false, error: `asterisk command not found in system PATH`, output: combinedOut, command: cmd, exitCode });
      } else if (unableToConnect) {
        const friendly = 'Unable to connect to Asterisk (is it running, and do you have permission to access asterisk.ctl?)';
        console.error(`[RELOAD-CONNECT] ${friendly}`);
        resolve({ success: false, error: friendly, output: combinedOut, command: cmd, exitCode });
      } else {
        // Generic error
        const errorMsg = stderr || (error ? error.message : 'Unknown error');
        console.error(`[RELOAD-ERROR]`, errorMsg);
        resolve({ success: false, error: errorMsg, output: combinedOut, command: cmd, exitCode });
      }
    });
  });
}

// ============== DIALPLAN MANAGEMENT ==============

// In-memory dialplan storage (for UI editing before applying to Asterisk)
let dialplanContexts = [];

// Parse extensions.conf format
function parseExtensionsConf(content) {
  const contexts = [];
  let currentContext = null;
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith(';') || trimmed === '') continue;
    
    // Context definition [context-name]
    const contextMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (contextMatch) {
      if (currentContext) contexts.push(currentContext);
      currentContext = {
        name: contextMatch[1],
        extensions: [],
        includes: [],
        comments: []
      };
      continue;
    }
    
    if (!currentContext) continue;
    
    // Include statement
    const includeMatch = trimmed.match(/^include\s*=>\s*(.+)$/i);
    if (includeMatch) {
      currentContext.includes.push(includeMatch[1].trim());
      continue;
    }
    
    // Extension: exten => pattern,priority,application(args)
    const extenMatch = trimmed.match(/^exten\s*=>\s*([^,]+),([^,]+),(.+)$/i);
    if (extenMatch) {
      currentContext.extensions.push({
        pattern: extenMatch[1].trim(),
        priority: extenMatch[2].trim(),
        application: extenMatch[3].trim()
      });
      continue;
    }
    
    // Same => priority,application(args)
    const sameMatch = trimmed.match(/^same\s*=>\s*([^,]+),(.+)$/i);
    if (sameMatch && currentContext.extensions.length > 0) {
      const lastExt = currentContext.extensions[currentContext.extensions.length - 1];
      currentContext.extensions.push({
        pattern: lastExt.pattern,
        priority: sameMatch[1].trim(),
        application: sameMatch[2].trim()
      });
    }
  }
  
  if (currentContext) contexts.push(currentContext);
  return contexts;
}

// Generate extensions.conf format
function generateExtensionsConf(contexts) {
  let output = '; Generated by Asterisk GUI\n';
  output += '; ' + new Date().toISOString() + '\n\n';
  
  for (const context of contexts) {
    output += `[${context.name}]\n`;
    
    for (const inc of context.includes || []) {
      output += `include => ${inc}\n`;
    }
    
    let lastPattern = null;
    for (const ext of context.extensions || []) {
      if (ext.pattern === lastPattern) {
        output += `same => ${ext.priority},${ext.application}\n`;
      } else {
        output += `exten => ${ext.pattern},${ext.priority},${ext.application}\n`;
        lastPattern = ext.pattern;
      }
    }
    output += '\n';
  }
  
  return output;
}

// Get all dialplan contexts
app.get('/api/asterisk/dialplan', authenticateAdmin, async (req, res) => {
  try {
    const result = await readAsteriskConfig('extensions.conf');
    if (!result.success) {
      // Return in-memory contexts if file not accessible
      return res.json({ success: true, contexts: dialplanContexts, source: 'memory' });
    }
    const contexts = parseExtensionsConf(result.content);
    dialplanContexts = contexts; // Sync to memory
    res.json({ success: true, contexts, source: 'file' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific context
app.get('/api/asterisk/dialplan/:contextName', authenticateAdmin, (req, res) => {
  const context = dialplanContexts.find(c => c.name === req.params.contextName);
  if (!context) {
    return res.status(404).json({ success: false, error: 'Context not found' });
  }
  res.json({ success: true, context });
});

// Create new context
app.post('/api/asterisk/dialplan', authenticateAdmin, (req, res) => {
  const { name, extensions = [], includes = [] } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Context name required' });
  }
  if (dialplanContexts.find(c => c.name === name)) {
    return res.status(400).json({ success: false, error: 'Context already exists' });
  }
  const context = { name, extensions, includes, comments: [] };
  dialplanContexts.push(context);
  res.json({ success: true, context });
});

// Update context
app.put('/api/asterisk/dialplan/:contextName', authenticateAdmin, (req, res) => {
  const idx = dialplanContexts.findIndex(c => c.name === req.params.contextName);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Context not found' });
  }
  const { extensions, includes, newName } = req.body;
  if (extensions !== undefined) dialplanContexts[idx].extensions = extensions;
  if (includes !== undefined) dialplanContexts[idx].includes = includes;
  if (newName && newName !== req.params.contextName) {
    if (dialplanContexts.find(c => c.name === newName)) {
      return res.status(400).json({ success: false, error: 'New context name already exists' });
    }
    dialplanContexts[idx].name = newName;
  }
  res.json({ success: true, context: dialplanContexts[idx] });
});

// Delete context
app.delete('/api/asterisk/dialplan/:contextName', authenticateAdmin, (req, res) => {
  const before = dialplanContexts.length;
  dialplanContexts = dialplanContexts.filter(c => c.name !== req.params.contextName);
  res.json({ success: true, removed: before !== dialplanContexts.length });
});

// Add extension to context
app.post('/api/asterisk/dialplan/:contextName/extension', authenticateAdmin, (req, res) => {
  const context = dialplanContexts.find(c => c.name === req.params.contextName);
  if (!context) {
    return res.status(404).json({ success: false, error: 'Context not found' });
  }
  const { pattern, priority = '1', application } = req.body;
  if (!pattern || !application) {
    return res.status(400).json({ success: false, error: 'Pattern and application required' });
  }
  context.extensions.push({ pattern, priority, application });
  res.json({ success: true, context });
});

// Remove extension from context
app.delete('/api/asterisk/dialplan/:contextName/extension/:index', authenticateAdmin, (req, res) => {
  const context = dialplanContexts.find(c => c.name === req.params.contextName);
  if (!context) {
    return res.status(404).json({ success: false, error: 'Context not found' });
  }
  const idx = parseInt(req.params.index);
  if (isNaN(idx) || idx < 0 || idx >= context.extensions.length) {
    return res.status(400).json({ success: false, error: 'Invalid extension index' });
  }
  context.extensions.splice(idx, 1);
  res.json({ success: true, context });
});

// Apply dialplan to Asterisk (write file and reload)
app.post('/api/asterisk/dialplan/apply', authenticateAdmin, async (req, res) => {
  try {
    const content = generateExtensionsConf(dialplanContexts);
    const writeResult = await writeAsteriskConfig('extensions.conf', content);
    if (!writeResult.success) {
      return res.status(500).json({ success: false, error: `Failed to write config: ${writeResult.error}` });
    }
    const reloadResult = await reloadAsteriskConfig('dialplan');
    res.json({ 
      success: true, 
      message: 'Dialplan applied successfully',
      reload: reloadResult 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SIP USER (PJSIP ENDPOINT) MANAGEMENT ==============

// In-memory SIP users storage
let sipUsers = [];

// Parse pjsip_users.conf or similar
function parsePjsipUsers(content) {
  const users = [];
  let currentSection = null;
  let currentType = null;
  let currentData = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(';') || trimmed === '') continue;
    
    const sectionMatch = trimmed.match(/^\[([^\]]+)\](?:\(([^)]+)\))?$/);
    if (sectionMatch) {
      if (currentSection && currentType === 'endpoint') {
        users.push({ ...currentData, name: currentSection });
      }
      currentSection = sectionMatch[1];
      currentType = null;
      currentData = {};
      continue;
    }
    
    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch && currentSection) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (key === 'type') {
        currentType = value;
      }
      currentData[key] = value;
    }
  }
  
  if (currentSection && currentType === 'endpoint') {
    users.push({ ...currentData, name: currentSection });
  }
  
  return users;
}

// Generate PJSIP config for users
function generatePjsipUsers(users) {
  let output = '; PJSIP Users - Generated by Asterisk GUI\n';
  output += '; ' + new Date().toISOString() + '\n\n';
  
  for (const user of users) {
    const name = user.name || user.username;
    const password = user.password || 'changeme';
    const context = user.context || 'default';
    const transport = user.transport || 'transport-udp';
    const codecs = user.codecs || 'ulaw,alaw,g722';
    const callerid = user.callerid || `"${name}" <${name}>`;
    
    // Endpoint section
    output += `[${name}](endpoint-template)\n`;
    output += `type=endpoint\n`;
    output += `context=${context}\n`;
    output += `disallow=all\n`;
    output += `allow=${codecs}\n`;
    output += `auth=${name}-auth\n`;
    output += `aors=${name}\n`;
    output += `callerid=${callerid}\n`;
    if (user.transport) output += `transport=${transport}\n`;
    if (user.directMedia !== undefined) output += `direct_media=${user.directMedia ? 'yes' : 'no'}\n`;
    if (user.rtp_symmetric !== undefined) output += `rtp_symmetric=${user.rtp_symmetric ? 'yes' : 'no'}\n`;
    if (user.force_rport !== undefined) output += `force_rport=${user.force_rport ? 'yes' : 'no'}\n`;
    if (user.rewrite_contact !== undefined) output += `rewrite_contact=${user.rewrite_contact ? 'yes' : 'no'}\n`;
    output += '\n';
    
    // Auth section
    output += `[${name}-auth]\n`;
    output += `type=auth\n`;
    output += `auth_type=userpass\n`;
    output += `username=${name}\n`;
    output += `password=${password}\n`;
    output += '\n';
    
    // AOR section
    output += `[${name}]\n`;
    output += `type=aor\n`;
    output += `max_contacts=${user.maxContacts || 5}\n`;
    output += `remove_existing=${user.removeExisting !== false ? 'yes' : 'no'}\n`;
    if (user.qualifyFrequency) output += `qualify_frequency=${user.qualifyFrequency}\n`;
    output += '\n';
  }
  
  return output;
}

// Get all SIP users
app.get('/api/asterisk/sip-users', authenticateAdmin, async (req, res) => {
  try {
    // Try to read from pjsip_users.conf first
    const result = await readAsteriskConfig('pjsip_users.conf');
    if (result.success) {
      const users = parsePjsipUsers(result.content);
      sipUsers = users.map(u => ({
        name: u.name,
        username: u.name,
        password: '********', // Don't expose passwords
        context: u.context || 'default',
        codecs: u.allow || 'ulaw,alaw',
        transport: u.transport || 'transport-udp',
        callerid: u.callerid || '',
        maxContacts: parseInt(u.max_contacts) || 5,
        enabled: true
      }));
    }
    res.json({ success: true, users: sipUsers, count: sipUsers.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific SIP user
app.get('/api/asterisk/sip-users/:username', authenticateAdmin, (req, res) => {
  const user = sipUsers.find(u => u.username === req.params.username || u.name === req.params.username);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  res.json({ success: true, user: { ...user, password: '********' } });
});

// Create new SIP user
app.post('/api/asterisk/sip-users', authenticateAdmin, (req, res) => {
  const { 
    username, 
    password, 
    context = 'default',
    codecs = 'ulaw,alaw,g722',
    transport = 'transport-udp',
    callerid = '',
    maxContacts = 5,
    directMedia = false,
    rtp_symmetric = true,
    force_rport = true,
    rewrite_contact = true
  } = req.body;
  
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username required' });
  }
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password required' });
  }
  if (sipUsers.find(u => u.username === username || u.name === username)) {
    return res.status(400).json({ success: false, error: 'User already exists' });
  }
  
  const user = {
    name: username,
    username,
    password,
    context,
    codecs,
    transport,
    callerid: callerid || `"${username}" <${username}>`,
    maxContacts,
    directMedia,
    rtp_symmetric,
    force_rport,
    rewrite_contact,
    enabled: true,
    createdAt: new Date().toISOString()
  };
  
  sipUsers.push(user);
  res.json({ success: true, user: { ...user, password: '********' } });
});

// Update SIP user
app.put('/api/asterisk/sip-users/:username', authenticateAdmin, (req, res) => {
  const idx = sipUsers.findIndex(u => u.username === req.params.username || u.name === req.params.username);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  
  const updates = req.body;
  const user = sipUsers[idx];
  
  // Update allowed fields
  if (updates.password) user.password = updates.password;
  if (updates.context !== undefined) user.context = updates.context;
  if (updates.codecs !== undefined) user.codecs = updates.codecs;
  if (updates.transport !== undefined) user.transport = updates.transport;
  if (updates.callerid !== undefined) user.callerid = updates.callerid;
  if (updates.maxContacts !== undefined) user.maxContacts = updates.maxContacts;
  if (updates.directMedia !== undefined) user.directMedia = updates.directMedia;
  if (updates.rtp_symmetric !== undefined) user.rtp_symmetric = updates.rtp_symmetric;
  if (updates.force_rport !== undefined) user.force_rport = updates.force_rport;
  if (updates.rewrite_contact !== undefined) user.rewrite_contact = updates.rewrite_contact;
  if (updates.enabled !== undefined) user.enabled = updates.enabled;
  
  user.updatedAt = new Date().toISOString();
  
  res.json({ success: true, user: { ...user, password: '********' } });
});

// Delete SIP user
app.delete('/api/asterisk/sip-users/:username', authenticateAdmin, (req, res) => {
  const before = sipUsers.length;
  sipUsers = sipUsers.filter(u => u.username !== req.params.username && u.name !== req.params.username);
  res.json({ success: true, removed: before !== sipUsers.length });
});

// Apply SIP users to Asterisk
app.post('/api/asterisk/sip-users/apply', authenticateAdmin, async (req, res) => {
  try {
    const content = generatePjsipUsers(sipUsers);
    const writeResult = await writeAsteriskConfig('pjsip_users.conf', content);
    if (!writeResult.success) {
      return res.status(500).json({ success: false, error: `Failed to write config: ${writeResult.error}` });
    }
    const reloadResult = await reloadAsteriskConfig('pjsip');
    res.json({ 
      success: true, 
      message: 'SIP users applied successfully',
      reload: reloadResult 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ASTERISK CLI COMMANDS ==============

// Execute Asterisk CLI command
app.post('/api/asterisk/cli', authenticateAdmin, async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: 'Command required' });
  }
  
  // Whitelist of safe commands (read-only commands for safety)
  const safeCommands = [
    'core show channels',
    'core show calls',
    'core show version',
    'core show uptime',
    'core show hints',
    'core show settings',
    'core show sysinfo',
    'core reload',
    'pjsip show endpoints',
    'pjsip show registrations',
    'pjsip show aors',
    'pjsip show auths',
    'pjsip show contacts',
    'pjsip reload',
    'dialplan reload',
    'dialplan show',
    'module reload',
    'queue show',
    'bridge show all',
    'module show',
    'module show like',
    'sip show peers',
    'sip show registry',
    'sip show channels',
    'sip reload',
    'voicemail show users',
    'voicemail reload',
    'http show status',
    'http reload',
    'ari show apps',
    'ari show users',
    'database show',
    'cdr show status',
    'cdr reload',
    'logger show channels',
    'logger reload'
  ];
  
  const isAllowed = safeCommands.some(safe => command.toLowerCase().startsWith(safe.toLowerCase()));
  
  if (!isAllowed) {
    return res.status(403).json({ 
      success: false, 
      error: 'Command not allowed',
      allowedCommands: safeCommands 
    });
  }
  
  exec(`asterisk -rx "${command}"`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ success: false, error: stderr || error.message });
    }
    res.json({ success: true, output: stdout });
  });
});

// Get Asterisk version and status
app.get('/api/asterisk/status', authenticateAdmin, async (req, res) => {
  try {
    const execWithTimeout = (command, timeoutMs = 5000) => {
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          resolve(null);
        }, timeoutMs);
        
        exec(command, (e, out) => {
          clearTimeout(timer);
          resolve(e ? null : out.trim());
        });
      });
    };
    
    const results = await Promise.all([
      execWithTimeout('asterisk -rx "core show version"', 5000),
      execWithTimeout('asterisk -rx "core show uptime"', 5000),
      execWithTimeout('asterisk -rx "core show channels count"', 5000)
    ]);
    
    res.json({
      success: true,
      status: {
        version: results[0] || 'Version: Unavailable',
        uptime: results[1] || 'Uptime: Unavailable',
        channels: results[2] || 'Channels: Unavailable',
        ariConnected: ariClient !== null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reload specific Asterisk module
app.post('/api/asterisk/reload', authenticateAdmin, async (req, res) => {
  const { module = 'all' } = req.body;
  
  console.log(`[API-RELOAD] Request to reload module: ${module}`);
  
  try {
    // Execute reload
    const result = await reloadAsteriskConfig(module);
    
    console.log(`[API-RELOAD] Result:`, result);
    
    // Always return the result, even if there was an error
    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: `${module} reload completed`,
        output: result.output,
        command: result.command,
        exitCode: result.exitCode,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(200).json({ 
        success: false,
        message: `${module} reload failed`,
        error: result.error,
        output: result.output,
        command: result.command,
        exitCode: result.exitCode,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error(`[API-RELOAD-ERROR]`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Internal server error during reload'
    });
  }
});

// ============== ASTERISK CONFIG FILES ==============

// List available config files
app.get('/api/asterisk/configs', authenticateAdmin, async (req, res) => {
  try {
    const files = await fs.promises.readdir(ASTERISK_CONFIG_DIR);
    const configFiles = files.filter(f => f.endsWith('.conf')).sort();
    res.json({ success: true, files: configFiles });
  } catch (error) {
    res.json({ success: true, files: [], error: error.message });
  }
});

// Read specific config file
app.get('/api/asterisk/configs/:filename', authenticateAdmin, async (req, res) => {
  const result = await readAsteriskConfig(req.params.filename);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// Write config file
app.put('/api/asterisk/configs/:filename', authenticateAdmin, async (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ success: false, error: 'Content required' });
  }
  const result = await writeAsteriskConfig(req.params.filename, content);
  res.json(result);
});

// ============== PJSIP CONFIG MANAGEMENT ==============

// Get PJSIP configuration
app.get('/api/pjsip/config', authenticateAdmin, async (req, res) => {
  console.log(`🔍 Admin ${req.admin.username} requested PJSIP config from ${ASTERISK_CONFIG_DIR}/pjsip.conf`);
  const result = await readAsteriskConfig('pjsip.conf');
  if (!result.success) {
    console.error(`⚠️  PJSIP config not found or error: ${result.error}`);
    return res.status(404).json(result);
  }
  res.json(result);
});

// Update PJSIP configuration
app.put('/api/pjsip/config', authenticateAdmin, async (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ success: false, error: 'Content required' });
  }
  console.log(`💾 Admin ${req.admin.username} updating PJSIP config (${content.length} bytes)`);
  const result = await writeAsteriskConfig('pjsip.conf', content);
  if (result.success) {
    console.log(`✅ PJSIP config updated successfully`);
  }
  res.json(result);
});

// ============== QUEUE MANAGEMENT ==============

// In-memory queue configuration
let queues = [];

// Get all queues
app.get('/api/asterisk/queues', authenticateAdmin, async (req, res) => {
  try {
    // Try to get live queue status from Asterisk
    exec('asterisk -rx "queue show"', (error, stdout) => {
      if (error) {
        return res.json({ success: true, queues, source: 'memory' });
      }
      res.json({ success: true, queues, liveStatus: stdout, source: 'asterisk' });
    });
  } catch (error) {
    res.json({ success: true, queues, source: 'memory' });
  }
});

// Create queue
app.post('/api/asterisk/queues', authenticateAdmin, (req, res) => {
  const { name, strategy = 'ringall', timeout = 15, wrapuptime = 0, members = [] } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Queue name required' });
  }
  if (queues.find(q => q.name === name)) {
    return res.status(400).json({ success: false, error: 'Queue already exists' });
  }
  const queue = { name, strategy, timeout, wrapuptime, members, createdAt: new Date().toISOString() };
  queues.push(queue);
  res.json({ success: true, queue });
});

// Update queue
app.put('/api/asterisk/queues/:name', authenticateAdmin, (req, res) => {
  const idx = queues.findIndex(q => q.name === req.params.name);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Queue not found' });
  }
  const updates = req.body;
  Object.assign(queues[idx], updates, { updatedAt: new Date().toISOString() });
  res.json({ success: true, queue: queues[idx] });
});

// Delete queue
app.delete('/api/asterisk/queues/:name', authenticateAdmin, (req, res) => {
  const before = queues.length;
  queues = queues.filter(q => q.name !== req.params.name);
  res.json({ success: true, removed: before !== queues.length });
});

// Add member to queue
app.post('/api/asterisk/queues/:name/members', authenticateAdmin, (req, res) => {
  const queue = queues.find(q => q.name === req.params.name);
  if (!queue) {
    return res.status(404).json({ success: false, error: 'Queue not found' });
  }
  const { interface: iface, penalty = 0 } = req.body;
  if (!iface) {
    return res.status(400).json({ success: false, error: 'Interface required' });
  }
  queue.members.push({ interface: iface, penalty });
  res.json({ success: true, queue });
});

// Remove member from queue
app.delete('/api/asterisk/queues/:name/members/:interface', authenticateAdmin, (req, res) => {
  const queue = queues.find(q => q.name === req.params.name);
  if (!queue) {
    return res.status(404).json({ success: false, error: 'Queue not found' });
  }
  queue.members = queue.members.filter(m => m.interface !== req.params.interface);
  res.json({ success: true, queue });
});

// ============== SERVER STARTUP ==============

async function startServer() {
  try {
    // Initialize database
    console.log('🔗 Connecting to database...');
    await db.query('SELECT NOW()');
    console.log('✅ Database connected');
    
    // Log configuration paths
    console.log(`📁 Asterisk config directory: ${ASTERISK_CONFIG_DIR}`);
    console.log(`📁 Recordings directory: ${actualRecordingsDir}`);
    console.log(`📁 Asterisk sounds directory: ${AST_SOUNDS_DIR}`);
    
    // Initialize ARI client
    await initializeAri();
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 ARI API Server running on port ${PORT}`);
      console.log(`📊 Admin Dashboard: http://localhost:${PORT}`);
      console.log(`🔌 ARI connected to: ${ARI_HOST}:${ARI_PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
