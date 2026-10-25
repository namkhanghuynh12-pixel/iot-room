# Phòng ở thông minh với ESP32 C5 N16R8

> Cập nhật 25/10/2026: đã bỏ MQ135, không đo mức khí. Web có ba gauge (nhiệt độ, độ ẩm, ánh sáng) và PIR; còi chỉ điều khiển thủ công. Các đoạn minh chứng khí cũ là lịch sử của phiên bản trước. Firmware/app khách cũ vẫn có thể gửi trường airQuality nhưng server không dùng làm số đo hoặc cảnh báo nữa.

Hệ thống giám sát và điều khiển hai phòng, viết bằng Node.js, MQTT và web tiếng Việt. Laptop chạy edge gateway và SQLite; ESP32 có thể kết nối qua USB hoặc Wi-Fi. Bạn đang có một ESP32-C5 N16R8; các cảm biến và tải bên ngoài chưa có.

## Mở hệ thống

1. Nhấp đúp `BAT_PHONG_IOT.cmd` để khởi động máy chủ và mở http://localhost:8765.
2. Chọn **Mô phỏng** để dùng hai nút cảm biến giả qua MQTT thật.
3. Chọn tình huống **Nóng lên**, **Không khí xấu**, **Phòng tối**, hoặc tự nhập giá trị.
4. Chọn **Thủ công** để điều khiển quạt, đèn, còi. Giao diện hiển thị trạng thái thiết bị báo về, không chỉ trạng thái nút bấm.
5. Mở **Tự động hóa** để đổi ngưỡng; **Thiết bị & kết nối** để lấy IP, thông tin MQTT và mã truy cập ứng dụng.
6. Nhấp **Xuất CSV** để lưu dữ liệu của phòng đang chọn. SQLite và cấu hình nằm trong `data/room.sqlite`.

Để dùng ESP32 qua USB sau khi nạp firmware, nhấp `BAT_GATEWAY_USB.cmd`. Chọn **ESP32 thật**, **Phòng ngủ / 01**. Gateway mặc định tự tìm board; có thể chạy `BAT_GATEWAY_USB.cmd COM16 esp32-room-01`.

`TAT_PHONG_IOT.cmd` dừng máy chủ. Mất lệnh quá 30 giây, firmware dừng đầu ra. Không mở hai gateway trên cùng cổng COM. Nếu cổng thay đổi sau khi rút/cắm, khởi động lại gateway. Không đồng thời mở Serial Monitor, công cụ nạp và gateway trên cùng COM.

## Các chức năng

- Nhiệt độ, độ ẩm không khí, ánh sáng và chuyển động PIR.
- Ba gauge và đồ thị ba đường theo thời gian.
- Quạt thông gió, đèn và còi cảnh báo; chế độ tự động hoặc thủ công.
- Quạt bật từ 30 °C, tắt dưới 28 °C.
- Còi bật khi chỉ số khí demo từ 70, tắt khi về 55; còi tự ngắt sau 10 giây và chỉ được bật lại sau khi nhận lệnh TẮT.
- Đèn bật khi ánh sáng dưới 25% và có chuyển động; tắt khi sáng từ 40% hoặc không có chuyển động.
- Hai nút độc lập `esp32-room-01`, `esp32-room-02`; tương ứng hai nút mô phỏng `sim-room-01`, `sim-room-02`.
- Trong tự động, cùng bộ quy tắc áp dụng cho hai phòng. Thủ công chỉ điều khiển phòng đang chọn, các đầu ra phòng còn lại về tắt.
- Nhật ký, cảnh báo, lịch sử lưu trên ổ đĩa, xuất CSV, truy vấn HTTP JSON.
- Xác thực MQTT và phân quyền topic theo device ID; mã truy cập cho web/app từ máy khác trong LAN.
- Trang cấu hình chạy ngay trên ESP32, lưu bằng Preferences/NVS, hoạt động sau khởi động lại.
- Gateway USB Serial ↔ MQTT; gateway ứng dụng MQTT ↔ HTTP/SQLite.
- Ứng dụng khách C# và Java cho Windows, Android Java và iOS SwiftUI.

MQ135 trong bản linh kiện phổ thông chỉ dùng làm **chỉ số khí tương đối đã hiệu chuẩn cho demo**, không gọi là AQI, ppm CO₂ hay cảm biến báo cháy. Có thể nâng cấp bằng SCD40/SCD41 cho đo CO₂ thực, nhưng cần sửa driver và thang đo. Hệ thống đồ án không thay thế thiết bị cảnh báo khói/CO được chứng nhận.

## Chế độ với ESP32 hiện có

Firmware mặc định **USB, dữ liệu cảm biến giả**. Board vẫn thực thi chương trình và phản hồi lệnh thật; RGB tích hợp biểu diễn trạng thái đầu ra:

- Đỏ: đèn.
- Xanh lá: quạt.
- Xanh dương: còi.

Khi nhiều đầu ra bật, RGB phối màu. Chưa có quạt, đèn ngoài, còi hoặc cảm biến thật thì không coi các thiết bị đó đã được nghiệm thu. Nhãn **ESP32 thật / cảm biến giả** phải giữ khi trình bày.

## Cấu hình ngay trên board

