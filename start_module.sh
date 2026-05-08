#!/usr/bin/env bash
# Build and load Firewall Kernel Module

set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "Building Firewall Kernel Module"
echo "=========================================="

# Build module
echo "[1/3] Building module..."
make clean
make

# Find .ko file
KO_FILE=$(ls *.ko 2>/dev/null | head -n1)
if [ -z "$KO_FILE" ]; then
  echo "❌ ERROR: No .ko file found after build"
  exit 1
fi

echo "[2/3] Loading module: $KO_FILE"
sudo insmod "$KO_FILE" || {
  if lsmod | grep -q firewall; then
    echo "⚠️  Module already loaded"
  else
    echo "❌ Failed to load module"
    sudo dmesg | tail -20
    exit 1
  fi
}

echo "[3/3] Verifying module..."
if lsmod | grep -q firewall; then
  echo "✅ Module loaded successfully!"
  echo ""
  echo "Module info:"
  lsmod | grep firewall
  echo ""
  echo "Recent kernel logs:"
  sudo dmesg | tail -5
else
  echo "❌ Module verification failed"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ Module started. To unload:"
echo "   sudo rmmod firewall"
echo "=========================================="
