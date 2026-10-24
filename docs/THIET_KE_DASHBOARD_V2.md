# Bước 1 — Thiết kế dashboard Phòng IoT

Trạng thái: đề xuất bố cục để người dùng duyệt, chưa triển khai giao diện mới. Đã bỏ toàn bộ tưới cây, nhà kính, bơm nước và độ ẩm đất. Chưa khởi động lại máy chủ hay kết nối ESP32.

## Phạm vi đồ án

- ESP32-C5 N16R8; máy chủ Node.js trên laptop; broker Aedes; MQTT hai chiều; SQLite.
- DHT22: nhiệt độ và độ ẩm không khí. LDR: ánh sáng tương đối (%), không ghi lux khi chưa hiệu chuẩn. MQ135: chỉ số khí tương đối 0–100, không ghi ppm/AQI. PIR: có/không chuyển động.
- Ba đầu ra phù hợp firmware hiện tại: quạt DC 12 V–1 A qua MOSFET/header nguồn; đèn LED demo; còi active qua driver.
- Không tạo đầu ra thứ tư giả để đáp ứng số lượng trong văn bản mẫu. Đầu ra thứ tư chỉ bổ sung nếu người dùng chọn thêm phần cứng và kiểm tra GPIO/driver.
- Hai phòng trên phần mềm; hiện chỉ có một ESP32 vật lý. Demo hai node phải được ghi rõ là mô phỏng.
- Việc làm dashboard không thay đổi thiết kế nguồn công suất hoặc chứng minh phần cứng đã hoạt động.

## Bố cục desktop

```text
┌ Sidebar ──────┬────────────────────────────────────────────────────────┐
│ PHÒNG IoT    │ Phòng ở thông minh | Broker | Chọn phòng | Sáng/tối | Tôi│
│              ├────────────────────────────────────────────────────────┤
│ Tổng quan    │ Nhãn nguồn: DEMO / ESP32 thật – cảm biến giả / cảm biến │
│ Thiết bị     │ thật. Trạng thái online và thời điểm cập nhật cuối.      │
│ Lịch sử      ├─────────────┬─────────────┬─────────────┬───────────────┤
│ Tự động hóa  │ Nhiệt độ    │ Độ ẩm KK    │ Ánh sáng    │ Chỉ số khí    │
│ Cấu hình     │ KPI + gauge│ KPI + gauge │ KPI + gauge │ KPI + gauge   │
│              ├─────────────┴─────────────┴─────────────┴───────────────┤
│              │ PIR: có/không chuyển động | Auto / Manual               │
│              ├─────────────────────────────────┬──────────────────────┤
│              │ Biểu đồ realtime 100 điểm       │ Quạt 12 V / Đèn / Còi│
│              │ Chú thích, tooltip, ẩn/hiện nét  │ ON/OFF, gửi, ACK/lỗi │
│              ├─────────────────────────────────┴──────────────────────┤
│              │ Kịch bản demo | Điều chỉnh giá trị cảm biến            │
│              │ Nhật ký: thời gian, người, phòng, thao tác, kết quả      │
└──────────────┴────────────────────────────────────────────────────────┘
```

Tablet: hai cột; điện thoại: một cột, điều hướng dưới gồm Tổng quan, Thiết bị, Lịch sử và Thêm. Các nút/công tắc có vùng chạm ít nhất 44 px. Không ép bốn gauge vào cùng một hàng trên điện thoại.

## Nhận diện giao diện

- Font: Inter nếu có tệp font local; dự phòng Segoe UI/system-ui. Giao diện không phụ thuộc Internet để tải font/icon.
- Card bo góc 20 px; khoảng cách 20–24 px; đổ bóng nhẹ; thanh điều hướng có nền mờ vừa phải.
- Mặc định theo giao diện hệ thống; lưu lựa chọn sáng/tối trong localStorage. Chỉ lưu tùy chọn UI, không lưu mật khẩu/token đăng nhập ở đó.
- Màu trạng thái đi cùng chữ/icon, không dựa vào màu duy nhất. Kiểm tra tương phản khi triển khai.

| CSS variable | Light | Dark |
|---|---|---|
| --bg | #F4F6FB | #0B1020 |
| --surface | #FFFFFF | #151D30 |
| --text | #172033 | #F1F5FC |
| --muted | #526078 | #AFBED4 |
| --primary | #4F46E5 | #A5B4FC |
| --ok | #147D45 | #4ADE80 |
| --warning | #8A5700 | #FACC15 |
| --danger | #B42335 | #FDA4AF |
| --offline | #64748B | #94A3B8 |

Chuyển động 200–300 ms; số tăng/giảm có nội suy; gauge chuyển kim mượt; tôn trọng prefers-reduced-motion. Skeleton chỉ xuất hiện lúc đang tải; sau lỗi phải ghi rõ mất kết nối/dữ liệu cũ.

## Các trang

