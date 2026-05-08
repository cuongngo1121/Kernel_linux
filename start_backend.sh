#!/usr/bin/env bash
# Start Backend (FastAPI + Uvicorn)

set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/web-dashboard/backend"

cd "$BACKEND_DIR"

echo "=========================================="
echo "Starting Backend API Server"
echo "=========================================="

# Create virtual environment if not exists
if [ ! -d venv ]; then
  echo "[1/3] Creating Python virtual environment..."
  python3 -m venv venv
else
  echo "[1/3] Using existing virtual environment..."
fi

# Activate venv
echo "[2/3] Installing dependencies..."
source venv/bin/activate
pip install -q -r "$ROOT_DIR/web-dashboard/requirements.txt" || {
  echo "⚠️  Some dependencies may have failed"
}

# Run backend
echo "[3/3] Starting FastAPI server on http://0.0.0.0:8000"
echo ""
echo "API Docs:  http://localhost:8000/docs"
echo "ReDoc:     http://localhost:8000/redoc"
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="

python3 main.py
