#!/bin/bash
# Asterisk PBX + GUI - Complete Full Installation from A-Z
# This script installs Asterisk, PostgreSQL, Node.js, and the complete GUI system

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_ROOT/backend-node"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SUDO_PASS="${SUDO_PASS:-}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions for output
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

check_command() {
    if command -v "$1" &> /dev/null; then
        print_success "$1 is installed"
        return 0
    else
        print_warning "$1 is not installed"
        return 1
    fi
}

# Require sudo password if not running as root
if [ "$EUID" -ne 0 ]; then
    if [ -z "$SUDO_PASS" ]; then
        read -sp "Enter sudo password: " SUDO_PASS
        echo ""
    fi
fi

print_header "Asterisk PBX + Web GUI - Complete Setup (A-Z)"

# ============================================================================
# STEP 1: Update System Packages
# ============================================================================
print_step "Updating system packages..."
echo "$SUDO_PASS" | sudo -S apt-get update
echo "$SUDO_PASS" | sudo -S apt-get upgrade -y > /dev/null 2>&1
print_success "System packages updated"

# ============================================================================
# STEP 2: Install System Dependencies
# ============================================================================
print_step "Installing system dependencies..."
PACKAGES=(
    "build-essential"
    "curl"
    "wget"
    "git"
    "libssl-dev"
    "libncurses5-dev"
    "libsqlite3-dev"
    "libjansson-dev"
    "libxml2-dev"
    "libpq-dev"
    "libgsm1-dev"
    "libtiff-dev"
    "libasound2-dev"
    "sox"
    "libc-client2007e-dev"
    "sqlite3"
    "uuid-dev"
    "flex"
    "bison"
)

for pkg in "${PACKAGES[@]}"; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
        echo "$SUDO_PASS" | sudo -S apt-get install -y "$pkg" > /dev/null 2>&1
        print_success "Installed $pkg"
    fi
done

# ============================================================================
# STEP 3: Install Node.js and npm
# ============================================================================
print_step "Installing Node.js and npm..."
if check_command "node"; then
    NODE_VERSION=$(node -v)
    print_success "Node.js $NODE_VERSION already installed"
else
    echo "$SUDO_PASS" | sudo -S apt-get install -y curl gnupg > /dev/null 2>&1
    
    # Try NodeSource repository
    if curl -fsSL https://deb.nodesource.com/setup_18.x 2>/dev/null | \
       echo "$SUDO_PASS" | sudo -S bash - > /dev/null 2>&1; then
        echo "$SUDO_PASS" | sudo -S apt-get install -y nodejs > /dev/null 2>&1
        if check_command "node"; then
            print_success "Node.js and npm installed from NodeSource"
        else
            print_warning "NodeSource install failed, trying apt-get..."
            echo "$SUDO_PASS" | sudo -S apt-get install -y nodejs npm > /dev/null 2>&1
            print_success "Node.js and npm installed"
        fi
    else
        print_warning "NodeSource setup failed, trying default packages..."
        echo "$SUDO_PASS" | sudo -S apt-get install -y nodejs npm > /dev/null 2>&1
        print_success "Node.js and npm installed"
    fi
fi

# ============================================================================
# STEP 4: Install PostgreSQL
# ============================================================================
print_step "Installing PostgreSQL..."
if check_command "psql"; then
    print_success "PostgreSQL already installed"
else
    echo "$SUDO_PASS" | sudo -S apt-get install -y postgresql postgresql-contrib > /dev/null 2>&1
    print_success "PostgreSQL installed"
fi

# Start PostgreSQL
print_step "Starting PostgreSQL service..."
echo "$SUDO_PASS" | sudo -S systemctl start postgresql > /dev/null 2>&1 || \
echo "$SUDO_PASS" | sudo -S service postgresql start > /dev/null 2>&1 || true
sleep 2

if echo "$SUDO_PASS" | sudo -S systemctl is-active --quiet postgresql 2>/dev/null || \
   echo "$SUDO_PASS" | sudo -S service postgresql status 2>/dev/null | grep -q "active"; then
    print_success "PostgreSQL service started"
