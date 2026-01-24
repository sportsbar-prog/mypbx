#!/bin/bash
# ============================================================================
# ASTERISK PBX + WEB GUI - COMPLETE ONE-SCRIPT INSTALLATION
# This single script installs and runs everything without any user input needed
# ============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC} $1"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}→${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Ensure running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root"
    echo "Run with: sudo bash complete-install.sh"
    exit 1
fi

print_header "ASTERISK PBX + WEB GUI - COMPLETE INSTALLATION"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend-node"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ============================================================================
# STEP 1: UPDATE SYSTEM
# ============================================================================
print_step "Step 1/10: Updating system packages..."
apt-get update > /dev/null 2>&1
apt-get upgrade -y > /dev/null 2>&1
print_success "System packages updated"

# ============================================================================
# STEP 2: INSTALL ALL DEPENDENCIES
# ============================================================================
print_step "Step 2/10: Installing all dependencies (this may take 2-3 minutes)..."

PACKAGES=(
    "build-essential" "curl" "wget" "git" "libssl-dev" "libncurses5-dev"
    "libsqlite3-dev" "libjansson-dev" "libxml2-dev" "libpq-dev" "libgsm1-dev"
    "libtiff-dev" "libasound2-dev" "sox" "libc-client2007e-dev" "sqlite3"
    "uuid-dev" "flex" "bison" "postgresql" "postgresql-contrib" "nodejs"
    "asterisk" "asterisk-dev" "asterisk-config"
)

# Install all at once
INSTALL_LIST=""
for pkg in "${PACKAGES[@]}"; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
        INSTALL_LIST="$INSTALL_LIST $pkg"
    fi
done

if [ ! -z "$INSTALL_LIST" ]; then
    echo "Installing packages: $INSTALL_LIST (this may take 5-10 minutes)..."
    apt-get install -y $INSTALL_LIST
    if [ $? -ne 0 ]; then
        print_error "Failed to install dependencies"
        exit 1
    fi
fi

print_success "All dependencies installed"

# ============================================================================
# STEP 3: START AND SETUP POSTGRESQL
# ============================================================================
print_step "Step 3/10: Setting up PostgreSQL..."

# Start PostgreSQL
echo "Starting PostgreSQL service..."
systemctl start postgresql 2>&1 || true
sleep 3

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if sudo -u postgres psql -c "SELECT 1" > /dev/null 2>&1; then
        print_success "PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_warning "PostgreSQL took longer than expected to start"
    fi
    sleep 1
done

# Create database
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'ari_api'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ari_api;" 2>/dev/null || true

# Drop existing user if exists
sudo -u postgres psql > /dev/null 2>&1 << 'SQL_EOF'
DROP USER IF EXISTS ari_user;
SQL_EOF

# Create database if not exists
sudo -u postgres psql > /dev/null 2>&1 << 'SQL_EOF'
CREATE DATABASE ari_api;
SQL_EOF

# Create user and grant privileges
sudo -u postgres psql > /dev/null 2>&1 << 'SQL_EOF'
CREATE USER ari_user WITH ENCRYPTED PASSWORD 'mypass';
ALTER ROLE ari_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE ari_api TO ari_user;
SQL_EOF

sleep 2

# Grant table privileges
sudo -u postgres psql -d ari_api > /dev/null 2>&1 << 'SQL_EOF'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ari_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ari_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ari_user;
SQL_EOF

# Create database schema for admin login
print_step "Creating admin database schema..."
sudo -u postgres psql -d ari_api > /dev/null 2>&1 << 'SCHEMA_EOF'
-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    session_token VARCHAR(500) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ari_user;
SCHEMA_EOF

# Load additional schema if exists
if [ -f "$BACKEND_DIR/database-schema.sql" ]; then
    sudo -u postgres psql -d ari_api -f "$BACKEND_DIR/database-schema.sql" > /dev/null 2>&1 || true
fi

# Verify connection with new user
if PGPASSWORD=mypass sudo -u postgres psql -h localhost -U ari_user -d ari_api -c "SELECT 1" > /dev/null 2>&1; then
    print_success "PostgreSQL configured and running"
else
    print_error "PostgreSQL authentication failed - checking configuration..."
    # Try to verify database exists
    if sudo -u postgres psql -d ari_api -c "\dt" > /dev/null 2>&1; then
        print_success "PostgreSQL database exists (continuing)"
    else
        print_error "PostgreSQL setup may have failed"
        exit 1
    fi
fi

# ============================================================================
# STEP 4: SETUP ASTERISK
# ============================================================================
print_step "Step 4/10: Configuring Asterisk..."

