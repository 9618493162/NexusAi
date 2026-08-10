# 🤖 NexusAI — Complete Project (Windows Ready)

## 🚀 Quick Start for Windows

### Option 1: PowerShell (Recommended)
```powershell
# Right-click the nexusai folder → "Open in Terminal"
.\start.ps1
```

### Option 2: Command Prompt
```cmd
# Double-click start-windows.bat
# OR in CMD:
cd nexusai
start-windows.bat
```

### Option 3: Manual Steps
```cmd
# Terminal 1 - Backend
cd nexusai\backend
npm install
npx prisma generate
npx prisma db push
npm run dev

# Terminal 2 - Frontend
cd nexusai\frontend
npm install
npm run dev
```

### Option 4: Docker (if installed)
```powershell
cd nexusai
docker-compose up --build
```

## 📦 Extracting the ZIP on Windows

Since `unzip` is not available on Windows, use one of these methods:

### Method 1: File Explorer
1. Right-click `nexusai.zip`
2. Select "Extract All..."
3. Choose destination folder
4. Click "Extract"

### Method 2: PowerShell
```powershell
Expand-Archive -Path "nexusai.zip" -DestinationPath ".\nexusai"
cd nexusai
```

### Method 3: 7-Zip / WinRAR
Right-click → "Extract Here" or "Extract to nexusai\"

## 🔑 IMPORTANT: Change JWT Secrets

Before running, edit `backend\.env` and change:
```env
JWT_SECRET=your_new_64_char_random_string_here
JWT_REFRESH_SECRET=your_new_64_char_random_string_here
SESSION_SECRET=your_new_64_char_random_string_here
```

Generate random strings with PowerShell:
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

## 📊 Services After Starting

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 (dev) or http://localhost:3000 (Docker) |
| Backend API | http://localhost:5000 |
| File Processor | http://localhost:8000 |

## 🐛 Windows Troubleshooting

### "npm is not recognized"
Install Node.js from https://nodejs.org/ (LTS version)

### "prisma command not found"
```cmd
cd backend
npm install -g prisma
npx prisma generate
```

### Port already in use
```powershell
# Find and kill process on port 5000
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process
```

### Docker Desktop not running
Start Docker Desktop first, then run:
```powershell
docker-compose up --build
```

## 📁 Project Structure
```
nexusai/
├── backend/              # Node.js API
│   ├── src/
│   ├── prisma/
│   └── file-processor/   # Python service
├── frontend/             # React 19 app
├── docker-compose.yml
├── start.ps1            ← PowerShell startup
├── start-windows.bat    ← CMD startup
└── STARTUP.md           ← Detailed guide
```

## ✅ Your API Keys Are Pre-Configured

All keys from your screenshot are already set in `backend\.env`:
- Groq, Gemini, OpenRouter, fal.ai, Jina, OpenWeather, Resend, Supabase

## 📄 License
MIT © 2024 NexusAI