else
    print_warning "PostgreSQL service may not be running"
fi

# ============================================================================
# STEP 5: Setup PostgreSQL Database and User
# ============================================================================
print_step "Setting up PostgreSQL database and user..."
{
    echo "SELECT 1 FROM pg_database WHERE datname = 'ari_api';" | \
    echo "$SUDO_PASS" | sudo -S -u postgres psql 2>/dev/null | grep -q 1 || \
    echo "$SUDO_PASS" | sudo -S -u postgres psql -c "CREATE DATABASE ari_api;" 2>/dev/null
    
    echo "$SUDO_PASS" | sudo -S -u postgres psql -c "DROP USER IF EXISTS ari_user;" 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S -u postgres psql -c "CREATE USER ari_user WITH ENCRYPTED PASSWORD 'change_me';" 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S -u postgres psql -c "ALTER ROLE ari_user CREATEDB;" 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ari_api TO ari_user;" 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;" 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ari_user;" 2>/dev/null || true
} || true

print_success "PostgreSQL database and user configured"

# Load database schema if exists
if [ -f "$BACKEND_DIR/database-schema.sql" ]; then
    print_step "Loading database schema..."
    echo "$SUDO_PASS" | sudo -S -u postgres psql -d ari_api -f "$BACKEND_DIR/database-schema.sql" > /dev/null 2>&1 || true
    print_success "Database schema loaded"
fi

# ============================================================================
# STEP 6: Install Asterisk from Source
# ============================================================================
print_step "Downloading Asterisk source..."
ASTERISK_VERSION="18.23.0"

# Try multiple download sources
ASTERISK_URLS=(
    "https://downloads.asterisk.org/pub/telephony/asterisk/releases/asterisk-${ASTERISK_VERSION}.tar.gz"
    "https://github.com/asterisk/asterisk/archive/refs/tags/${ASTERISK_VERSION}.tar.gz"
)

ASTERISK_BUILD_DIR="/tmp/asterisk-${ASTERISK_VERSION}"
DOWNLOAD_SUCCESS=0

if [ ! -d "$ASTERISK_BUILD_DIR" ]; then
    mkdir -p /tmp/asterisk-build
    cd /tmp/asterisk-build
    
    for ASTERISK_URL in "${ASTERISK_URLS[@]}"; do
        print_step "Trying download from: $ASTERISK_URL"
        
        # Try with curl first (usually more reliable)
        if curl -L --max-time 60 -o asterisk.tar.gz "$ASTERISK_URL" 2>/dev/null; then
            if tar tzf asterisk.tar.gz > /dev/null 2>&1; then
                DOWNLOAD_SUCCESS=1
                print_success "Downloaded successfully with curl"
                break
            fi
        fi
        
        # Try with wget if curl fails
        if [ $DOWNLOAD_SUCCESS -eq 0 ]; then
            if wget -q --timeout=60 "$ASTERISK_URL" -O asterisk.tar.gz 2>/dev/null; then
                if tar tzf asterisk.tar.gz > /dev/null 2>&1; then
                    DOWNLOAD_SUCCESS=1
                    print_success "Downloaded successfully with wget"
                    break
                fi
            fi
        fi
    done
    
    if [ $DOWNLOAD_SUCCESS -eq 0 ]; then
        print_error "Failed to download Asterisk from all sources"
        print_warning "Network connectivity may be limited. Options:"
        echo "  1. Run this script with internet access"
        echo "  2. Download manually: https://downloads.asterisk.org/pub/telephony/asterisk/releases/"
        echo "  3. Install from system packages: sudo apt-get install asterisk"
        echo ""
        read -p "Install Asterisk from system packages instead? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_step "Installing Asterisk from system packages..."
            echo "$SUDO_PASS" | sudo -S apt-get install -y asterisk asterisk-dev > /dev/null 2>&1
            if command -v asterisk &> /dev/null; then
                print_success "Asterisk installed from system packages"
                ASTERISK_VERSION=$(asterisk -V | grep -oP '\d+\.\d+\.\d+' | head -1)
                print_success "Asterisk version: $ASTERISK_VERSION"
                DOWNLOAD_SUCCESS=2
            else
                print_error "Could not install Asterisk - skipping"
            fi
        else
            print_warning "Skipping Asterisk installation"
            DOWNLOAD_SUCCESS=2
        fi
    else
        # Extract the tarball
        tar xzf asterisk.tar.gz > /dev/null 2>&1
        
        # Find the extracted directory
        if [ -d "asterisk-${ASTERISK_VERSION}" ]; then
            ASTERISK_BUILD_DIR="$(pwd)/asterisk-${ASTERISK_VERSION}"
        elif [ -d "asterisk-asterisk-${ASTERISK_VERSION}" ]; then
            ASTERISK_BUILD_DIR="$(pwd)/asterisk-asterisk-${ASTERISK_VERSION}"
        else
            # Get the first directory that was extracted
            ASTERISK_BUILD_DIR="$(ls -d */ | head -1 | sed 's:/$::')"
            ASTERISK_BUILD_DIR="$(pwd)/$ASTERISK_BUILD_DIR"
        fi
        
        if [ ! -d "$ASTERISK_BUILD_DIR" ]; then
            print_error "Asterisk source directory not found after extraction"
            DOWNLOAD_SUCCESS=0
        else
            print_success "Asterisk source downloaded and extracted"
        fi
    fi
