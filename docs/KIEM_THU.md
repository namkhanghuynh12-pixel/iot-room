# Kết quả kiểm thử

Ngày thực hiện 25/10/2026, trên laptop Windows của người dùng. Không coi việc có source hoặc build thành công là đã nghiệm thu trên mọi phần cứng.

## Đã xác nhận

- Board thực tế: ESP32-C5HR8 revision 1.2, Flash đọc được 16 MB; esptool nhận PSRAM 8 MB theo chip.
- Đã sao lưu toàn bộ 16.777.216 byte Flash trước lần nạp đầu. SHA256 bản sao: `D9A81C333A321EA5BCA4B60C11CBDFC30A05B7874B14E9D49DE8281238AA73E0`.
- Firmware Arduino core 3.3.12 biên dịch thành công cho C5, Flash 16M, PSRAM enabled, USB CDC enabled, app partition khoảng 3 MB.
- Đã nạp firmware vào COM16; esptool ghi và xác minh hash thành công.
- Đã nhận telemetry JSON thực sự phát ra từ board qua USB. Trường `synthetic: true` xác nhận giá trị cảm biến là giả.
- Gateway USB → MQTT → SQLite/API/dashboard hoạt động. Kiểm thử phần cứng đã nhận ACK cả quạt, đèn và còi trên board; chưa lắp tải ngoài. Minh chứng `hardware-usb-verification.json`.
- Laptop nhìn thấy SSID `PhongIoT-Config` do board phát. Người dùng báo chưa mở được trang 192.168.4.1 trên điện thoại; đã bổ sung cấu hình Wi-Fi qua USB trên dashboard.
- Năm test tự động đạt: validation cảm biến, hysteresis ba đầu ra, ràng buộc PIR và manual, validation cấu hình, tích hợp MQTT/2 nút/điều khiển/database restart/xác thực.
- Test tích hợp bao gồm còi tự dừng/khóa sau khoảng 10 giây; mã firmware có watchdog 30 giây. Chưa ghi nhận một phép đo độc lập độ trễ watchdog trên tải ngoài.
- Gói Mosquitto của người dùng báo version 2.0.17. Kiểm thử broker thật ở loopback 18884: Node pub/sub JSON QoS1 thành công, sai mật khẩu bị từ chối.
- API LAN trên chính laptop trả 401 khi không có token và 200 với token đúng. Đây không thay thế kiểm thử từ một điện thoại qua router/firewall.
- C# WinForms biên dịch thành EXE; chế độ kiểm tra gọi API thành công.
- Java Swing biên dịch bằng JDK 17; chế độ kiểm tra gọi API thành công.
- Android native Java được biên dịch thành APK và apksigner xác minh chữ ký v2/v3. Package `vn.phongiot`, min SDK 26, target SDK 35; chưa chạy trên điện thoại Android.
- iOS có SwiftUI source và cấu hình XcodeGen; chưa build/run vì máy hiện tại là Windows.
- Đã mở source trong VS Code. Đã quan sát dashboard và trang quy tắc trên trình duyệt.

## Còn cần nghiệm thu

1. Wi-Fi STA và MQTT từ ESP32 sau khi người dùng nhập mật khẩu trực tiếp trong biểu mẫu cục bộ. Chỉ xác nhận sau khi có bản tin mới từ IP LAN của board và ACK khi không chạy gateway USB.
2. Trang AP HTTP và lưu form trên điện thoại; phương án USB/NVS là đường thay thế đã chuẩn bị.
3. DHT22, LDR, PIR, MQ135 và tải quạt/đèn/còi thực tế. Người dùng hiện chỉ có ESP32.
4. Hai ESP32 vật lý; hiện có một board và hai simulator.
5. APK trên Android, app iOS trên Mac/iPhone, UI desktop khi trình bày.
6. Điều kiện router/captive portal/firewall và vận hành lâu dài.

## Chạy lại

`node --test tests/*.test.mjs` kiểm tra phần mềm bằng database/cổng riêng, không thay đổi dữ liệu dashboard đang dùng. `node test-mosquitto.mjs` dùng broker thử riêng 18884 và dừng sau khi xong. `node build-firmware.mjs` build C5; thêm `--upload --port COM16` để nạp sau khi đã đóng các chương trình giữ COM.
