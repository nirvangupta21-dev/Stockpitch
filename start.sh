#!/bin/sh
# Start the Python fundamentals microservice in the background
python3 /app/server/fundamentals_service.py 5001 &
PYTHON_PID=$!

echo "✓ Python fundamentals service started (PID $PYTHON_PID) on port 5001"

# Wait for Python service to be ready (up to 30s)
for i in $(seq 1 30); do
  sleep 1
  if curl -s "http://127.0.0.1:5001/?ticker=AAPL" > /dev/null 2>&1; then
    echo "✓ Python service ready after ${i}s"
    break
  fi
done

# Start the Node.js production server
exec node /app/dist/index.cjs
