import com.sightline.v3.HostPolicy;
import com.sightline.v3.LanPagePolicy;

public final class LanJoinPolicyProbe {
    private static void check(boolean value) { if(!value)throw new AssertionError("LAN policy regression"); }
    public static void main(String[] args) {
        if(args.length>0) {
            System.out.print(LanPagePolicy.assetPath(args[0],Boolean.parseBoolean(args[1])));
            return;
        }
        for(String ip:new String[]{"192.168.1.255","10.2.255.255","172.16.0.127"})check(HostPolicy.isPrivateNetworkIPv4(ip));
        for(String ip:new String[]{"8.8.8.255","127.0.0.255","172.32.1.255","192.168.1.256","192.168.01.255"})check(!HostPolicy.isPrivateNetworkIPv4(ip));
        check(HostPolicy.normalize("192.168.1.255")==null); // Broadcast permission cannot become a join target.
        check("192.168.1.20".equals(HostPolicy.normalize("http://192.168.1.20:8080")));
        check("phone-host/index.html".equals(LanPagePolicy.assetPath("/",true)));
        check("phone-host/index.html".equals(LanPagePolicy.assetPath("/index.html",true)));
        check(LanPagePolicy.assetPath("/remote.html",true)==null);
        for(String path:new String[]{"/../server.js","/%2e%2e/server.js","/x\\server.js","index.html"})check(LanPagePolicy.assetPath(path,false)==null);
        check("phone-host/three.min.js".equals(LanPagePolicy.assetPath("/three.min.js",false)));
        check("http://192.168.1.20:8080/?join=1".equals(LanPagePolicy.pageUrl("192.168.1.20",false,true)));
        check("https://approved.example:8080/?join=1".equals(LanPagePolicy.pageUrl("approved.example",true,true)));
        check("application/javascript".equals(LanPagePolicy.mimeType("three.min.js")));
        System.out.println("PASS: broadcast, host input, bundled routing and TLS-origin policies");
    }
}
