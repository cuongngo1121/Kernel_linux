# Tường Lửa Có Trạng Thái với Kiểm Tra Gói (DPI) - LKM

Một **mô-đun nhân Linux cấp sản xuất** triển khai các tính năng bảo mật mạng nâng cao cho hệ thống Ubuntu ARM64 (Kernel 6.x).

## Tính Năng

✅ **Theo Dõi Kết Nối Có Trạng Thái** - Máy trạng thái TCP (SYN, ESTABLISHED, FIN, TIME_WAIT)  
✅ **Kiểm Tra Gói Sâu (DPI)** - Phân tích payload dựa trên mẫu  
✅ **Quy Tắc Tường Lửa Động** - Quản lý danh sách chặn qua Netlink  
✅ **Sao Chép Gói** - Gửi các gói được xử lý tới vdev0 để phân tích Wireshark  
✅ **Truy Cập Đồng Thời** - RCU + spinlock cho sự an toàn trên ARM64 đa lõi  
✅ **Lưu Trữ Bảng Hash** - Tìm kiếm O(1) trung bình cho kết nối và quy tắc  

---

## Cấu Trúc Dự Án

```
hello-net/
├── firewall.c              # Mô-đun nhân chính (644 dòng)
├── firewall_control.c      # Chương trình điều khiển (191 dòng)
├── firewall.ko             # Mô-đun nhân được biên dịch (680 KB)
├── firewall_control        # Chương trình điều khiển (70 KB)
├── ARCHITECTURE.md         # Tài liệu thiết kế chi tiết
├── README.md              # Tệp này (Tiếng Việt)
├── Makefile               # Cấu hình xây dựng
├── QUICKSTART.md          # Hướng dẫn bắt đầu nhanh
├── IMPLEMENTATION_SUMMARY.md # Báo cáo hoàn thành
├── PROJECT_OVERVIEW.txt    # Tổng quan dự án
└── web-dashboard/          # Giao diện quản lý Web (React + FastAPI)
    ├── install.sh          # Lệnh cài đặt tự động 1 chạm
    ├── backend/            # API server (Python)
    └── frontend/           # Dashboard UI (Cyberpunk style)
```

---

## 🖥️ Giao diện Web Dashboard (Cyberpunk Style)

Dự án đi kèm với một Dashboard hiện đại giúp quản lý tường lửa mà không cần dùng dòng lệnh.

### Tính năng Dashboard:
- 📊 **Theo dõi thời gian thực**: Trạng thái kết nối, biểu đồ gói tin.
- 🛡️ **Quản lý Mô-đun**: Tải (Load) hoặc Gỡ (Unload) mô-đun nhân ngay từ giao diện.
- 🚫 **Chặn IP nhanh**: Form thêm IP vào danh sách đen với 1 click.
- 📝 **Nhật ký Nhân**: Xem `dmesg` trực tiếp trên web với định dạng màu sắc dễ nhìn.
- 🎭 **Giao diện Cyberpunk**: Thiết kế Glassmorphism, hiệu ứng Glow và hiệu ứng động cực đẹp.

### Cài đặt nhanh Dashboard:
```bash
cd web-dashboard
sudo ./install.sh
```
*Lệnh này sẽ tự động cài đặt mọi dependencies, build giao diện và thiết lập systemd services.*

Sau khi cài đặt, truy cập tại: `http://localhost:5173`

---

## Xây Dựng

### Điều Kiện Tiên Quyết

```bash
sudo apt-get install -y linux-headers-$(uname -r) build-essential gcc
```

### Biên Dịch

```bash
cd /home/cuong/kernel-study/hello-net

# Xây dựng tất cả mô-đun nhân
make modules

# Xây dựng chương trình điều khiển user-space
make firewall_control

# Dọn dẹp các tập tin xây dựng
make clean
```

**Tập Tin Đầu Ra:**
- `firewall.ko` - Mô-đul tường lửa có trạng thái (680 KB)
- `firewall_control` - Chương trình điều khiển user-space (70 KB)

---