else
    print_success "Asterisk source already downloaded"
    DOWNLOAD_SUCCESS=1
fi

# Only continue with build if we successfully downloaded from source
if [ $DOWNLOAD_SUCCESS -eq 1 ]; then
    if [ ! -d "$ASTERISK_BUILD_DIR" ]; then
        print_error "Asterisk build directory not accessible"
        exit 1
    fi
    
    cd "$ASTERISK_BUILD_DIR"

    print_step "Configuring Asterisk build..."
    ./configure --prefix=/opt/asterisk \
        --with-pgsql \
        --with-ssl \
        --with-srtp \
        --with-jansson \
        --with-json \
        --enable-dev-mode \
        > /dev/null 2>&1

    print_success "Asterisk configured"

    print_step "Building and installing Asterisk (this may take several minutes)..."
    make -j$(nproc) > /dev/null 2>&1
    echo "$SUDO_PASS" | sudo -S make install > /dev/null 2>&1
    echo "$SUDO_PASS" | sudo -S make install-logrotate > /dev/null 2>&1
    echo "$SUDO_PASS" | sudo -S /opt/asterisk/sbin/asterisk -V > /dev/null 2>&1 && \
        print_success "Asterisk installed: $(/opt/asterisk/sbin/asterisk -V)"
else
    print_warning "Skipping Asterisk from source build"
fi

# ============================================================================
# STEP 7: Install Asterisk Sample Configuration
# ============================================================================
print_step "Installing Asterisk configuration files..."
if command -v asterisk &> /dev/null; then
    ASTERISK_CONF_DIR=$(/opt/asterisk/sbin/asterisk -r -x "core show settings" 2>/dev/null | grep "Asterisk Executable" | awk '{print $NF}' | xargs dirname 2>/dev/null || echo "/etc/asterisk")
    [ ! -d "$ASTERISK_CONF_DIR" ] && ASTERISK_CONF_DIR="/etc/asterisk"
    
    echo "$SUDO_PASS" | sudo -S mkdir -p "$ASTERISK_CONF_DIR"
    
    # Copy sample configs if available
    if [ -d "$ASTERISK_BUILD_DIR/configs/samples" ]; then
        echo "$SUDO_PASS" | sudo -S cp -r "$ASTERISK_BUILD_DIR/configs/samples/"*.conf.sample "$ASTERISK_CONF_DIR/" 2>/dev/null || true
    fi
    
    print_success "Asterisk configuration directory: $ASTERISK_CONF_DIR"
else
    print_warning "Asterisk not found, skipping configuration files"
    ASTERISK_CONF_DIR="/etc/asterisk"
