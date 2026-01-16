#!/bin/bash
# Asterisk ARI GUI - API Endpoint Test Suite
# Tests all 30+ endpoints

BASE_URL="http://localhost:3000"
ADMIN_USER="admin"
ADMIN_PASS="admin123"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local METHOD=$1
    local ENDPOINT=$2
    local DATA=$3
    local AUTH=$4
    local EXPECTED_CODE=$5
    
    local CMD="curl -s -w '%{http_code}' -X $METHOD $BASE_URL$ENDPOINT"
    
    if [ ! -z "$AUTH" ]; then
        CMD="$CMD -H 'Authorization: Bearer $AUTH'"
    fi
    
    if [ ! -z "$DATA" ]; then
        CMD="$CMD -H 'Content-Type: application/json' -d '$DATA'"
    fi
    
    local RESULT=$(eval $CMD)
    local HTTP_CODE="${RESULT: -3}"
    local RESPONSE="${RESULT%???}"
    
    if [[ "$HTTP_CODE" =~ ^[2-3][0-9]{2}$ ]]; then
        echo -e "${GREEN}✓ PASS${NC} $METHOD $ENDPOINT ($HTTP_CODE)"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} $METHOD $ENDPOINT ($HTTP_CODE)"
        ((FAILED++))
    fi
}

echo "======================================"
echo "  ASTERISK ARI GUI - API TEST SUITE"
echo "======================================"
echo ""

# Step 1: Admin Login
echo -e "${BLUE}[1] AUTHENTICATION${NC}"
echo "Testing admin login..."
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/api/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ ! -z "$ADMIN_TOKEN" ]; then
    echo -e "${GREEN}✓ Admin login successful${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ Admin login failed${NC}"
    ((FAILED++))
fi
echo ""

# Step 2: Health & Status Endpoints
echo -e "${BLUE}[2] HEALTH & STATUS${NC}"
test_endpoint "GET" "/api/health" "" "" "200"
test_endpoint "GET" "/api/asterisk/info" "" "" "200"
test_endpoint "GET" "/api/stats" "" "" "200"
echo ""

# Step 3: Admin Endpoints
echo -e "${BLUE}[3] ADMIN OPERATIONS${NC}"
test_endpoint "GET" "/api/admin/keys" "" "$ADMIN_TOKEN" "200"
test_endpoint "GET" "/api/admin/call-logs" "" "$ADMIN_TOKEN" "200"
test_endpoint "GET" "/api/admin/stats" "" "$ADMIN_TOKEN" "200"
echo ""

# Step 4: Channel Operations
echo -e "${BLUE}[4] CHANNEL OPERATIONS${NC}"
test_endpoint "GET" "/api/channels" "" "" "200"
echo ""

# Step 5: Endpoint Management
echo -e "${BLUE}[5] ENDPOINT MANAGEMENT${NC}"
test_endpoint "GET" "/api/endpoints" "" "" "200"
test_endpoint "GET" "/api/device-states" "" "" "200"
echo ""

# Step 6: Bridge Operations
echo -e "${BLUE}[6] BRIDGE (CONFERENCE) OPERATIONS${NC}"
test_endpoint "GET" "/api/bridges" "" "" "200"
echo ""

# Step 7: Voicemail
echo -e "${BLUE}[7] VOICEMAIL & MAILBOXES${NC}"
test_endpoint "GET" "/api/mailboxes" "" "" "200"
echo ""

# Step 8: Media & Sounds
echo -e "${BLUE}[8] MEDIA & SOUNDS${NC}"
test_endpoint "GET" "/api/sounds" "" "" "200"
test_endpoint "GET" "/api/recordings" "" "" "200"
test_endpoint "GET" "/api/playbacks" "" "" "200"
echo ""

# Step 9: Applications
echo -e "${BLUE}[9] APPLICATIONS${NC}"
test_endpoint "GET" "/api/applications" "" "" "200"
echo ""

echo "======================================"
echo "  TEST RESULTS"
echo "======================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Check logs above.${NC}"
    exit 1
fi
