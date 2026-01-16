# Asterisk ARI GUI - Complete Telephony Management System

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Version](https://img.shields.io/badge/Version-2.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

A production-ready web-based management system for Asterisk VoIP PBX using the Asterisk REST Interface (ARI). Complete Node.js backend, React frontend, and PostgreSQL database with one-click deployment.

## 🎯 Features

### Core Capabilities
- ✅ **Web-Based Admin Dashboard** - Manage Asterisk from any browser
- ✅ **Real-Time Call Monitoring** - See active calls and channels live
- ✅ **Call Control** - Answer, hold, mute, transfer, disconnect calls
- ✅ **Conference Management** - Create and manage bridge conferences
- ✅ **SIP Endpoint Management** - Monitor and configure SIP endpoints
- ✅ **Call History & Analytics** - Track all calls and usage
- ✅ **Admin Authentication** - Secure JWT-based access
- ✅ **API Rate Limiting** - Protect against abuse
- ✅ **19+ REST API Endpoints** - Programmatic access
- ✅ **Credit System** - API key-based access management

## ⚡ Quick Start

### Production Deploy (One Command)
```bash
sudo bash INSTALL_PRODUCTION.sh
```

### WSL/Linux Development
```bash
# Setup environment (WSL or Ubuntu)
bash scripts/install.sh

# Terminal 1: Backend
cd backend-node && npm start

# Terminal 2: Frontend (new terminal)
cd frontend && npm run dev
```

**Access:** http://localhost:3000 | **Credentials:** admin / admin123

## 📊 Architecture

```
React Frontend (5173)
        ↓
Express.js Backend (3000)
        ↓
    ├─ Asterisk ARI (8088)
    └─ PostgreSQL (5432)
```

## 🔧 Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React | 18.x |
| Build | Vite | 5.4.21 |
| Backend | Express.js | 4.18.2 |
| Runtime | Node.js | 18+ |
| Database | PostgreSQL | 16 |
| VoIP | Asterisk | 20.17.0 |
| VoIP API | ARI | 7.x |

## 📚 Project Structure
```
asterisk-ari-gui/
├── backend-node/              # Node.js Express API
│   ├── server.js             # Main server (629 lines)
│   ├── database-schema.sql   # PostgreSQL schema
│   ├── .env                  # Configuration
│   └── public/index.html     # Admin dashboard
├── frontend/                  # React web app
│   ├── src/                  # React components
│   └── vite.config.js        # Build config
├── scripts/
│   ├── install.sh            # WSL setup
│   └── test_all_endpoints.sh # API tests
├── INSTALL_PRODUCTION.sh      # One-click production installer
├── API_DOCUMENTATION.md       # 19 endpoints documented
├── DEPLOYMENT_GUIDE.md        # Operations guide
├── DEVELOPMENT_SETUP.md       # Dev environment
└── FINAL_RELEASE_SUMMARY.md  # Release info
```

## 🌐 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | System health |
| `/api/admin/login` | POST | Authentication |
| `/api/channels` | GET | List active channels |
| `/api/channels/{id}/answer` | POST | Answer call |
| `/api/channels/{id}/mute` | POST | Mute audio |
| `/api/channels/{id}/hold` | POST | Hold call |
| `/api/channels/{id}` | DELETE | Hangup call |
| `/api/bridges` | GET | List conferences |
| `/api/bridges/create` | POST | Create conference |
| `+9 more endpoints` | - | Bridge, endpoint, call management |

**Full documentation:** [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

## 🔐 Security

- JWT token authentication
- bcryptjs password hashing
- Rate limiting (100 req/15min)
- CORS protection
- Helmet.js security headers
- SQL injection prevention
- Session tracking
- Admin activity logging

## 📖 Documentation

| Document | Content |
|----------|---------|
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | 19 REST endpoints with examples |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Production deployment & troubleshooting |
| [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md) | Development environment setup |
| [FINAL_RELEASE_SUMMARY.md](FINAL_RELEASE_SUMMARY.md) | Complete release information |

## 🚀 Deployment

### Prerequisites
- Ubuntu 22.04+ (or WSL2)
- 2GB RAM
- 10GB disk space
- root/sudo access

### Installation
```bash
cd /opt
git clone https://github.com/your-repo/asterisk-ari-gui.git
cd asterisk-ari-gui
sudo bash INSTALL_PRODUCTION.sh
```

**Time:** 25-35 minutes  
**Access:** http://your-server

### Configuration

Edit backend environment variables:
```bash
nano /opt/asterisk-ari-gui/backend-node/.env
```

Key variables:
- `JWT_SECRET` - Change to random string
- `DATABASE_URL` - Database connection
- `ARI_HOST`, `ARI_PORT` - Asterisk location

## 🔑 Default Credentials

```
Admin:
  Username: admin
  Password: admin123

Asterisk ARI:
  User: ariuser
  Password: aripassword

Database:
  User: ari_user
  Password: change_me
```

⚠️ **Change all passwords in production!**

## 🛠️ Service Management

```bash
# Check status
sudo systemctl status asterisk
sudo systemctl status asterisk-gui-backend
sudo systemctl status postgresql

# View logs
sudo journalctl -u asterisk-gui-backend -f
sudo tail -f /var/log/asterisk/full
```

## 🧪 Testing

### Test All Endpoints
```bash
bash scripts/test_all_endpoints.sh
```

### Manual API Test
```bash
# Login
TOKEN=$(curl -X POST http://localhost:3000/api/admin/login \
  -d '{"username":"admin","password":"admin123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Get channels
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/channels
```

## 🐛 Troubleshooting

### Backend Won't Start
```bash
# Check Node.js
node --version

# Check dependencies
npm ls

# Check logs
journalctl -u asterisk-gui-backend -n 50
```

### Database Connection Error
```bash
# Test connectivity
psql -h localhost -U ari_user -d ari_api

# Check status
sudo systemctl status postgresql
```

### Asterisk Not Connected
```bash
# Check module
sudo asterisk -rx "module show like ari"

# Reload
sudo asterisk -rx "core reload"
```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#troubleshooting) for detailed solutions.

## 📈 Monitoring

```bash
# Health check
curl http://localhost/api/health

# Active calls
sudo asterisk -rx "core show calls"

# Database size
sudo -u postgres psql -d ari_api -c \
  "SELECT pg_size_pretty(pg_database_size('ari_api'));"
```

## 🎓 Learning Resources

- [Asterisk Documentation](https://docs.asterisk.org/)
- [ARI Reference](https://wiki.asterisk.org/wiki/display/AST/Asterisk+REST+Interface)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Express.js Guide](https://expressjs.com/)

## API Auth
- Admin login: POST /api/admin/login
- API keys: Bearer sk_xxx on /api/* (originate, etc.)

## Default Creds
- Admin: admin / admin123
- ARI user: ariuser / aripassword (config/asterisk/ari.conf)

## Notes
- Python and C++ components were removed; ignore old instructions referencing backend/ or cpp/.
- Frontend expects backend at http://localhost:3000/api; adjust VITE_API_URL if needed.

## License
MIT