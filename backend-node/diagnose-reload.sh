#!/bin/bash

# Diagnostic script to test Asterisk reload functionality

echo "=================================================="
echo "ASTERISK RELOAD DIAGNOSTICS"
echo "=================================================="
echo ""

# Check if Asterisk is running
echo "1️⃣  Check if Asterisk is running:"
ps aux | grep asterisk | grep -v grep
echo ""

# Check Asterisk version
echo "2️⃣  Asterisk version:"
asterisk -rx "core show version"
echo ""

# Check Asterisk uptime
echo "3️⃣  Asterisk uptime:"
asterisk -rx "core show uptime"
echo ""

# Test management interface
echo "4️⃣  Test management interface connection:"
echo "core show version" | nc localhost 5038
echo ""

# Show current PJSIP endpoints before reload
echo "5️⃣  PJSIP endpoints (before reload):"
asterisk -rx "pjsip show endpoints" | head -20
echo ""

# Test PJSIP reload
echo "6️⃣  Executing PJSIP reload:"
asterisk -rx "pjsip reload"
echo ""

# Show current PJSIP endpoints after reload
echo "7️⃣  PJSIP endpoints (after reload):"
asterisk -rx "pjsip show endpoints" | head -20
echo ""

# Test module reload
echo "8️⃣  Executing module reload:"
asterisk -rx "module reload"
echo ""

# Test core reload
echo "9️⃣  Executing core reload:"
asterisk -rx "core reload"
echo ""

# Check pjsip.conf file
echo "🔟 Check pjsip.conf file size and modification time:"
ls -lh /etc/asterisk/pjsip.conf
echo ""

# Show first 50 lines of pjsip.conf
echo "1️⃣1️⃣  First 50 lines of pjsip.conf:"
head -50 /etc/asterisk/pjsip.conf
echo ""

# Check for errors in Asterisk logs
echo "1️⃣2️⃣  Recent Asterisk errors/warnings:"
tail -30 /var/log/asterisk/messages | grep -E "ERROR|WARNING|reload"
echo ""

echo "=================================================="
echo "✅ DIAGNOSTICS COMPLETED"
echo "=================================================="
