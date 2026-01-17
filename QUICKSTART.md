# One-Click Installation Guide

## Quick Start (Recommended)

The easiest way to install everything is with the one-click script:

```bash
cd ~/mypbx
chmod +x install.sh
sudo bash install.sh
```

That's it! The script will:
- Update system packages
- Install all dependencies (build tools, Node.js, PostgreSQL, etc.)
- Download and compile Asterisk 20
- Set up PostgreSQL database
- Install backend and frontend
- Start all services
- Display access information

**Total time: ~10-20 minutes** (depending on internet speed and server performance)

---

## After Installation

### Access the Web Interface
- **URL**: http://your-server-ip:5173
- **Login**: admin / admin123
- **⚠️ Change password immediately!**

### Access Asterisk CLI
```bash
asterisk -r
```

### View Logs
```bash
# Backend logs
tail -f ~/mypbx/backend-node/backend.log

# Frontend logs
tail -f ~/mypbx/frontend/frontend.log

# Asterisk logs
journalctl -u asterisk -f
```

### Stop/Start Services
```bash
# Stop
sudo systemctl stop asterisk
pkill -f "node server.js"
pkill -f "npm run dev"

# Start
sudo systemctl start asterisk
cd ~/mypbx/backend-node && nohup node server.js > backend.log 2>&1 &
cd ~/mypbx/frontend && nohup npm run dev > frontend.log 2>&1 &
```

---

## Alternative Installation Methods

If the one-click script doesn't work for some reason, you can:

### Option 1: Use the Manual Asterisk Script
```bash
sudo bash ~/mypbx/manual-asterisk-install.sh
```

### Option 2: Follow Step-by-Step Commands
See [INSTALLATION-COMMANDS.md](INSTALLATION-COMMANDS.md) for detailed manual steps

---

## Troubleshooting

### Services not starting?
```bash
# Check status
sudo systemctl status asterisk
systemctl status postgresql
ps aux | grep node

# View detailed logs
journalctl -u asterisk -n 100
cat ~/mypbx/backend-node/backend.log
```

### Port conflicts?
```bash
# See what's using ports
sudo netstat -tuln | grep -E '5060|5173|3000'

# Kill conflicting processes
sudo killall asterisk
pkill -f "node server.js"
pkill -f "npm run dev"

# Then restart
sudo systemctl start asterisk
cd ~/mypbx/backend-node && nohup node server.js > backend.log 2>&1 &
cd ~/mypbx/frontend && nohup npm run dev > frontend.log 2>&1 &
```

### Database issues?
```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Connect to database
sudo -u postgres psql -d ari_api

# Within psql shell:
# \dt   (show tables)
# \du   (show users)
# \l    (show databases)
# \q    (exit)
```

---

## System Requirements

- Ubuntu 20.04 LTS or later
- 2+ CPU cores
- 4GB+ RAM
- 20GB+ disk space
- Internet connectivity for downloads

---

## Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| Web UI | admin | admin123 |
| PostgreSQL | ari_user | change_me |

**⚠️ IMPORTANT: Change all default passwords after installation!**

---

## What Gets Installed

- **Asterisk 20.8.0** - PBX server
- **PostgreSQL** - Database
- **Node.js 20** - Backend runtime
- **npm** - JavaScript package manager
- **React + Vite** - Frontend framework
- **Systemd services** - Auto-start on reboot

---

## Support & Documentation

- [Post-Installation Guide](POST-INSTALLATION-GUIDE.md)
- [Installation Commands](INSTALLATION-COMMANDS.md)
- [Manual Asterisk Script](manual-asterisk-install.sh)
- [Asterisk Wiki](https://wiki.asterisk.org/)
- [GitHub Repository](https://github.com/sportsbar-prog/mypbx)
