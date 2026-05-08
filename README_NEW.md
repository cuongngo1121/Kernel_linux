# Tường Lửa Linux với Dashboard (KernelGuard)

Một mô-đun nhân Linux cấp sản xuất triển khai firewall có trạng thái + DPI + Dashboard web.

## 🚀 Cách Chạy (Đơn Giản)

Dự án có **3 file lệnh riêng biệt** để chạy từng thành phần:

### 1️⃣ Chạy Module Kernel

```bash
cd /home/cuong/Desktop/linux_lab/Kernel_linux
chmod +x start_module.sh
./start_module.sh
```

**Tác dụng:**
- Build kernel module (`make`)
- Nạp module vào kernel (`sudo insmod firewall.ko`)
- Kiểm tra xác nhận module đã load

---

### 2️⃣ Chạy Backend API (FastAPI)

Mở terminal mới và chạy:

```bash
cd /home/cuong/Desktop/linux_lab/Kernel_linux
chmod +x start_backend.sh
./start_backend.sh
```

**Tác dụng:**
- Tạo virtual environment Python (nếu chưa có)
- Cài đặt dependencies từ `requirements.txt`
- Chạy server FastAPI trên `http://localhost:8000`

**API Documentation:**
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

### 3️⃣ Chạy Frontend (React + Vite)

Mở terminal mới và chạy:

```bash
cd /home/cuong/Desktop/linux_lab/Kernel_linux
chmod +x start_frontend.sh
./start_frontend.sh
```

**Tác dụng:**
- Cài đặt npm dependencies (nếu chưa có)
- Chạy dev server Vite trên `http://localhost:5173`
- Tự động compile khi file thay đổi

**Dashboard:**
- Truy cập tại: `http://localhost:5173`
- Quản lý module, xem logs, chặn IP từ giao diện

---

## 📋 Quy Trình Chạy Đầy Đủ

**Terminal 1 - Module Kernel:**
```bash
./start_module.sh
# Chạy xong thì có thể đóng (module sẽ ở lại kernel)
```

**Terminal 2 - Backend API:**
```bash
./start_backend.sh
# Chạy liên tục ở nền (Ctrl+C để dừng)
```

**Terminal 3 - Frontend Dashboard:**
```bash
./start_frontend.sh
# Chạy liên tục ở nền (Ctrl+C để dừng)
```

Sau đó truy cập: `http://localhost:5173`

---

## 🛠️ Dừng & Gỡ Module

```bash
# Gỡ module khỏi kernel (chạy sau khi dừng backend/frontend)
sudo rmmod firewall

# Hoặc dùng dmesg để xem logs
sudo dmesg | tail -50
```

---

## 📁 Cấu Trúc Thư Mục

```
Kernel_linux/
├── start_module.sh       # ⭐ Chạy module kernel
├── start_backend.sh      # ⭐ Chạy backend API
├── start_frontend.sh     # ⭐ Chạy frontend dashboard
├── firewall.c            # Mã nguồn kernel module
├── firewall_control.c    # Chương trình điều khiển
├── Makefile              # Cấu hình build
├── README.md             # File này
├── ARCHITECTURE.md       # Tài liệu thiết kế chi tiết
├── IMPLEMENTATION_SUMMARY.md
├── QUICKSTART.md
├── web-dashboard/
│   ├── backend/
│   │   ├── main.py
│   │   └── requirements.txt
│   └── frontend/
│       ├── src/
│       ├── package.json
│       └── vite.config.ts
└── firewall.ko           # Kernel module biên dịch
```

---

## ⚙️ Yêu Cầu Hệ Thống

- Linux kernel 6.x trở lên
- Python 3.8+
- Node.js 18+
- Build tools: `make`, `gcc`

```bash
# Cài đặt kernel headers
sudo apt install -y linux-headers-$(uname -r) build-essential gcc

# Cài đặt Python
sudo apt install -y python3 python3-venv python3-pip

# Cài đặt Node.js
sudo apt install -y nodejs npm
```

---

## 🔍 Kiểm Tra & Gỡ Lỗi

**Kiểm tra module đã load?**
```bash
lsmod | grep firewall
```

**Xem kernel logs:**
```bash
sudo dmesg | tail -50
sudo dmesg | grep FIREWALL
```

**Kiểm tra port đã listen?**
```bash
sudo netstat -tuln | grep -E '8000|5173'
```

**Tắt backend/frontend:**
```bash
# Ctrl+C trong terminal chạy nó
# Hoặc từ terminal khác:
pkill -f "uvicorn\|npm"
```

---

## 📖 Tài Liệu Thêm

- [ARCHITECTURE.md](ARCHITECTURE.md) - Thiết kế chi tiết module kernel
- [QUICKSTART.md](QUICKSTART.md) - Bắt đầu nhanh
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Báo cáo hoàn thành
- [firewall_control](firewall_control) - User-space control program

---

## 🎯 Tính Năng

✅ Theo dõi kết nối TCP có trạng thái (Stateful Firewall)  
✅ Kiểm tra gói sâu DPI (Deep Packet Inspection)  
✅ Danh sách chặn IP động (Dynamic Blacklist)  
✅ Sao chép gói tin để phân tích (Packet Mirroring)  
✅ Dashboard web real-time (React + Cyberpunk UI)  
✅ API REST quản lý module  
✅ Logging kernel comprehensive  

---

## 📝 License

Dự án học tập - Miễn phí sử dụng.
