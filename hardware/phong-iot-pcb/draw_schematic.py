"""Editable KiCad schematics. Logical DevKit pins, not a PCB footprint."""
from pathlib import Path
import uuid, json, csv, heapq

ROOT=Path(__file__).resolve().parent
uid=lambda:str(uuid.uuid4())
q=lambda s:json.dumps(str(s),ensure_ascii=False)
def effects(size=1,justify=''):
    return f'(effects (font (size {size} {size}))'+(f' (justify {justify})' if justify else '')+')'
class Sheet:
    def __init__(self,name,title):
        self.name=name; self.title=title; self.id=uid(); self.libs={}; self.items=[]; self.bom=[]; self.terminals=[]; self.obstacles=[]; self.stubs=[]
    def text(self,t,x,y,size=1.3):
        self.items.append(f'(text {q(t)} (at {x} {y} 0) {effects(size,"left")} (uuid {uid()}))')
    def box(self,title,x,y,w,h):
        self.items.append(f'(rectangle (start {x} {y}) (end {x+w} {y+h}) (stroke (width 0.254) (type default)) (fill (type none)) (uuid {uid()}))')
        self.text(title,x+3,y+4,1.6)
    def part(self,ref,value,x,y,pins,kind='box',desc=''):
        # pins: number, name, x/y relative to symbol in screen coordinates, net
        x=round(x/1.27)*1.27; y=round(y/1.27)*1.27
        lib='RoomIoT:'+ref; n=ref; geometry=[]
        line=lambda a,b:f'(polyline (pts (xy {a[0]} {a[1]}) (xy {b[0]} {b[1]})) (stroke (width 0.254) (type default)) (fill (type none)))'
        if kind in ['R','C','D','L','LED']:
            if kind=='R': geometry=[f'(rectangle (start -2.54 1.016) (end 2.54 -1.016) (stroke (width 0.254) (type default)) (fill (type none)))']
            elif kind=='C': geometry=[line((-.635,-2),(-.635,2)),line((.635,-2),(.635,2))]
            elif kind in ['D','LED']:
                geometry=[f'(polyline (pts (xy -1.5 0) (xy 1.5 1.5) (xy 1.5 -1.5) (xy -1.5 0)) (stroke (width 0.254) (type default)) (fill (type none)))',line((-1.5,-1.7),(-1.5,1.7))]
            else: geometry=[line((-2.54,0),(-2,0)),f'(polyline (pts (xy -2 0) (xy -1.5 1) (xy -.5 -1) (xy .5 1) (xy 1.5 -1) (xy 2 0) (xy 2.54 0)) (stroke (width 0.254) (type default)) (fill (type none)))']
        else:
            ys=[-p[3] for p in pins]; half=max(4,max(abs(a) for a in ys)+2.54)
            geometry=[f'(rectangle (start -10.16 {half}) (end 10.16 {-half}) (stroke (width 0.254) (type default)) (fill (type background)))']
        pinstr=[]
        for num,name,dx,dy,net in pins:
            angle=0 if dx<0 else 180
            length=2.54 if kind not in ['R','C','D','L','LED'] else (4.445 if kind=='C' else 2.54)
            pinstr.append(f'(pin passive line (at {dx} {-dy} {angle}) (length {length}) (name {q(name)} {effects(.9)}) (number {q(num)} {effects(.8)}))')
        self.libs[lib]=f'(symbol {q(lib)} (pin_names (offset 1.016)) (in_bom yes) (on_board yes) (property "Reference" {q(ref)} (at 0 0 0) {effects(1)}) (property "Value" {q(value)} (at 0 0 0) {effects(1)}) (symbol {q(n+"_0_1")} {"".join(geometry)}) (symbol {q(n+"_1_1")} {"".join(pinstr)}))'
        sid=uid(); half=max(abs(p[3]) for p in pins)
        refy=y-max(4,half+2.54)-6 if kind=='box' else y-5
        valy=refy+2.5
        self.obstacles.append((x-(10.8 if kind=='box' else 3),y-(max(4,half+2.54) if kind=='box' else 2.3),x+(10.8 if kind=='box' else 3),y+(max(4,half+2.54) if kind=='box' else 2.3)))
        self.obstacles.append((x-max(5,len(value)*.27),refy-1,x+max(5,len(value)*.27),valy+1))
        inst=f'(symbol (lib_id {q(lib)}) (at {x} {y} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) (uuid {sid}) (property "Reference" {q(ref)} (at {x} {refy} 0) {effects(1)}) (property "Value" {q(value)} (at {x} {valy} 0) {effects(.9)}) (instances (project "PhongIoT" (path "/{self.id}" (reference {q(ref)}) (unit 1)))))'
        self.items.append(inst)
        for num,name,dx,dy,net in pins:
            px,py=x+dx,y+dy; ex=px+(-5.08 if dx<0 else 5.08)
            if net is None:
                self.items.append(f'(no_connect (at {px} {py}) (uuid {uid()}))');continue
            self.items.append(f'(wire (pts (xy {px} {py}) (xy {ex} {py})) (stroke (width 0) (type default)) (uuid {uid()}))')
            # Local labels connect all equal net names within the page.
            self.items.append(f'(label {q(net)} (at {ex} {py} {0 if dx>0 else 180}) {effects(.9,"left bottom")} (uuid {uid()}))')
            self.terminals.append((ref,str(num),net,ex,py))
            self.stubs.append((net,px,py,ex,py))
        self.bom.append((ref,value,desc))
    def two(self,ref,value,x,y,a,b,kind='R',desc=''):
        self.part(ref,value,x,y,[('1','',-5.08,0,a),('2','',5.08,0,b)],kind,desc)
    def ic(self,ref,value,x,y,left,right,desc=''):
        pins=[]
        for sign,items in [(-1,left),(1,right)]:
            for i,(number,name,net) in enumerate(items):pins.append((str(number),name,sign*12.7,(i-(len(items)-1)/2)*2.54,net))
        self.part(ref,value,x,y,pins,desc=desc)
    def route(self):
        grid=.635; cell=lambda x:round(x/grid)
        blocked=set(); occupied={}; protected=set()
        for x1,y1,x2,y2 in self.obstacles:
            for ix in range(cell(x1),cell(x2)+1):
                for iy in range(cell(y1),cell(y2)+1):blocked.add((ix,iy))
        for net,x1,y1,x2,y2 in self.stubs:
            for ix in range(min(cell(x1),cell(x2)),max(cell(x1),cell(x2))+1):occupied[(ix,cell(y1))]=(net,0)
            protected.update([(cell(x1),cell(y1)),(cell(x2),cell(y2))])
        groups={}
        for ref,num,net,x,y in self.terminals:
            # Power and ground are drawn within functional blocks; signals connect globally.
            region=('left' if x<130 else 'middle' if x<270 else 'right')+('top' if y<156 else 'bottom') if self.name=='PhongIoT' else ('input' if y<78 else 'sepic' if y<201 else 'buck')
            key=(net,region if net in ['GND','+5V','+3V3','+12V_REG','VIN_PROT'] else '')
            groups.setdefault(key,[]).append((cell(x),cell(y)))
        jobs=[]
        for (net,region),points in groups.items():
            tree=[points[0]]; rest=list(dict.fromkeys(points[1:]))
            while rest:
                a,b=min(((a,b) for a in tree for b in rest),key=lambda z:abs(z[0][0]-z[1][0])+abs(z[0][1]-z[1][1]))
                jobs.append((abs(a[0]-b[0])+abs(a[1]-b[1]),net,a,b));tree.append(b);rest.remove(b)
        failures=[]
        for _,net,start,end in sorted(jobs):
            queue=[(0,0,start[0],start[1],0)]; costs={(start[0],start[1],0):0}; prev={}; last=None
            while queue:
                _,cost,x,y,axis=heapq.heappop(queue);state=(x,y,axis)
                if cost!=costs.get(state):continue
                if (x,y)==end:last=state;break
                for dx,dy,newaxis in [(1,0,0),(-1,0,0),(0,1,1),(0,-1,1)]:
                    nx,ny=x+dx,y+dy;point=(nx,ny)
                    if not (cell(13)<nx<cell(406) and cell(28)<ny<cell(266)):continue
                    if point in blocked and point not in [start,end]:continue
                    here=occupied.get((x,y));there=occupied.get(point)
                    if here and here[0]!=net and newaxis!=axis:continue
                    if there and there[0]!=net and (point in protected or there[1]==newaxis):continue
                    extra=1+(7 if axis!=newaxis else 0)+(25 if there and there[0]!=net else 0)
                    nxt=(nx,ny,newaxis);nc=cost+extra
                    if nc<costs.get(nxt,1e20):
                        costs[nxt]=nc;prev[nxt]=state;h=abs(nx-end[0])+abs(ny-end[1]);heapq.heappush(queue,(nc+h,nc,nx,ny,newaxis))
            if last is None:failures.append((net,start,end));continue
            path=[]
            while last in prev:path.append(last[:2]);last=prev[last]
            path.append(start);path.reverse()
            bends=[path[0]]
            for i in range(1,len(path)-1):
                if (path[i][0]-path[i-1][0],path[i][1]-path[i-1][1])!=(path[i+1][0]-path[i][0],path[i+1][1]-path[i][1]):bends.append(path[i])
            bends.append(path[-1])
            protected.update(bends)
            for a,b in zip(bends,bends[1:]):
                self.items.append(f'(wire (pts (xy {a[0]*grid:.4f} {a[1]*grid:.4f}) (xy {b[0]*grid:.4f} {b[1]*grid:.4f})) (stroke (width 0) (type default)) (uuid {uid()}))')
            for i,point in enumerate(path):
                nxt=path[min(i+1,len(path)-1)];axis=0 if nxt[1]==point[1] else 1
                if point not in occupied:occupied[point]=(net,axis)
            for point in [start,end]:
                self.items.append(f'(junction (at {point[0]*grid:.4f} {point[1]*grid:.4f}) (diameter 0) (color 0 0 0 0) (uuid {uid()}))')
        print(self.name,'wire routes:',len(jobs)-len(failures),'of',len(jobs),'failed',failures)
    def save(self):
        self.route()
        out=f'(kicad_sch (version 20250114) (generator "eeschema") (uuid {self.id}) (paper "A3") (title_block (title {q(self.title)}) (date "2026-10-25") (rev "A - schematic review") (company "PHONG IoT / ESP32-C5") (comment 1 "Logical pin labels; verify actual DevKit revision before wiring")) (lib_symbols {"".join(self.libs.values())}) {"".join(self.items)} (sheet_instances (path "/" (page "1"))))'
        (ROOT/(self.name+'.kicad_sch')).write_text(out,encoding='utf-8')

