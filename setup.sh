#!/bin/bash
# Asterisk GUI - Complete Automated Setup Script
# This script sets up PostgreSQL, creates the database, and starts both servers

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend-node"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SUDO_PASS="khanki1Magi"

echo "╔════════════════════════════════════════════════════════╗"
echo "║   Asterisk GUI - Complete Automated Setup             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}→${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

# Step 1: Check if running in WSL
print_step "Checking environment..."
if ! grep -qi "microsoft" /proc/version; then
    print_warning "Not running in WSL. Some features may not work."
fi
print_success "Environment check passed"
echo ""

# Step 2: Start PostgreSQL
print_step "Starting PostgreSQL service..."
echo "$SUDO_PASS" | sudo -S service postgresql start > /dev/null 2>&1 || true
sleep 2
if sudo service postgresql status | grep -q "active"; then
    print_success "PostgreSQL started"
else
    print_error "Failed to start PostgreSQL"
    exit 1
fi
echo ""

# Step 3: Create/Reset Database and User
print_step "Setting up database..."

# Create database if not exists
echo "$SUDO_PASS" | sudo -S -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'ari_api'" | grep -q 1 || \
    echo "$SUDO_PASS" | sudo -S -u postgres psql -c "CREATE DATABASE ari_api;" 2>/dev/null || true

# Create/Reset user
echo "$SUDO_PASS" | sudo -S -u postgres psql -c "DROP USER IF EXISTS ari_user;" 2>/dev/null || true
echo "$SUDO_PASS" | sudo -S -u postgres psql -c "CREATE USER ari_user WITH PASSWORD 'change_me';" 2>/dev/null || true

# Grant privileges
echo "$SUDO_PASS" | sudo -S -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ari_api TO ari_user;" 2>/dev/null || true
echo "$SUDO_PASS" | sudo -S -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;" 2>/dev/null || true
echo "$SUDO_PASS" | sudo -S -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ari_user;" 2>/dev/null || true

print_success "Database configured"
echo ""

# Step 4: Setup database schema
print_step "Creating database tables..."
if [ -f "$BACKEND_DIR/database-schema.sql" ]; then
    echo "$SUDO_PASS" | sudo -S -u postgres psql -d ari_api -f "$BACKEND_DIR/database-schema.sql" > /dev/null 2>&1 || true
    print_success "Database tables created"
else
    print_warning "database-schema.sql not found, skipping schema creation"
fi
echo ""

# Step 5: Install backend dependencies
print_step "Installing backend dependencies..."
cd "$BACKEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install > /dev/null 2>&1
    print_success "Backend dependencies installed"
else
    print_success "Backend dependencies already installed"
fi
echo ""

# Step 6: Install frontend dependencies
print_step "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install > /dev/null 2>&1
    print_success "Frontend dependencies installed"
else
    print_success "Frontend dependencies already installed"
fi
echo ""

# Step 7: Start backend server
print_step "Starting backend server..."
cd "$BACKEND_DIR"
nohup node server.js > backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if ps -p $BACKEND_PID > /dev/null; then
    print_success "Backend server started (PID: $BACKEND_PID)"
else
    print_error "Failed to start backend server"
    cat backend.log | tail -20
    exit 1
fi
echo ""

# Step 8: Start frontend server
print_step "Starting frontend server..."
cd "$FRONTEND_DIR"
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 5

if ps -p $FRONTEND_PID > /dev/null; then
    print_success "Frontend server started (PID: $FRONTEND_PID)"
else
    print_error "Failed to start frontend server"
    cat frontend.log | tail -20
    exit 1
fi
echo ""

# Step 9: Verify services
print_step "Verifying services..."
sleep 2

# Check backend
if curl -s http://localhost:3000/api/channels > /dev/null 2>&1; then
    print_success "Backend API responding"
else
    print_warning "Backend API not responding yet (may take a moment)"
fi

# Check frontend
if curl -s http://localhost:5173/ > /dev/null 2>&1 || curl -s http://localhost:5175/ > /dev/null 2>&1; then
    print_success "Frontend server responding"
else
    print_warning "Frontend server not responding yet"
fi
echo ""

# Step 10: Display summary
echo "╔════════════════════════════════════════════════════════╗"
echo "║              Setup Complete!                          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Access Information:"
echo "────────────────────────────────────────────────────────"
echo -e "${GREEN}Frontend:${NC} http://localhost:5173 or http://localhost:5175"
echo -e "${GREEN}Backend:${NC}  http://localhost:3000"
echo -e "${GREEN}Login:${NC}    admin / admin123"
echo ""
echo "Processes Running:"
echo "────────────────────────────────────────────────────────"
echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Log Files:"
echo "────────────────────────────────────────────────────────"
echo "Backend:  $BACKEND_DIR/backend.log"
echo "Frontend: $FRONTEND_DIR/frontend.log"
echo ""
echo "To stop servers:"
echo "  kill $BACKEND_PID  # Stop backend"
echo "  kill $FRONTEND_PID # Stop frontend"
echo ""
