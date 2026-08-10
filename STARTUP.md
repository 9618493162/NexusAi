# 🚀 NexusAI - Quick Start Guide

## ⚡ Your API Keys Are Configured!

All your API keys have been pre-configured in `backend/.env`:

| Service | Status |
|---------|--------|
| Groq (LLaMA 3, Mixtral) | ✅ Active |
| Google Gemini 1.5 Pro/Flash | ✅ Active |
| OpenRouter (Claude 3.5, GPT-4o) | ✅ Active |
| fal.ai (FLUX, Stable Diffusion) | ✅ Active |
| Jina AI (Embeddings) | ✅ Active |
| OpenWeather | ✅ Active |
| Resend (Email) | ✅ Active |
| Supabase PostgreSQL | ✅ Active |

## 🔐 IMPORTANT: Change JWT Secrets

Before deploying, change these in `backend/.env`:
```
JWT_SECRET=your_new_64_char_random_string_here
JWT_REFRESH_SECRET=your_new_64_char_random_string_here
SESSION_SECRET=your_new_64_char_random_string_here
```

Generate with: `openssl rand -base64 64`

## 🐳 Option 1: Docker Compose (Recommended)

```bash
cd nexusai
docker-compose up --build
```

Access:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- File Processor: http://localhost:8000

## 💻 Option 2: Manual Development

### Terminal 1 - Backend
```bash
cd nexusai/backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```

### Terminal 2 - Frontend
```bash
cd nexusai/frontend
npm install
npm run dev
```

### Terminal 3 - File Processor (Optional)
```bash
cd nexusai/backend/file-processor
pip install -r requirements.txt
python main.py
```

## 📊 Features Available

### 🤖 AI Models
- **Groq**: LLaMA 3.3 70B, LLaMA 3.1 8B, Mixtral 8x7B, Gemma 2 9B
- **Google**: Gemini 1.5 Pro, Gemini 1.5 Flash (1M context)
- **OpenRouter**: Claude 3.5 Sonnet, GPT-4o, LLaMA 3.1 70B

### 🎨 Creative Tools
- **Image Studio**: FLUX Schnell/Dev/Pro, Stable Diffusion XL
- **Video Studio**: Luma Dream Machine, Kling

### 📁 File Processing
- PDF, DOCX, PPTX, XLSX text extraction
- Image OCR (EasyOCR)
- Audio transcription (Whisper)
- Video processing (OpenCV)

### 🔒 Authentication
- JWT with refresh tokens
- Google OAuth
- GitHub OAuth
- Password reset via email

## 🧪 Test Commands

```bash
# Health check
curl http://localhost:5000/api/health

# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# Get AI models
curl http://localhost:5000/api/chat/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📁 Project Structure

```
nexusai/
├── backend/              # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── config/      # env, database, redis, AI configs
│   │   ├── controllers/ # Request handlers
│   │   ├── middleware/  # Auth, rate limit, upload
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic (multi-AI)
│   │   └── utils/       # JWT, email
│   ├── prisma/          # Database schema
│   └── file-processor/  # Python microservice
├── frontend/            # React 19 + Vite + Tailwind
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # 16 pages
│   │   ├── services/    # API clients
│   │   └── store/       # Zustand stores
└── docker-compose.yml
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill processes on ports
lsof -ti:5000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

### Database Connection Issues
- Verify Supabase URL in `backend/.env`
- Check if IP is allowed in Supabase dashboard

### AI Model Errors
- Verify API keys are correct
- Check provider status pages
- Fallback to Groq (most reliable)

## 📄 License

MIT © 2024 NexusAI
