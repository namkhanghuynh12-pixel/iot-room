# Kết nối ESP32 C5 qua WiFi

Tại lúc thiết lập ngày 25/10/2026, laptop đang dùng Wi-Fi và có IP **172.16.0.109**. IP này do router cấp, có thể đổi khi khởi động lại hoặc chuyển mạng. Lấy IP hiện tại ở trang Thiết bị & kết nối, ưu tiên IP adapter Wi-Fi; IP 192.168.56.1 của mạng Ethernet/ảo không phải địa chỉ cần dùng trong thiết lập hiện tại.

Hai địa chỉ có vai trò khác nhau:

- **192.168.4.1**: địa chỉ trang cấu hình do chính ESP32 phát khi bạn nối vào `PhongIoT-Config`.
- **172.16.0.109:1883**: IP laptop và cổng MQTT mà ESP32 gửi dữ liệu về khi đã nối vào cùng mạng với laptop.
- **172.16.0.109:8765**: web/app dashboard trên điện thoại trong cùng LAN.

## Các bước

Cách ưu tiên: vào **Thiết bị & kết nối** trên dashboard laptop, dùng biểu mẫu **Cấu hình Wi-Fi qua cáp USB**. Tên Wi-Fi, COM16 và IP broker được điền tự động. Chỉ cần nhập mật khẩu ở biểu mẫu và bấm Lưu; mật khẩu không được lưu trong database laptop. Gateway USB và Serial Monitor phải đóng để ứng dụng mở được cổng. ESP32 xác nhận, lưu NVS và khởi động sang Wi-Fi. Không cần đi qua mạng AP bằng điện thoại.

Cách thay thế bằng AP, nếu điện thoại kết nối được:

1. Chạy `BAT_PHONG_IOT.cmd` trên laptop. Không chạy gateway USB cùng lúc với firmware đã chuyển sang Wi-Fi, vì hai kết nối trùng clientId sẽ đẩy nhau ra khỏi broker.
2. Kết nối điện thoại vào Wi-Fi `PhongIoT-Config`, mật khẩu `phongiot2026`.
3. Mở http://192.168.4.1.
4. Chọn **Wi-Fi qua MQTT**, ID `esp32-room-01` và **Dữ liệu giả** khi chưa có cảm biến.
5. Nhập SSID và mật khẩu mạng đang dùng. Không cần gửi mật khẩu vào chat. IP broker đã được điền mặc định cho mạng hiện tại; nếu IP laptop đổi thì sửa lại.
6. MQTT username là `esp32`. Mật khẩu MQTT của bản nạp cục bộ đã có mặc định, hoặc nhập lại giá trị trong trang Thiết bị của dashboard.
7. Lưu và chờ board khởi động lại. Điện thoại chuyển lại Wi-Fi nhà/mạng LAN ban đầu.
8. Dashboard chọn **ESP32 thật** và **Phòng ngủ**. Cần thấy thiết bị trực tuyến, dữ liệu mới và xác nhận lệnh trước khi coi đã kết nối thành công.

ESP32-C5 hỗ trợ Wi-Fi hai băng tần; board ESP32 đời khác thường chỉ có 2,4 GHz. Firmware sử dụng cấu hình tự chọn băng tần được core C5 hỗ trợ. Nếu mạng dùng đăng nhập web/captive portal, chặn thiết bị giao tiếp trong cùng Wi-Fi, hoặc firewall laptop chặn TCP 1883, tên Wi-Fi và mật khẩu đúng vẫn chưa đủ để MQTT kết nối. Có thể dùng router/hotspot cá nhân cho buổi demo hoặc tiếp tục USB.

Gateway USB là phương án bổ sung, không thay thế tính năng Wi-Fi. Trang AP và cấu hình NVS vẫn có trong firmware để đáp ứng bài cấu hình thiết bị.