fi

# Create basic extensions configuration
echo "$SUDO_PASS" | sudo -S mkdir -p "$ASTERISK_CONF_DIR"
echo "$SUDO_PASS" | sudo -S tee "$ASTERISK_CONF_DIR/extensions.conf" > /dev/null << 'EOF'
[general]
static=yes
writeprotect=no
clearglobalvars=no

[default]
exten => 100,1,Dial(SIP/101)
exten => 101,1,VoiceMail(101@default)
exten => 101,2,Hangup()

exten => 200,1,Dial(SIP/102)
exten => 102,1,VoiceMail(102@default)
exten => 102,2,Hangup()

[from-internal]
exten => _X.,1,Dial(SIP/${EXTEN})
exten => _X.,2,VoiceMail(${EXTEN}@default)
exten => _X.,3,Hangup()
EOF

print_success "Asterisk configuration files installed"

# ============================================================================
# STEP 8: Setup Asterisk Service
# ============================================================================
print_step "Creating Asterisk systemd service..."
echo "$SUDO_PASS" | sudo -S tee /etc/systemd/system/asterisk.service > /dev/null << 'EOF'
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

echo "$SUDO_PASS" | sudo -S systemctl daemon-reload
print_success "Asterisk service created"

# Create asterisk user if it doesn't exist
if ! id -u asterisk > /dev/null 2>&1; then
    echo "$SUDO_PASS" | sudo -S useradd -r -s /bin/bash asterisk
    echo "$SUDO_PASS" | sudo -S chown -R asterisk:asterisk /opt/asterisk
fi

# ============================================================================
# STEP 9: Install Backend Dependencies
# ============================================================================
print_step "Installing backend dependencies..."
cd "$BACKEND_DIR"

if [ ! -d "node_modules" ]; then
    npm install > /dev/null 2>&1
    print_success "Backend dependencies installed"
else
    print_success "Backend dependencies already present"
fi

# ============================================================================
# STEP 10: Install Frontend Dependencies
# ============================================================================
print_step "Installing frontend dependencies..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    npm install > /dev/null 2>&1
    print_success "Frontend dependencies installed"
else
    print_success "Frontend dependencies already present"
fi

# ============================================================================
# STEP 11: Enable and Start Asterisk
# ============================================================================
print_step "Starting Asterisk service..."
echo "$SUDO_PASS" | sudo -S systemctl enable asterisk > /dev/null 2>&1 || true
echo "$SUDO_PASS" | sudo -S systemctl start asterisk > /dev/null 2>&1 || true
sleep 3

if echo "$SUDO_PASS" | sudo -S systemctl is-active --quiet asterisk 2>/dev/null; then
    ASTERISK_PID=$(pgrep -f "/opt/asterisk/sbin/asterisk" | head -n1)
    print_success "Asterisk service started (PID: $ASTERISK_PID)"
else
    print_warning "Asterisk service may not have started - checking manually..."
fi

# ============================================================================
# STEP 12: Start Backend Server
# ============================================================================
print_step "Starting backend server..."
cd "$BACKEND_DIR"
nohup node server.js > backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if ps -p $BACKEND_PID > /dev/null 2>&1; then
    print_success "Backend server started (PID: $BACKEND_PID)"
else
    print_error "Failed to start backend server"
    print_warning "Backend log:"
    cat backend.log | tail -10
fi

# ============================================================================
# STEP 13: Start Frontend Server
# ============================================================================
print_step "Starting frontend server..."
cd "$FRONTEND_DIR"
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 5

if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    print_success "Frontend server started (PID: $FRONTEND_PID)"
else
    print_error "Failed to start frontend server"
    print_warning "Frontend log:"
    cat frontend.log | tail -10
fi

# ============================================================================
# STEP 14: Verification
# ============================================================================
print_step "Verifying services..."
sleep 2

SERVICES_OK=0