s=Sheet('PhongIoT','PHONG IoT - ESP32, sensors and 12 V / 1 A fan')
s.text('SO DO NGUYEN LY / SMART ROOM',15,15,2.7)
s.text('Same net label = electrically connected. GPIO numbers are NOT header positions.',15,22,1.2)
s.box('1. ESP32-C5 N16R8 DEVBOARD',12,30,115,122)
s.ic('A1','ESP32-C5 N16R8 (logical pins)',67,85,
 [('3V3','3V3 OUT','+3V3'),('5V','5V IN','ESP_5V'),('GND','GND','GND')],
 [('IO7','GPIO7 / DHT','DHT_DATA'),('IO1','GPIO1 / ADC','MQ_ADC'),('IO3','GPIO3 / ADC','LDR_ADC'),('IO10','GPIO10 / PIR','PIR_GPIO'),('IO4','GPIO4 / FAN','FAN_GPIO'),('IO5','GPIO5 / BUZZER','BUZ_GPIO'),('IO6','GPIO6 / LED','LED_GPIO')],
 'Existing user DevKit. No footprint/header order assumed.')
s.two('JP1','OPEN for USB; CLOSE for external power',67,124,'+5V','ESP_5V',desc='2-pin jumper; NEVER close while USB power is connected')
s.text('USB programming: remove JP1 first.',18,138,1.1)
s.text('GPIO3 / GPIO7 are strap pins: check boot with sensors.',18,144,.95)
s.box('2. DHT22 + PIR',136,30,128,122)
s.ic('U2','DHT22 / AM2302 bare sensor',200,64,[(1,'VDD','+3V3'),(2,'DATA','DHT_DATA')],[(3,'NC',None),(4,'GND','GND')])
s.two('R1','10k',200,87,'+3V3','DHT_DATA')
s.two('C1','100n / 10V',200,102,'+3V3','GND','C')
s.ic('J2','PIR HC-SR501 cable',200,128,[(1,'VCC','+5V'),(2,'OUT','PIR_OUT')],[(3,'GND','GND')])
s.text('Cable pins are project-defined. Read module labels.',141,146,.95)
s.box('3. AIR / LIGHT / INPUT FILTERS',273,30,135,122)
s.ic('J3','MQ135 module cable',339,57,[(1,'VCC','+5V'),(2,'AO','MQ_RAW')],[(3,'GND','GND')])
s.two('R2','20k / 1%',339,77,'MQ_RAW','MQ_ADC')
s.two('R3','10k / 1%',339,89,'MQ_ADC','GND')
s.two('C2','100n',339,101,'MQ_ADC','GND','C')
s.two('R4','LDR',312,120,'+3V3','LDR_ADC')
s.two('R5','10k',376,120,'LDR_ADC','GND')
s.two('R6','1k',312,137,'PIR_OUT','PIR_GPIO')
s.two('R7','100k',376,137,'PIR_GPIO','GND')
s.box('4. FAN 12 V / 1 A - SWITCHED POWER HEADER',12,160,190,108)
s.ic('J4','FAN HEADER >= 3A',67,188,[(1,'FAN +12V','+12V_REG')],[(2,'FAN -','FAN_MINUS')], 'Keyed 2-pin power header rated >=3A, not GPIO power')
s.ic('Q1','AO3400A / N-MOSFET',67,222,[(1,'GATE','FAN_GATE')],[(3,'DRAIN','FAN_MINUS'),(2,'SOURCE','GND')])
s.two('R8','100R',157,193,'FAN_GPIO','FAN_GATE')
s.two('R9','100k',157,210,'FAN_GATE','GND')
s.two('D1','1N5822 / 3A 40V',157,230,'+12V_REG','FAN_MINUS','D', 'Pin1 cathode to +12V; pin2 anode to FAN_MINUS')
s.text('D1: K -> +12V, A -> FAN-. Q1 source -> GND.',18,247,1.1)
s.text('Fan startup current and MOSFET temperature need bench test.',18,257,1)
s.box('5. ACTIVE BUZZER / LED',211,160,197,88)
s.ic('BZ1','ACTIVE BUZZER 5V / <=100mA',262,190,[(1,'PLUS','+5V')],[(2,'MINUS','BUZ_MINUS')])
s.ic('Q2','AO3400A / N-MOSFET',262,221,[(1,'GATE','BUZ_GATE')],[(3,'DRAIN','BUZ_MINUS'),(2,'SOURCE','GND')])
s.two('R10','100R',360,184,'BUZ_GPIO','BUZ_GATE')
s.two('R11','100k',360,199,'BUZ_GATE','GND')
s.two('D2','1N5819 / flyback',360,216,'+5V','BUZ_MINUS','D')
s.two('R12','1k',262,240,'LED_GPIO','LED_A')
s.two('D3','WHITE LED',360,240,'GND','LED_A','LED')
s.text('Power circuits: see Nguon12V.kicad_sch. All GND nets are common.',15,278,1.1)
s.save()

