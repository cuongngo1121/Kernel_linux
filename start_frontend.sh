#!/usr/bin/env bash
# Start Frontend (Vite Dev Server)

set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/web-dashboard/frontend"

cd "$FRONTEND_DIR"

echo "=========================================="
echo "Starting Frontend Dev Server"
echo "=========================================="

# Install dependencies if not exists
if [ ! -d node_modules ]; then
  echo "[1/2] Installing npm dependencies..."
  npm install -q
else
  echo "[1/2] Dependencies already installed"
fi

echo "[2/2] Starting Vite dev server"
echo ""
echo "Dashboard: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="

npm run dev
