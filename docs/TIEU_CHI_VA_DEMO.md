# Đối chiếu bảng chấm đồ án

Bảng dưới chép các tiêu chí và trọng số nhìn thấy trong ảnh người dùng cung cấp. Không có file Excel công thức gốc, nên không tự khẳng định cách cộng điểm theo số lượng hoặc việc quy đổi điểm tối đa. Cần dùng minh chứng chạy thật và câu hỏi bảo vệ; không cam kết điểm số.

| Tiêu chí trong ảnh | Trọng số thấy trong ảnh | Chức năng đã chuẩn bị | Cách demo và phần cần nghiệm thu |
|---|---:|---|---|
| NodeJS MOS | 1,5 | Node.js + broker Aedes; gói Mosquitto được kiểm tra và lưu riêng | Chạy server, cho MQTT client kết nối, chỉ topic/ACL. Nếu bắt buộc Mosquitto thì dùng cấu hình thay thế, không chạy chung 1883 |
| Database | 1 | SQLite WAL, bảng samples/events/settings | Xuất CSV, đọc history, khởi động lại còn dữ liệu; không gọi là SQL Server |
| WEB | 2,5 | Dashboard responsive tiếng Việt, trang thiết bị, tự động hóa và hướng dẫn | Demo nút, đổi phòng, ngoại tuyến, lỗi nhập liệu |
| JSON | 1,5 | Telemetry, state, command, REST API đều JSON và có validation | Gửi JSON sai, server tiếp tục hoạt động; chỉ rõ kiểu number/boolean |
| Cảm biến | 0,25 | DHT22, LDR, MQ135 và PIR; năm đại lượng gồm nhiệt độ, độ ẩm, ánh sáng, khí và chuyển động | Hiện mới có ESP32, dữ liệu demo; cần lắp đủ cảm biến để nghiệm thu phần cứng |
| GAUGE | 0,75 | Bốn gauge cho nhiệt độ/độ ẩm/khí/ánh sáng | Đổi giá trị và quan sát cập nhật, đơn vị, thang đo |
| Đồ thị | 0,25 | Bốn đường lịch sử cùng trục thời gian, ghi SQLite | Tăng/giảm dữ liệu, đổi phòng, tải CSV |
| Điều khiển | 0,25 | Quạt, đèn và còi; phản hồi commandId từ thiết bị | Thủ công ON/OFF; với board trống dùng RGB tích hợp; tải thật chưa lắp |
| Tự động điều khiển | 0,25 | Nhiệt độ/quạt, ánh sáng+PIR/đèn, mức khí/còi, hysteresis | Cho nóng, tối+có chuyển động, khí cao; hạ ngưỡng và kiểm tra tắt |
| Cài Web Server | 0,5 | Node HTTP trên laptop, ESP32 WebServer cấu hình | Mở localhost và web AP trên ESP32 |
| Trang web cấu hình | 0,5 | ESP32 AP, form Wi-Fi/MQTT/ID/mode/calibration, NVS | Lưu, khởi động lại và chứng minh cấu hình còn |
| Nhiều thiết bị ESP32s | 0,5 | Hai ID/nút hoạt động đồng thời, MQTT và lịch sử tách riêng | Hai nút giả đã có; bạn có một ESP32, cần board thứ hai để chứng minh hai ESP32 vật lý |
| Gateway | 1 | USB Serial ↔ MQTT và MQTT ↔ HTTP/SQLite trên laptop | Board gửi JSON USB, web nhận; web gửi lệnh, RGB board phản hồi. Đây là gateway laptop, không phải một ESP32 gateway riêng |
| Android | 0,5 | Ứng dụng Java native dùng HTTP JSON, hiển thị và điều khiển | Build APK, cài điện thoại Android, thử cùng LAN; không dùng PWA để tự nhận tiêu chí native |
| IOS | 0,5 | SwiftUI native, REST và điều khiển | Có source/XcodeGen; cần macOS/Xcode và iPhone để build/test, không thể xác nhận chạy iOS trên Windows |
| JAVA,C# | 0,5 | Java Swing và C# WinForms độc lập trình duyệt | Biên dịch và gọi API, chạy UI và điều khiển |
| Adv | 0,2 | Xác thực/ACL, hysteresis, command ACK, timeout, cảnh báo, CSV, phục hồi dữ liệu | Chỉ ra mã và chứng minh ngắt kết nối; giảng viên quyết định tính điểm nâng cao |

## Kịch bản bảo vệ khoảng 8–10 phút

1. Nêu bài toán phòng ở: thoải mái, chiếu sáng theo hiện diện và cảnh báo demo. Trình bày hai phòng, node, gateway, broker, database và web.
2. Chạy hai mô phỏng. Mở thiết bị, chỉ ID/topic tách biệt. Nói rõ đây là giả lập hai nút, chưa phải hai ESP32 vật lý.
3. Nhập 34 °C, 85% ẩm, mức khí 90, ánh sáng 10, PIR có chuyển động. Quan sát ba đầu ra và lệnh ACK.
4. Nhập 26 °C, mức khí 20, ánh sáng 80 hoặc PIR không chuyển động. Chứng minh ba đầu ra tắt và hysteresis chống nhấp nháy.
5. Chuyển thủ công. Điều khiển quạt/đèn/còi; chỉ trạng thái đến từ state, không suy ra từ nút bấm.
6. Tạm ngắt mô phỏng, quan sát ngoại tuyến. Thử JSON lỗi và mật khẩu sai bằng test có sẵn.
7. Xuất CSV, restart server, mở lại lịch sử.
8. Mở ESP32 thật USB, chỉ COM và gateway. Nhấn điều khiển đèn để RGB đổi màu. Giải thích dữ liệu trên board vẫn là giả nếu chưa lắp sensor.
9. Mở AP cấu hình ESP32; đổi cấu hình rồi restart để chứng minh NVS.
10. Chạy app desktop và Android khi có điện thoại. Với iOS, báo đúng trạng thái source/build/test.

Các minh chứng không được làm giả: ảnh hai board khi chỉ có một; nhãn “cảm biến thật” cho dữ liệu random; APK/iOS chưa chạy mà ghi đã nghiệm thu; ghi SQLite thành SQL Server; gọi MQ135 là CO₂ chuẩn.
