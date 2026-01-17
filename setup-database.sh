#!/bin/bash
set -e

echo "=========================================="
echo "PostgreSQL Database Setup for Asterisk ARI"
echo "=========================================="
echo ""

# Configuration
DB_NAME="ari_api"
DB_USER="ari_user"
DB_PASS="mypass"
DB_HOST="localhost"
DB_PORT="5432"

echo "Database Configuration:"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASS"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo ""

# Check if PostgreSQL is running
echo "→ Checking PostgreSQL status..."
if ! sudo systemctl is-active --quiet postgresql; then
    echo "  PostgreSQL is not running. Starting..."
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
else
    echo "  ✓ PostgreSQL is running"
fi
echo ""

# Create database and user
echo "→ Creating database and user..."
sudo -u postgres psql <<EOF
-- Drop existing database and user if they exist
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;

-- Create new user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';

-- Create database
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

\c $DB_NAME

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;

\q
EOF

echo "  ✓ Database and user created"
echo ""

# Create .env file
echo "→ Creating .env file..."
cd ~/mypbx/backend-node
cat > .env <<EOF
# Database Configuration
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME

# Asterisk ARI Configuration
ARI_HOST=localhost
ARI_PORT=8088
ARI_USER=ariuser
ARI_PASSWORD=aripassword
ARI_APP_NAME=asterisk-gui

# Server Configuration
PORT=3000
JWT_SECRET=$(openssl rand -base64 32)

# Optional Settings
NODE_ENV=production
RECORDINGS_DIR=/var/spool/asterisk/recording
ASTERISK_SOUNDS_DIR=/var/lib/asterisk/sounds
EOF

echo "  ✓ .env file created"
echo ""

# Apply database schema
echo "→ Applying database schema..."
export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
psql "$DATABASE_URL" -f database-schema.sql

echo "  ✓ Schema applied"
echo ""

# Run migrations
echo "→ Running database migrations..."
node initialize-db.js

echo ""
echo "=========================================="
echo "✓ Database setup complete!"
echo "=========================================="
echo ""
echo "Connection string: postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo "Next steps:"
echo "  1. Test the server: node server.js"
echo "  2. The admin user will be created on first server start"
echo ""
