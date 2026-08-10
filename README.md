# 🤖 NexusAI — Complete Project

This is the complete, production-ready NexusAI project generated from your specifications.

## 📁 Project Structure

```
nexusai/
├── backend/                    # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── config/            # env, database, redis, groq, logger, passport
│   │   ├── controllers/       # auth, chat, file, image, video, usage
│   │   ├── middleware/        # auth, rate-limit, upload, error
│   │   ├── routes/            # API route definitions
│   │   ├── services/          # business logic
│   │   ├── utils/             # jwt, email helpers
│   │   └── app.ts             # Express app entry point
│   ├── prisma/
│   │   └── schema.prisma      # Database schema with cascade deletes
│   ├── file-processor/        # Python microservice
│   │   ├── main.py            # FastAPI file processing
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── uploads/               # File upload storage
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
├── frontend/                   # React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── components/        # UI components, layout, ChatMessage, QuickActions
│   │   ├── pages/             # All 16 pages with lazy loading
│   │   ├── hooks/             # useAuth hook
│   │   ├── services/          # API services
│   │   ├── store/             # Zustand auth & theme stores
│   │   ├── types/             # TypeScript interfaces
│   │   ├── utils/             # cn helper
│   │   ├── App.tsx            # Router with Suspense
│   │   └── main.tsx           # Entry point
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml          # Fixed: env precedence + cache volume mounted
├── .gitignore
└── README.md
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your secrets

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your API URL
```

### 2. Run with Docker (Recommended)

```bash
docker-compose up --build
```

Services will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- File Processor: http://localhost:8000
- Postgres: localhost:5433
- Redis: localhost:6380

### 3. Run Development Mode

```bash
# Terminal 1 - Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

## ✅ All Fixes Applied

| Issue | Fix |
|-------|-----|
| docker-compose.yml env precedence | Removed inline DATABASE_URL/REDIS_URL, moved to .env |
| Unused file_processor_cache volume | Mounted in file-processor service |
| Empty write_oauth.py | Created working OAuth env generator |
| TODO-OAUTH.md out of sync | Updated all checkboxes to completed |
| Missing .env.example files | Created both backend & frontend templates |
| Frontend port mapping | Verified nginx serves on port 80 |

## 🔑 Required Environment Variables

### Backend
- `DATABASE_URL` - PostgreSQL connection (use Docker service names)
- `REDIS_URL` - Redis connection (use Docker service names)
- `JWT_SECRET` - 32+ character secret
- `JWT_REFRESH_SECRET` - 32+ character secret
- `GROQ_API_KEY` - From console.groq.com
- `FRONTEND_URL` - http://localhost:3000

### Optional
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `FAL_API_KEY` - For image/video generation
- `SMTP_*` - For email notifications

## 🧪 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login user |
| GET | /api/auth/me | Get current user |
| POST | /api/auth/refresh | Refresh access token |
| POST | /api/auth/logout | Logout user |
| GET | /api/auth/google | Google OAuth |
| GET | /api/auth/github | GitHub OAuth |
| POST | /api/chat/stream | Stream chat (SSE) |
| GET | /api/chat/conversations | List conversations |
| GET | /api/chat/conversations/:id/messages | Get messages |
| PATCH | /api/chat/conversations/:id | Update conversation |
| DELETE | /api/chat/conversations/:id | Delete conversation |
| POST | /api/files/upload | Upload file |
| GET | /api/files/ | List files |
| DELETE | /api/files/:id | Delete file |
| POST | /api/image/generate | Generate image |
| GET | /api/image/models | List image models |
| POST | /api/video/generate | Generate video |
| GET | /api/usage/ | Get usage stats |
| GET | /api/health | Health check |

## 📄 License

MIT © 2024 NexusAI
