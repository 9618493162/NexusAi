#!/bin/bash
# NexusAI Startup Script

echo "🚀 NexusAI Project Setup"
echo "========================"

# Check if Docker is available
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "✅ Docker found - starting with docker-compose..."

    # Check if .env files exist
    if [ ! -f backend/.env ]; then
        echo "⚠️  Creating backend/.env from example..."
        cp backend/.env.example backend/.env
        echo "❗ IMPORTANT: Edit backend/.env and set your JWT_SECRET, JWT_REFRESH_SECRET, and GROQ_API_KEY"
    fi

    if [ ! -f frontend/.env ]; then
        echo "⚠️  Creating frontend/.env from example..."
        cp frontend/.env.example frontend/.env
    fi

    echo ""
    echo "🐳 Starting services..."
    docker-compose up --build

else
    echo "❌ Docker not found. Starting in development mode..."
    echo ""
    echo "📦 Installing backend dependencies..."
    cd backend && npm install

    echo "🔧 Setting up database..."
    npx prisma generate
    npx prisma db push

    echo "🚀 Starting backend (port 5000)..."
    npm run dev &
    BACKEND_PID=$!

    cd ../frontend
    echo "📦 Installing frontend dependencies..."
    npm install

    echo "🚀 Starting frontend (port 5173)..."
    npm run dev &
    FRONTEND_PID=$!

    echo ""
    echo "✅ Services started!"
    echo "   Frontend: http://localhost:5173"
    echo "   Backend: http://localhost:5000"
    echo ""
    echo "Press Ctrl+C to stop all services"

    wait $BACKEND_PID $FRONTEND_PID
fi
