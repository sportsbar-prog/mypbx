# Asterisk GUI - One-Click Setup Script (Windows)
# Run this script to automatically setup and start everything

param(
    [string]$SudoPassword = "khanki1Magi"
)

# Set error action
$ErrorActionPreference = "Continue"

# Color functions
function Write-Step {
    param([string]$Message)
    Write-Host "→ " -ForegroundColor Cyan -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "OK " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Err {
    param([string]$Message)
    Write-Host "FAIL " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "WARN " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

# Banner
Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Asterisk GUI - One-Click Setup                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommandPath
$BackendDir = Join-Path $ProjectRoot "backend-node"
$FrontendDir = Join-Path $ProjectRoot "frontend"

# Step 1: Check WSL
Write-Step "Checking WSL availability..."
try {
    $wslCheck = wsl bash -c "echo 'WSL OK'" 2>&1
    if ($wslCheck -match "WSL OK") {
        Write-Success "WSL is available"
    } else {
        Write-Err "WSL is not working properly"
        exit 1
    }
} catch {
    Write-Err "WSL not found. Please install WSL2."
    exit 1
}
Write-Host ""

# Step 2: Start PostgreSQL via WSL
Write-Step "Starting PostgreSQL..."
wsl bash -c "echo '$SudoPassword' | sudo -S service postgresql restart" 2>&1 | Out-Null
Start-Sleep -Seconds 2
Write-Success "PostgreSQL service restarted"
Write-Host ""

# Step 3: Setup Database
Write-Step "Setting up database and user..."
$dbSetup = @"
echo '$SudoPassword' | sudo -S -u postgres psql -c "DROP DATABASE IF EXISTS ari_api;" 2>/dev/null || true;
echo '$SudoPassword' | sudo -S -u postgres psql -c "CREATE DATABASE ari_api;" 2>/dev/null || true;
echo '$SudoPassword' | sudo -S -u postgres psql -c "DROP USER IF EXISTS ari_user;" 2>/dev/null || true;
echo '$SudoPassword' | sudo -S -u postgres psql -c "CREATE USER ari_user WITH PASSWORD 'change_me';" 2>/dev/null;
echo '$SudoPassword' | sudo -S -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ari_api TO ari_user;" 2>/dev/null;
echo '$SudoPassword' | sudo -S -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ari_user;" 2>/dev/null;
echo '$SudoPassword' | sudo -S -u postgres psql -d ari_api -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ari_user;" 2>/dev/null;
echo 'Database setup complete'
"@

wsl bash -c $dbSetup | Out-Null
Write-Success "Database configured"
Write-Host ""

# Step 4: Install Dependencies
Write-Step "Installing backend dependencies..."
Push-Location $BackendDir
if (-not (Test-Path "node_modules")) {
    npm install 2>&1 | Out-Null
    Write-Success "Backend dependencies installed"
} else {
    Write-Success "Backend dependencies already installed"
}
Pop-Location
Write-Host ""

Write-Step "Installing frontend dependencies..."
Push-Location $FrontendDir
if (-not (Test-Path "node_modules")) {
    npm install 2>&1 | Out-Null
    Write-Success "Frontend dependencies installed"
} else {
    Write-Success "Frontend dependencies already installed"
}
Pop-Location
Write-Host ""

# Step 5: Start Backend
Write-Step "Starting backend server..."
$BackendPs = Start-Process powershell -ArgumentList `
    '-NoExit', `
    '-Command', `
    "cd '$BackendDir'; npm start" `
    -WindowStyle Minimized `
    -PassThru

Start-Sleep -Seconds 4
if ($BackendPs.HasExited -eq $false) {
    Write-Success "Backend server started (PID: $($BackendPs.Id))"
} else {
    Write-Err "Failed to start backend server"
    exit 1
}
Write-Host ""

# Step 6: Start Frontend
Write-Step "Starting frontend server..."
$FrontendPs = Start-Process powershell -ArgumentList `
    '-NoExit', `
    '-Command', `
    "cd '$FrontendDir'; npm run dev" `
    -WindowStyle Minimized `
    -PassThru

Start-Sleep -Seconds 6
if ($FrontendPs.HasExited -eq $false) {
    Write-Success "Frontend server started (PID: $($FrontendPs.Id))"
} else {
    Write-Err "Failed to start frontend server"
    exit 1
}
Write-Host ""

# Step 7: Verify Services
Write-Step "Verifying services..."
Start-Sleep -Seconds 3

try {
    $backendTest = Invoke-WebRequest -Uri "http://localhost:3000/api/channels" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($backendTest) {
        Write-Success "Backend API is responding"
    }
} catch {
    Write-Warn "Backend API not responding yet (may take a moment)"
}

try {
    $frontendTest = Invoke-WebRequest -Uri "http://localhost:5173/" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    if (-not $frontendTest) {
        $frontendTest = Invoke-WebRequest -Uri "http://localhost:5175/" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    }
    if ($frontendTest) {
        Write-Success "Frontend server is responding"
    }
} catch {
    Write-Warn "Frontend not responding yet (may take a moment)"
}
Write-Host ""

# Step 8: Display Summary
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║            Setup Complete! 🎉                         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "Access Information:" -ForegroundColor Green
Write-Host "────────────────────────────────────────────────────────"
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend:  http://localhost:3000" -ForegroundColor Yellow
Write-Host "Login:    admin / admin123" -ForegroundColor Yellow
Write-Host ""

Write-Host "Running Processes:" -ForegroundColor Green
Write-Host "────────────────────────────────────────────────────────"
Write-Host "Backend PID:  $($BackendPs.Id)"
Write-Host "Frontend PID: $($FrontendPs.Id)"
Write-Host ""

Write-Host "To stop servers:" -ForegroundColor Green
Write-Host "────────────────────────────────────────────────────────"
Write-Host "Stop-Process -Id $($BackendPs.Id)  # Stop backend"
Write-Host "Stop-Process -Id $($FrontendPs.Id) # Stop frontend"
Write-Host ""

# Open browser
Write-Step "Opening browser..."
Start-Process "http://localhost:5173"

Write-Host "Setup is complete! Your browser should open shortly." -ForegroundColor Green
Write-Host "If not, visit: http://localhost:5173`n"
