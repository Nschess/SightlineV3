import com.sightline.v3.HostPolicy;
public class HostPolicyTest {
  private static void check(String input, String expected) {
    String got=HostPolicy.normalize(input);
    if (!(expected==null ? got==null : expected.equals(got)))
      throw new AssertionError("input="+input+" expected="+expected+" got="+got);
  }
  public static void main(String[] args) {
    check("192.168.100.12", "192.168.100.12");
    check(" 192.168.100.12:8080 ","192.168.100.12");
    check("http://192.168.100.12:8080","192.168.100.12");
    check("10.0.0.5", "10.0.0.5");
    check("172.16.0.2", "172.16.0.2");
    check("172.31.255.10", "172.31.255.10");
    String[] bad={"", "8.8.8.8", "172.32.1.1", "127.0.0.1", "169.254.1.3", "192.168.1.1:3000",
       "192.168.1.1:8081", "https://192.168.1.1", "192.168.1.1/evil", "192.168.1.1@evil.com",
       "192.168.1.256", "192.168.01.1", "192.168.1.0", "192.168.1.255", "localhost", "evil.test",
       "192.168.1.1#frag", "192.168.1.1:8080/", "192.168.1.1\\\\"};
    for(String b:bad) check(b,null);
    System.out.println("HostPolicy: 6 allowed and "+bad.length+" rejected inputs passed");
  }
}
