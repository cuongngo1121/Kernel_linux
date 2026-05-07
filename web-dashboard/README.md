# Firewall Dashboard

A web dashboard for managing and monitoring the ARM64 Linux kernel firewall module.

## Backend

### Requirements

- Python 3.11 or later
- `sudo` access for kernel commands
- `firewall_control` built and available in `/home/cuong/kernel-study/hello-net/firewall_control`

### Install

```bash
cd /home/cuong/kernel-study/hello-net/web-dashboard
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run backend

```bash
cd /home/cuong/kernel-study/hello-net/web-dashboard/backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Frontend

### Install

```bash
cd /home/cuong/kernel-study/hello-net/web-dashboard/frontend
npm install
```

### Run frontend

```bash
cd /home/cuong/kernel-study/hello-net/web-dashboard/frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

### Open UI

Browse to `http://localhost:5173`

## Notes

- The dashboard uses the backend API at `http://localhost:8000/api`.
- The backend executes `firewall_control` with `sudo` and reads recent `dmesg` output.
- Ensure the firewall module is loaded first with `sudo insmod firewall.ko`.