p=Sheet('Nguon12V','PHONG IoT - discrete SEPIC 12 V and buck 5 V')
p.text('NGUON ROI: 12 V NOMINAL -> REGULATED 12 V + 5 V',15,15,2.5)
p.text('Design-review schematic. SEPIC follows TI TPS55340 Fig.8-10; startup/thermal tests remain required.',15,23,1.1)
p.box('1. INPUT PROTECTION / 12 V DC ADAPTER',12,30,396,43)
p.ic('J1','12V DC adapter / >=3A',50,54,[(1,'PLUS','VIN_RAW')],[(2,'MINUS','GND')])
p.two('F1','2A time-delay',130,54,'VIN_RAW','VIN_FUSED')
p.two('D4','MBR540 / 5A 40V',218,54,'VIN_PROT','VIN_FUSED','D', 'Reverse polarity diode: K=VIN_PROT A=VIN_FUSED; heat needs checking')
p.two('C3','100u / 35V',310,54,'VIN_PROT','GND','C')
p.two('C4','100n / 50V',378,54,'VIN_PROT','GND','C')
p.box('2. DISCRETE SEPIC - FAN SUPPLY / 12 V 1 A NOMINAL',12,80,396,118)
p.ic('U3','TPS55340PWP (HTSSOP-14 + pad)',66,124,
 [(3,'VIN','VIN_IC'),(4,'EN','VIN_IC'),(5,'SS','SS'),(6,'SYNC','GND'),(7,'AGND','GND')],
 [(1,'SW1','SEPIC_SW'),(2,'SW2','SEPIC_SW'),(8,'COMP','COMP'),(9,'FB','FB12'),(10,'FREQ','FREQ'),(11,'NC->GND','GND'),(12,'PGND','GND'),(13,'PGND','GND'),(14,'PGND','GND'),(15,'THERMAL PAD','GND')],
 'TPS55340PWP only: pin numbering differs from QFN RTE')