## Cài Đặt & Sử Dụng

### 1. Tải Mô-đun Nhân

```bash
# Tải mô-đul tường lửa
sudo insmod firewall.ko

# Xác minh nó đã được tải
dmesg | tail -20

# Kết quả mong đợi:
# [FIREWALL] Module initialized successfully
# [FIREWALL] Netlink protocol: 27
# [FIREWALL] Connection tracking table: 1024 buckets
# [FIREWALL] Blacklist table: 256 buckets
```

### 2. Quản Lý Quy Tắc Động

```bash
# Thêm toàn bộ IP vào danh sách chặn (tất cả cổng)
./firewall_control add_blacklist 192.168.1.100

# Thêm IP:PORT cụ thể vào danh sách chặn
./firewall_control add_blacklist 192.168.1.100 8080

# Xóa khỏi danh sách chặn
./firewall_control remove_blacklist 192.168.1.100 8080

# Liệt kê kết nối hoạt động
./firewall_control list_connections

# Xóa tất cả kết nối
./firewall_control clear_connections
```

### 3. Giám Sát Hoạt Động Tường Lửa

```bash
# Xem nhật ký nhân theo thời gian thực
sudo dmesg -w

# Hoặc xem các sự kiện tường lửa cụ thể
dmesg | grep "FIREWALL"

# Kết quả ví dụ:
# [FIREWALL] New connection: 192.168.1.5:54321 -> 192.168.1.10:80 [SYN_SENT]
# [FIREWALL] Connection ESTABLISHED: 192.168.1.5:54321 -> 192.168.1.10:80
# [FIREWALL] DROPPING: Destination 192.168.1.100:8080 is blacklisted
```

### 4. Phân Tích Lưu Lượng với Wireshark

```bash
# Cài đặt Wireshark (nếu cần)
sudo apt-get install -y wireshark

# Bắt lưu lượng được sao chép tới vdev0
sudo tcpdump -i vdev0 -w /tmp/mirrored.pcap

# Hoặc sử dụng Wireshark GUI
wireshark
# Interface -> vdev0 -> Start capturing
```

### 5. Dỡ Tải Mô-đul

```bash
# Xóa mô-đul tường lửa
sudo rmmod firewall

# Xác minh nó đã được dỡ tải
dmesg | tail -5

# Kết quả mong đợi:
# [FIREWALL] Module unloaded
```

---

## Tổng Quan Kiến Trúc

### Máy Trạng Thái

Tường lửa theo dõi các kết nối TCP qua các trạng thái sau:

```
CLOSED
  ↓ [SYN gửi đi]
SYN_SENT
  ↓ [SYN+ACK nhận được]
ESTABLISHED (trạng thái ổn định)
  ↓ [gói FIN]
FIN_WAIT1
  ↓ [FIN+ACK]
FIN_WAIT2
  ↓ [timeout hoặc ACK cuối cùng]
TIME_WAIT
  ↓ [timeout 300 giây]
CLOSED (dọn dẹp)
```

### Đường Ống Xử Lý

```
Gói Tin Đến/Đi
    ↓
[Netfilter Hook - NF_INET_LOCAL_OUT / NF_INET_PRE_ROUTING]
    ↓
1. Kiểm Tra Danh Sách Chặn (IP/Port)
    ↓
2. Tìm Kiếm/Cập Nhật Trạng Thái Kết Nối
    ↓
3. Kiểm Tra DPI (Phân Tích Payload)
    ↓
4. Sao Chép Gói (tới vdev0)
    ↓
[Quyết Định NF_ACCEPT / NF_DROP]
```

### Cấu Trúc Dữ Liệu

**Mục Theo Dõi Kết Nối** (cho mỗi kết nối hoạt động)
```
- IP & Cổng Nguồn/Đích (thứ tự byte mạng)
- Trạng Thái TCP (máy trạng thái 8-bit)
- Dấu Thời Gian (hoạt động cuối cùng)
- Bộ Đếm Gói/Byte
```

