# Linh kiện cho phòng ở thông minh

Bạn đã có ESP32-C5 N16R8. Bắt đầu làm một phòng trước; bổ sung ESP32 thứ hai khi cần nghiệm thu tiêu chí nhiều thiết bị thật.

| Linh kiện | Một phòng | Hai phòng | Yêu cầu chọn |
|---|---:|---:|---|
| ESP32-C5 N16R8 | 1 đã có | 2 tổng | Ưu tiên cùng dòng để dùng chung firmware/GPIO |
| DHT22 module | 1 | 2 | Hoạt động được với nguồn 3,3 V, có pull-up hoặc thêm 10 kΩ |
| LDR và điện trở 10 kΩ | 1 bộ | 2 bộ | Làm bộ chia áp ánh sáng 0–3,3 V |
| PIR HC-SR501 | 1 | 2 | Cấp nguồn theo module; kiểm tra mức OUT phù hợp GPIO 3,3 V |
| MQ135 module | 1 | 2 | Nguồn 5 V cho heater, analog qua bộ chia áp; dùng chỉ số tương đối |
| Điện trở chia áp MQ135 | 20 kΩ + 10 kΩ | 2 bộ | Không đưa analog 5 V trực tiếp vào ESP32 |
| Quạt DC 5 V | 1 | 2 | Chọn tải nhỏ, biết dòng định mức |
| Mạch MOSFET đóng cắt | 1 kênh | 2 kênh | Nhận mức điều khiển 3,3 V; đủ dòng quạt |
| Diode bảo vệ quạt | 1 nếu driver chưa có | 2 | Theo tải và mạch MOSFET, lắp ngược song song tải |
| Module còi active | 1 | 2 | Loại có driver và nhận tín hiệu logic 3,3 V |
| LED trắng và điện trở 220 Ω | 1 bộ | 2 bộ | Đèn demo; nâng cấp đèn tải lớn cần thêm driver |
| Nguồn DC 5 V | 1 | 1–2 | Dòng đủ tổng quạt, heater MQ135, board và các module, có dự phòng |
| Breadboard, dây jumper, cáp USB data | 1 bộ | 2 bộ | Đấu nối thử và nạp |

Đợt mua tối thiểu: DHT22, LDR + điện trở, PIR, LED + điện trở, breadboard/dây. Đợt bổ sung: MQ135 + chia áp, quạt + MOSFET, còi, nguồn. Để chứng minh hai nút thật, mua thêm một ESP32 và lắp bộ cảm biến thứ hai. Có thể thêm cửa từ để demo cảnh báo mở cửa; chức năng này chưa nằm trong firmware hiện tại.

## GPIO mặc định cho ESP32-C5

Đối chiếu nhãn IO trên board thực tế trước khi nối. Các số dưới đây là số GPIO, không phải số thứ tự chân trên hàng header.

| Tín hiệu | GPIO C5 | Đấu nối |
|---|---:|---|
| DHT22 DATA | 7 | VCC 3,3 V; GND chung; DATA kéo lên 3,3 V bằng 10 kΩ nếu module chưa có |
| MQ135 analog | 1 | AO → 20 kΩ → điểm ADC; điểm ADC → 10 kΩ → GND; heater/module theo nguồn yêu cầu |
| LDR analog | 3 | 3,3 V → LDR → điểm ADC → 10 kΩ → GND; sáng hơn cho điện áp cao hơn |
| PIR OUT | 10 | Kiểm tra OUT không quá mức GPIO cho phép; VCC theo thông số module |
| Quạt qua MOSFET | 4 | GPIO vào chân điều khiển driver; quạt cấp nguồn tải riêng |
| Còi module có driver | 5 | Tín hiệu HIGH bật; chọn module tương ứng |
| LED ngoài | 6 | GPIO → 220 Ω → anode LED; cathode → GND |
| RGB tích hợp C5 DevKit | 27 | Đã có trên board tương thích; firmware dùng RGB_BUILTIN |

Không dùng chân USB 13/14 cho cảm biến khi cần USB native. Dây ground chung giữa board và mạch điều khiển nguồn thấp áp; tránh cấp ngược hai nguồn vào chân 5 V của board. Không đấu tải điện lưới vào breadboard hoặc GPIO. Bản đồ án dùng quạt và đèn DC thấp áp.

## Hiệu chuẩn

LDR cho giá trị tương đối, không phải lux. MQ135 cần thời gian ổn định và hiệu chuẩn theo datasheet/module. Nhập ADC mức nền và ADC mức demo cao trong trang cấu hình. Firmware chuẩn hóa về 0–100, chỉ để so sánh và chạy quy tắc, không quy đổi ppm hay AQI. Không thử bằng đốt vật liệu hoặc xả khí trong phòng. Dùng kịch bản mô phỏng để chứng minh logic cảnh báo.

## Nguồn tham khảo

- [Espressif C5 DevKitC](https://documentation.espressif.com/api/resource/path/docs/projects/esp-dev-kits/en/latest/esp32c5/esp32-c5-devkitc-1/user_guide.html)
- [GPIO variant C5 Arduino 3.3.12](https://github.com/espressif/arduino-esp32/blob/3.3.12/variants/esp32c5/pins_arduino.h)
- [Adafruit DHT wiring](https://learn.adafruit.com/dht/connecting-to-a-dhtxx-sensor)
