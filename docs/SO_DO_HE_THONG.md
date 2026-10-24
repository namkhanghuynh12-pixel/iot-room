# Kiến trúc phòng ở thông minh

```mermaid
flowchart LR
  S1[Phòng ngủ<br/>DHT22 · LDR · PIR · MQ135] --> E1[ESP32-C5 số 01]
  S2[Phòng khách<br/>DHT22 · LDR · PIR · MQ135] --> E2[ESP32-C5 số 02]
  E1 <-->|Wi-Fi MQTT hoặc USB| G[Edge Gateway laptop]
  E2 <-->|Wi-Fi MQTT hoặc USB| G
  G <--> M[MQTT broker Aedes<br/>TCP 1883 + xác thực/ACL]
  M <--> B[Node.js<br/>Quy tắc tự động + HTTP 8765]
  B --> D[(SQLite<br/>Lịch sử và cấu hình)]
  B <--> W[Web tiếng Việt<br/>4 gauge · đồ thị · điều khiển]
  B <--> A[Android · iOS<br/>Java · CSharp]
  E1 --> O1[Quạt · đèn · còi]
  E2 --> O2[Quạt · đèn · còi]
```

Với đường Wi-Fi, ESP32 nối trực tiếp MQTT broker; gateway ứng dụng Node.js nhận topic và ghi SQLite/API. Với đường USB, chương trình gateway-usb chuyển JSON serial thành MQTT và chuyển command về board. Không bật cả hai đường cho cùng ID trong cùng thời điểm.

## Luồng đo và điều khiển

```mermaid
sequenceDiagram
  participant E as ESP32
  participant M as MQTT
  participant N as Node gateway
  participant D as SQLite
  participant W as Web/App
  E->>M: telemetry JSON mỗi 3 giây
  M->>N: Chuyển tiếp telemetry
  N->>D: INSERT có tham số
  N->>N: Kiểm tra ngưỡng và hysteresis
  N->>M: command JSON, commandId, không retained
  M->>E: fan / led / buzzer
  E->>M: state + commandId
  M->>N: Phản hồi đầu ra
  N-->>W: Trạng thái trực tiếp qua SSE / HTTP
  W->>N: Yêu cầu đổi chế độ hoặc điều khiển thủ công
```

## Cấu hình và phục hồi

ESP32 giữ AP cấu hình và web 192.168.4.1. Preferences/NVS lưu Wi-Fi, broker, ID, transport, demo/sensor và điểm hiệu chuẩn. Nếu router đổi hoặc thông tin sai, người dùng vào lại AP để sửa. Lệnh có thời hạn, còi giới hạn thời gian phát, mất gateway không duy trì đầu ra vô hạn.

Một bộ ESP32 hiện có chỉ chứng minh được một nút vật lý. Hai MQTT simulator chứng minh luồng nhiều node và tách dữ liệu; không thay thế minh chứng hai board thật.
