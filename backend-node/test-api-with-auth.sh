#!/bin/bash

# Manual API Testing Guide with Commands
# Run each step one at a time to see detailed responses

API_URL="http://localhost:3000/api"

echo "=================================================="
echo "ASTERISK PBX API - MANUAL TESTING GUIDE"
echo "=================================================="
echo ""
echo "Step 1: LOGIN AND GET TOKEN"
echo "Command:"
echo "TOKEN=\$(curl -s -X POST $API_URL/admin/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"username\":\"admin\",\"password\":\"admin123\"}' | grep -o '\"token\":\"[^\"]*' | cut -d'\"' -f4)"
echo "echo \$TOKEN"
echo ""
echo "Run this first, then save the token and use in commands below:"
echo "=================================================="
echo ""

# Step 1 - Get Token
echo "Getting token..."
TOKEN_RESPONSE=$(curl -s -X POST "$API_URL/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token!"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Token acquired: ${TOKEN:0:30}..."
echo ""

# Now show all test commands with the token
echo "Step 2: TEST ENDPOINTS (using token)"
echo ""

echo "TEST 1: Asterisk Status"
echo "curl -s -X GET $API_URL/asterisk/status \\"
echo "  -H 'Authorization: Bearer $TOKEN'"
curl -s -X GET "$API_URL/asterisk/status" \
  -H "Authorization: Bearer $TOKEN" | jq '.' 2>/dev/null || curl -s -X GET "$API_URL/asterisk/status" -H "Authorization: Bearer $TOKEN"
echo ""
echo "=================================================="
echo ""

echo "TEST 2: Get Channels"
echo "curl -s -X GET $API_URL/channels \\"
echo "  -H 'Authorization: Bearer $TOKEN'"
curl -s -X GET "$API_URL/channels" \
  -H "Authorization: Bearer $TOKEN" | jq '.' 2>/dev/null || curl -s -X GET "$API_URL/channels" -H "Authorization: Bearer $TOKEN"
echo ""
echo "=================================================="
echo ""

echo "TEST 3: Get Endpoints"
echo "curl -s -X GET $API_URL/endpoints \\"
echo "  -H 'Authorization: Bearer $TOKEN'"
curl -s -X GET "$API_URL/endpoints" \
  -H "Authorization: Bearer $TOKEN" | jq '.' 2>/dev/null || curl -s -X GET "$API_URL/endpoints" -H "Authorization: Bearer $TOKEN"
echo ""
echo "=================================================="
echo ""

echo "TEST 4: Get Dashboard"
echo "curl -s -X GET $API_URL/dashboard \\"
echo "  -H 'Authorization: Bearer $TOKEN'"
curl -s -X GET "$API_URL/dashboard" \
  -H "Authorization: Bearer $TOKEN" | jq '.' 2>/dev/null || curl -s -X GET "$API_URL/dashboard" -H "Authorization: Bearer $TOKEN"
echo ""
echo "=================================================="
echo ""

echo "TEST 5: Get Call Logs"
echo "curl -s -X GET $API_URL/call-logs \\"
echo "  -H 'Authorization: Bearer $TOKEN'"
curl -s -X GET "$API_URL/call-logs" \
  -H "Authorization: Bearer $TOKEN" | jq '.' 2>/dev/null || curl -s -X GET "$API_URL/call-logs" -H "Authorization: Bearer $TOKEN"
echo ""
echo "=================================================="
echo ""

echo "TEST 6: CLI Command - Core Version"
echo "curl -s -X POST $API_URL/asterisk/cli \\"
echo "  -H 'Authorization: Bearer $TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"command\":\"core show version\"}'"
curl -s -X POST "$API_URL/asterisk/cli" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"core show version"}' | jq '.' 2>/dev/null || curl -s -X POST "$API_URL/asterisk/cli" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"command":"core show version"}'
echo ""
echo "=================================================="
echo ""

echo "TEST 7: CLI Command - Show Channels"
echo "curl -s -X POST $API_URL/asterisk/cli \\"
echo "  -H 'Authorization: Bearer $TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"command\":\"core show channels\"}'"
curl -s -X POST "$API_URL/asterisk/cli" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"core show channels"}' | jq '.' 2>/dev/null || curl -s -X POST "$API_URL/asterisk/cli" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"command":"core show channels"}'
echo ""
echo "=================================================="
echo ""

echo "TEST 8: PJSIP Reload"
echo "curl -s -X POST $API_URL/asterisk/reload \\"
echo "  -H 'Authorization: Bearer $TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"module\":\"pjsip\"}'"
curl -s -X POST "$API_URL/asterisk/reload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"module":"pjsip"}' | jq '.' 2>/dev/null || curl -s -X POST "$API_URL/asterisk/reload" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"module":"pjsip"}'
echo ""
echo "=================================================="
echo ""

echo "TEST 9: Core Reload (All)"
echo "curl -s -X POST $API_URL/asterisk/reload \\"
echo "  -H 'Authorization: Bearer $TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"module\":\"all\"}'"
curl -s -X POST "$API_URL/asterisk/reload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"module":"all"}' | jq '.' 2>/dev/null || curl -s -X POST "$API_URL/asterisk/reload" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"module":"all"}'
echo ""
echo "=================================================="
echo ""

echo "TEST 10: Get SIP Trunks"
echo "curl -s -X GET $API_URL/trunks \\"
echo "  -H 'Authorization: Bearer $TOKEN'"
curl -s -X GET "$API_URL/trunks" \
  -H "Authorization: Bearer $TOKEN" | jq '.' 2>/dev/null || curl -s -X GET "$API_URL/trunks" -H "Authorization: Bearer $TOKEN"
echo ""
echo "=================================================="
echo ""

echo "✅ ALL TESTS COMPLETED"
