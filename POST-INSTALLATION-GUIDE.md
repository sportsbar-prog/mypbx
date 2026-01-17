# Asterisk PBX + Web GUI - Post-Installation Guide

## Installation Summary

Your complete Asterisk PBX system with web GUI has been installed. This guide covers:
- Initial configuration
- Creating users and endpoints
- Setting up calls
- Troubleshooting
- Administration

---

## Quick Start

### 1. Access the Web Interface
- **URL**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Default Login**: admin / admin123
  
**⚠️ IMPORTANT: Change the default password immediately!**

### 2. Access Asterisk CLI
```bash
sudo asterisk -r
```

### 3. Check Service Status
```bash
# Check all services
sudo systemctl status asterisk
sudo systemctl status postgresql
ps aux | grep "node server.js"
ps aux | grep "npm run dev"
```

---

## Initial Configuration

### Step 1: Change Database Password

By default, the PostgreSQL user `ari_user` has password `change_me`. Change this immediately:

```bash
sudo -u postgres psql
```

Then in the psql prompt:
```sql
ALTER USER ari_user WITH PASSWORD 'your_secure_password';
\q
```

Update the backend `.env` file with the new password:
```bash
# Edit backend-node/.env
DATABASE_URL=postgresql://ari_user:your_secure_password@localhost:5432/ari_api
```

Restart the backend server:
```bash
pkill -f "node server.js"
cd backend-node && nohup node server.js > backend.log 2>&1 &
```

### Step 2: Change Web UI Default Password

1. Log in with admin/admin123
2. Go to Settings → User Management
3. Edit the admin user
4. Change the password
5. Save and log out, then log back in with new password

### Step 3: Configure SIP Settings

1. In the web UI, navigate to **Settings → SIP Configuration**
2. Configure your SIP domain/realm
3. Set bind address (usually 0.0.0.0 or your server IP)
4. Configure ports if needed

---

## Creating SIP Users and Endpoints

### Method 1: Using Web Interface

1. Go to **Endpoints** in the web menu
2. Click **Create New Endpoint**
3. Fill in:
   - **Username**: sip_user_1
   - **Password**: secure_password
   - **Display Name**: User 1
   - **Type**: SIP
4. Click Save

### Method 2: Using Asterisk CLI

```bash
sudo asterisk -r
```

Then:
```
core> pjsip set endpoint auth <endpoint-name> password <password>
core> exit
```

### Verify SIP Users

In Asterisk CLI:
```
core> pjsip show endpoints
core> pjsip show aor <endpoint-name>
```

In Web UI:
- Go to **Endpoints** to see all configured SIP users

---

## Setting Up Phone Extensions

### Create a Dialplan

The basic extensions have been created in `/opt/asterisk/etc/asterisk/extensions.conf`:

```
[default]
exten => 100,1,Dial(SIP/101)
exten => 101,1,VoiceMail(101@default)
exten => 101,2,Hangup()
```

This means:
- Extension 100 dials endpoint 101
- Extension 101 goes to voicemail

### Add More Extensions

Edit `/opt/asterisk/etc/asterisk/extensions.conf`:

```bash
sudo nano /opt/asterisk/etc/asterisk/extensions.conf
```

Add new extensions:
```
[default]
exten => 200,1,Dial(SIP/102)
exten => 102,1,VoiceMail(102@default)
exten => 102,2,Hangup()

exten => 300,1,Dial(SIP/103)
exten => 103,1,VoiceMail(103@default)
exten => 103,2,Hangup()
```

### Reload Dialplan

In Asterisk CLI:
```
core> dialplan reload
core> exit
```

Or from command line:
```bash
sudo asterisk -r -x "dialplan reload"
```

---

## Setting Up Trunks (External Calling)

### Configure a SIP Trunk

1. In Web UI, go to **Trunks**
2. Click **Create New Trunk**
3. Fill in trunk details:
   - **Trunk Name**: my_voip_provider
   - **Provider**: (your provider name)
   - **Outbound Proxy**: trunk.provider.com
   - **Trunk Number**: your_account_number
4. Save

### Add Trunk to Dialplan

Edit `/opt/asterisk/etc/asterisk/extensions.conf`:

```
[default]
; Local calls
exten => _1XX,1,Dial(SIP/${EXTEN})

; External calls (starts with 9)
exten => _9X.,1,Dial(SIP/trunk/${EXTEN:1})
```

Reload: `sudo asterisk -r -x "dialplan reload"`

---

## Testing and Verification

### Test 1: SIP Registration
```bash
sudo asterisk -r
core> pjsip show endpoints
```

You should see your created endpoints listed.

### Test 2: Make a Call

