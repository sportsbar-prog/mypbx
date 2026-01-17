#!/bin/bash
# Monitor installation progress

echo "Checking installation status..."
echo ""

# Check if make is running
if pgrep -f "make -j" > /dev/null; then
    echo "✓ Asterisk is being compiled..."
    ps aux | grep -E "make|asterisk" | grep -v grep
    echo ""
    echo "Monitoring compilation..."
    echo "Press Ctrl+C to stop monitoring"
    echo ""
    # Show build progress
    while pgrep -f "make -j" > /dev/null; do
        ps aux | grep -E "make|gcc" | grep -v grep | wc -l
        sleep 5
    done
    echo "✓ Compilation finished"
    echo ""
fi

# Check if installation is complete
if [ -f "/opt/asterisk/sbin/asterisk" ]; then
    echo "✓ Asterisk binary found at /opt/asterisk/sbin/asterisk"
    /opt/asterisk/sbin/asterisk -V
elif command -v asterisk &> /dev/null; then
    echo "✓ Asterisk installed from system packages"
    asterisk -V
else
    echo "! Asterisk installation in progress or not yet started"
fi

echo ""
echo "Current backend/frontend status:"
ps aux | grep -E "node|npm" | grep -v grep || echo "Not yet started"

echo ""
echo "Run 'tail -f /tmp/asterisk-build-*/asterisk-20*/config.log' to see compile logs"
echo "Or wait for the script to complete..."
