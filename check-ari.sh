#!/bin/bash

echo "=========================================="
echo "Asterisk ARI Configuration Checker"
echo "=========================================="
echo ""

# Check if Asterisk is running
echo "→ Checking Asterisk status..."
if ! pgrep -x "asterisk" > /dev/null; then
    echo "  ❌ Asterisk is not running!"
    echo "  Starting Asterisk..."
    sudo systemctl start asterisk
    sleep 2
fi
echo "  ✓ Asterisk is running"
echo ""

# Check HTTP configuration
echo "→ Checking HTTP configuration (/etc/asterisk/http.conf)..."
if grep -q "^enabled.*=.*yes" /etc/asterisk/http.conf 2>/dev/null; then
    echo "  ✓ HTTP is enabled"
else
    echo "  ❌ HTTP may not be enabled in http.conf"
fi

if grep -q "^bindaddr.*=.*0.0.0.0" /etc/asterisk/http.conf 2>/dev/null; then
    echo "  ✓ HTTP bound to 0.0.0.0"
else
    echo "  ⚠ HTTP may not be bound to 0.0.0.0"
fi

if grep -q "^bindport.*=.*8088" /etc/asterisk/http.conf 2>/dev/null; then
    echo "  ✓ HTTP port is 8088"
else
    echo "  ⚠ HTTP port may not be 8088"
fi
echo ""

# Check ARI configuration
echo "→ Checking ARI configuration (/etc/asterisk/ari.conf)..."
if grep -q "^enabled.*=.*yes" /etc/asterisk/ari.conf 2>/dev/null; then
    echo "  ✓ ARI is enabled"
else
    echo "  ❌ ARI may not be enabled in ari.conf"
fi

if grep -q "^\[ariuser\]" /etc/asterisk/ari.conf 2>/dev/null; then
    echo "  ✓ ARI user 'ariuser' exists"
else
    echo "  ❌ ARI user 'ariuser' not found"
fi
echo ""

# Test ARI endpoint
echo "→ Testing ARI endpoint..."
echo "  URL: http://localhost:8088/ari/api-docs/resources.json"
echo "  User: ariuser"
echo "  Pass: aripassword"
echo ""

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u ariuser:aripassword http://localhost:8088/ari/api-docs/resources.json)

if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ ARI authentication successful (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "401" ]; then
    echo "  ❌ ARI authentication failed (HTTP $HTTP_CODE - Unauthorized)"
    echo ""
    echo "  Fixing ARI configuration..."
    
    # Copy our ARI config to Asterisk
    if [ -f ~/mypbx/config/ari.conf ]; then
        sudo cp ~/mypbx/config/ari.conf /etc/asterisk/ari.conf
        echo "  ✓ Copied ari.conf"
    fi
    
    if [ -f ~/mypbx/config/http.conf ]; then
        sudo cp ~/mypbx/config/http.conf /etc/asterisk/http.conf
        echo "  ✓ Copied http.conf"
    fi
    
    echo "  Reloading Asterisk configuration..."
    sudo asterisk -rx "module reload res_http_websocket.so"
    sudo asterisk -rx "module reload res_ari.so"
    sudo asterisk -rx "http reload"
    
    sleep 2
    
    # Test again
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u ariuser:aripassword http://localhost:8088/ari/api-docs/resources.json)
    if [ "$HTTP_CODE" = "200" ]; then
        echo "  ✓ ARI authentication now working!"
    else
        echo "  ❌ Still failing (HTTP $HTTP_CODE)"
        echo ""
        echo "Manual fix required:"
        echo "  1. Edit /etc/asterisk/ari.conf"
        echo "  2. Edit /etc/asterisk/http.conf"
        echo "  3. Run: asterisk -rx 'core reload'"
    fi
else
    echo "  ❌ Unexpected response (HTTP $HTTP_CODE)"
fi

echo ""
echo "=========================================="
echo "Current Asterisk status:"
sudo asterisk -rx "core show version"
sudo asterisk -rx "http show status"
echo "=========================================="
