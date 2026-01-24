#!/bin/bash
# ============================================================================
# Cleanup Script - Remove Unwanted Files
# ============================================================================

echo "🧹 Cleaning up unwanted files..."

# Go to backend directory
cd backend-node

# Remove unwanted files that may have been created from failed commands
rm -f "2&1  head -20" 2>/dev/null
rm -f "ersBappaOneDriveDesktopAsteriskbackend-node ; node test-billing.js 2&1  Out-String" 2>/dev/null
rm -f "l bash" 2>/dev/null

# Remove old test files (optional - comment out if you want to keep them)
# rm -f test-*.sh test-*.js test_*.js

# Remove old log files
rm -f backend.log server.log 2>/dev/null

echo "✅ Cleanup complete!"
echo ""
echo "To perform additional cleanup, you can run:"
echo "  rm backend-node/test-*.sh      # Remove test shell scripts"
echo "  rm backend-node/test-*.js      # Remove test JS files"
echo "  rm backend-node/test_*.js      # Remove underscore test files"
