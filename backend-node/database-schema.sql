-- PostgreSQL Database Schema for Asterisk ARI API
-- Based on production reference schema

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

-- Create database (run separately)
-- CREATE DATABASE ari_api;

-- Connect to database
-- \c ari_api

-- ============== TABLES ==============

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Admin sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_id VARCHAR(50) UNIQUE NOT NULL,
    key_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    credits NUMERIC(14,6) DEFAULT 0,
    rate_per_second NUMERIC(12,6) DEFAULT 0,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    rate_limit INTEGER DEFAULT 100,
    allowed_ips TEXT[],
    webhook_url VARCHAR(500)
);

-- API usage logs
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
    endpoint VARCHAR(100) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    response_status INTEGER,
    response_time INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call logs table
CREATE TABLE IF NOT EXISTS call_logs (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(255) UNIQUE NOT NULL,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
    number VARCHAR(50) NOT NULL,
    caller_id VARCHAR(50),
    status VARCHAR(20) NOT NULL,
    amd_status VARCHAR(20),
    amd_confidence DECIMAL(5,2),
    recording_filename VARCHAR(255),
    webhook_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration INTEGER,
    bill_seconds INTEGER,
    bill_cost NUMERIC(14,6)
);
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
    call_id VARCHAR(255),
    transaction_type VARCHAR(20) NOT NULL,
    amount INTEGER NOT NULL,
    balance_before INTEGER,
    balance_after INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('credit', 'debit', 'refund'))
);

-- SIP trunks table
CREATE TABLE IF NOT EXISTS sip_trunks (
    id SERIAL PRIMARY KEY,
    trunk_name VARCHAR(100) UNIQUE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    username VARCHAR(100),
    password VARCHAR(100),
    server VARCHAR(255) NOT NULL,
    port INTEGER DEFAULT 5060,
    context VARCHAR(50) DEFAULT 'default',
    codecs VARCHAR(100) DEFAULT 'ulaw,alaw',
    auth_type VARCHAR(20) DEFAULT 'credential',
    registration_enabled BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    config_template TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============== INDEXES ==============

CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX idx_api_keys_key ON api_keys(api_key);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);
CREATE INDEX idx_api_usage_key ON api_usage(api_key_id);
CREATE INDEX idx_api_usage_created ON api_usage(created_at);
CREATE INDEX idx_call_logs_call_id ON call_logs(call_id);
CREATE INDEX idx_call_logs_api_key ON call_logs(api_key_id);
CREATE INDEX idx_call_logs_created ON call_logs(created_at);
CREATE INDEX idx_credit_transactions_api_key ON credit_transactions(api_key_id);
CREATE INDEX idx_sip_trunks_name ON sip_trunks(trunk_name);
CREATE INDEX idx_sip_trunks_active ON sip_trunks(is_active);

-- ============== FUNCTIONS ==============

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============== TRIGGERS ==============

-- Trigger for api_keys updated_at
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for sip_trunks updated_at
CREATE TRIGGER update_sip_trunks_updated_at BEFORE UPDATE ON sip_trunks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============== DEFAULT DATA ==============

-- Insert default admin (password: admin123)
-- IMPORTANT: Change this password in production!
INSERT INTO admins (username, email, password_hash) VALUES
('admin', 'admin@example.com', '$2a$10$8K1p/a0dL3LKZa0W0qO3vu7VDJp/JJYe1L1XzH8hKkr6LQYC3kR4W')
ON CONFLICT (username) DO NOTHING;

-- Insert sample API key for testing
-- Generate unique key_id
INSERT INTO api_keys (key_id, key_name, api_key, credits, description) VALUES
('key_' || substr(md5(random()::text), 1, 16), 
 'Test API Key',
 'sk_test_' || substr(md5(random()::text), 1, 32),
 1000,
 'Sample API key for testing')
ON CONFLICT (key_id) DO NOTHING;

-- ============== VIEWS ==============

-- View for API key statistics
CREATE OR REPLACE VIEW api_key_stats AS
SELECT 
    ak.id,
    ak.key_name,
    ak.credits,
    ak.total_calls,
    ak.successful_calls,
    COUNT(DISTINCT cl.id) as recent_calls,
    COUNT(DISTINCT au.id) as recent_api_calls,
    ak.last_used,
    ak.is_active
FROM api_keys ak
LEFT JOIN call_logs cl ON ak.id = cl.api_key_id AND cl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
LEFT JOIN api_usage au ON ak.id = au.api_key_id AND au.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY ak.id;

-- View for call statistics
CREATE OR REPLACE VIEW call_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
    COUNT(*) FILTER (WHERE status = 'no-answer') as no_answer_calls,
    AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration
FROM call_logs
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============== GRANTS ==============

-- Grant permissions to ari_user (create this user first)
-- CREATE USER ari_user WITH PASSWORD 'your_password';
-- GRANT ALL PRIVILEGES ON DATABASE ari_api TO ari_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ari_user;

-- ============== COMPLETION ==============

SELECT 'Database schema created successfully!' AS status;
SELECT 'Total tables: ' || COUNT(*) AS info FROM information_schema.tables WHERE table_schema = 'public';
