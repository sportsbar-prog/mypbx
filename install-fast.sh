#!/bin/bash
# Asterisk PBX + Web GUI - Fast Installation (System Packages)
# This is the fastest way to get everything running

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run as root. Use: sudo bash install-fast.sh"
    exit 1
fi

print_header "Asterisk PBX + Web GUI - Fast Installation"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend-node"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ============================================================================
# 1. UPDATE AND INSTALL ALL
# ============================================================================
print_step "Updating system..."
apt-get update > /dev/null 2>&1
apt-get upgrade -y > /dev/null 2>&1
print_success "System updated"

print_step "Installing all packages at once..."
apt-get install -y \
    build-essential curl wget git libssl-dev libncurses5-dev libsqlite3-dev \
    libjansson-dev libxml2-dev libpq-dev libgsm1-dev libtiff-dev libasound2-dev \
    sox libc-client2007e-dev sqlite3 uuid-dev flex bison \
    postgresql postgresql-contrib nodejs npm asterisk asterisk-dev \
    > /dev/null 2>&1
print_success "All packages installed"

# ============================================================================
# 2. POSTGRESQL SETUP
# ============================================================================
print_step "Configuring PostgreSQL..."
systemctl start postgresql > /dev/null 2>&1 || true
sleep 2

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'ari_api'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ari_api;" 2>/dev/null || true

sudo -u postgres psql -c "DROP USER IF EXISTS ari_user;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER ari_user WITH ENCRYPTED PASSWORD 'change_me';" 2>/dev/null || true
sudo -u postgres psql -c "ALTER ROLE ari_user CREATEDB;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ari_api TO ari_user;" 2>/dev/null || true
sudo -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;" 2>/dev/null || true

if [ -f "$BACKEND_DIR/database-schema.sql" ]; then
    sudo -u postgres psql -d ari_api -f "$BACKEND_DIR/database-schema.sql" > /dev/null 2>&1 || true
fi

print_success "PostgreSQL ready"

# ============================================================================
# 3. ASTERISK SETUP
# ============================================================================
print_step "Setting up Asterisk..."

if ! id -u asterisk > /dev/null 2>&1; then
    useradd -r -s /bin/bash asterisk
fi

# Create systemd service
tee /etc/systemd/system/asterisk.service > /dev/null << 'EOF'
[Unit]
Description=Asterisk PBX and VoIP Server
After=network.target postgresql.service

[Service]
Type=simple
ExecStart=/usr/sbin/asterisk -f
Restart=always
RestartSec=5
User=asterisk
Group=asterisk
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload > /dev/null 2>&1
systemctl enable asterisk > /dev/null 2>&1
systemctl start asterisk > /dev/null 2>&1
sleep 3

print_success "Asterisk running"

# ============================================================================
# 4. BACKEND
# ============================================================================
print_step "Installing backend..."
cd "$BACKEND_DIR"
npm install > /dev/null 2>&1
print_success "Backend ready"

# ============================================================================
# 5. FRONTEND
# ============================================================================
print_step "Installing frontend..."
cd "$FRONTEND_DIR"
npm install > /dev/null 2>&1
print_success "Frontend ready"

# ============================================================================
# 6. START SERVICES
# ============================================================================
print_step "Starting web services..."

pkill -f "node server.js" 2>/dev/null || true
sleep 1
cd "$BACKEND_DIR"
nohup node server.js > backend.log 2>&1 &
BACKEND_PID=$!
sleep 2

pkill -f "npm run dev" 2>/dev/null || true
sleep 1
cd "$FRONTEND_DIR"
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 3

print_success "Services started"

# ============================================================================
# 7. VERIFY
# ============================================================================
print_step "Verifying..."
sleep 2

echo ""
if systemctl is-active --quiet asterisk 2>/dev/null; then
    print_success "Asterisk"
fi
if systemctl is-active --quiet postgresql 2>/dev/null; then
    print_success "PostgreSQL"
fi
if ps -p $BACKEND_PID > /dev/null 2>&1; then
    print_success "Backend (PID: $BACKEND_PID)"
fi
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    print_success "Frontend (PID: $FRONTEND_PID)"
fi

# ============================================================================
# 8. SUMMARY
# ============================================================================
print_header "Installation Complete!"

echo -e "${GREEN}✓ All ready to use!${NC}"
echo ""
echo "Access your system:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Web UI:${NC}      http://your-server-ip:5173"
echo -e "${GREEN}API:${NC}        http://your-server-ip:3000"
echo -e "${GREEN}CLI:${NC}        asterisk -r"
echo ""
echo "Login:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}User:${NC}       admin"
echo -e "${GREEN}Password:${NC}   admin123"
echo ""
echo "Logs:"
echo "────────────────────────────────────────────────────────"
echo "Backend:  tail -f $BACKEND_DIR/backend.log"
echo "Frontend: tail -f $FRONTEND_DIR/frontend.log"
echo "Asterisk: journalctl -u asterisk -f"
echo ""
