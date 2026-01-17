#!/bin/bash
set -e

echo "=========================================="
echo "Node.js Upgrade Script for Ubuntu"
echo "=========================================="
echo ""

# Check current Node.js version
echo "Current Node.js version:"
node --version || echo "Node.js not installed"
echo ""

# Install Node.js 18.x LTS
echo "→ Installing Node.js 18.x LTS..."
echo ""

# Remove old Node.js repository if exists
sudo rm -f /etc/apt/sources.list.d/nodesource.list

# Download and run NodeSource setup script for Node.js 18.x
echo "→ Adding NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

echo ""
echo "→ Installing Node.js..."
sudo apt-get install -y nodejs

echo ""
echo "→ Verifying installation..."
node --version
npm --version

echo ""
echo "✓ Node.js upgrade complete!"
echo "=========================================="