p.ic('L1','12uH COUPLED / >=5A peak (verify)',170,105,
 [(1,'DOT / winding A','VIN_PROT'),(3,'DOT / winding B','GND')],
 [(2,'winding A','SEPIC_SW'),(4,'winding B','SEPIC_DIODE')],
 'Coupled inductor! Pin order and saturation current must match selected MPN. Not two random 12uH inductors.')
p.two('C5','2.2u / 50V X7R / high RMS',287,101,'SEPIC_SW','SEPIC_DIODE','C')
p.two('D5','MBR360 / 3A 60V',372,101,'+12V_REG','SEPIC_DIODE','D')
p.two('C6','22u / 25V X7R',170,130,'+12V_REG','GND','C')
p.two('C7','22u / 25V X7R',245,130,'+12V_REG','GND','C')
p.two('C8','22u / 25V X7R',324,130,'+12V_REG','GND','C')
p.two('R13','0R',170,151,'VIN_PROT','VIN_IC')
p.two('C9','100n / 50V',245,151,'VIN_IC','GND','C')
p.two('C10','47n',324,151,'SS','GND','C')
p.two('R14','95.3k / 1%',170,171,'FREQ','GND')
p.two('R15','2.37k / 1%',245,171,'COMP','COMP_RC')
p.two('C11','100n',324,171,'COMP_RC','GND','C')
p.two('R16','49.9R / 1%',66,185,'+12V_REG','FB_FILTER')
p.two('R17','86.6k / 1%',190,185,'FB_FILTER','FB12')
p.two('R18','10k / 1%',324,185,'FB12','GND')
p.box('3. DISCRETE 5 V BUCK - FROM INPUT, NOT FAN RAIL',12,205,396,43)
p.ic('U4','LM2596T-5.0 (TO-220-5)',66,235,[(1,'VIN','VIN_PROT'),(3,'GND','GND'),(5,'ON/OFF','GND')],[(2,'SW','BUCK_SW'),(4,'FEEDBACK','+5V')])
p.two('D6','1N5822 / 3A 40V',161,228,'BUCK_SW','GND','D')
p.two('L2','33uH / Isat >=4A',250,228,'BUCK_SW','+5V','L')
p.two('C12','220u / 35V low ESR',161,241,'VIN_PROT','GND','C')
p.two('C13','220u / 10V low ESR',250,241,'+5V','GND','C')
p.two('C14','100n / 10V',345,241,'+5V','GND','C')
p.text('12V_REG -> J4 fan; +5V -> sensors / JP1.',15,259,1)
p.text('+3V3 comes from ESP32 DevKit. All GNDs are common.',15,265,1)
p.text('SEPIC: reference-rated 1 A; fan startup margin is NOT verified.',15,276,1)
p.text('Verify transient response, output ripple and heat before assembly release.',15,282,.95)
p.save()

all_libs={**s.libs,**p.libs}
library='(kicad_symbol_lib (version 20250114) (generator "kicad_symbol_editor") '+''.join(v.replace(q(k),q(k.split(':')[1]),1) for k,v in all_libs.items())+')'
(ROOT/'RoomIoT.kicad_sym').write_text(library,encoding='utf-8')
(ROOT/'sym-lib-table').write_text('(sym_lib_table (version 7) (lib (name "RoomIoT") (type "KiCad") (uri "${KIPRJMOD}/RoomIoT.kicad_sym") (options "") (descr "Local schematic symbols")))',encoding='utf-8')
(ROOT/'Nguon12V.kicad_pro').write_text('{}',encoding='utf-8')

with (ROOT/'BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['Reference','Value','Notes']);w.writerows(s.bom+p.bom)
(ROOT/'PhongIoT.kicad_pro').write_text('{}',encoding='utf-8')
(ROOT/'README.md').write_text('''# Sơ đồ nguyên lý Phòng IoT

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
''',encoding='utf-8')
print('Created editable schematics and BOM:',len(s.bom+p.bom),'components')
