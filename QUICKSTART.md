# Hướng Dẫn Bắt Đầu Nhanh - Mô-đun Tường Lửa Có Trạng Thái

**Thời Gian Cần Thiết**: 5-10 phút  
**Mức Độ Kỹ Năng**: Trung bình (yêu cầu kiến thức cơ bản về nhân Linux)

---

## Bước 1: Xây Dựng Tất Cả (2 phút)

```bash
cd /home/cuong/kernel-study/hello-net

# Dọn dẹp các bản xây dựng cũ
make clean

# Xây dựng tất cả mô-đun
make modules

# Xây dựng chương trình điều khiển
make firewall_control

# Xác minh bản xây dựng thành công
ls -lh firewall.ko firewall_control
```

**Kết Quả Dự Kiến**:
```
-rwxr-xr-x 1 cuong cuong  70K firewall_control
-rw-r--r-- 1 cuong cuong 680K firewall.ko
```

---

## Bước 2: Tải Mô-đul (1 phút)

```bash
# Tải mô-đul nhân
sudo insmod firewall.ko

# Kiểm tra xem nó đã được tải chưa
sudo dmesg | tail -10
```

**Thông Báo Nhân Dự Kiến**:
```
========================================
Stateful Firewall with DPI Loading...
========================================
[FIREWALL] Module initialized successfully
[FIREWALL] Netlink protocol: 27
[FIREWALL] Connection tracking table: 1024 buckets
[FIREWALL] Blacklist table: 256 buckets
```

---

## Bước 3: Kiểm Tra Lệnh Cơ Bản (2 phút)

### Thiết Bị Đầu Cuối 1: Giám Sát Nhật Ký

```bash
# Xem hoạt động tường lửa theo thời gian thực
sudo dmesg -w
```

### Thiết Bị Đầu Cuối 2: Gửi Lệnh

```bash
cd /home/cuong/kernel-study/hello-net

# Kiểm tra 1: Thêm IP vào danh sách chặn
./firewall_control add_blacklist 192.168.1.100

# Kiểm tra 2: Chặn cổng cụ thể
./firewall_control add_blacklist 192.168.1.100 8080

# Kiểm tra 3: Xóa khỏi danh sách chặn
./firewall_control remove_blacklist 192.168.1.100

# Kiểm tra 4: Liệt kê kết nối
./firewall_control list_connections
```

**Kết Quả Nhân Dự Kiến (Thiết Bị Đầu Cuối 1)**:
```
[FIREWALL-NETLINK] Add blacklist: 192.168.1.100:0 (result=0)
[FIREWALL-NETLINK] Add blacklist: 192.168.1.100:8080 (result=0)
[FIREWALL-NETLINK] Remove blacklist: 192.168.1.100:8080 (result=0)
[FIREWALL-NETLINK] List connections requested
```

---

## Bước 4: Kiểm Tra với Lưu Lượng Thực (3 phút)

### Tạo Kết Nối TCP

```bash
# Thiết Bị Đầu Cuối 2: Tạo kết nối kiểm tra
timeout 5 nc -zv 192.168.1.10 80 &

# Hoặc sử dụng curl
curl http://example.com &

# Giám sát nhật ký tường lửa ở Thiết Bị Đầu Cuối 1 để xem:
# [FIREWALL] New connection: <source> -> <dest> [SYN_SENT]
# [FIREWALL] Connection ESTABLISHED: <source> -> <dest>
```

### Chặn Bằng Tường Lửa

```bash
# Thêm đích vào danh sách chặn
./firewall_control add_blacklist 93.184.216.34  # IP của example.com

# Thử kết nối lại (nên timeout/lỗi)
timeout 3 curl http://example.com

# Kiểm tra nhật ký - nên thấy:
# [FIREWALL] DROPPING: Destination 93.184.216.34:80 is blacklisted
```

---

## Bước 5: Bắt Lưu Lượng Được Sao Chép (2 phút)

### Xác Minh vdev0 Tồn Tại

```bash
# Kiểm tra thiết bị ảo
ip link show | grep vdev

# Nếu không có, tải mô-đul netdev trước
sudo insmod netdev.ko
```

### Bắt Bằng Wireshark

```bash
# Sử dụng tcpdump
sudo tcpdump -i vdev0 -w /tmp/capture.pcap

# Trong thiết bị đầu cuối khác, tạo lưu lượng
./firewall_control add_blacklist 192.168.1.100

# Dừng tcpdump bằng Ctrl+C
# Phân tích bằng Wireshark
wireshark /tmp/capture.pcap
```

