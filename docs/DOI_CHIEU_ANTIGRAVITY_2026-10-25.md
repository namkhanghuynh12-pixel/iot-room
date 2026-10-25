# Đối chiếu bản Antigravity — 25/10/2026

## Phạm vi kiểm tra

Đã mở Antigravity, đọc phần bàn giao và mở bảng Review của thay đổi giao diện Galaxy. Đường dẫn trong Review khớp workspace `C:\Users\ADMIN\Documents\ChatGPT\IOT\iot-room`. Đây là kết quả đối chiếu mã nguồn và chạy lại test, không phải xác nhận mọi lời mô tả của agent trong Antigravity đều đã được nghiệm thu phần cứng.

Giữ nguyên bản Galaxy mới của người dùng. Không chạy lại `maintenance/redesign-web.py`: script đó tạo bản thiết kế cũ và sẽ ghi đè giao diện mới. Không thực thi `DAY_CODE_LEN_GITHUB.cmd`, không commit/push hay gửi tin nhắn cho agent Antigravity.

## Thay đổi đã nhận diện

- Frontend Galaxy Dark OLED: nền sao Canvas, hiệu ứng parallax/FX, bốn gauge SVG, biểu đồ Canvas hai trục, trạng thái PIR.
- Các tab Tổng quan, Thiết bị & Kết nối, Tự động hóa, Lịch sử; dark/light và FX lưu localStorage.
- Giữ form Wi-Fi USB `/api/provision`, thông tin kết nối và form tùy chỉnh ngưỡng `/api/settings`.
- Quạt hiển thị đúng DC 12 V–1 A. Không thấy nội dung tưới cây/bơm/độ ẩm đất trong frontend đã quét.
- Backend vẫn Node HTTP + Aedes + SQLite + SSE. Không phải Express/Socket.IO hay hệ thống JWT/admin/viewer.
- Gateway USB được đổi clientId thành `esp32-room-01-gw`/`02-gw`; server cho phép ID này và ánh xạ lại roomDevice. Chấp nhận gateway ID mới nên phần sửa clientId và broker hiện khớp nhau.
- Git hiện có thay đổi chưa commit ở gateway-usb.mjs, server.mjs và các file public; không được reset/restore chỉ vì chúng khác HEAD.

## Kiểm tra thực hiện

- `node --check public/app.js`: đạt.
- `node --check server.mjs`: đạt.
- `node --check gateway-usb.mjs`: đạt.
- `node --test tests/*.test.mjs`: 5/5 đạt, 0 lỗi; gồm validation, hysteresis, MQTT hai nút, điều khiển, SQLite và truy cập API.

Test này dùng dữ liệu tạm/cổng riêng; không dùng để khẳng định giao diện mobile, tất cả tình huống ACK hoặc kết nối USB/Wi-Fi đồng thời đều đã đạt. Chưa kiểm tra lại đầy đủ bằng trình duyệt hay lắp cảm biến/tải thật trong lần đối chiếu này.

## Các vấn đề cần sửa tiếp

### 1. Cảnh báo KPI chưa theo ngưỡng cá nhân

`public/app.js` quanh dòng 995, 1007, 1019 dùng cố định `curTemp >= 30`, `curHum >= 80`, `curGas >= 70`. Trong khi `renderRulesSettings` hiển thị ngưỡng tùy chỉnh từ server, màu cảnh báo KPI vẫn dùng số cũ. Ví dụ đổi ngưỡng quạt lên 35 °C thì thẻ nhiệt độ vẫn cảnh báo từ 30 °C. Cần lấy settings.onTemperature, settings.humidityAlert, settings.airQualityOn; xét trạng thái online và dữ liệu hữu hạn.

### 2. Chờ ACK chưa gắn chính xác với lệnh và phòng

`sendActuatorCommand` chỉ lưu targetValue, startTime và timer; `checkActuatorAckAndRender` xác nhận khi realState khớp và `d.acknowledged` true. Không lưu deviceId/commandId đang chờ. Một ACK từ phòng/lệnh khác, hoặc đổi phòng trong lúc đang chờ, có thể bị coi là phản hồi cho thao tác cũ. Cần ràng buộc ID thiết bị + lastCommand từ phản hồi POST; chỉ xác nhận khi snapshot tương ứng, hủy pending khi chuyển phòng/source; xử lý thứ tự SSE đến trước HTTP response.

### 3. Lịch sử có thể trộn dữ liệu khi chuyển phòng nhanh

`loadHistoryData` gán trực tiếp kết quả HTTP vào appState.historyData, không có generation hoặc kiểm tra phòng/source được yêu cầu. SSE cũng thêm mẫu vào mảng chung. Cần xóa/cô lập dữ liệu khi đổi room/source, bỏ response cũ và kiểm tra snapshot đã chuyển sang phòng mới trước khi thêm mẫu.

### 4. Hai đường USB và Wi-Fi vẫn dùng chung availability

Đổi clientId gateway giúp tránh đẩy nhau ra khỏi broker nhưng cả gateway và Wi-Fi vẫn publish vào cùng `iot/{id}/availability`. Gateway không nhận serial quá 20 giây gửi offline; server đặt online trực tiếp theo payload này. Vì vậy USB nhàn rỗi có thể báo node Wi-Fi đang hoạt động là offline. Cần quản lý online theo từng transport/client hoặc chỉ cho một transport làm chủ tại một thời điểm; kiểm tra LWT/reconnect cả hai đường trước khi khẳng định đã hết lỗi.

Ngoài ra `findPort` fallback sang board đầu tiên kể cả khi đã truyền COM cụ thể nhưng COM đó vắng mặt; nên tôn trọng COM được chỉ định để tránh mở nhầm board khác.

## Trạng thái chạy quan sát được

Trong lần kiểm tra có một server đang lắng nghe 8765/1883, cùng kết nối MQTT từ ESP32 và hai node localhost. Lần đối chiếu này không tự khởi động/dừng server đó, không mở gateway USB và không nạp firmware. Trạng thái này có thể thay đổi sau khi lập báo cáo.
