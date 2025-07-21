#!/bin/bash
set -e
cd "$(dirname "$0")"

# Activate venv
source venv/bin/activate

# Start backend
uvicorn main:app --reload &
BACKEND_PID=$!

# Start frontend
cd frontend
npm start &
FRONTEND_PID=$!

# Wait for both to exit
wait $BACKEND_PID $FRONTEND_PID 