# One-Script Complete Installation

## Quick Start (Easiest Way)

Just run this ONE script:

```bash
cd ~/mypbx
chmod +x complete-install.sh
sudo bash complete-install.sh
```

**The script does EVERYTHING automatically:**
1. Updates system packages
2. Installs all dependencies (Node.js, PostgreSQL, Asterisk, build tools, etc.)
3. Sets up PostgreSQL database with user credentials
4. Configures Asterisk PBX with SIP endpoints
5. Installs backend Node.js dependencies
6. Installs frontend React dependencies
7. Starts backend server
8. Starts frontend server
9. Verifies all services are running
10. Displays access information

**Total time: 10-15 minutes**

After completion, you'll see:
- ✅ Access URLs
- ✅ Login credentials
- ✅ Database info
- ✅ Running services status
- ✅ Useful commands

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

## If Installation Fails

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

- [README.md](README.md) - Main project documentation
- [POST-INSTALLATION-GUIDE.md](POST-INSTALLATION-GUIDE.md) - Configuration and administration
- [INSTALLATION-COMMANDS.md](INSTALLATION-COMMANDS.md) - Manual step-by-step commands
- [GitHub Repository](https://github.com/sportsbar-prog/mypbx) - Source code
- [Asterisk Wiki](https://wiki.asterisk.org/) - Asterisk documentation
