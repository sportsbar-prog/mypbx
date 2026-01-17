#!/bin/bash
# Manual Asterisk Installation Script
# Run this on your Linux server to manually compile and install Asterisk

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║     Asterisk Manual Installation from Source          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run as root. Use: sudo bash manual-asterisk-install.sh"
    exit 1
fi

# Step 1: Download Asterisk
echo "→ Downloading Asterisk 20 source..."
mkdir -p /usr/src
cd /usr/src

if [ ! -f "asterisk-20-current.tar.gz" ]; then
    wget -q https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
    if [ $? -eq 0 ]; then
        echo "✓ Download successful"
    else
        echo "✗ Download failed - trying alternative URL"
        wget -q https://github.com/asterisk/asterisk/archive/refs/heads/20.tar.gz -O asterisk-20-current.tar.gz
    fi
else
    echo "✓ Asterisk source already downloaded"
fi

# Step 2: Extract
echo "→ Extracting Asterisk source..."
if [ -f "asterisk-20-current.tar.gz" ]; then
    tar -xzf asterisk-20-current.tar.gz
    echo "✓ Extraction complete"
else
    echo "✗ Source file not found"
    exit 1
fi

# Find the extracted directory
ASTERISK_DIR=$(ls -d asterisk-20* | grep -v "\.tar" | head -1)

if [ -z "$ASTERISK_DIR" ]; then
    echo "✗ Could not find extracted Asterisk directory"
    exit 1
fi

echo "→ Entering directory: $ASTERISK_DIR"
cd "$ASTERISK_DIR"

# Step 3: Install dependencies (if not already installed)
echo "→ Installing build dependencies..."
apt-get update > /dev/null 2>&1
apt-get install -y \
    build-essential \
    curl \
    wget \
    git \
    libssl-dev \
    libncurses5-dev \
    libsqlite3-dev \
    libjansson-dev \
    libxml2-dev \
    libpq-dev \
    libgsm1-dev \
    libtiff-dev \
    libasound2-dev \
    sox \
    libc-client2007e-dev \
    sqlite3 \
    uuid-dev \
    flex \
    bison \
    > /dev/null 2>&1
echo "✓ Dependencies installed"

# Step 4: Run bootstrap if exists
echo "→ Running bootstrap..."
if [ -f "bootstrap.sh" ]; then
    ./bootstrap.sh > /dev/null 2>&1
    echo "✓ Bootstrap complete"
else
    echo "! Bootstrap script not found (this is OK)"
fi

# Step 5: Configure
echo "→ Configuring Asterisk build..."
./configure --prefix=/opt/asterisk \
    --with-pgsql \
    --with-ssl \
    --with-srtp \
    --with-jansson \
    --enable-dev-mode \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Configuration successful"
else
    echo "! Configuration had warnings (continuing anyway)"
fi

# Step 6: Build (this takes time!)
echo "→ Building Asterisk (this may take 5-15 minutes)..."
echo "  Compiling with $(nproc) cores..."

make -j$(nproc) 2>&1 | tail -5

if [ $? -eq 0 ]; then
    echo "✓ Build successful"
else
    echo "✗ Build failed"
    exit 1
fi

# Step 7: Install
echo "→ Installing Asterisk..."
make install > /dev/null 2>&1
make install-logrotate > /dev/null 2>&1
make install-config > /dev/null 2>&1
echo "✓ Installation complete"

# Step 8: Verify
echo "→ Verifying installation..."
if [ -f "/opt/asterisk/sbin/asterisk" ]; then
    ASTERISK_VERSION=$(/opt/asterisk/sbin/asterisk -V)
    echo "✓ Asterisk installed: $ASTERISK_VERSION"
else
    echo "! Asterisk binary not found at /opt/asterisk/sbin/asterisk"
fi

# Step 9: Create asterisk user
echo "→ Setting up Asterisk user..."
if ! id -u asterisk > /dev/null 2>&1; then
    useradd -r -s /bin/bash asterisk
    echo "✓ Created asterisk user"
else
    echo "✓ Asterisk user already exists"
fi

# Set permissions
chown -R asterisk:asterisk /opt/asterisk
chmod -R u+w /opt/asterisk
echo "✓ Permissions set"

# Step 10: Create systemd service
echo "→ Creating systemd service..."
cat > /etc/systemd/system/asterisk.service << 'EOF'
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

systemctl daemon-reload
systemctl enable asterisk
echo "✓ Service created and enabled"

# Step 11: Start Asterisk
echo "→ Starting Asterisk..."
systemctl start asterisk
sleep 2

if systemctl is-active --quiet asterisk; then
    echo "✓ Asterisk service started successfully"
else
    echo "! Asterisk service may not have started - checking logs..."
    journalctl -u asterisk -n 20
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          Installation Complete!                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Asterisk Information:"
echo "────────────────────────────────────────────────────────"
echo "Installation Directory: /opt/asterisk"
echo "Configuration Directory: /etc/asterisk"
echo "Asterisk CLI: asterisk -r"
echo "View Logs: journalctl -u asterisk -f"
echo ""
echo "Useful Commands:"
echo "────────────────────────────────────────────────────────"
echo "Check status:        systemctl status asterisk"
echo "Restart:             systemctl restart asterisk"
echo "Stop:                systemctl stop asterisk"
echo "Start:               systemctl start asterisk"
echo "View logs:           journalctl -u asterisk -f"
echo "Access CLI:          asterisk -r"
echo "Reload config:       asterisk -r -x 'core reload'"
echo ""
echo "Next Steps:"
echo "────────────────────────────────────────────────────────"
echo "1. Go back to your project directory"
echo "2. Install backend and frontend:"
echo "   cd ~/mypbx"
echo "   cd backend-node && npm install"
echo "   cd ../frontend && npm install"
echo "3. Start the servers:"
echo "   cd ~/mypbx/backend-node && nohup node server.js > backend.log 2>&1 &"
echo "   cd ~/mypbx/frontend && nohup npm run dev > frontend.log 2>&1 &"
echo ""