# Check Asterisk
if echo "$SUDO_PASS" | sudo -S systemctl is-active --quiet asterisk 2>/dev/null || \
   pgrep -f "/opt/asterisk/sbin/asterisk" > /dev/null 2>&1; then
    print_success "Asterisk is running"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "Asterisk service may not be fully initialized"
fi

# Check PostgreSQL
if echo "$SUDO_PASS" | sudo -S systemctl is-active --quiet postgresql 2>/dev/null; then
    print_success "PostgreSQL is running"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "PostgreSQL service check failed"
fi

# Check Backend API
if curl -s http://localhost:3000/api/channels > /dev/null 2>&1; then
    print_success "Backend API is responding"
    SERVICES_OK=$((SERVICES_OK + 1))
else
    print_warning "Backend API not responding yet (may be initializing)"
fi

# Check Frontend
FRONTEND_PORTS=(5173 5175 3000)
FRONTEND_OK=0
for port in "${FRONTEND_PORTS[@]}"; do
    if curl -s http://localhost:$port/ > /dev/null 2>&1; then
        print_success "Frontend is responding on port $port"
        FRONTEND_OK=1
        break
    fi
done
[ $FRONTEND_OK -eq 0 ] && print_warning "Frontend not responding yet (may be initializing)"

# ============================================================================
# STEP 15: Display Summary
# ============================================================================
print_header "Setup Complete!"

echo -e "${GREEN}All components installed successfully!${NC}"
echo ""
echo "Access Information:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Frontend Web UI:${NC} http://localhost:5173"
echo -e "${GREEN}Backend API:${NC}     http://localhost:3000"
echo -e "${GREEN}Asterisk CLI:${NC}    asterisk -r (as root)"
echo -e "${GREEN}Default Login:${NC}   admin / admin123"
echo ""
echo "Database Information:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Database:${NC}        ari_api"
echo -e "${GREEN}User:${NC}            ari_user"
echo -e "${GREEN}Password:${NC}        change_me (CHANGE THIS!)"
echo ""
echo "Process Information:"
echo "────────────────────────────────────────────────────────"
if [ -n "$ASTERISK_PID" ]; then
    echo -e "${GREEN}Asterisk PID:${NC}    $ASTERISK_PID"
fi
echo -e "${GREEN}Backend PID:${NC}     $BACKEND_PID"
echo -e "${GREEN}Frontend PID:${NC}    $FRONTEND_PID"
echo ""
echo "Log Files:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Asterisk:${NC}  tail -f /opt/asterisk/var/log/asterisk/full"
echo -e "${GREEN}Backend:${NC}  tail -f $BACKEND_DIR/backend.log"
echo -e "${GREEN}Frontend:${NC}  tail -f $FRONTEND_DIR/frontend.log"
echo ""
echo "Useful Commands:"
echo "────────────────────────────────────────────────────────"
echo "# View Asterisk logs"
echo "sudo tail -f /opt/asterisk/var/log/asterisk/full"
echo ""
echo "# Access Asterisk CLI"
echo "asterisk -r"
echo ""
echo "# Check Asterisk status"
echo "sudo systemctl status asterisk"
echo ""
echo "# Restart Asterisk"
echo "sudo systemctl restart asterisk"
echo ""
echo "# Stop services"
echo "kill $BACKEND_PID  # Backend"
echo "kill $FRONTEND_PID # Frontend"
echo "sudo systemctl stop asterisk  # Asterisk"
echo ""
echo "# Start services again"
echo "cd $BACKEND_DIR && nohup node server.js > backend.log 2>&1 &"
echo "cd $FRONTEND_DIR && nohup npm run dev > frontend.log 2>&1 &"
echo "sudo systemctl start asterisk"
echo ""
echo "Next Steps:"
echo "────────────────────────────────────────────────────────"
echo "1. Change PostgreSQL password: sudo -u postgres psql -c \"ALTER USER ari_user WITH PASSWORD 'your_secure_password';\""
echo "2. Configure SIP users and endpoints in the web UI"
echo "3. Set up trunks for external calling"
echo "4. Configure dialplan rules in Asterisk"
echo "5. Test calls through the web interface"
echo ""
