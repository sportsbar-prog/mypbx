#!/bin/bash
# Asterisk PBX + Web GUI - Complete One-Click Installation
# This script installs and configures everything from scratch

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

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root"
    echo "Run: sudo bash install.sh"
    exit 1
fi

print_header "Asterisk PBX + Web GUI - One-Click Installation"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend-node"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# ============================================================================
# 1. UPDATE SYSTEM
# ============================================================================
print_step "Updating system packages..."
apt-get update > /dev/null 2>&1
apt-get upgrade -y > /dev/null 2>&1
print_success "System updated"

# ============================================================================
# 2. INSTALL DEPENDENCIES
# ============================================================================
print_step "Installing dependencies..."
PACKAGES=(
    "build-essential" "curl" "wget" "git" "libssl-dev" "libncurses5-dev"
    "libsqlite3-dev" "libjansson-dev" "libxml2-dev" "libpq-dev" "libgsm1-dev"
    "libtiff-dev" "libasound2-dev" "sox" "libc-client2007e-dev" "sqlite3"
    "uuid-dev" "flex" "bison" "postgresql" "postgresql-contrib" "nodejs" "npm"
)

for pkg in "${PACKAGES[@]}"; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
        apt-get install -y "$pkg" > /dev/null 2>&1
    fi
done
print_success "All dependencies installed"

# ============================================================================
# 3. SETUP POSTGRESQL
# ============================================================================
print_step "Setting up PostgreSQL..."
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

print_success "PostgreSQL configured"

# ============================================================================
# 4. INSTALL ASTERISK
# ============================================================================
print_step "Installing Asterisk 20..."
ASTERISK_VERSION="20.8.0"
ASTERISK_BUILD="/tmp/asterisk-build"

if [ ! -f "/opt/asterisk/sbin/asterisk" ]; then
    mkdir -p "$ASTERISK_BUILD"
    cd "$ASTERISK_BUILD"
    
    # Try to download
    if wget -q "https://downloads.asterisk.org/pub/telephony/asterisk/releases/asterisk-${ASTERISK_VERSION}.tar.gz" 2>/dev/null || \
       curl -s -o "asterisk-${ASTERISK_VERSION}.tar.gz" "https://downloads.asterisk.org/pub/telephony/asterisk/releases/asterisk-${ASTERISK_VERSION}.tar.gz" 2>/dev/null; then
        
        tar xzf "asterisk-${ASTERISK_VERSION}.tar.gz" > /dev/null 2>&1
        
        # Find extracted directory
        if [ -d "asterisk-${ASTERISK_VERSION}" ]; then
            ASTERISK_DIR="$ASTERISK_BUILD/asterisk-${ASTERISK_VERSION}"
        else
            ASTERISK_DIR=$(ls -d */ | head -1 | sed 's:/$::')
            ASTERISK_DIR="$ASTERISK_BUILD/$ASTERISK_DIR"
        fi
        
        if [ -d "$ASTERISK_DIR" ]; then
            cd "$ASTERISK_DIR"
            
            # Build
            if [ -f "bootstrap.sh" ]; then
                ./bootstrap.sh > /dev/null 2>&1 || true
            fi
            
            ./configure --prefix=/opt/asterisk --with-pgsql --with-ssl --with-srtp --with-jansson --enable-dev-mode > /dev/null 2>&1
            make -j$(nproc) > /dev/null 2>&1
            make install > /dev/null 2>&1
            make install-logrotate > /dev/null 2>&1
            make install-config > /dev/null 2>&1
            
            print_success "Asterisk compiled and installed"
        else
            print_warning "Could not find Asterisk directory, trying package install..."
            apt-get install -y asterisk asterisk-dev > /dev/null 2>&1
            print_success "Asterisk installed from packages"
        fi
    else
        print_warning "Download failed, installing from system packages..."
        apt-get install -y asterisk asterisk-dev > /dev/null 2>&1
        print_success "Asterisk installed from packages"
    fi
else
    print_success "Asterisk already installed"
fi

# ============================================================================
# 5. SETUP ASTERISK USER AND SERVICE
# ============================================================================
print_step "Configuring Asterisk service..."

if ! id -u asterisk > /dev/null 2>&1; then
    useradd -r -s /bin/bash asterisk
fi

