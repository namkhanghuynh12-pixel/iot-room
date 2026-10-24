# Ứng dụng khách

Các ứng dụng gọi cùng API Node.js, đọc trạng thái cảm biến và gửi lệnh qua gateway/MQTT. Tất cả app trên thiết bị khác phải dùng IP laptop và mã truy cập trong trang Thiết bị & kết nối. Chạy cùng mạng LAN.

## CSharp Windows

Mở `clients/csharp/PhongIoT.exe` khi máy chủ đã chạy. Chương trình là WinForms, có các nút quạt, đèn, còi và chế độ tự động. Có thể build lại bằng C# compiler của .NET Framework trên Windows; source `PhongIoT.cs`.

## Java Windows

Cần JDK 17 trở lên. `clients/java/PhongIoT.java` dùng Swing và java.net.http, không cần thư viện ngoài. Biên dịch `javac -encoding UTF-8 PhongIoT.java`, chạy `java PhongIoT`. Nếu đã có JDK portable trong tools/java, dùng file khởi động đi kèm sau khi build.

## Android

Source Android native Java tại `clients/android`. Có input IP/token, hai phòng, đọc năm đại lượng, điều khiển ba đầu ra và chọn tự động. Minimum Android 8/API 26. Không phải webview hay shortcut PWA.

Mở thư mục bằng Android Studio, dùng JDK 17, Android SDK 35, Gradle tương thích plugin 8.7.3 (Gradle 8.9), rồi Build APK. Bộ build gọn có thể dùng javac → d8 → aapt2 → zipalign → apksigner; xem script build nếu đã được tạo. APK debug chỉ để kiểm thử đồ án, không đăng cửa hàng.

Chưa có điện thoại Android kết nối thì mới xác nhận build/sign APK, không xác nhận đã chạy trên điện thoại. Khi cài, người dùng tự chọn cài ứng dụng của mình; ứng dụng chỉ yêu cầu mạng.

## iOS

Source SwiftUI tại `clients/ios/PhongIoT`, cấu hình XcodeGen `clients/ios/project.yml`. Trên máy Mac có Xcode và XcodeGen: chạy `xcodegen generate`, mở project sinh ra, chọn signing team và thiết bị/simulator, rồi Run. iOS 16 trở lên.

Cho phép quyền Local Network khi iOS hỏi để truy cập laptop. Cấu hình ATS cho HTTP phục vụ LAN demo; triển khai thật nên HTTPS và giới hạn cấu hình mạng. Bản source không phải IPA và không được tính là đã nghiệm thu iPhone khi chưa build/run.

## Web trên điện thoại

Trang web responsive dùng được trong trình duyệt Android/iOS khi LAN cho phép. PWA có manifest và service worker chỉ cache shell; API luôn lấy mạng và báo lỗi khi không có dữ liệu. Không dùng việc mở web trên iPhone để tự nhận rằng đã có app iOS native được kiểm thử.
