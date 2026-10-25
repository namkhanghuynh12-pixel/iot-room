# Nạp firmware từ web anime

Mở http://localhost:8765 → Thiết bị & Kết nối → Nạp firmware ESP32 qua USB.

1. Cắm cáp USB truyền dữ liệu, bấm Quét cổng COM và chọn đúng board.
2. Chọn Phòng 01 hoặc Phòng 02. Dùng ID khác nhau khi chạy hai board.
3. Chọn sao lưu vùng sẽ ghi (mặc định) hoặc toàn bộ Flash, rồi bấm Sao lưu & Nạp code đồ án. Giữ nguyên cáp và không tắt máy chủ trong quá trình chạy.
4. Web tự đóng gateway tương thích đang giữ đúng cổng, nhận diện chip/Flash/MAC, biên dịch, xác định vùng ghi từ flash_args, sao lưu, kiểm tra lại MAC, nạp rồi mở gateway USB. Thành công chỉ khi nhận dữ liệu mới và ACK đầu ra tắt từ board.

Trong lúc nạp, điều khiển/cấu hình Wi-Fi và thao tác tắt máy chủ qua API bị khóa. Không có thanh phần trăm tổng giả; tiến trình sao lưu lấy từ số byte đã đọc đủ và kiểm tra, tiến trình ghi Flash lấy trực tiếp từ esptool. Đọc Flash từng phần tối đa 256 KB, tự giảm tới 64 KB khi cần để tránh ngắt truyền khi đọc lớn trên USB; đối chiếu MAC từng phần, chỉ công nhận backup khi đủ dung lượng và có SHA256. Đóng/mở lại tab vẫn xem được phiên nạp đang chạy. Nhật ký dùng textContent.

Hỗ trợ hiện tại: ESP32-C5 Flash 4/8/16 MB; PSRAM tắt vì code không cần. Board khác bị dừng trước khi ghi. Mã nguồn luôn là firmware/room_monitor trong dự án, không cho tải lên/chọn tệp tùy ý từ API. Mọi tệp build/backup/trạng thái job lưu trong data/ (không đẩy Git). Sau nạp, gateway chuyển board sang USB và ID đã chọn, giữ các thông số Wi-Fi đã lưu. Quạt/đèn/còi tắt, web ở chế độ Thủ công.

Chỉ thực hiện từ localhost/127.0.0.1 trên laptop; không nhận lệnh nạp từ Render, địa chỉ LAN hoặc host giả. Render chỉ hướng dẫn mở local. Các endpoint mới: GET /api/firmware/status, GET /api/firmware/ports, POST /api/firmware/flash với {port,deviceId,backupMode}, backupMode là affected hoặc full. Các API/SSE/MQTT cũ giữ nguyên.

Nếu báo bận cổng: đóng Serial Monitor, Arduino IDE hoặc gateway cũ không hỗ trợ tự nhả cổng. Khi Connecting không vào được bootloader: giữ BOOT, nhấn rồi thả RESET, thả BOOT và thử lại. Nếu đọc Flash bị ngắt, công cụ nhận diện lại board và giảm kích thước phần đọc và chỉ ghi khi bản sao lưu đủ dung lượng. Không khẳng định quạt/cảm biến vật lý hoạt động chỉ từ ACK; cần lắp linh kiện đúng sơ đồ và kiểm tra thực tế.

Chế độ affected sao lưu liên tục từ địa chỉ 0 đến hết sector chứa mọi tệp sẽ ghi, bao gồm NVS; đây không phải bản sao toàn bộ Flash. Chế độ full yêu cầu đọc đủ toàn bộ Flash. Cả hai đều dừng trước khi ghi nếu sao lưu không đủ. Công cụ nạp đúng các đoạn trong flash_args, không xóa toàn bộ Flash; vùng ngoài phạm vi ghi được giữ nguyên.