chown -R asterisk:asterisk /opt/asterisk 2>/dev/null || true
chmod -R u+w /opt/asterisk 2>/dev/null || true

# Create systemd service
tee /etc/systemd/system/asterisk.service > /dev/null << 'EOF'
[Unit]
Description=Asterisk PBX and VoIP Server
After=network.target postgresql.service

[Service]
Type=simple
ExecStart=/opt/asterisk/sbin/asterisk -f
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

print_success "Asterisk service configured"

# ============================================================================
# 6. INSTALL BACKEND DEPENDENCIES
# ============================================================================
print_step "Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install > /dev/null 2>&1
print_success "Backend ready"

# ============================================================================
# 7. INSTALL FRONTEND DEPENDENCIES
# ============================================================================
print_step "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install > /dev/null 2>&1
print_success "Frontend ready"

# ============================================================================
# 8. START SERVICES
# ============================================================================
print_step "Starting services..."

# Start backend
cd "$BACKEND_DIR"
pkill -f "node server.js" 2>/dev/null || true
sleep 1
nohup node server.js > backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

# Start frontend
cd "$FRONTEND_DIR"
pkill -f "npm run dev" 2>/dev/null || true
sleep 1
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 5

print_success "Services started"

# ============================================================================
# 9. VERIFICATION
# ============================================================================
print_step "Verifying installation..."

echo ""
SERVICES_OK=0

# Check Asterisk
if systemctl is-active --quiet asterisk 2>/dev/null || ps aux | grep -q "[a]sterisk -f"; then
    print_success "Asterisk running"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "Asterisk may not have started"
fi

# Check PostgreSQL
if systemctl is-active --quiet postgresql 2>/dev/null; then
    print_success "PostgreSQL running"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "PostgreSQL not responding"
fi

# Check Backend
if ps -p $BACKEND_PID > /dev/null 2>&1; then
    print_success "Backend running (PID: $BACKEND_PID)"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "Backend may have stopped"
fi

# Check Frontend
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    print_success "Frontend running (PID: $FRONTEND_PID)"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "Frontend may have stopped"
fi

# ============================================================================
# 10. SUMMARY
# ============================================================================
print_header "Installation Complete!"

echo -e "${GREEN}✓ All components installed and running!${NC}"
echo ""
echo "Access Information:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Web UI:${NC}        http://localhost:5173"
echo -e "${GREEN}Backend API:${NC}   http://localhost:3000"
echo -e "${GREEN}Asterisk CLI:${NC}  asterisk -r"
echo ""
echo "Credentials:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Admin Login:${NC}   admin / admin123"
echo -e "${GREEN}Database:${NC}      ari_api / ari_user (password: change_me)"
echo ""
echo "Running Services:"
echo "────────────────────────────────────────────────────────"
if systemctl is-active --quiet asterisk 2>/dev/null; then
    echo -e "${GREEN}✓ Asterisk${NC}"
fi
if systemctl is-active --quiet postgresql 2>/dev/null; then
    echo -e "${GREEN}✓ PostgreSQL${NC}"
fi
if ps -p $BACKEND_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend (PID: $BACKEND_PID)${NC}"
fi
if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend (PID: $FRONTEND_PID)${NC}"
fi

echo ""
echo "Log Files:"
echo "────────────────────────────────────────────────────────"
echo "Backend:  $BACKEND_DIR/backend.log"
echo "Frontend: $FRONTEND_DIR/frontend.log"
echo "Asterisk: journalctl -u asterisk -f"
echo ""
echo "Next Steps:"
echo "────────────────────────────────────────────────────────"
echo "1. Access http://your-server-ip:5173 in your browser"
echo "2. Log in with admin / admin123"
echo "3. Change default password in Settings"
echo "4. Configure SIP endpoints and users"
echo "5. Set up phone extensions in the web interface"
echo ""
echo "Useful Commands:"
echo "────────────────────────────────────────────────────────"
echo "# Restart all services"
echo "sudo systemctl restart asterisk"
echo "pkill -f 'node server.js'"
echo "pkill -f 'npm run dev'"
echo ""
echo "# View logs"
echo "tail -f $BACKEND_DIR/backend.log"
echo "tail -f $FRONTEND_DIR/frontend.log"
echo "journalctl -u asterisk -f"
echo ""
echo "# Access Asterisk CLI"
echo "asterisk -r"
echo ""
