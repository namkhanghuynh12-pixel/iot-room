# Phòng IoT — giao diện anime

## Đã thực hiện

- Nền từ video người dùng cung cấp: `public/bg.mp4`, H.264, 1280×720, 30 fps, 37,15 giây, không audio, 4.354.012 byte (<5 MB); `public/poster.jpg` 1280×720. Bản gốc không bị sửa.
- Video fixed / cover / object-position 30% center (mobile 37%) và khoảng trống ở bên trái phần giới thiệu để thấy nhân vật. Veil đổi theo theme; thẻ có nền đủ đậm/sáng, viền 2px, bóng cứng, hover nâng lên. Font hệ thống, không CDN.
- Dark mặc định; đổi sáng/tối tức thì, lưu tùy chọn trên trình duyệt. Hiệu ứng Đầy đủ / Giảm / Tắt. Video dừng khi tab ẩn, Giảm/Tắt hoặc reduced-motion; sau tối thiểu 60 khung hình, tỷ lệ rơi >30% trong cửa sổ kiểm tra 5 giây tự chuyển sang Giảm.
- Ba đồng hồ số đo (nhiệt độ, độ ẩm, ánh sáng) và một đồng hồ/radar PIR dạng trạng thái, không phải phép đo liên tục. Vùng màu tính bằng tọa độ cung theo cấu hình `settings` thật. Mặc định nhiệt độ 28/30 °C, ánh sáng 25/40%; độ ẩm cảnh báo ở `humidityAlert` (mặc định 80%).
- Biểu đồ hai trục (100 điểm mới nhất), nhật ký, lịch sử phân trang dữ liệu tải được và CSV qua API cũ. PIR lịch sử đọc đúng cả boolean và số SQLite 0/1.
- Lệnh: Đang gửi → Chờ ACK mã lệnh → xác nhận khi khớp device ID, `lastCommand`, `acknowledged` và trạng thái đầu ra. Một lệnh giao diện tại một thời điểm; báo lỗi sau 3 giây kể từ khi gửi. Auto/ngoại tuyến/mất SSE khóa điều khiển. Hoạt ảnh quạt/đèn/còi chỉ theo trạng thái thật đã nhận.
- Giữ toàn bộ API, topic MQTT và tên JSON. `commandId` không do frontend tự tạo; lấy từ `device.lastCommand` của snapshot trả về sau POST `/api/settings`. Đăng nhập mã truy cập giữ nguyên endpoint `/api/login` và session cookie.
- Không inline script/style do ứng dụng tạo, không dùng innerHTML. Service worker lưu asset bao gồm video/poster; API/lệnh không cache. Không có Internet vẫn dùng được qua Node.js nội bộ; nếu máy chủ mất kết nối, chỉ xem giao diện đã cache, điều khiển bị khóa.

## Thay đổi máy chủ cần thiết (đã áp dụng ở cả hai server.mjs)

- Allowlist tĩnh thêm `/bg.mp4`, `/poster.jpg`, `/ui-state.js`.
- MIME `video/mp4`, `image/jpeg`; CSP thêm `media-src 'self'`.
- Video có `Accept-Ranges: bytes`, `Content-Length`, Range → 206 + `Content-Range`, range không hợp lệ → 416. Service worker cũng trả Range khi xem asset đã cache mà mất mạng.
- Đồng bộ cả 9 asset sang `CODE_DEPLOY_RENDER/public` bằng `node sync-render-ui.mjs` trước khi đẩy Git. Giữ backend cloud riêng.

## Giới hạn và phần không thêm

- Đã bỏ đo khí theo yêu cầu trước: không phục hồi MQ135 hay dùng ngưỡng legacy 55/70 như số đo mới. Backend vẫn giữ các trường legacy để tương thích, giá trị đo khí chuẩn hóa null. Độ ẩm không bị gán ngưỡng khí 55/70.
- Không thêm nút lọc lịch sử theo ngày phía máy chủ, lịch hẹn hay admin/viewer vì backend chưa có. Phân trang phía trình duyệt dùng tối đa 1000 bản ghi API hiện trả; CSV vẫn theo giới hạn backend.
- Kiểm thử tự động: `node --test tests/*.test.mjs`. Kiểm tra trên trình duyệt với MQTT mô phỏng, kể cả ACK cố tình sai mã; chưa chứng minh cảm biến/quạt vật lý hay mọi cấu hình thiết bị di động. Nhánh tự giảm khung hình được kiểm thử bằng số liệu tổng/rơi trong hàm thuần, chưa ép GPU thật rơi khung hình.
- Màu chữ chính/phụ sử dụng các token tương phản trên nền thẻ gần đục; việc thẩm định WCAG toàn diện với mọi khung video, thiết bị và công nghệ hỗ trợ chưa thực hiện.

Không đẩy `data/`, thông tin đăng nhập hay `local_defaults.h` lên Git.
