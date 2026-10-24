using System;
using System.Collections.Generic;
using System.Drawing;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class PhongIoT : Form {
    TextBox server = new TextBox(), token = new TextBox();
    Label values = new Label(), status = new Label();
    ComboBox room = new ComboBox();
    Button fan = new Button(), lamp = new Button(), buzzer = new Button();
    readonly HttpClient http = new HttpClient(new HttpClientHandler { UseProxy=false });
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    Dictionary<string,object> current;
    bool busy;
    public PhongIoT(){
        Text="Phòng IoT — C# Desktop"; Width=710; Height=580; Font=new Font("Segoe UI",11); BackColor=Color.FromArgb(245,248,243);
        var layout=new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.TopDown, WrapContents=false, Padding=new Padding(24), AutoScroll=true }; Controls.Add(layout);
        layout.Controls.Add(new Label { Text="PHÒNG Ở THÔNG MINH",Font=new Font("Segoe UI",20,FontStyle.Bold),AutoSize=true });
        server.Text="http://localhost:8765"; server.Width=600;layout.Controls.Add(new Label {Text="Địa chỉ máy chủ",AutoSize=true});layout.Controls.Add(server);
        token.Width=600;token.UseSystemPasswordChar=true;layout.Controls.Add(new Label {Text="Mã truy cập (để trống khi chạy trên laptop máy chủ)",AutoSize=true});layout.Controls.Add(token);
        room.Items.AddRange(new object[]{"Phòng ngủ / 01","Phòng khách / 02"});room.SelectedIndex=0;room.Width=600;layout.Controls.Add(room);
        var connect=new Button {Text="Kết nối / Chọn phòng",Width=240,Height=36};connect.Click+=async delegate {await Post(new {hardwareId=room.SelectedIndex==0?"esp32-room-01":"esp32-room-02"});};layout.Controls.Add(connect);
        values.Width=610;values.Height=100;values.Font=new Font("Segoe UI",14);layout.Controls.Add(values);
        status.Width=610;status.Height=36;layout.Controls.Add(status);
        var buttons=new FlowLayoutPanel {Width=620,Height=50};layout.Controls.Add(buttons);
        fan.Text="Quạt";lamp.Text="Đèn";buzzer.Text="Còi";
        foreach(var b in new[]{fan,lamp,buzzer}){b.Width=130;b.Height=38;buttons.Controls.Add(b);}
        fan.Click+=async delegate {await Post(new {mode="manual",manualFan=!GetBool("fan")});};
        lamp.Click+=async delegate {await Post(new {mode="manual",led=!GetBool("led")});};
        buzzer.Click+=async delegate {await Post(new {mode="manual",manualBuzzer=!GetBool("buzzer")});};
        var auto=new Button {Text="Bật tự động",Width=200,Height=38};auto.Click+=async delegate {await Post(new {mode="auto"});};layout.Controls.Add(auto);
        var timer=new Timer {Interval=2000};timer.Tick+=async delegate {await RefreshData();};timer.Start();Shown+=async delegate {await RefreshData();};
        FormClosed+=delegate {timer.Stop();http.Dispose();};http.Timeout=TimeSpan.FromSeconds(5);
    }
    bool GetBool(string key){return current!=null&&current.ContainsKey(key)&&current[key] is bool&&(bool)current[key];}
    HttpRequestMessage Request(string path,HttpMethod method){var r=new HttpRequestMessage(method,server.Text.TrimEnd('/')+path);if(token.Text.Trim().Length>0)r.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token.Text.Trim());return r;}
    async Task Post(object payload){try{var req=Request("/api/settings",HttpMethod.Post);req.Content=new StringContent(json.Serialize(payload),Encoding.UTF8,"application/json");var res=await http.SendAsync(req);res.EnsureSuccessStatusCode();await RefreshData();}catch(Exception e){status.Text=e.Message;}}
    async Task RefreshData(){if(busy)return;busy=true;try{var res=await http.SendAsync(Request("/api/status",HttpMethod.Get));res.EnsureSuccessStatusCode();var p=json.Deserialize<Dictionary<string,object>>(await res.Content.ReadAsStringAsync());current=(Dictionary<string,object>)p["device"];values.Text=String.Format("{0}\nNhiệt độ {1} °C  ·  Độ ẩm {2}%\nÁnh sáng {3}%  ·  Khí tương đối {4}",current["id"],current["temperature"],current["humidity"],current["light"],current["airQuality"]);var online=GetBool("online");status.Text=online?"Thiết bị trực tuyến — phản hồi thực tế từ MQTT":"Thiết bị ngoại tuyến";fan.Enabled=lamp.Enabled=buzzer.Enabled=online;fan.Text="Quạt: "+(GetBool("fan")?"BẬT":"TẮT");lamp.Text="Đèn: "+(GetBool("led")?"BẬT":"TẮT");buzzer.Text="Còi: "+(GetBool("buzzer")?"BẬT":"TẮT");}catch(Exception e){status.Text="Không kết nối: "+e.Message;fan.Enabled=lamp.Enabled=buzzer.Enabled=false;}finally{busy=false;}}
    [STAThread]public static void Main(string[] args){
        if(args.Length>0&&args[0]=="--check"){using(var c=new HttpClient(new HttpClientHandler {UseProxy=false})){Console.WriteLine(c.GetStringAsync("http://localhost:8765/api/health").Result);}return;}
        Application.EnableVisualStyles();Application.Run(new PhongIoT());
    }
}
