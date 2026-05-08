#!/usr/bin/env bash
# ============================================================
#  KernelGuard - One-Command Installer
#  Usage: sudo ./install.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✔ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
die()   { echo -e "${RED}✘ $*${RESET}"; exit 1; }

# ── Root check ─────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run as root: sudo ./install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$SCRIPT_DIR/.venv"
INSTALL_USER="${SUDO_USER:-$(whoami)}"
INSTALL_HOME=$(eval echo "~$INSTALL_USER")

echo -e "${BOLD}"
echo "  ██╗  ██╗███████╗██████╗ ███╗   ██╗███████╗██╗      "
echo "  ██║ ██╔╝██╔════╝██╔══██╗████╗  ██║██╔════╝██║      "
echo "  █████╔╝ █████╗  ██████╔╝██╔██╗ ██║█████╗  ██║      "
echo "  ██╔═██╗ ██╔══╝  ██╔══██╗██║╚██╗██║██╔══╝  ██║      "
echo "  ██║  ██╗███████╗██║  ██║██║ ╚████║███████╗███████╗ "
echo "  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝ "
echo "                        GUARD  v1.0"
echo -e "${RESET}"

# ── Step 1: System dependencies ────────────────────────────
step "Checking system dependencies..."
MISSING=()
for cmd in python3 pip3 node npm; do
  command -v "$cmd" &>/dev/null || MISSING+=("$cmd")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  warn "Missing: ${MISSING[*]}. Installing..."
  apt-get update -qq
  for pkg in "${MISSING[@]}"; do
    case $pkg in
      python3) apt-get install -y -qq python3 ;;
      pip3)    apt-get install -y -qq python3-pip python3-venv ;;
      node|npm) apt-get install -y -qq nodejs npm ;;
    esac
  done
fi
ok "System dependencies ready"

# ── Step 2: Python venv + dependencies ─────────────────────
step "Setting up Python virtual environment..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"
ok "Python environment ready"

# ── Step 3: Build frontend ──────────────────────────────────
step "Building frontend..."
cd "$FRONTEND_DIR"
npm install --silent
npm run build --silent
ok "Frontend built → $FRONTEND_DIR/dist"

# ── Step 4: sudoers for backend ─────────────────────────────
step "Configuring passwordless sudo for firewall commands..."
SUDOERS_FILE="/etc/sudoers.d/kernelguard"
FIREWALL_CTRL="$KERNEL_DIR/firewall_control"
KO_FILE="$KERNEL_DIR/firewall.ko"

cat > "$SUDOERS_FILE" << EOF
# KernelGuard - allow backend to control firewall without password
$INSTALL_USER ALL=(ALL) NOPASSWD: $FIREWALL_CTRL *
$INSTALL_USER ALL=(ALL) NOPASSWD: /sbin/insmod $KO_FILE
$INSTALL_USER ALL=(ALL) NOPASSWD: /sbin/rmmod firewall
$INSTALL_USER ALL=(ALL) NOPASSWD: /usr/sbin/insmod $KO_FILE
$INSTALL_USER ALL=(ALL) NOPASSWD: /usr/sbin/rmmod firewall
$INSTALL_USER ALL=(ALL) NOPASSWD: /bin/dmesg
$INSTALL_USER ALL=(ALL) NOPASSWD: /usr/bin/dmesg
EOF
chmod 440 "$SUDOERS_FILE"
ok "Sudoers configured"

# ── Step 5: Systemd service - backend ──────────────────────
step "Installing systemd services..."

cat > /etc/systemd/system/kernelguard-backend.service << EOF
[Unit]
Description=KernelGuard Backend API
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$BACKEND_DIR
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kernelguard-backend
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# ── Step 6: Systemd service - frontend (serve built files) ──
# Use Python to serve the built frontend dist folder
cat > /etc/systemd/system/kernelguard-frontend.service << EOF
[Unit]
Description=KernelGuard Frontend
After=kernelguard-backend.service
StartLimitIntervalSec=0

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$FRONTEND_DIR/dist
ExecStart=$VENV_DIR/bin/python3 -m http.server 5173 --bind 0.0.0.0
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kernelguard-frontend

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --quiet kernelguard-backend kernelguard-frontend
systemctl restart kernelguard-backend kernelguard-frontend
ok "Systemd services installed and started"

# ── Step 7: Done ─────────────────────────────────────────────
HOST_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║      KernelGuard installed! 🛡             ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Dashboard → ${CYAN}http://$HOST_IP:5173${RESET}"
echo -e "  Backend   → ${CYAN}http://$HOST_IP:8000/docs${RESET}"
echo ""
echo -e "  Manage services:"
echo -e "  ${YELLOW}sudo systemctl {start|stop|restart|status} kernelguard-backend${RESET}"
echo -e "  ${YELLOW}sudo systemctl {start|stop|restart|status} kernelguard-frontend${RESET}"
echo ""
echo -e "  Everything else is controlled from the dashboard UI."
echo ""
