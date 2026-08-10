# NexusAI Startup Script for Windows PowerShell
Write-Host "🚀 NexusAI Startup for Windows" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check Docker
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
    $hasDocker = $true
} catch {
    Write-Host "⚠️  Docker not found. Will use manual mode." -ForegroundColor Yellow
    $hasDocker = $false
}

if ($hasDocker) {
    # Docker mode
    if (-not (Test-Path "backend\.env")) {
        Write-Host "⚠️  Creating backend\.env..." -ForegroundColor Yellow
        Copy-Item "backend\.env.example" "backend\.env"
        Write-Host "❗ IMPORTANT: Edit backend\.env and set JWT_SECRET!" -ForegroundColor Red
    }
    if (-not (Test-Path "frontend\.env")) {
        Write-Host "⚠️  Creating frontend\.env..." -ForegroundColor Yellow
        Copy-Item "frontend\.env.example" "frontend\.env"
    }

    Write-Host "🐳 Starting Docker Compose..." -ForegroundColor Cyan
    docker-compose up --build
} else {
    # Manual mode
    Write-Host "📦 Manual Development Mode" -ForegroundColor Cyan

    # Backend
    Write-Host "`n📦 Installing backend..." -ForegroundColor Cyan
    Set-Location backend
    npm install
    if ($LASTEXITCODE -ne 0) { throw "Backend npm install failed" }

    npx prisma generate
    if ($LASTEXITCODE -ne 0) { throw "Prisma generate failed" }

    Write-Host "🚀 Starting backend on port 5000..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev" -WindowStyle Normal
    Set-Location ..

    # Frontend
    Write-Host "`n📦 Installing frontend..." -ForegroundColor Cyan
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) { throw "Frontend npm install failed" }

    Write-Host "🚀 Starting frontend on port 5173..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev" -WindowStyle Normal
    Set-Location ..

    Write-Host "`n✅ All services started!" -ForegroundColor Green
    Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "   Backend: http://localhost:5000" -ForegroundColor Cyan
    Read-Host "`nPress Enter to exit"
}
