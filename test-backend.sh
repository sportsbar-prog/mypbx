#!/bin/bash

# Asterisk Backend API Test Script
# Tests various endpoints to verify the server is working correctly

set -e

# Configuration
SERVER_URL="${1:-http://localhost:3000}"
API_URL="$SERVER_URL/api"

echo "=========================================="
echo "Asterisk Backend API Test Suite"
echo "=========================================="
echo "Server: $SERVER_URL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0

test_endpoint() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_code="$5"
    local auth_token="$6"
    
    echo -n "Testing: $name... "
    
    local curl_cmd="curl -s -w '%{http_code}' -o /tmp/test_response.json -X $method"
    
    if [ -n "$auth_token" ]; then
        curl_cmd="$curl_cmd -H 'Authorization: Bearer $auth_token'"
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    curl_cmd="$curl_cmd '$API_URL$endpoint'"
    
    http_code=$(eval $curl_cmd)
    
    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_code, Got: $http_code)"
        cat /tmp/test_response.json 2>/dev/null | jq . 2>/dev/null || cat /tmp/test_response.json
        echo ""
        return 1
    fi
}

echo "→ Test 1: Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Health endpoint" "GET" "/health" "" "200"
echo ""

echo "→ Test 2: Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test with wrong credentials
test_endpoint "Login with wrong credentials" "POST" "/admin/login" '{"username":"wrong","password":"wrong"}' "401"

# Test with correct credentials (default: admin/admin123)
test_endpoint "Login with correct credentials" "POST" "/admin/login" '{"username":"admin","password":"admin123"}' "200"

# Extract token from successful login
if [ -f /tmp/test_response.json ]; then
    TOKEN=$(cat /tmp/test_response.json | jq -r '.token' 2>/dev/null)
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
        echo -e "${GREEN}✓ Token received: ${TOKEN:0:20}...${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Could not extract token from response${NC}"
    fi
fi
echo ""

echo "→ Test 3: Protected Endpoints (without auth)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Get stats without auth" "GET" "/stats" "" "401"
test_endpoint "Get API keys without auth" "GET" "/api-keys" "" "401"
echo ""

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo "→ Test 4: Protected Endpoints (with auth)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    test_endpoint "Get stats with auth" "GET" "/stats" "" "200" "$TOKEN"
    test_endpoint "Get API keys with auth" "GET" "/api-keys" "" "200" "$TOKEN"
    test_endpoint "Get trunks with auth" "GET" "/trunks" "" "200" "$TOKEN"
    test_endpoint "Get system settings with auth" "GET" "/system-settings" "" "200" "$TOKEN"
    echo ""
    
    echo "→ Test 5: API Key Management"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    test_endpoint "Create new API key" "POST" "/api-keys" '{"name":"Test Key","description":"Test API key","credits":10.00}' "201" "$TOKEN"
    
    # Extract API key ID from response
    if [ -f /tmp/test_response.json ]; then
        API_KEY=$(cat /tmp/test_response.json | jq -r '.apiKey' 2>/dev/null)
        if [ -n "$API_KEY" ] && [ "$API_KEY" != "null" ]; then
            echo -e "${GREEN}✓ API Key created: ${API_KEY:0:20}...${NC}"
        fi
    fi
    echo ""
fi

echo "→ Test 6: Asterisk Integration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Get channels" "GET" "/channels" "" "200" "$TOKEN"
test_endpoint "Get bridges" "GET" "/bridges" "" "200" "$TOKEN"
test_endpoint "Get endpoints" "GET" "/endpoints" "" "200" "$TOKEN"
echo ""

echo "→ Test 7: Call Management (without active calls)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Get active calls" "GET" "/calls" "" "200" "$TOKEN"
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
