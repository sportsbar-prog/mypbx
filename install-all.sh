#!/bin/bash

# ============================================
# Asterisk PBX Management System - One-Click Installer
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     Asterisk PBX Management System Installer             ║
║     Complete Setup with Database, Backend & Frontend     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# ============================================
# 1. Check Prerequisites
# ============================================
echo -e "${YELLOW}[1/8] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
fi

if ! command -v asterisk &> /dev/null; then
    echo -e "${RED}❌ Asterisk not found. Please install Asterisk first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"

# ============================================
# 2. Setup PostgreSQL Database
# ============================================
echo -e "${YELLOW}[2/8] Setting up PostgreSQL database...${NC}"

DB_NAME="ari_api"
DB_USER="ari_user"
DB_PASS="$(openssl rand -base64 12)"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"

sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = '$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo -e "${GREEN}✅ Database configured${NC}"

# ============================================
# 3. Create Environment File
# ============================================
echo -e "${YELLOW}[3/8] Creating environment configuration...${NC}"

cat > backend-node/.env << EOF
# Database
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost/${DB_NAME}

# Server
PORT=3000
NODE_ENV=production

# JWT Secret
JWT_SECRET=$(openssl rand -base64 32)

# Asterisk ARI
ARI_HOST=localhost
ARI_PORT=8088
ARI_USER=ariuser
ARI_PASSWORD=aripassword
ARI_APP_NAME=asterisk-gui

# Asterisk Config
ASTERISK_CONFIG_DIR=/etc/asterisk
RECORDINGS_DIR=/var/spool/asterisk/recording
ASTERISK_SOUNDS_DIR=/var/lib/asterisk/sounds

# Default Caller ID
CALLER_ID=1000

# PJSIP
PJSIP_PORT=5060

# TTS (Optional)
TTS_ENGINE=gtts
GOOGLE_TTS_API_KEY=
EOF

echo -e "${GREEN}✅ Environment configured${NC}"

# ============================================
# 4. Install Backend Dependencies
# ============================================
echo -e "${YELLOW}[4/8] Installing backend dependencies...${NC}"

cd backend-node
npm install --production
cd ..

echo -e "${GREEN}✅ Backend dependencies installed${NC}"

# ============================================
# 5. Initialize Database Schema
# ============================================
echo -e "${YELLOW}[5/8] Initializing database schema...${NC}"

cd backend-node
node initialize-db.js
cd ..

echo -e "${GREEN}✅ Database schema created${NC}"

# ============================================
# 6. Create Admin User
# ============================================
echo -e "${YELLOW}[6/8] Creating admin user...${NC}"

cd backend-node
node create-admin.js
cd ..

echo -e "${GREEN}✅ Admin user created (Username: admin, Password: admin123)${NC}"

# ============================================
# 7. Setup Frontend
# ============================================
echo -e "${YELLOW}[7/8] Setting up frontend...${NC}"

cd frontend
npm install
cd ..

echo -e "${GREEN}✅ Frontend dependencies installed${NC}"

# ============================================
# 8. Create Systemd Services
# ============================================
echo -e "${YELLOW}[8/8] Creating systemd services...${NC}"

INSTALL_DIR=$(pwd)

# Backend Service
sudo tee /etc/systemd/system/asterisk-backend.service > /dev/null << EOF
[Unit]
Description=Asterisk PBX Backend API
After=network.target postgresql.service asterisk.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/backend-node
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Frontend Service
sudo tee /etc/systemd/system/asterisk-frontend.service > /dev/null << EOF
[Unit]
Description=Asterisk PBX Frontend
After=network.target asterisk-backend.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/frontend
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable asterisk-backend
sudo systemctl enable asterisk-frontend
sudo systemctl start asterisk-backend
sudo systemctl start asterisk-frontend

echo -e "${GREEN}✅ Services created and started${NC}"

# ============================================
# 9. Configure Asterisk
# ============================================
echo -e "${YELLOW}[9/9] Configuring Asterisk...${NC}"

# Ensure ARI is enabled
if ! grep -q "enabled = yes" /etc/asterisk/ari.conf 2>/dev/null; then
    sudo tee /etc/asterisk/ari.conf > /dev/null << EOF
[general]
enabled = yes
pretty = yes

[ariuser]
type = user
read_only = no
password = aripassword
password_format = plain
EOF
fi

# Ensure HTTP is enabled
if ! grep -q "enabled=yes" /etc/asterisk/http.conf 2>/dev/null; then
    sudo tee -a /etc/asterisk/http.conf > /dev/null << EOF
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
EOF
fi

# Reload Asterisk config
sudo asterisk -rx "module reload res_ari.so" 2>/dev/null || true
sudo asterisk -rx "module reload res_http.so" 2>/dev/null || true

echo -e "${GREEN}✅ Asterisk configured${NC}"

# ============================================
# Installation Complete
# ============================================
echo -e "${GREEN}"
cat << "EOF"

╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║            🎉 Installation Completed! 🎉                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

EOF
echo -e "${NC}"

SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 Access Information:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Frontend:${NC}      http://${SERVER_IP}:5173"
echo -e "  ${YELLOW}Backend API:${NC}   http://${SERVER_IP}:3000"
echo -e "  ${YELLOW}Admin Login:${NC}   Username: ${GREEN}admin${NC}"
echo -e "                  Password: ${GREEN}admin123${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔧 Service Management:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Check status:   ${YELLOW}sudo systemctl status asterisk-backend${NC}"
echo -e "                  ${YELLOW}sudo systemctl status asterisk-frontend${NC}"
echo ""
echo -e "  View logs:      ${YELLOW}sudo journalctl -u asterisk-backend -f${NC}"
echo -e "                  ${YELLOW}sudo journalctl -u asterisk-frontend -f${NC}"
echo ""
echo -e "  Restart:        ${YELLOW}sudo systemctl restart asterisk-backend${NC}"
echo -e "                  ${YELLOW}sudo systemctl restart asterisk-frontend${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📝 Next Steps:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  1. Open ${YELLOW}http://${SERVER_IP}:5173${NC} in your browser"
echo -e "  2. Login with admin credentials"
echo -e "  3. Configure SIP Users and Trunks"
echo -e "  4. Start making calls!"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}Database credentials saved in: backend-node/.env${NC}"
echo ""
