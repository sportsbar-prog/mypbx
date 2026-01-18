# Asterisk PBX System - Port Reference

## Required Ports

### Web Interface
| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 5173 | TCP | Frontend | React web interface |
| 3000 | TCP | Backend | Node.js API server |

### Asterisk Services
| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 8088 | TCP | ARI | Asterisk REST Interface (HTTP) |
| 8089 | TCP | WebRTC | WebSocket Secure for WebRTC |

### SIP Signaling
| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 5060 | UDP/TCP | SIP | Standard SIP signaling |
| 5061 | TCP | SIP-TLS | Encrypted SIP signaling |

### Media (RTP)
| Port Range | Protocol | Service | Description |
|------------|----------|---------|-------------|
| 10000-20000 | UDP | RTP | Real-time media streams |

### Optional
| Port | Protocol | Service | Description |
|------|----------|---------|-------------|
| 4569 | UDP | IAX2 | Inter-Asterisk Exchange (if used) |
| 5432 | TCP | PostgreSQL | Database (localhost only) |

## Firewall Configuration

### Ubuntu/Debian (UFW)
```bash
chmod +x configure-firewall.sh
sudo ./configure-firewall.sh
```

### Manual UFW Commands
```bash
sudo ufw allow 5173/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8088/tcp
sudo ufw allow 8089/tcp
sudo ufw allow 5060/tcp
sudo ufw allow 5060/udp
sudo ufw allow 5061/tcp
sudo ufw allow 10000:20000/udp
sudo ufw enable
```

### CentOS/RHEL (firewalld)
```bash
firewall-cmd --permanent --add-port=5173/tcp
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --permanent --add-port=8088/tcp
firewall-cmd --permanent --add-port=8089/tcp
firewall-cmd --permanent --add-port=5060/tcp
firewall-cmd --permanent --add-port=5060/udp
firewall-cmd --permanent --add-port=5061/tcp
firewall-cmd --permanent --add-port=10000-20000/udp
firewall-cmd --reload
```

### Cloud Provider Security Groups

#### AWS EC2
Add inbound rules for:
- Custom TCP: 3000, 5173, 8088, 8089, 5060, 5061
- Custom UDP: 5060, 10000-20000

#### Google Cloud
```bash
gcloud compute firewall-rules create asterisk-web \
  --allow tcp:3000,tcp:5173,tcp:8088,tcp:8089,tcp:5060,tcp:5061,udp:5060,udp:10000-20000
```

#### Azure
```bash
az network nsg rule create \
  --resource-group myResourceGroup \
  --nsg-name myNSG \
  --name asterisk-ports \
  --priority 100 \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --destination-port-ranges 3000 5173 8088 8089 5060 5061
```

## NAT/Router Port Forwarding

If behind NAT, forward these ports to your Asterisk server:

**Required:**
- 5173 → Internal IP (Frontend)
- 3000 → Internal IP (Backend)  
- 5060 UDP → Internal IP (SIP)
- 10000-20000 UDP → Internal IP (RTP)

**Optional:**
- 8088 → Internal IP (ARI - if remote access needed)
- 5061 → Internal IP (SIP TLS)
- 8089 → Internal IP (WebRTC)

## Environment Variables

Update `backend-node/.env`:

```bash
# If behind NAT, set your public IP
EXTERNAL_IP=YOUR_PUBLIC_IP
LOCAL_NET=192.168.1.0/24
```

## Testing Ports

```bash
# Check if ports are listening
sudo netstat -tulpn | grep -E '3000|5173|8088|5060'

# Test from remote machine
telnet YOUR_SERVER_IP 3000
telnet YOUR_SERVER_IP 5173
telnet YOUR_SERVER_IP 8088
nc -u YOUR_SERVER_IP 5060
```

## Security Best Practices

1. **Restrict Admin Ports** - Only allow 3000/5173 from trusted IPs
2. **Use HTTPS** - Deploy nginx reverse proxy with SSL
3. **Strong Passwords** - Change default admin/ARI passwords
4. **Fail2Ban** - Install fail2ban to block brute force
5. **Regular Updates** - Keep Asterisk and dependencies updated