# Create asterisk user if doesn't exist
if ! id -u asterisk > /dev/null 2>&1; then
    useradd -r -s /bin/bash asterisk
fi

# Ensure asterisk config directory exists
mkdir -p /etc/asterisk
chown -R asterisk:asterisk /etc/asterisk

# Create basic SIP configuration
cat > /etc/asterisk/pjsip.conf << 'EOF'
[global]
type = global

[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060

[endpoint/101]
type = endpoint
context = default
disallow = all
allow = ulaw
auth = auth101
aors = 101

[auth/auth101]
type = auth
auth_type = userpass
username = 101
password = 101

[aor/101]
type = aor
max_contacts = 1
contact = sip:101@127.0.0.1

[endpoint/102]
type = endpoint
context = default
disallow = all
allow = ulaw
auth = auth102
aors = 102

[auth/auth102]
type = auth
auth_type = userpass
username = 102
password = 102

[aor/102]
type = aor
max_contacts = 1
contact = sip:102@127.0.0.1
EOF

# Create extensions configuration
cat > /etc/asterisk/extensions.conf << 'EOF'
[general]
static = yes
writeprotect = no

[default]
exten => 101,1,Dial(PJSIP/101)
exten => 102,1,Dial(PJSIP/102)
exten => _X.,1,Dial(PJSIP/${EXTEN})
exten => _X.,2,VoiceMail(${EXTEN}@default)
exten => _X.,3,Hangup()
EOF

# Create and Enable ARI module configuration
cat > /etc/asterisk/http.conf << 'EOF'
[general]
enabled = yes
bindaddr = 0.0.0.0
bindport = 8088
EOF

cat > /etc/asterisk/ari.conf << 'EOF'
[general]
enabled = yes
pretty = yes
allowed_origins = *

[asterisk-gui]
type = user
password = aripassword
read_only = no
EOF

# Create modules.conf to explicitly enable ARI module
cat > /etc/asterisk/modules.conf << 'EOF'
[modules]
autoload = yes

[res_ari]
load = yes

[res_http_asterisk_ari]
load = yes
EOF

# Create systemd service file using printf
printf '[Unit]\nDescription=Asterisk PBX and VoIP Server\nAfter=network.target postgresql.service\n\n[Service]\nType=simple\nExecStart=/usr/sbin/asterisk -f\nRestart=always\nRestartSec=5\nUser=asterisk\nGroup=asterisk\nStandardOutput=journal\nStandardError=journal\nEnvironment="PATH=/usr/sbin:/usr/bin:/sbin:/bin"\n\n[Install]\nWantedBy=multi-user.target\n' > /etc/systemd/system/asterisk.service

# Enable and start Asterisk
systemctl daemon-reload > /dev/null 2>&1
systemctl enable asterisk > /dev/null 2>&1
systemctl restart asterisk > /dev/null 2>&1
sleep 5

# Verify Asterisk is running and ARI is enabled
if systemctl is-active --quiet asterisk; then
    print_success "Asterisk installed and running"
    # Wait a bit more for ARI to initialize
    sleep 3
else
    print_error "Failed to start Asterisk"
    journalctl -u asterisk -n 20
    exit 1
fi

# ============================================================================
# STEP 5: INSTALL BACKEND DEPENDENCIES
# ============================================================================
print_step "Step 5/10: Installing backend dependencies (this may take 2-3 minutes)..."

if [ ! -d "$BACKEND_DIR" ]; then
    print_error "Backend directory not found: $BACKEND_DIR"
    exit 1
fi

cd "$BACKEND_DIR"

# Clean and reinstall
rm -rf node_modules package-lock.json > /dev/null 2>&1 || true
echo "Running npm install for backend..."
npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install backend dependencies"
    exit 1
fi

print_success "Backend dependencies installed"

# Generate bcrypt hash and create admin user
print_step "Creating admin user with bcrypt hash..."
ADMIN_HASH=$(node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(hash => console.log(hash));")
sudo -u postgres psql -d ari_api > /dev/null 2>&1 << ADMIN_EOF
INSERT INTO admins (username, password_hash, email, is_active)
VALUES ('admin', '$ADMIN_HASH', 'admin@asterisk.local', true)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
ADMIN_EOF
print_success "Admin user created (username: admin, password: admin123)"

# ============================================================================
# STEP 6: INSTALL FRONTEND DEPENDENCIES
# ============================================================================
print_step "Step 6/10: Installing frontend dependencies (this may take 2-3 minutes)..."

if [ ! -d "$FRONTEND_DIR" ]; then
    print_error "Frontend directory not found: $FRONTEND_DIR"
    exit 1
fi

cd "$FRONTEND_DIR"

# Clean and reinstall
rm -rf node_modules package-lock.json > /dev/null 2>&1 || true
echo "Running npm install for frontend..."
npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install frontend dependencies"
    exit 1
fi

print_success "Frontend dependencies installed"

# Create frontend .env file with server IP
print_step "Configuring frontend API endpoint..."
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v 127.0.0.1 | head -n1)
fi
cat > "$FRONTEND_DIR/.env" << ENV_EOF
VITE_API_URL=http://${SERVER_IP}:3000/api
ENV_EOF
print_success "Frontend configured to connect to http://${SERVER_IP}:3000/api"

# ============================================================================
# STEP 7: STOP ANY EXISTING SERVICES
# ============================================================================
print_step "Step 7/10: Cleaning up any existing services..."

pkill -f "node server.js" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

print_success "Old services stopped"

# ============================================================================
# STEP 8: START BACKEND SERVER
# ============================================================================
print_step "Step 8/10: Starting backend server..."

cd "$BACKEND_DIR"

# Remove old logs
rm -f backend.log

# Check if Asterisk ARI is listening before starting backend
print_step "Verifying Asterisk ARI is listening on port 8088..."
ARI_READY=false
for i in {1..20}; do
    if netstat -tuln 2>/dev/null | grep -q ":8088" || ss -tuln 2>/dev/null | grep -q ":8088"; then
        print_success "Asterisk ARI is listening on port 8088"
        ARI_READY=true
        break
    fi
    if [ $i -lt 20 ]; then
        sleep 1
    fi
done

if [ "$ARI_READY" = "false" ]; then
    print_warning "Asterisk ARI not yet listening - it may be slow to start, continuing anyway..."
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://ari_user:mypass@localhost:5432/ari_api

# Asterisk ARI Configuration
ARI_HOST=localhost
ARI_PORT=8088
ARI_USER=asterisk-gui
ARI_PASSWORD=aripassword

# Server Configuration
NODE_ENV=production
PORT=3000
EOF
elif ! grep -q "DATABASE_URL" .env; then
    # Append to existing .env if DATABASE_URL is missing
    echo "" >> .env
    echo "# Database Configuration" >> .env
    echo "DATABASE_URL=postgresql://ari_user:mypass@localhost:5432/ari_api" >> .env
fi

# Wait for PostgreSQL to be fully ready
print_step "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if PGPASSWORD=mypass psql -h localhost -U ari_user -d ari_api -c "SELECT 1" > /dev/null 2>&1; then
        print_success "PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_warning "PostgreSQL may not be fully ready, continuing anyway..."
    fi
    sleep 1
done

# Apply database schema
print_step "Creating database schema..."
if PGPASSWORD=mypass psql -h localhost -U ari_user -d ari_api -f database-schema.sql > /dev/null 2>&1; then
    print_success "Database schema created"
else
    print_warning "Database schema may already exist, continuing..."
fi

# Run database migrations
print_step "Running database migrations..."
if node initialize-db.js > /dev/null 2>&1; then
    print_success "Database migrations completed"
else
    print_warning "Database migrations failed or already applied, continuing..."
fi

# Start backend
nohup node server.js > backend.log 2>&1 &
BACKEND_PID=$!

# Wait and verify - allow longer startup time for ARI connection
print_step "Waiting for backend to establish connections..."
for i in {1..15}; do
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        # Check if it's actually ready (connected to ARI)
        if grep -q "ARI connected\|listening on\|started" backend.log 2>/dev/null; then
            print_success "Backend server started (PID: $BACKEND_PID)"
            break
        fi
        if [ $i -eq 15 ]; then
            # Even if ARI isn't connected, backend is running - that's OK
            if ps -p $BACKEND_PID > /dev/null 2>&1; then
                print_success "Backend server started (PID: $BACKEND_PID)"
                print_warning "Note: Asterisk ARI may not be connected yet (it will retry automatically)"
            fi
        fi
    else
        print_error "Backend server failed to start"
        echo "Backend log:"
        tail -20 backend.log
        exit 1
    fi
    sleep 1
done

# ============================================================================
# STEP 9: START FRONTEND SERVER
# ============================================================================
print_step "Step 9/10: Starting frontend server..."

cd "$FRONTEND_DIR"

# Remove old logs
rm -f frontend.log

# Start frontend
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait and verify
sleep 5
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    print_success "Frontend server started (PID: $FRONTEND_PID)"
else
    print_error "Frontend server failed to start"
    echo "Frontend log:"
    cat frontend.log
    exit 1
fi

# ============================================================================
# STEP 10: FINAL VERIFICATION
# ============================================================================
print_step "Step 10/10: Verifying all services..."

echo ""
SERVICES_RUNNING=0

# Check Asterisk
if systemctl is-active --quiet asterisk 2>/dev/null; then
    print_success "Asterisk is running"
    SERVICES_RUNNING=$((SERVICES_RUNNING + 1))
else
    print_error "Asterisk is NOT running"
fi

# Check PostgreSQL
if systemctl is-active --quiet postgresql 2>/dev/null; then
    print_success "PostgreSQL is running"
    SERVICES_RUNNING=$((SERVICES_RUNNING + 1))
else
    print_error "PostgreSQL is NOT running"
fi

# Check Backend
if ps -p $BACKEND_PID > /dev/null 2>&1; then
    print_success "Backend API is running (PID: $BACKEND_PID)"
    SERVICES_RUNNING=$((SERVICES_RUNNING + 1))
else
    print_error "Backend API is NOT running"
fi

# Check Frontend
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    print_success "Frontend is running (PID: $FRONTEND_PID)"
    SERVICES_RUNNING=$((SERVICES_RUNNING + 1))
else
    print_error "Frontend is NOT running"
fi

echo ""

if [ $SERVICES_RUNNING -eq 4 ]; then
    print_header "INSTALLATION COMPLETE - ALL SERVICES RUNNING!"
else
    print_error "Some services failed to start. Check logs above."
    exit 1
fi

# ============================================================================
# DISPLAY SUMMARY
# ============================================================================

echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ ASTERISK PBX + WEB GUI FULLY INSTALLED${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

echo "ACCESS INFORMATION:"
echo "────────────────────────────────────────────────────────"
echo -e "${CYAN}Web Interface:${NC}   http://localhost:5173"
echo -e "${CYAN}Backend API:${NC}      http://localhost:3000"
echo -e "${CYAN}Asterisk CLI:${NC}     asterisk -r"
echo ""

echo "LOGIN CREDENTIALS:"
echo "────────────────────────────────────────────────────────"
echo -e "${CYAN}Username:${NC}   admin"
echo -e "${CYAN}Password:${NC}   admin123"
echo ""

echo "DATABASE CREDENTIALS:"
echo "────────────────────────────────────────────────────────"
echo -e "${CYAN}Database:${NC}   ari_api"
echo -e "${CYAN}User:${NC}       ari_user"
echo -e "${CYAN}Password:${NC}   mypass"
echo ""

echo "RUNNING SERVICES:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}✓ Asterisk PBX${NC}        (systemd service)"
echo -e "${GREEN}✓ PostgreSQL Database${NC}  (systemd service)"
echo -e "${GREEN}✓ Backend API${NC}         (PID: $BACKEND_PID)"
echo -e "${GREEN}✓ Frontend Web UI${NC}     (PID: $FRONTEND_PID)"
echo ""

echo "LOG FILES:"
echo "────────────────────────────────────────────────────────"
echo "Backend:  $BACKEND_DIR/backend.log"
echo "Frontend: $FRONTEND_DIR/frontend.log"
echo "Asterisk: journalctl -u asterisk -f"
echo ""

echo "USEFUL COMMANDS:"
echo "────────────────────────────────────────────────────────"
echo "# View backend logs"
echo "tail -f $BACKEND_DIR/backend.log"
echo ""
echo "# View frontend logs"
echo "tail -f $FRONTEND_DIR/frontend.log"
echo ""
echo "# View Asterisk logs"
echo "journalctl -u asterisk -f"
echo ""
echo "# Restart Asterisk"
echo "sudo systemctl restart asterisk"
echo ""
echo "# Restart backend"
echo "pkill -f 'node server.js'"
echo "cd $BACKEND_DIR && nohup node server.js > backend.log 2>&1 &"
echo ""
echo "# Restart frontend"
echo "pkill -f 'npm run dev'"
echo "cd $FRONTEND_DIR && nohup npm run dev > frontend.log 2>&1 &"
echo ""
echo "# Access Asterisk CLI"
echo "asterisk -r"
echo ""

echo "IMPORTANT SECURITY NOTE:"
echo "────────────────────────────────────────────────────────"
echo "⚠️  Change all default passwords immediately:"
echo "  1. Web UI: Settings → User Management"
echo "  2. Database: sudo -u postgres psql"
echo "     ALTER USER ari_user WITH PASSWORD 'new_password';"
echo ""

print_header "READY TO USE!"
echo "Open your browser and go to: http://localhost:5173"
echo "Login with admin / admin123"
echo ""
