# KernelGuard Dashboard

Web dashboard for the ARM64 Linux kernel firewall module.

## Install (one command)

```bash
sudo ./install.sh
```

That's it. The script will:
1. Install missing system dependencies (python3, node, npm)
2. Create Python venv and install backend dependencies
3. Build the React frontend
4. Configure passwordless sudo for firewall commands
5. Install and start systemd services (auto-start on boot)

After install, open your browser at `http://<your-linux-ip>:5173`

## What the dashboard controls

Everything is done from the UI — no terminal needed after install:

| Feature | How |
|---|---|
| Load kernel module | Click **Load Module** button |
| Unload kernel module | Click **Unload** button |
| Toggle packet mirror | Click **Start/Stop Mirror** button |
| Block an IP | Fill form → **Block IP** |
| View connections | Connections tab |
| View DPI alerts | Alerts tab |
| View kernel logs | Logs tab |

## Service management

```bash
# Check status
sudo systemctl status kernelguard-backend
sudo systemctl status kernelguard-frontend

# Restart
sudo systemctl restart kernelguard-backend kernelguard-frontend

# View logs
sudo journalctl -u kernelguard-backend -f
```

## Ports

| Service | Port |
|---|---|
| Dashboard (frontend) | 5173 |
| API (backend) | 8000 |
| API Docs (Swagger) | 8000/docs |

## Requirements

- Linux (ARM64 or x86_64)
- `firewall.ko` and `firewall_control` built in the parent directory
- `sudo` access for initial install