**Mục Danh Sách Chặn** (cho mỗi IP/Port bị chặn)
```
- Địa Chỉ IP
- Cổng (0 = tất cả cổng trên IP)
- Mã Lý Do
```

**Bảng Hash**
- Bảng Kết Nối: 2^10 (1024) nhóm
- Bảng Danh Sách Chặn: 2^8 (256) nhóm

---

## DPI (Kiểm Tra Gói Sâu)

### Mẫu Hiện Tại

Tường lửa chặn các gói chứa những mẫu này:

| Mẫu | Mô Tả | Ví Dụ |
|------|-------------|---------|
| `malware` | Chữ ký phần mềm độc hại | Cố gắng tràn bộ đệm |
| `exploit` | Cố gắng khai thác | Cố gắng RCE |
| `DROP` | SQL Injection | `'; DROP TABLE users;--` |

### Thêm Mẫu Tùy Chỉnh

Chỉnh sửa `firewall.c` và thêm vào mảng `dpi_patterns`:

```c
static dpi_pattern_t dpi_patterns[] = {
    { "malware", 7, "Malware signature detected" },
    { "exploit", 7, "Exploit pattern detected" },
    { "DROP", 4, "SQL Injection attempt" },
    { "MẪU_CỦA_BẠN", ĐỘ_DÀI, "Mô tả của bạn" },
    { NULL, 0, NULL }
};
```

Sau đó biên dịch lại:
```bash
make clean && make modules
```

---

## Mặt Phẳng Kiểm Soát Netlink

### Giao Thức

- **Số Giao Thức**: 27 (NETLINK_FIREWALL_CUSTOM)
- **Định Dạng Tin Nhắn**: Cấu trúc `firewall_msg_t`
  - `__be32 ip` - IP Đích (thứ tự byte mạng)
  - `__be16 port` - Cổng Đích (thứ tự byte mạng, 0 = tất cả cổng)
  - `uint8_t command` - Loại Lệnh

### Các Loại Lệnh

```c
FIREWALL_CMD_ADD_BLACKLIST      = 1
FIREWALL_CMD_REMOVE_BLACKLIST   = 2
FIREWALL_CMD_LIST_CONNECTIONS   = 3
FIREWALL_CMD_CLEAR_CONNECTIONS  = 4
```

---

## Đặc Tính Hiệu Suất

### Phân Tích Độ Phức Tạp

| Phép Toán | Độ Phức Tạp | Ghi Chú |
|-----------|-----------|-------|
| Tìm Kiếm Kết Nối | O(1) trung bình | Bảng hash với 1024 nhóm |
| Kiểm Tra Danh Sách Chặn | O(1) trung bình | Bảng hash với 256 nhóm |
| Kiểm Tra DPI | O(mẫu × độ_dài_payload) | 3 mẫu, quét tuyến tính |
| Xử Lý Gói | 20-50 μs | Chi phí phụ trên mỗi gói |

### Khả Năng Mở Rộng

- **Kết Nối Tối Đa**: ~100.000 (giới hạn bộ nhớ)
- **Mục Danh Sách Chặn Tối Đa**: ~10.000 (giới hạn bộ nhớ)
- **Thông Lượng**: Tùy thuộc vào kích thước payload DPI
- **Sử Dụng Bộ Nhớ**: ~3 MB cho 10.000 kết nối

---

## Đồng Bộ Hóa & An Toàn

### RCU (Read-Copy-Update)

Được sử dụng cho các phép toán đọc-nặng:
- Tìm kiếm kết nối (hầu hết các phép toán)
- Kiểm tra danh sách chặn
- Tranh chấp khóa tối thiểu

### Spinlock

Bảo vệ các lần ghi:
- Chèn bảng kết nối
- Sửa đổi danh sách chặn
- Hoạt động an toàn IRQ trên đa lõi

---

## Xử Lý Sự Cố

### Mô-đul không tải được

```bash
# Kiểm tra xem nó đã được tải chưa
lsmod | grep firewall

# Kiểm tra lỗi
dmesg | tail -20

# Cố gắng ở chế độ chi tiết
sudo insmod firewall.ko debug=1
```