---

## Bước 6: Dỡ Tải Mô-đul (1 phút)

```bash
# Dừng giám sát
Ctrl+C  # ở Thiết Bị Đầu Cuối 1

# Dỡ tải mô-đul
sudo rmmod firewall

# Xác minh nó đã được dỡ tải
lsmod | grep firewall  # Không nên hiển thị gì

# Kiểm tra thông báo dọn dẹp
sudo dmesg | tail -5
```

**Kết Quả Dự Kiến**:
```
========================================
Stateful Firewall Unloading...
========================================
[FIREWALL] Module unloaded
```

---

## Các Vấn Đề Thường Gặp & Giải Pháp

### Vấn Đề: "insmod: ERROR: could not insert module firewall.ko"

**Giải Pháp**:
```bash
# Kiểm tra nhật ký nhân để biết chi tiết
sudo dmesg | tail -20

# Xác minh các tiêu đề được cài đặt
ls /lib/modules/$(uname -r)/build/

# Xây dựng lại nếu cần
make clean && make modules
```

### Vấn Đề: "firewall_control: No such device"

**Giải Pháp**:
```bash
# Xác minh mô-đul được tải
lsmod | grep firewall

# Tải nó
sudo insmod firewall.ko

# Thử lệnh điều khiển lại
./firewall_control add_blacklist 192.168.1.1
```

### Vấn Đề: Cảnh báo "NETLINK_FIREWALL redefined"

**Giải Pháp**: Điều này an toàn để bỏ qua. Nó chỉ là một cảnh báo thời biên dịch.

---

## Kiểm Tra Hiệu Suất (Nâng Cao)

### Đo Lường Chi Phí Phụ Mô-đul

```bash
# Cài đặt iperf3
sudo apt-get install -y iperf3

# Thiết Bị Đầu Cuối 1: Server
iperf3 -s

# Thiết Bị Đầu Cuối 2: Client (không có tường lửa)
iperf3 -c localhost -t 10

# Tải tường lửa
sudo insmod firewall.ko

# Thiết Bị Đầu Cuối 2: Client (có tường lửa)
iperf3 -c localhost -t 10

# So sánh sự khác biệt thông lượng
```

### Kết Quả Dự Kiến

- **Không Có Tường Lửa**: ~1000-10000 Mbps (cục bộ)
- **Có Tường Lửa**: ~800-9000 Mbps (chi phí phụ tối đa 20%)

---

## Các Bước Tiếp Theo

1. **Đọc Tài Liệu Kiến Trúc**: Xem [ARCHITECTURE.md](ARCHITECTURE.md)
2. **Tùy Chỉnh Mẫu DPI**: Chỉnh sửa firewall.c và thêm mẫu của bạn
3. **Mở Rộng Quản Lý Danh Sách Chặn**: Thêm lưu trữ liên tục
4. **Thêm Hỗ Trợ IPv6**: Mở rộng tới móc NF_INET_IPV6
5. **Tích Hợp với SIEM**: Ghi nhật ký vào rsyslog/journald

---

## Tham Chiếu Tập Tin

| Tập Tin | Mục Đích | Kích Thước |
|---------|---------|-----------|
| firewall.c | Mô-đun nhân chính | 20 KB |
| firewall_control.c | CLI user-space | 5.8 KB |
| firewall.ko | Mô-đul đã biên dịch | 680 KB |
| firewall_control | Chương trình đã biên dịch | 70 KB |
| Makefile | Cấu hình xây dựng | 0.4 KB |
| ARCHITECTURE.md | Tài liệu chi tiết | 20 KB |
| README.md | Tài liệu đầy đủ | 12 KB |

---

## Danh Sách Kiểm Tra Thành Công

- [x] Mô-đul biên dịch mà không có lỗi
- [x] Mô-đul tải với các thông báo dmesg
- [x] Chương trình điều khiển chạy mà không có sự cố
- [x] Lệnh Netlink được xử lý
- [x] Quy tắc danh sách chặn được thêm/xóa
- [x] Tường lửa chặn IP bị chặn
- [x] DPI phát hiện các mẫu bị cấm
- [x] vdev0 nhận các gói được sao chép
- [x] Mô-đul dỡ tải sạch sẽ

---

**Thời Lượng**: ~10 phút cho chu kỳ kiểm tra đầy đủ  
**Bước Tiếp Theo**: Đọc [ARCHITECTURE.md](ARCHITECTURE.md) để hiểu sâu hơn
