import javax.swing.*;
import java.awt.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.concurrent.*;

// Java 17+. Native desktop HTTP/JSON client, independent of the browser.
public class PhongIoT {
  static HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  static JTextField server=new JTextField("http://localhost:8765",35);
  static JPasswordField token=new JPasswordField(35);
  static JTextArea data=new JTextArea(18,56);
  static ExecutorService worker=Executors.newSingleThreadExecutor();
  static void call(String body){String base=server.getText().replaceAll("/$","");String key=new String(token.getPassword());worker.submit(()->{try{var b=HttpRequest.newBuilder(URI.create(base+(body==null?"/api/status":"/api/settings"))).timeout(Duration.ofSeconds(5));if(!key.isBlank())b.header("Authorization","Bearer "+key);if(body!=null)b.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body));var r=client.send(b.build(),HttpResponse.BodyHandlers.ofString());SwingUtilities.invokeLater(()->data.setText("HTTP "+r.statusCode()+"\n"+r.body().replace(",",",\n")));}catch(Exception e){SwingUtilities.invokeLater(()->data.setText(e.toString()));}});}
  public static void main(String[] args)throws Exception{
    if(args.length>0&&args[0].equals("--check")){System.out.println(client.send(HttpRequest.newBuilder(URI.create("http://localhost:8765/api/health")).build(),HttpResponse.BodyHandlers.ofString()).body());return;}
    SwingUtilities.invokeLater(()->{var f=new JFrame("Phòng IoT — Java Desktop");f.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);var p=new JPanel();p.setLayout(new BoxLayout(p,BoxLayout.Y_AXIS));p.setBorder(BorderFactory.createEmptyBorder(20,20,20,20));p.add(new JLabel("PHÒNG Ở THÔNG MINH · Java HTTP/JSON"));p.add(server);p.add(new JLabel("Mã truy cập (để trống khi chạy trên laptop)"));p.add(token);var row=new JPanel();String[] labels={"Lấy dữ liệu","Tự động","Bật quạt","Tắt quạt","Bật đèn","Tắt đèn","Bật còi","Tắt còi"};String[] commands={null,"{\"mode\":\"auto\"}","{\"mode\":\"manual\",\"manualFan\":true}","{\"mode\":\"manual\",\"manualFan\":false}","{\"mode\":\"manual\",\"led\":true}","{\"mode\":\"manual\",\"led\":false}","{\"mode\":\"manual\",\"manualBuzzer\":true}","{\"mode\":\"manual\",\"manualBuzzer\":false}"};for(int i=0;i<labels.length;i++){final String c=commands[i];var b=new JButton(labels[i]);b.addActionListener(e->call(c));row.add(b);}p.add(row);data.setEditable(false);data.setLineWrap(true);p.add(new JScrollPane(data));f.setContentPane(p);f.pack();f.setLocationRelativeTo(null);f.setVisible(true);new Timer(3000,e->call(null)).start();call(null);});
  }
}
