# Sơ đồ nguyên lý Phòng IoT

- `PhongIoT.kicad_sch`: ESP32, cảm biến, MOSFET, quạt 12 V–1 A, còi và LED.
- `Nguon12V.kicad_sch`: linh kiện rời cho nguồn SEPIC 12 V và buck 5 V. Hai trang độc lập; nhãn nguồn/GND cùng tên tương ứng khi đấu dây.
- `BOM.csv`: danh sách linh kiện theo reference.

## Trạng thái
Đây là sơ đồ để xem xét, chưa có PCB, chưa mô phỏng ổn định nguồn, chưa thử tải/nhiệt/khởi động quạt. Không phải bộ hồ sơ đặt sản xuất. Các chân ESP32 được ghi theo số GPIO logic, không phải vị trí chân trên hàng header. Chưa xác định chính xác phiên bản DevKit C5 N16R8 của người dùng. Các chân cuộn cảm ghép phải đối chiếu datasheet của mã linh kiện mua thật; dòng 5 A là yêu cầu chọn linh kiện, chưa chốt mã hàng.

## Cách đọc
Nhãn net cùng tên trên cùng một trang được nối điện với nhau. D1/D2/D4/D5/D6: chân 1 là K (cathode), chân 2 là A (anode). Q1/Q2 AO3400A: G=1, S=2, D=3. Quạt nối J4 (+12V_REG, FAN_MINUS), không nối trực tiếp GPIO. JP1 phải tháo khi cấp nguồn USB; chỉ đóng khi cấp nguồn ngoài và đã ngắt USB. MQ135 module cấp 5 V, AO qua R2/R3 còn 1/3 điện áp trước khi vào GPIO1. LDR sáng làm ADC tăng. HC-SR501 cần kiểm tra OUT 3,3 V. DHT22 là cảm biến 4 chân trần, không phải thứ tự chân của mọi module 3 chân. Chân đầu cắm cảm biến phải đọc theo nhãn, không dựa màu dây.

## Nguồn 12 V
Chọn TPS55340PWP cấu hình SEPIC thay cho TPS552872 được cân nhắc ban đầu; nguồn dùng đúng bộ tham số SEPIC 12 V/1 A trong datasheet TI, chuyển sang package HTSSOP với pinout tương ứng. Không hiểu '5 A' của IC là dòng ra 5 A. Mạch tham chiếu chỉ định 1 A đầu ra, bằng dòng định mức quạt; cần đo dòng khởi động của quạt và đánh giá lại cuộn cảm/diode/IC trước khi kết luận dùng được thực tế. Nhánh 5 V lấy từ VIN_PROT để không tăng tải nhánh quạt. Vout danh định = 1,229 × (1 + (86,6k + 49,9)/10k) ≈ 11,88 V; dung sai linh kiện/reference ảnh hưởng kết quả. Đây là điện áp danh định khoảng 12 V, không phải đúng tuyệt đối 12,000 V.

## Lắp thử ngày mai
Có thể mua DHT22, MQ135 module, HC-SR501, LDR, điện trở, LED, AO3400A trên breakout, diode 1N5822, quạt 12 V 1 A, adapter 12 V có ổn áp ≥3 A, dây và breadboard để thử phần cảm biến/điều khiển. Dùng nguồn 5 V ổn áp riêng hoặc USB cho ESP32 trong lần thử đầu, nối GND chung. Nguồn SEPIC 500 kHz dùng IC SMD, cuộn cảm ghép và layout công suất ngắn; không ráp khối này trên breadboard. Linh kiện nguồn rời cần chốt mã hàng sau khi kiểm tra thiết kế, chưa nên mua theo giá trị chung trong BOM.

## Nguồn tham khảo
- https://www.ti.com/lit/ds/symlink/tps55340.pdf (SEPIC Fig. 8-10 và pinout PWP)
- https://www.ti.com/lit/an/slva516a/slva516a.pdf
- https://www.ti.com/lit/ds/symlink/lm2596.pdf
- https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c5/esp32-c5-devkitc-1/user_guide.html
- https://www.aosmd.com/products/mosfets/low-voltage-mosfets-12v-30v/ao3400a
