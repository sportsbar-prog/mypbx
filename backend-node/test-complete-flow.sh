#!/bin/bash

# Complete API testing flow with login first

API_URL="http://localhost:3000/api"
ADMIN_USER="admin"
ADMIN_PASS="admin123"

echo "======================================"
echo "ASTERISK PBX API - COMPLETE TEST FLOW"
echo "======================================"
echo ""

# Step 1: Login and get JWT token
echo "1️⃣  STEP 1: Admin Login (Get JWT Token)"
echo "Request: POST $API_URL/admin/login"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

echo "Response: $LOGIN_RESPONSE"
echo ""

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token. Response was: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Got Token: ${TOKEN:0:20}..."
echo ""

# Now use this token for all subsequent requests
HEADERS="-H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json'"

# Step 2: Get Asterisk Status
echo "2️⃣  STEP 2: Get Asterisk Status"
echo "Request: GET $API_URL/asterisk/status"
STATUS=$(curl -s -X GET "$API_URL/asterisk/status" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $STATUS"
echo ""

# Step 3: Get Channels
echo "3️⃣  STEP 3: Get Active Channels"
echo "Request: GET $API_URL/channels"
CHANNELS=$(curl -s -X GET "$API_URL/channels" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $CHANNELS"
echo ""

# Step 4: Get Endpoints
echo "4️⃣  STEP 4: Get PJSIP Endpoints"
echo "Request: GET $API_URL/endpoints"
ENDPOINTS=$(curl -s -X GET "$API_URL/endpoints" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $ENDPOINTS"
echo ""

# Step 5: Get Dashboard
echo "5️⃣  STEP 5: Get Dashboard Stats"
echo "Request: GET $API_URL/dashboard"
DASHBOARD=$(curl -s -X GET "$API_URL/dashboard" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $DASHBOARD"
echo ""

# Step 6: Get Call Logs
echo "6️⃣  STEP 6: Get Call Logs"
echo "Request: GET $API_URL/call-logs"
LOGS=$(curl -s -X GET "$API_URL/call-logs" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $LOGS"
echo ""

# Step 7: Test CLI Command (safe read-only command)
echo "7️⃣  STEP 7: Execute Asterisk CLI Command"
echo "Request: POST $API_URL/asterisk/cli (core show version)"
CLI=$(curl -s -X POST "$API_URL/asterisk/cli" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"core show version"}')
echo "Response: $CLI"
echo ""

# Step 8: Test Reload (core reload)
echo "8️⃣  STEP 8: Reload Asterisk Configuration"
echo "Request: POST $API_URL/asterisk/reload (all)"
RELOAD=$(curl -s -X POST "$API_URL/asterisk/reload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"module":"all"}')
echo "Response: $RELOAD"
echo ""

# Step 9: Test PJSIP Reload Specifically
echo "9️⃣  STEP 9: Reload PJSIP Module"
echo "Request: POST $API_URL/asterisk/reload (pjsip)"
PJSIP_RELOAD=$(curl -s -X POST "$API_URL/asterisk/reload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"module":"pjsip"}')
echo "Response: $PJSIP_RELOAD"
echo ""

# Step 10: Get SIP Trunks
echo "🔟 STEP 10: Get SIP Trunks"
echo "Request: GET $API_URL/trunks"
TRUNKS=$(curl -s -X GET "$API_URL/trunks" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $TRUNKS"
echo ""

echo "======================================"
echo "✅ ALL TESTS COMPLETED"
echo "======================================"
