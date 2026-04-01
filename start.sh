#!/bin/sh
# Start the Python fundamentals microservice in the background
python3 /app/server/fundamentals_service.py 5001 &
PYTHON_PID=$!

echo "✓ Python fundamentals service started (PID $PYTHON_PID) on port 5001"

# Wait a moment for it to be ready
sleep 2

# Start the Node.js production server
exec node /app/dist/index.cjs