Cách thuận tiện trên laptop: mở **Thiết bị & kết nối → Cấu hình Wi-Fi qua cáp USB**. Để cắm ESP32, đóng gateway USB/Serial Monitor, nhập mật khẩu trực tiếp trong biểu mẫu và bấm Lưu. SSID, COM và IP laptop được điền tự động; chương trình gửi cấu hình xuống NVS của ESP32 rồi board khởi động sang Wi-Fi. Không gửi mật khẩu qua chat. Cách này không yêu cầu điện thoại chuyển mạng hoặc mở 192.168.4.1.

1. ESP32 phát Wi-Fi **PhongIoT-Config**, mật khẩu **phongiot2026**.
2. Kết nối điện thoại/laptop vào Wi-Fi này và mở http://192.168.4.1.
3. Chọn ID phòng, USB hoặc Wi-Fi, dữ liệu giả hoặc cảm biến thật.
4. Nếu dùng Wi-Fi: nhập mạng nhà bạn, IP laptop và mật khẩu MQTT ở trang Thiết bị của hệ thống.
5. Lưu và đợi board khởi động lại. Mật khẩu để trống giữ giá trị đã lưu.

Không nhập dữ liệu Wi-Fi cá nhân vào mã nguồn hoặc đưa `data/credentials.json` lên kho công khai. Khi kết nối Wi-Fi cấu hình, laptop có thể tạm mất Internet; dashboard localhost vẫn dùng được.

## Điện thoại và mạng LAN

Laptop và điện thoại cần cùng mạng. Dùng `http://IP-LAPTOP:8765`, không dùng localhost trên điện thoại. Đăng nhập bằng mã truy cập ở trang Thiết bị trên laptop. Windows có thể chặn kết nối từ LAN; chỉ cho phép ứng dụng/cổng 8765 và 1883 trong mạng Private nếu cần, không tắt firewall. Script không tự thay đổi firewall.

Web từ IP LAN dùng HTTP. Dữ liệu và mã truy cập chỉ dùng trong LAN tin cậy; không mở port forwarding ra Internet. Service worker/PWA chỉ hoạt động đầy đủ trên localhost hoặc HTTPS; bản web chạy từ IP LAN không được mặc định coi là ứng dụng Android/iOS đã cài.

## MQTT và API

Broker Aedes tích hợp dùng MQTT 3.1.1, TCP 1883. Không chạy Mosquitto đồng thời cùng cổng. Gói Mosquitto do bạn đưa được giữ trong `tools/mosquitto` như công cụ thay thế; chương trình của gói chưa được dùng làm dịch vụ chính.

| Topic | Hướng | Payload |
|---|---|---|
| `iot/<id>/telemetry` | Board → gateway | temperature, humidity, airQuality, light, motion, synthetic |
| `iot/<id>/command` | Gateway → board | fan, buzzer, led, commandId, ttlMs |
| `iot/<id>/state` | Board → gateway | fan, buzzer, led, buzzerLockout, commandId |
| `iot/<id>/availability` | Board/broker → gateway | online/offline |

Mỗi client phải có clientId trùng ID phòng. Username ESP32 là `esp32`, mật khẩu được sinh ngẫu nhiên ở lần chạy đầu. Client chỉ được gửi telemetry/state/availability của chính nó và nhận command của chính nó. Các lệnh không dùng retained để tránh kích hoạt lại lệnh cũ sau khi nối mạng.

API chính: `GET /api/status`, `/api/history`, `/api/export`, `/api/health`, `POST /api/settings`, `/api/simulator`, `/api/login`. Server-Sent Events ở `/api/events`. App từ LAN dùng header `Authorization: Bearer <mã truy cập>`. Dữ liệu lỗi trả HTTP 400 và không làm dừng server.

## Tài liệu và kiểm chứng

- `docs/LINH_KIEN_VA_DAU_NOI.md`: danh sách mua và GPIO dành cho C5.
- `docs/TIEU_CHI_VA_DEMO.md`: đối chiếu từng cột bảng chấm điểm.
- `docs/UNG_DUNG_KHACH.md`: chạy C#, Java, build Android và iOS.
- `docs/KIEM_THU.md`: kết quả thực tế, giới hạn và các bước kiểm tra còn lại.
- `firmware/room_monitor/room_monitor.ino`: firmware.
- `docs/CAU_HINH_WIFI.md`: cấu hình Wi-Fi và phân biệt IP laptop với IP AP.
- `.vscode/tasks.json`: mở hệ thống, kiểm thử, build và nạp từ VS Code.
- `tests/`: kiểm thử tự động; chạy `node --test tests/*.test.mjs`.

SQLite được dùng để có database chạy ngay, không cần SQL Server. Nếu giảng viên bắt buộc SQL Server theo bài 7, cần chuyển adapter lưu trữ; không gọi SQLite là SQL Server. Xác nhận yêu cầu này trước khi nộp.

## Khôi phục và sao lưu

Flash gốc board được lưu tại `data/backup/esp32-c5-original.bin` trước khi nạp thử. Không chia sẻ bản sao này công khai vì có thể chứa cấu hình cũ. Sao lưu thư mục `data` khi máy chủ đã dừng. Kho mã loại trừ dữ liệu, mật khẩu và bộ công cụ tải về.

Bộ biên dịch C5 dùng ổ ảo ngắn do giới hạn đường dẫn của toolchain trên Windows. `build-firmware.mjs` tự tạo lại mapping nếu cần; không lưu mã nguồn vào một ổ vật lý khác. Board khai báo Flash 16 MB, PSRAM enabled, USB CDC enabled; sơ đồ phân vùng dành 3 MB cho app và chưa dùng toàn bộ Flash 16 MB.
