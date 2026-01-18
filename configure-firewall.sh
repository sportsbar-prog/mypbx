#!/bin/bash

# ============================================
# Port Configuration and Firewall Setup
# ============================================

echo "🔧 Configuring firewall rules for Asterisk PBX..."

# ============================================
# Required Ports
# ============================================

# Web Interface
sudo ufw allow 5173/tcp comment 'Asterisk GUI Frontend'
sudo ufw allow 3000/tcp comment 'Asterisk API Backend'

# Asterisk ARI
sudo ufw allow 8088/tcp comment 'Asterisk ARI HTTP'

# SIP Signaling
sudo ufw allow 5060/tcp comment 'SIP TCP'
sudo ufw allow 5060/udp comment 'SIP UDP'
sudo ufw allow 5061/tcp comment 'SIP TLS'

# WebRTC
sudo ufw allow 8089/tcp comment 'WebRTC WSS'

# RTP Media (adjust range as needed)
sudo ufw allow 10000:20000/udp comment 'RTP Media'

# Optional: IAX2 (if used)
# sudo ufw allow 4569/udp comment 'IAX2'

# ============================================
# Enable Firewall
# ============================================

sudo ufw --force enable
sudo ufw status verbose

echo "✅ Firewall configured successfully!"
echo ""
echo "Allowed ports:"
echo "  - 5173 (Frontend)"
echo "  - 3000 (Backend API)"
echo "  - 8088 (Asterisk ARI)"
echo "  - 5060 (SIP)"
echo "  - 5061 (SIP TLS)"
echo "  - 8089 (WebRTC)"
echo "  - 10000-20000 (RTP)"
