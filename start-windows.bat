@echo off
chcp 65001 >nul
echo 🚀 NexusAI Startup for Windows
echo ================================

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Please install from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Docker not found. Will start in manual mode.
    goto MANUAL_MODE
)

REM Docker mode
echo ✅ Docker found. Starting with docker-compose...
if not exist backend\.env (
    echo ⚠️  Creating backend\.env from example...
    copy backend\.env.example backend\.env
    echo ❗ IMPORTANT: Edit backend\.env and set JWT_SECRET, JWT_REFRESH_SECRET
)
if not exist frontend\.env (
    echo ⚠️  Creating frontend\.env from example...
    copy frontend\.env.example frontend\.env
)
docker-compose up --build
pause
exit /b 0

:MANUAL_MODE
echo 📦 Starting in manual development mode...

REM Backend
echo.
echo 📦 Installing backend dependencies...
cd backend
call npm install
if errorlevel 1 (
    echo ❌ Backend npm install failed
    pause
    exit /b 1
)

echo 🔧 Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo ❌ Prisma generate failed
    pause
    exit /b 1
)

echo 🚀 Starting backend (port 5000)...
start "NexusAI Backend" cmd /k "npm run dev"
cd ..

REM Frontend
echo.
echo 📦 Installing frontend dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo ❌ Frontend npm install failed
    pause
    exit /b 1
)

echo 🚀 Starting frontend (port 5173)...
start "NexusAI Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ✅ Services started!
echo    Frontend: http://localhost:5173
echo    Backend: http://localhost:5000
echo.
pause
