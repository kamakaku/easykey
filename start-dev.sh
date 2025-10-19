#!/bin/bash
# EasyKey Development Startup Script

echo "🚀 Starting EasyKey Development Environment..."
echo ""

# Check if we're in the right directory
if [ ! -d "services/auth-api" ] || [ ! -d "apps/web" ]; then
    echo "❌ Error: Run this script from the project root directory"
    exit 1
fi

# Check for backend
cd services/auth-api
echo "📦 Backend: Checking dependencies..."
if ! go version &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.22 or later."
    exit 1
fi

# Check if .env exists and warn about MySQL
if [ -f ".env" ]; then
    echo "⚙️  Backend: Using MySQL configuration from .env"
    echo "   Make sure your IP is whitelisted in All-Inkl KAS!"
else
    echo "⚙️  Backend: Using SQLite (no .env file found)"
    echo "   Perfect for local development!"
fi

echo ""
echo "🔌 Starting Backend on http://localhost:8080..."
go run main.go > /tmp/easykey-backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 2

# Check if backend started successfully
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "❌ Backend failed to start. Check logs:"
    cat /tmp/easykey-backend.log
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Backend is running!"
cd ../..

# Check for frontend
cd apps/web
echo ""
echo "📦 Frontend: Checking dependencies..."
if ! pnpm --version &> /dev/null; then
    echo "❌ pnpm is not installed. Installing..."
    npm install -g pnpm
fi

if [ ! -d "node_modules" ]; then
    echo "📥 Installing frontend dependencies..."
    pnpm install
fi

echo ""
echo "🎨 Starting Frontend on http://localhost:3000..."
pnpm dev > /tmp/easykey-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

cd ../..

# Save PIDs for cleanup
echo $BACKEND_PID > /tmp/easykey-backend.pid
echo $FRONTEND_PID > /tmp/easykey-frontend.pid

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ EasyKey is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Frontend:  http://localhost:3000"
echo "🔌 Backend:   http://localhost:8080"
echo "❤️  Health:    http://localhost:8080/health"
echo ""
echo "📋 Logs:"
echo "   Backend:  tail -f /tmp/easykey-backend.log"
echo "   Frontend: tail -f /tmp/easykey-frontend.log"
echo ""
echo "🛑 To stop:"
echo "   ./stop-dev.sh"
echo "   or press Ctrl+C and run: kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm /tmp/easykey-*.pid 2>/dev/null; echo '✅ Services stopped.'; exit 0" INT

# Keep script running
wait
