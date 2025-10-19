#!/bin/bash
# EasyKey Development Stop Script

echo "🛑 Stopping EasyKey Development Environment..."

# Read PIDs from files
if [ -f "/tmp/easykey-backend.pid" ]; then
    BACKEND_PID=$(cat /tmp/easykey-backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID 2>/dev/null
        echo "✅ Backend stopped (PID: $BACKEND_PID)"
    fi
    rm /tmp/easykey-backend.pid
fi

if [ -f "/tmp/easykey-frontend.pid" ]; then
    FRONTEND_PID=$(cat /tmp/easykey-frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill $FRONTEND_PID 2>/dev/null
        echo "✅ Frontend stopped (PID: $FRONTEND_PID)"
    fi
    rm /tmp/easykey-frontend.pid
fi

# Also kill by port (backup)
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "✅ All services stopped."
