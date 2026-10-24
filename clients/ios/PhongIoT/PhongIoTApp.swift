import SwiftUI

@MainActor final class RoomModel: ObservableObject {
    @Published var server = "http://192.168.1.100:8765"
    @Published var token = ""
    @Published var values = "Nhập IP laptop và mã truy cập"
    @Published var error = ""
    @Published var connected = false
    private var fetching = false
    func request(_ body: [String: Any]? = nil) async {
        guard !fetching else { return }; fetching = true; defer { fetching = false }
        do {
            let base = server.hasSuffix("/") ? String(server.dropLast()) : server
            guard let url = URL(string: base + (body == nil ? "/api/status" : "/api/settings")), ["http","https"].contains(url.scheme ?? "") else { throw URLError(.badURL) }
            var req = URLRequest(url: url); req.timeoutInterval = 5
            req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            if let body { req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.httpBody = try JSONSerialization.data(withJSONObject: body) }
            let (data, response) = try await URLSession.shared.data(for: req)
            let p = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw NSError(domain: "IoT", code: 1, userInfo: [NSLocalizedDescriptionKey: p["error"] as? String ?? "Không kết nối được"]) }
            if let d = p["device"] as? [String: Any] {
                values = "\(d["id"] ?? "")\n\nNhiệt độ: \(d["temperature"] ?? "--") °C\nĐộ ẩm: \(d["humidity"] ?? "--") %\nÁnh sáng: \(d["light"] ?? "--") %\nKhí tương đối: \(d["airQuality"] ?? "--")\nPIR: \(d["motion"] ?? "--")\n\nQuạt: \(d["fan"] ?? false)\nĐèn: \(d["led"] ?? false)\nCòi: \(d["buzzer"] ?? false)"
                error = (d["online"] as? Bool ?? false) ? "Trực tuyến" : "Ngoại tuyến"
            }
        } catch { self.error = error.localizedDescription }
    }
}
@main struct PhongIoTApp: App { var body: some Scene { WindowGroup { RoomView() } } }
@MainActor struct RoomView: View {
    @StateObject var model = RoomModel()
    var body: some View {
        NavigationStack { Form {
            Section("Máy chủ trong mạng nội bộ") {
                TextField("http://IP-LAPTOP:8765", text: $model.server).textInputAutocapitalization(.never).keyboardType(.URL)
                SecureField("Mã truy cập", text: $model.token)
                Button("Kết nối") { model.connected = true; Task { await model.request() } }
                Text(model.error).font(.caption)
            }
            Section("Dữ liệu cảm biến") { Text(model.values).monospacedDigit() }
            Section("Chọn phòng") {
                Button("Phòng ngủ") { send(["hardwareId":"esp32-room-01"]) }
                Button("Phòng khách") { send(["hardwareId":"esp32-room-02"]) }
            }
            Section("Điều khiển") {
                Button("Tự động") { send(["mode":"auto"]) }
                ForEach(["manualFan","led","manualBuzzer"], id: \.self) { key in
                    HStack {
                        Text(key == "manualFan" ? "Quạt" : key == "led" ? "Đèn" : "Còi")
                        Spacer()
                        Button("Bật") { send(["mode":"manual", key:true]) }.buttonStyle(.bordered)
                        Button("Tắt") { send(["mode":"manual", key:false]) }.buttonStyle(.bordered)
                    }
                }
            }
        }.navigationTitle("Phòng IoT") }.task { while !Task.isCancelled { if model.connected { await model.request() }; try? await Task.sleep(nanoseconds: 2_000_000_000) } }
    }
    func send(_ data: [String:Any]) { Task { await model.request(data) } }
}
