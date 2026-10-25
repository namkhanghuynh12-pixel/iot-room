# Giao diện triển khai Render

Dịch vụ iot-room.onrender.com hiện phục vụ mã trong thư mục này. Giao diện được viết/chỉnh tại `public/` ở thư mục gốc dự án.

Trước khi commit và đẩy thay đổi giao diện, chạy từ thư mục gốc:

```powershell
node sync-render-ui.mjs
node --test tests/render-ui.test.mjs
```

Commit cả `public/` và `CODE_DEPLOY_RENDER/public/`, sau đó push nhánh `main`. Bài kiểm tra đối chiếu sáu asset giúp phát hiện trường hợp GitHub đã có bản mới nhưng Render vẫn nhận thư mục giao diện cũ.

Backend trong thư mục này có cấu hình PORT/host dành cho Render, không sao chép đè từ backend laptop. Đồng bộ giao diện không đưa database, mật khẩu Wi-Fi/MQTT, cổng COM hay ESP32 thật lên Internet. Form USB chỉ hoạt động trên máy chủ laptop, không thể nạp board cắm vào laptop thông qua máy chủ Render.

Nếu dịch vụ không tự triển khai commit mới, mở Render Dashboard của dịch vụ và chọn Manual Deploy → Deploy latest commit. Sau khi deployment thành công, kiểm tra tiêu đề trang: `Trạm Chỉ Huy · Phòng IoT`.
