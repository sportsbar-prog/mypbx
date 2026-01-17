# Asterisk Installation - Quick Command Reference

## For Linux Server (not Windows PowerShell)

Copy and paste these commands into your Linux terminal (SSH into your instance first).

### Step 1: Download Asterisk 20

```bash
cd /usr/src
sudo wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-20-current.tar.gz
```

### Step 2: Extract

```bash
sudo tar -xzf asterisk-20-current.tar.gz
```

### Step 3: Enter Directory

```bash
cd asterisk-20.*
```

### Step 4: Run Bootstrap (if needed)

```bash
sudo ./bootstrap.sh
```

### Step 5: Install Dependencies

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl wget git libssl-dev libncurses5-dev libsqlite3-dev libjansson-dev libxml2-dev libpq-dev libgsm1-dev libtiff-dev libasound2-dev sox libc-client2007e-dev sqlite3 uuid-dev flex bison
```

### Step 6: Configure Build

```bash
sudo ./configure --prefix=/opt/asterisk --with-pgsql --with-ssl --with-srtp --with-jansson --enable-dev-mode
```

### Step 7: Compile (takes 5-15 minutes)

```bash
sudo make -j$(nproc)
```

### Step 8: Install

```bash
sudo make install
sudo make install-logrotate
sudo make install-config
```

### Step 9: Create Asterisk User

```bash
sudo useradd -r -s /bin/bash asterisk
sudo chown -R asterisk:asterisk /opt/asterisk
sudo chmod -R u+w /opt/asterisk
```

### Step 10: Create SystemD Service

```bash
sudo tee /etc/systemd/system/asterisk.service > /dev/null << 'EOF'
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
```

### Step 11: Enable and Start Asterisk

```bash
sudo systemctl daemon-reload
sudo systemctl enable asterisk
sudo systemctl start asterisk
```

### Step 12: Verify Installation

```bash
/opt/asterisk/sbin/asterisk -V
```

---

## Verify Services Are Running

```bash
# Check Asterisk
systemctl status asterisk

# Check PostgreSQL
systemctl status postgresql

# Check logs
journalctl -u asterisk -f
```

---

## Install Backend and Frontend

From your home directory:

```bash
cd ~/mypbx
cd backend-node && npm install
cd ../frontend && npm install
```

---

## Start the Web Servers

From project root directory:

```bash
# Terminal 1 - Backend
cd ~/mypbx/backend-node
nohup node server.js > backend.log 2>&1 &

# Terminal 2 - Frontend
cd ~/mypbx/frontend
nohup npm run dev > frontend.log 2>&1 &
```

---

## Access Your System

- **Web UI**: http://your-server-ip:5173
- **Backend API**: http://your-server-ip:3000
- **Asterisk CLI**: `asterisk -r`

Default Login: `admin` / `admin123`

---

## Troubleshooting

If Asterisk fails to start:

```bash
# View detailed logs
sudo journalctl -u asterisk -n 50

# Run Asterisk in foreground (for debugging)
sudo /opt/asterisk/sbin/asterisk -f -vvv
```

If ports are in use:

```bash
# Check what's using the ports
sudo netstat -tuln | grep -E '5060|5061|3000|5173'

# Kill processes if needed
sudo killall asterisk
sudo killall node
```
