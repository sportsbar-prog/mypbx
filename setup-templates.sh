#!/bin/bash

# Quick Start Script for SIP Template Implementation
# This script initializes the database and prepares the system

echo "=================================================="
echo "SIP Template Management - Quick Start"
echo "=================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "backend-node/package.json" ]; then
    echo "❌ Error: Please run this script from the Asterisk project root directory"
    exit 1
fi

cd backend-node

echo "📋 Step 1: Installing dependencies..."
npm install

echo ""
echo "🗄️  Step 2: Initializing database..."
node initialize-db.js

if [ $? -ne 0 ]; then
    echo "❌ Database initialization failed. Please check your DATABASE_URL in .env"
    exit 1
fi

echo ""
echo "🔄 Step 3: Migrating existing SIP users (if any)..."
node migrate-sip-users.js

echo ""
echo "✅ Setup Complete!"
echo ""
echo "=================================================="
echo "Next Steps:"
echo "=================================================="
echo "1. Start the backend server:"
echo "   cd backend-node && npm start"
echo ""
echo "2. Test the API:"
echo "   curl http://localhost:3000/api/providers"
echo ""
echo "3. Create a trunk:"
echo "   curl -X POST http://localhost:3000/api/trunks \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"trunk_name\":\"test\",\"provider\":\"telnyx\",\"username\":\"user\",\"password\":\"pass\",\"did\":\"+1555\"}'"
echo ""
echo "4. Create a SIP user:"
echo "   curl -X POST http://localhost:3000/api/asterisk/sip-users \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"username\":\"testuser\",\"secret\":\"pass123\",\"extension\":\"1001\",\"template_type\":\"basic_user\"}'"
echo ""
echo "📖 For full documentation, see TEMPLATE-IMPLEMENTATION.md"
echo "=================================================="