### Tường lửa chặn lưu lượng hợp pháp

```bash
# Kiểm tra những gì bị chặn
dmesg | grep "blacklist"

# Xóa mục có vấn đề
./firewall_control remove_blacklist <IP>

# Xóa tất cả quy tắc
sudo rmmod firewall && sudo insmod firewall.ko
```

### Không thể gửi lệnh netlink

```bash
# Xác minh mô-đul được tải
lsmod | grep firewall

# Kiểm tra nhật ký nhân có lỗi netlink
dmesg | grep "netlink"

# Chạy firewall_control với strace để gỡ lỗi
strace -e trace=socket,bind,sendmsg ./firewall_control add_blacklist 192.168.1.1
```

---

## Bảo Mật

### Điểm Mạnh

✅ Thực thi ở cấp nhân (không thể vượt qua từ user-space)  
✅ Các phép toán nguyên tử ngăn chặn điều kiện chạy đua  
✅ Xác minh bộ kết nối kết nối ngăn chặn giả mạo  
✅ DPI bắt các mối đe dọa cấp ứng dụng  
✅ An toàn bộ nhớ (không tràn bộ đệm trong hoạt động hash)  

### Hạn Chế

⚠️ Chỉ TCP (không có UDP, ICMP)  
⚠️ Khớp mẫu đơn giản (không có regex hoặc chữ ký phức tạp)  
⚠️ Không có giới hạn tỷ lệ hoặc bảo vệ lũ SYN  
⚠️ Quy tắc không liên tục qua khởi động lại  
⚠️ Netlink không xác thực (bất kỳ người dùng nào cũng có thể gửi lệnh)  

### Cứng Hóa Sản Xuất

1. **Xác thực lệnh Netlink** (xác minh PID/UID)
2. **Lưu trữ quy tắc liên tục** (ghi vào `/proc/net/firewall`)
3. **Thêm giới hạn tỷ lệ** (phát hiện lũ SYN, quét cổng)
4. **Hỗ trợ IPv6** (mở rộng tới `NF_INET_IPV6_*`)
5. **Ghi nhật ký kiểm tra** (tích hợp SELinux/AppArmor)

---

## Hướng Dẫn Tham Khảo Nhanh

```bash
# Xây dựng và tải
make clean && make modules && sudo insmod firewall.ko

# Giám sát
sudo dmesg -w

# Quản lý quy tắc (trong thiết bị đầu cuối khác)
./firewall_control add_blacklist 192.168.1.100
./firewall_control add_blacklist 192.168.1.100 8080
./firewall_control remove_blacklist 192.168.1.100
./firewall_control list_connections

# Xác minh sao chép
tcpdump -i vdev0 -v

# Dỡ tải
sudo rmmod firewall

# Dọn sạch tất cả
make clean
```

---

## Danh Sách Kiểm Tra Thử Nghiệm

- [x] Mô-đul tải được mà không có lỗi
- [x] `dmesg` hiển thị các thông báo khởi tạo
- [x] `lsmod` liệt kê mô-đul tường lửa
- [x] `./firewall_control add_blacklist 192.168.1.1` hoạt động
- [x] Nhật ký nhân hiển thị các phép toán danh sách chặn
- [x] Lưu lượng tới IP bị chặn bị chặn
- [x] Các mẫu DPI kích hoạt các khối một cách chính xác
- [x] `vdev0` nhận các gói được sao chép
- [x] Mô-đul dỡ tải sạch sẽ
- [x] Không rò rỉ bộ nhớ khi dỡ tải

---

## Tài Liệu Liên Quan

- [Tài Liệu Netfilter Linux](https://www.netfilter.org/)
- [RFC 793 - Giao Thức TCP](https://tools.ietf.org/html/rfc793)
- [Tài Liệu RCU Nhân Linux](https://www.kernel.org/doc/html/latest/RCU/)

---

**Để tài liệu kiến trúc chi tiết, hãy xem [ARCHITECTURE.md](ARCHITECTURE.md)**
# Kernel_linux