Using a SIP client (like Zoiper or MicroSIP):
1. Configure with:
   - **Server**: your_server_ip_or_hostname
   - **Username**: sip_user_1
   - **Password**: secure_password
2. Register the client
3. Dial another extension (e.g., 101)

### Test 3: Check Logs

```bash
# Asterisk logs
sudo tail -f /opt/asterisk/var/log/asterisk/full

# Backend API logs
tail -f backend-node/backend.log

# Frontend logs
tail -f frontend/frontend.log
```

### Test 4: API Endpoint

```bash
# Get channels
curl http://localhost:3000/api/channels

# Get endpoints
curl http://localhost:3000/api/endpoints
```

---

## Troubleshooting

### Issue: Backend Server Won't Start

**Check logs:**
```bash
cat backend-node/backend.log
```

**Common causes:**
- Port 3000 already in use
- Database connection failure
- Missing dependencies

**Fix:**
```bash
# Kill any existing Node process
pkill -f "node server.js"

# Restart
cd backend-node
npm install  # Reinstall dependencies if needed
node server.js  # Run in foreground to see errors
```

### Issue: Frontend Won't Start

**Check logs:**
```bash
cat frontend/frontend.log
```

**Fix:**
```bash
pkill -f "npm run dev"
cd frontend
npm install  # Reinstall if needed
npm run dev
```

### Issue: Asterisk Won't Start

**Check status:**
```bash
sudo systemctl status asterisk
sudo journalctl -u asterisk -n 50
```

**Check for port conflicts:**
```bash
sudo netstat -tuln | grep -E '5060|5061'
```

**Restart:**
```bash
sudo systemctl restart asterisk
```

### Issue: SIP Endpoints Not Registering

**Check PJSIP status:**
```bash
sudo asterisk -r
core> pjsip show endpoints
core> pjsip show registrations
```

**Check configuration:**
```bash
sudo asterisk -r
core> config reload
core> exit
```

### Issue: No Audio in Calls

1. Check RTP ports are open (5000-20000)
2. Check firewall rules
3. Check codec configuration
4. Check STUN/TURN settings if behind NAT

```bash
sudo ufw allow 5000:20000/udp
sudo ufw allow 5060:5061/tcp
sudo ufw allow 5060:5061/udp
```

---

## Advanced Configuration

### Enable TLS/SSL for SIP

Edit `/opt/asterisk/etc/asterisk/pjsip.conf`:

```
[transport-tls]
type=transport
protocol=tls
bind=0.0.0.0:5061
cert_file=/path/to/cert.pem
priv_key_file=/path/to/key.pem
```

### Configure Voicemail

Edit `/opt/asterisk/etc/asterisk/voicemail.conf`:

```
[default]
101 => 1234,User One,user1@example.com
102 => 1234,User Two,user2@example.com
```

Access voicemail: dial *98

### Configure Music on Hold

```bash
mkdir -p /opt/asterisk/var/lib/asterisk/moh/custom
# Copy .wav files to directory
```

---

## Backup and Restore

### Backup Configuration

```bash
# Backup Asterisk config
sudo tar -czf asterisk-backup-$(date +%Y%m%d).tar.gz /opt/asterisk/etc/

# Backup database
sudo pg_dump -U ari_user ari_api > ari_backup-$(date +%Y%m%d).sql
```

### Restore Configuration

```bash
# Restore Asterisk
sudo tar -xzf asterisk-backup-20260117.tar.gz -C /

# Restore database
sudo -u postgres psql ari_api < ari_backup-20260117.sql

# Reload
sudo asterisk -r -x "core reload"
```

---

## Useful Asterisk Commands

```bash
# Access CLI
sudo asterisk -r

# In CLI:
core> pjsip show endpoints          # List all SIP endpoints
core> pjsip show aor <name>        # Show endpoint details
core> dialplan show default        # Show extensions
core> core show channels           # Active calls
core> core show calls              # Detailed call info
core> soft hangup <channel>        # End a call
core> reload                        # Reload configuration
core> exit                          # Exit CLI
```

---

## Support and Further Help

- **Asterisk Documentation**: https://wiki.asterisk.org/
- **PJSIP Configuration**: https://wiki.asterisk.org/wiki/display/AST/Configuring+res_pjsip
- **Project Repository**: Check your local setup for source code

---

## Security Recommendations

1. ✅ Change default passwords (admin, database user)
2. ✅ Use firewall to restrict access
3. ✅ Disable unnecessary services
4. ✅ Keep Asterisk and dependencies updated
5. ✅ Use TLS/SSL for SIP
6. ✅ Restrict SIP access by IP if possible
7. ✅ Regularly backup configuration and database

---

**Last Updated**: January 17, 2026
**Version**: Asterisk 20.8.0 + Web GUI v1.0