1. **Đăng nhập:** tài khoản admin/viewer; hiện/ẩn mật khẩu; thông báo lỗi. JWT phải được kiểm tra tại server trên mọi API cần quyền. Viewer không được điều khiển/cấu hình dù gọi API trực tiếp. Không hardcode tài khoản hay mật khẩu mặc định công khai; hướng dẫn tạo tài khoản ban đầu tại máy chủ.
2. **Tổng quan:** bốn KPI/gauge, PIR, đồ thị 100 điểm, ba điều khiển thực, trạng thái ACK theo commandId và lỗi quá 3 giây. Không đổi trạng thái thực tế sang ON khi chỉ mới bấm nút. Còi vẫn có giới hạn 10 giây theo firmware.
3. **Thiết bị:** hai phòng; ID, online/LWT/heartbeat, cập nhật cuối, tên và phòng tùy chỉnh. RSSI/firmware chỉ hiện khi board thực sự gửi, nếu thiếu ghi “Chưa có dữ liệu”. Phát hiện node mới không tự cấp quyền MQTT: vẫn cần đăng ký/provision từ admin. Xóa thiết bị không mặc định xóa lịch sử.
4. **Lịch sử:** lọc phòng, chỉ số, 1 giờ/24 giờ/7 ngày/tùy chọn; phân trang bảng; chọn vùng biểu đồ; CSV khớp bộ lọc. Backend truy vấn SQLite theo khoảng thời gian và giới hạn số hàng.
5. **Tự động hóa:** NẾU–THÌ theo khả năng firmware. Mẫu: nóng bật quạt; tối và có chuyển động bật đèn; khí cao bật còi; độ ẩm không khí cao tạo cảnh báo. Mẫu thứ tư là cảnh báo, không giả thành điều khiển máy hút ẩm khi chưa có thiết bị. Có hysteresis, bật/tắt từng luật, lịch giờ và xử lý xung đột; Manual ưu tiên thao tác người dùng, watchdog vẫn giữ hiệu lực. Mặc định Asia/Bangkok.
6. **Cấu hình:** tài khoản/role, ngưỡng, tên phòng, kết nối, hướng dẫn ESP32 AP 192.168.4.1 và cấu hình qua USB. Broker tích hợp dùng host/cổng của laptop; chuyển sang Mosquitto là lựa chọn backend có validation/restart, không phải chỉ đổi một ô mà coi như đã kết nối được. Không hiển thị mật khẩu MQTT cho viewer.
7. **Cảnh báo:** toast, chuông đếm cảnh báo chưa đọc và nhật ký trong app. Telegram/email để tùy chọn chưa cấu hình; không gửi thông báo ra ngoài khi chưa có yêu cầu và cấu hình của người dùng.

## Giao tiếp và tương thích

Giữ topic đang dùng để không làm hỏng firmware/app hiện có:

```text
iot/{deviceId}/telemetry     ESP32 -> server: dữ liệu cảm biến
iot/{deviceId}/command       server -> ESP32: lệnh + commandId + ttlMs
iot/{deviceId}/state         ESP32 -> server: trạng thái thực + commandId ACK
iot/{deviceId}/availability  online/offline; LWT
```

Không tự đổi `/command` thành `/cmd`, `temperature` thành `temp`, hoặc `light` thành `lux`. Nếu thêm schema/version thì có bộ chuyển đổi tương thích và validation. Dữ liệu khí/ánh sáng tiếp tục dùng đúng đơn vị tương đối. API lịch sử cũ và native clients cần được kiểm tra sau migration.

Giữ nền tảng Node HTTP + Aedes + MQTT.js + SQLite đang hoạt động. Realtime web hiện dùng SSE một chiều nhận trạng thái và HTTP POST gửi lệnh; kiến trúc này đáp ứng cập nhật hai chiều ở mức ứng dụng, không phải WebSocket. Không thêm Express/Socket.IO chỉ để đổi tên công nghệ; nếu bắt buộc theo đề môn học thì đánh giá chuyển đổi ở bước 2 trước khi sửa. Chart.js có thể dùng cho đồ thị tương tác, gauge có thể giữ Canvas/SVG; chọn và khóa phiên bản thật khi cài, đóng gói asset local. Không khẳng định thư viện đã được cài khi mới đề xuất.

## Cấu trúc dự kiến

```text
iot-room/
  server.mjs                  # entry point hiện tại
  logic.mjs                   # validation/hysteresis dùng chung
  simulator.mjs               # node demo qua MQTT thật
  gateway-usb.mjs              # giữ gateway hiện có
  routes/                     # auth, devices, history, rules, settings
  models/                     # SQLite, users, migration
  services/                   # MQTT, lịch tự động, ACK, audit
  public/
    index.html
    css/                      # token/theme, layout, components
    js/                       # API, realtime, charts, trang/chức năng
    vendor/                   # chart/icon/font local, khóa phiên bản
  firmware/room_monitor/      # sửa có kiểm soát nếu cần thêm telemetry
  data/                       # database/secret; không công khai/đưa vào ZIP
  tests/                      # auth/role, migration, MQTT, ACK, lịch sử
  docs/
  .env.example                # chỉ tên biến và giá trị mẫu không bí mật
```

Không đổi `.mjs` thành `.js` chỉ vì ví dụ trong yêu cầu. Ghi phiên bản runtime/dependency từ package/lockfile thực tế trong hướng dẫn bàn giao; chưa cập nhật dependency ở bước thiết kế.

## Lộ trình theo tài liệu người dùng

1. Duyệt bố cục, phạm vi phòng ở và nhận diện giao diện (tài liệu này).
2. Backend, broker, demo, migration và quyền truy cập; kiểm tra riêng, giữ dữ liệu hiện có.
3. Dashboard: KPI/gauge/chart/điều khiển/ACK.
4. Các trang thiết bị, lịch sử, tự động hóa, cấu hình và đăng nhập.
5. Dark/light, responsive, animation và kiểm tra hiển thị.
6. Kiểm thử, hướng dẫn chạy và xử lý lỗi. Phân biệt rõ mô phỏng, phần cứng thật và phần chưa nghiệm thu.

Theo mục 7 của văn bản đã gửi, dừng sau mỗi bước để người dùng xác nhận. Việc duyệt bước 1 không được coi là cho phép nạp lại ESP32 hoặc bật kết nối thật sau yêu cầu ngắt kết nối trước đó.
