# Login Fix Summary

## What Was Fixed

The installation script now automatically handles:

1. **Database Schema**: Creates `admins` and `admin_sessions` tables with proper structure
2. **Admin User**: Generates bcrypt hash for `admin123` password and inserts admin user
3. **Frontend Configuration**: Creates `.env` file with server IP for API connectivity

## Changes Made to complete-install.sh

### 1. Added Admin Database Schema (After Step 3)
```bash
# Creates admins table with:
- id, username, password_hash, email, is_active, last_login, created_at, updated_at

# Creates admin_sessions table with:
- id, admin_id, session_token, ip_address, user_agent, expires_at, created_at
```

### 2. Added Admin User Creation (After Step 5)
```bash
# Generates proper bcrypt hash for 'admin123'
# Inserts admin user into database with:
- Username: admin
- Password: admin123 (bcrypt hashed)
- Email: admin@asterisk.local
```

### 3. Added Frontend .env Configuration (After Step 6)
```bash
# Auto-detects server IP address
# Creates frontend/.env with:
VITE_API_URL=http://[SERVER_IP]:3000/api
```

## Testing the Fix

Run on your VPS:
```bash
cd ~/
sudo rm -rf mypbx
git clone https://github.com/sportsbar-prog/mypbx.git
cd mypbx
sudo bash complete-install.sh
```

After installation:
1. Open browser to `http://[YOUR_SERVER_IP]:5173`
2. Login with:
   - Username: `admin`
   - Password: `admin123`

## Manual Fix (If Needed)

If you already ran the old script, manually fix with:

```bash
cd ~/mypbx/backend-node
# Generate hash
ADMIN_HASH=$(node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(hash => console.log(hash));")

# Create tables and admin user
sudo -u postgres psql -d ari_api << 'EOF'
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    session_token VARCHAR(500) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF

# Insert admin (replace HASH with output from above)
sudo -u postgres psql -d ari_api -c "INSERT INTO admins (username, password_hash, email, is_active) VALUES ('admin', '$ADMIN_HASH', 'admin@asterisk.local', true) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;"

# Configure frontend
cd ~/mypbx/frontend
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "VITE_API_URL=http://${SERVER_IP}:3000/api" > .env

# Restart frontend
pkill -f "npm run dev"
nohup npm run dev -- --host 0.0.0.0 > frontend.log 2>&1 &
```

Then clear browser cache and login.

## Verification

Test login works:
```bash
SERVER_IP=$(hostname -I | awk '{print $1}')
curl -X POST http://${SERVER_IP}:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Should return:
```json
{"success":true,"token":"...","username":"admin"}
```

## Files Modified

- `complete-install.sh` - Added database schema, admin user creation, frontend .env configuration

## Git Commit

```
commit b031017
Add admin database schema, bcrypt hash generation, and frontend .env configuration
```
