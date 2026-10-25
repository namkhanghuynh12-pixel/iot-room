#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <MQTT.h>
#include <ArduinoJson.h>
#include <DHT.h>
#if __has_include("local_defaults.h")
#include "local_defaults.h"
#endif
#ifndef DEFAULT_BROKER
#define DEFAULT_BROKER ""
#define DEFAULT_MQTT_PASS ""
#endif

// ESP32-C5: confirm header labels before connecting external components.
#if CONFIG_IDF_TARGET_ESP32
const int DHT_PIN=27, AIR_PIN=32, LIGHT_PIN=33, FAN_PIN=25, BUZZER_PIN=26, LAMP_PIN=4, MOTION_PIN=14;
#else
const int DHT_PIN=7, AIR_PIN=1, LIGHT_PIN=3, FAN_PIN=4, BUZZER_PIN=5, LAMP_PIN=6, MOTION_PIN=10;
#endif
const uint32_t BUZZER_LIMIT=10000, COMMAND_TTL=30000;
Preferences prefs;
WebServer web(80);
WiFiClient net;
MQTTClient mqtt(1024);
String pendingCommand;
DHT dht(DHT_PIN,DHT22);
String wifiSsid,wifiPass,brokerHost,mqttPass,deviceId="esp32-room-01",transport="usb",csrf,serialLine;
bool demo=true,fan=false,buzzer=false,lamp=false,buzzerLockout=false,wasConnected=false,wasWifi=false;
int brokerPort=1883,cleanRaw=1000,alertRaw=3000;
uint32_t lastPublish=0,lastWifiTry=0,lastMqttTry=0,lastCommand=0,buzzerStarted=0,bootPress=0;
String prefix(){return "iot/"+deviceId;}
void setOutputs(){
  digitalWrite(FAN_PIN,fan?HIGH:LOW); digitalWrite(BUZZER_PIN,buzzer?HIGH:LOW); digitalWrite(LAMP_PIN,lamp?HIGH:LOW);
  #ifdef RGB_BUILTIN
  rgbLedWrite(RGB_BUILTIN,lamp?24:0,fan?20:0,buzzer?24:0);
  #endif
}
void emit(JsonDocument &doc,const char* kind,bool retain=false){
  doc["type"]=kind;doc["deviceId"]=deviceId;
  String payload;serializeJson(doc,payload);
  if(transport=="wifi"){if(mqtt.connected())mqtt.publish(prefix()+"/"+kind,payload,retain,1);}else Serial.println(payload);
}
void state(const String &id=""){
  JsonDocument doc;doc["fan"]=fan;doc["buzzer"]=buzzer;doc["led"]=lamp;doc["buzzerLockout"]=buzzerLockout;if(id.length())doc["commandId"]=id;
  emit(doc,"state",true);
}
void stopOutputs(){fan=false;buzzer=false;lamp=false;setOutputs();state();}
// USB gateway may select its transport without erasing saved Wi-Fi credentials.
bool configureUsb(const String &payload){
  JsonDocument doc;if(deserializeJson(doc,payload)||doc["type"]!="configureUsb")return false;
  String id=doc["deviceId"]|"";
  JsonDocument ack;ack["type"]="usbConfigAck";
  bool valid=id=="esp32-room-01"||id=="esp32-room-02";ack["ok"]=valid;
  if(valid){
    if(mqtt.connected()){mqtt.publish(prefix()+"/availability","offline",true,1);mqtt.disconnect();}
    WiFi.disconnect(false,false);
    deviceId=id;transport="usb";wasConnected=false;wasWifi=false;
    prefs.begin("phongiot",false);prefs.putString("transport","usb");prefs.putString("id",id);prefs.end();
    stopOutputs();ack["deviceId"]=deviceId;
  }
  serializeJson(ack,Serial);Serial.println();return true;
}
bool provision(const String &payload){
  JsonDocument doc;if(deserializeJson(doc,payload)||doc["type"]!="provision")return false;
  String ssid=doc["ssid"]|"",pass=doc["password"]|"",host=doc["broker"]|"",mpass=doc["mqttPassword"]|"",id=doc["deviceId"]|"esp32-room-01";
  JsonDocument ack;ack["type"]="provisionAck";
  bool valid=ssid.length()>0&&ssid.length()<=32&&pass.length()<=64&&host.length()>0&&host.length()<=80&&mpass.length()<=80&&(id=="esp32-room-01"||id=="esp32-room-02");
  ack["ok"]=valid;
  if(!valid){serializeJson(ack,Serial);Serial.println();return true;}
  prefs.begin("phongiot",false);prefs.putString("ssid",ssid);prefs.putString("wpass",pass);prefs.putString("broker",host);prefs.putString("mpass",mpass);prefs.putString("id",id);prefs.putString("transport","wifi");prefs.putInt("port",1883);prefs.end();
  stopOutputs();serializeJson(ack,Serial);Serial.println();Serial.flush();delay(500);ESP.restart();return true;
}
void command(const String &payload){
  JsonDocument doc;if(deserializeJson(doc,payload))return;
  if(!doc["fan"].is<bool>()||!doc["buzzer"].is<bool>()||!doc["led"].is<bool>()||!doc["commandId"].is<String>())return;
  fan=doc["fan"].as<bool>();lamp=doc["led"].as<bool>();bool nextBuzzer=doc["buzzer"].as<bool>();
  if(!nextBuzzer)buzzerLockout=false;
  if(nextBuzzer&&!buzzer&&!buzzerLockout)buzzerStarted=millis();
  buzzer=nextBuzzer&&!buzzerLockout;lastCommand=millis();setOutputs();state(doc["commandId"].as<String>());
}
void loadConfig(){
  prefs.begin("phongiot",true);wifiSsid=prefs.getString("ssid","");wifiPass=prefs.getString("wpass","");brokerHost=prefs.getString("broker",DEFAULT_BROKER);mqttPass=prefs.getString("mpass",DEFAULT_MQTT_PASS);deviceId=prefs.getString("id","esp32-room-01");transport=prefs.getString("transport","usb");demo=prefs.getBool("demo",true);brokerPort=prefs.getInt("port",1883);cleanRaw=prefs.getInt("clean",1000);alertRaw=prefs.getInt("alert",3000);prefs.end();
}
String escapeHtml(String s){s.replace("&","&amp;");s.replace("<","&lt;");s.replace(">","&gt;");s.replace("\"","&quot;");return s;}
void configPage(){
  String page=R"HTML(<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cấu hình Phòng IoT</title><style>body{font:16px system-ui;background:#edf3e8;color:#204d36;max-width:560px;margin:30px auto;padding:20px}form{background:white;padding:25px;border-radius:12px}label{display:block;margin:16px 0}input,select,button{box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccc;border-radius:5px}button{background:#176b50;color:white}small{color:#687865}</style><h1>Phòng IoT</h1><p>Cấu hình ESP32 · Lưu sau khi mất điện</p><form method="post" action="/save"><input type="hidden" name="csrf" value=")HTML"+csrf+R"HTML("><label>Mã thiết bị<select name="id"><option>esp32-room-01</option><option>esp32-room-02</option></select></label><label>Đường truyền<select name="transport"><option value="usb">USB qua gateway laptop</option><option value="wifi">Wi-Fi qua MQTT</option></select></label><label>Cảm biến<select name="demo"><option value="1">Dữ liệu giả (chưa lắp cảm biến)</option><option value="0">Cảm biến thật (đã lắp đủ linh kiện)</option></select></label><label>Tên Wi-Fi<input name="ssid" maxlength="32" value=")HTML"+escapeHtml(wifiSsid)+R"HTML("></label><label>Mật khẩu Wi-Fi<input name="wpass" type="password" maxlength="64" placeholder="Để trống để giữ mật khẩu cũ"></label><label>IP laptop chạy MQTT<input name="broker" maxlength="80" value=")HTML"+escapeHtml(brokerHost)+R"HTML("></label><label>Cổng MQTT<input name="port" type="number" min="1" max="65535" value=")HTML"+String(brokerPort)+R"HTML("></label><p>MQTT username: <b>esp32</b></p><label>MQTT password<input name="mpass" type="password" maxlength="80" placeholder="Lấy từ trang Thiết bị trên laptop"></label><label>ADC không khí xấu<input name="polluted" type="number" min="0" max="4095" value=")HTML"+String(cleanRaw)+R"HTML("></label><label>ADC mức khí demo cao<input name="wet" type="number" min="0" max="4095" value=")HTML"+String(alertRaw)+R"HTML("></label><small>Chọn lại đúng mã thiết bị, đường truyền và loại cảm biến trước khi lưu. Mặc định demo qua USB, esp32-room-01. Chỉ cấp nguồn 3,3 V cho tín hiệu cảm biến.</small><p>Đang lưu: )HTML"+escapeHtml(deviceId)+" / "+escapeHtml(transport)+" / "+(demo?"DEMO":"SENSOR")+R"HTML(</p><button>Lưu và khởi động lại</button></form></html>)HTML";
  page.replace("<option>"+deviceId+"</option>","<option selected>"+deviceId+"</option>");
  page.replace("value=\""+transport+"\">","value=\""+transport+"\" selected>");
  page.replace(String("value=\"")+(demo?"1":"0")+"\">",String("value=\"")+(demo?"1":"0")+"\" selected>");
  web.sendHeader("Cache-Control","no-store");web.send(200,"text/html; charset=utf-8",page);
}
void saveConfig(){
  if(web.arg("csrf")!=csrf){web.send(403,"text/plain","Invalid request");return;}
  String id=web.arg("id"),tr=web.arg("transport");int port=web.arg("port").toInt(),dr=web.arg("polluted").toInt(),wr=web.arg("wet").toInt();
  if((id!="esp32-room-01"&&id!="esp32-room-02")||(tr!="usb"&&tr!="wifi")||port<1||port>65535||abs(dr-wr)<100||dr<0||dr>4095||wr<0||wr>4095||web.arg("ssid").length()>32||web.arg("broker").length()>80){web.send(400,"text/plain","Invalid config");return;}
  prefs.begin("phongiot",false);prefs.putString("id",id);prefs.putString("transport",tr);prefs.putBool("demo",web.arg("demo")=="1");prefs.putString("ssid",web.arg("ssid"));if(web.arg("wpass").length())prefs.putString("wpass",web.arg("wpass"));prefs.putString("broker",web.arg("broker"));if(web.arg("mpass").length())prefs.putString("mpass",web.arg("mpass"));prefs.putInt("port",port);prefs.putInt("clean",dr);prefs.putInt("alert",wr);prefs.end();
  stopOutputs();web.send(200,"text/html; charset=utf-8","<meta charset='utf-8'><h2>Đã lưu. ESP32 đang khởi động lại.</h2>");delay(400);ESP.restart();
}
void publishSample(){
  JsonDocument doc;
  if(demo){float t=millis()/1000.0;doc["temperature"]=roundf((29.5+3.5*sinf(t/30))*10)/10;doc["humidity"]=roundf((65+7*sinf(t/45))*10)/10;doc["airQuality"]=roundf((45+35*sinf(t/40))*10)/10;doc["motion"]=((millis()/20000)%3)!=0;doc["light"]=roundf((45+30*sinf(t/50))*10)/10;}
  else {float t=dht.readTemperature(),h=dht.readHumidity();if(isnan(t)||isnan(h)){Serial.println("SENSOR_ERROR: DHT22 read failed; no telemetry sent");return;}int sr=analogRead(AIR_PIN),lr=analogRead(LIGHT_PIN);doc["temperature"]=t;doc["humidity"]=h;doc["airQuality"]=constrain(100.0f*(sr-cleanRaw)/(alertRaw-cleanRaw),0.0f,100.0f);doc["light"]=constrain(lr*100.0f/4095,0.0f,100.0f);doc["airQualityRaw"]=sr;doc["motion"]=digitalRead(MOTION_PIN)==HIGH;doc["lightRaw"]=lr;}
  doc["synthetic"]=demo;doc["uptimeMs"]=millis();emit(doc,"telemetry");
}
void setup(){
  Serial.begin(115200);pinMode(FAN_PIN,OUTPUT);pinMode(BUZZER_PIN,OUTPUT);pinMode(LAMP_PIN,OUTPUT);pinMode(MOTION_PIN,INPUT);setOutputs();loadConfig();if(!demo)dht.begin();analogReadResolution(12);csrf=String(esp_random(),HEX)+String(esp_random(),HEX);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  #if CONFIG_IDF_TARGET_ESP32C5
  WiFi.setBandMode(WIFI_BAND_MODE_AUTO);
  #endif
  WiFi.softAP("PhongIoT-Config","phongiot2026");web.on("/",HTTP_GET,configPage);web.on("/save",HTTP_POST,saveConfig);
  web.on("/status",HTTP_GET,[](){JsonDocument doc;doc["deviceId"]=deviceId;doc["transport"]=transport;doc["synthetic"]=demo;doc["wifiConnected"]=WiFi.status()==WL_CONNECTED;doc["mqttConnected"]=mqtt.connected();doc["stationIp"]=WiFi.localIP().toString();doc["apIp"]=WiFi.softAPIP().toString();doc["flashBytes"]=ESP.getFlashChipSize();doc["psramBytes"]=ESP.getPsramSize();String s;serializeJson(doc,s);web.send(200,"application/json",s);});web.begin();
  if(transport=="wifi"&&brokerHost.length()){mqtt.begin(brokerHost.c_str(),brokerPort,net);mqtt.onMessage(+[](String &topic,String &payload){if(topic==prefix()+"/command")pendingCommand=payload;});mqtt.setWill((prefix()+"/availability").c_str(),"offline",true,1);mqtt.setOptions(30,true,5000);}
  Serial.println("PHONG_IOT_READY | Config AP: PhongIoT-Config | http://192.168.4.1 | default USB / synthetic sensors");
  Serial.printf("PHONG_IOT_BOARD flash=%lu psram=%lu ap=%s transport=%s synthetic=%d\n",(unsigned long)ESP.getFlashChipSize(),(unsigned long)ESP.getPsramSize(),WiFi.softAPIP().toString().c_str(),transport.c_str(),demo);
}
void loop(){
  web.handleClient();if(pendingCommand.length()){String c=pendingCommand;pendingCommand="";command(c);}
  if(transport=="wifi"){
    if(WiFi.status()==WL_CONNECTED&&!wasWifi)Serial.printf("WIFI_CONNECTED IP=%s BROKER=%s:%d\n",WiFi.localIP().toString().c_str(),brokerHost.c_str(),brokerPort);
    wasWifi=WiFi.status()==WL_CONNECTED;
    if(WiFi.status()!=WL_CONNECTED&&wifiSsid.length()&&millis()-lastWifiTry>10000){lastWifiTry=millis();WiFi.begin(wifiSsid.c_str(),wifiPass.c_str());}
    if(WiFi.status()==WL_CONNECTED&&brokerHost.length()&&!mqtt.connected()&&millis()-lastMqttTry>5000){lastMqttTry=millis();if(mqtt.connect(deviceId.c_str(),"esp32",mqttPass.c_str())){net.setNoDelay(true);Serial.println("MQTT_CONNECTED");mqtt.subscribe(prefix()+"/command",1);mqtt.publish(prefix()+"/availability","online",true,1);state();}else{Serial.printf("MQTT_CONNECT_FAILED error=%d code=%d\n",mqtt.lastError(),mqtt.returnCode());}}
    mqtt.loop();if(wasConnected&&!mqtt.connected()){Serial.printf("MQTT_DISCONNECTED error=%d code=%d\n",mqtt.lastError(),mqtt.returnCode());stopOutputs();}wasConnected=mqtt.connected();
  }
  while(Serial.available()){char c=Serial.read();if(c=='\n'){if(serialLine.length()){if(!configureUsb(serialLine)&&!provision(serialLine)&&transport=="usb")command(serialLine);}serialLine="";}else if(serialLine.length()<1500)serialLine+=c;else serialLine="";}
  if(buzzer&&millis()-buzzerStarted>=BUZZER_LIMIT){buzzer=false;buzzerLockout=true;setOutputs();state();}
  if((fan||buzzer||lamp)&&millis()-lastCommand>COMMAND_TTL)stopOutputs();
  if(millis()-lastPublish>=3000){lastPublish=millis();publishSample();}
  delay(2);
}
