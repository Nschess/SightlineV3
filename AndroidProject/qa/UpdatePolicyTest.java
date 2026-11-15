package com.sightline.v3;
import java.net.URI;
public class UpdatePolicyTest {
    private static int passed=0;
    private static void ok(boolean condition, String name) {
        if(!condition) throw new AssertionError(name);
        passed++;
    }
    private static void reject(Runnable work,String name) {
        try { work.run(); throw new AssertionError("Accepted " + name); }
        catch(IllegalArgumentException e) { passed++; }
    }
    public static void main(String[] args) {
        URI feed=UpdatePolicy.trustedManifest("https://updates.sightline.example/releases/android/version.json");
        ok(feed.getHost().equals("updates.sightline.example"),"HTTPS manifest");
        ok(UpdatePolicy.trustedManifest("")==null,"updates disabled by default");
        ok(UpdatePolicy.trustedApk(feed,"https://updates.sightline.example/releases/android/Sightline-v3.apk").getPath().endsWith(".apk"),"APK same origin");
        reject(()->UpdatePolicy.trustedManifest("http://updates.sightline.example/version.json"),"HTTP manifest");
        reject(()->UpdatePolicy.trustedManifest("https://localhost/version.json"),"localhost feed");
        reject(()->UpdatePolicy.trustedManifest("https://127.0.0.1/version.json"),"IPv4 feed");
        reject(()->UpdatePolicy.trustedManifest("https://user:password@updates.sightline.example/version.json"),"credentials");
        reject(()->UpdatePolicy.trustedManifest("https://updates.sightline.example:8080/version.json"),"insecure port");
        reject(()->UpdatePolicy.trustedManifest("https://updates.sightline.example/version.json?x=1"),"query string");
        reject(()->UpdatePolicy.trustedManifest("https://updates.sightline.example/a/../version.json"),"path traversal");
        reject(()->UpdatePolicy.trustedApk(feed,"http://updates.sightline.example/releases/Sightline.apk"),"HTTP APK");
        reject(()->UpdatePolicy.trustedApk(feed,"https://evil.example/sightline.apk"),"other host APK");
        reject(()->UpdatePolicy.trustedApk(feed,"https://updates.sightline.example/not-apk.html"),"not APK");
        reject(()->UpdatePolicy.trustedApk(feed,"https://updates.sightline.example/x.apk#bad"),"fragment");
        reject(()->UpdatePolicy.trustedApk(feed,"https://updates.sightline.example/x.apk?redirect=1"),"query");
        String hash="a".repeat(64);
        ok(UpdatePolicy.newer("com.sightline.v3","com.sightline.v3",2,3,hash),"new update");
        ok(!UpdatePolicy.newer("com.fake","com.sightline.v3",2,3,hash),"wrong package");
        ok(!UpdatePolicy.newer("com.sightline.v3","com.sightline.v3",2,2,hash),"same code");
        ok(!UpdatePolicy.newer("com.sightline.v3","com.sightline.v3",2,1,hash),"downgrade");
        ok(!UpdatePolicy.newer("com.sightline.v3","com.sightline.v3",2,3,"1"),"invalid checksum");
        ok(!UpdatePolicy.newer("com.sightline.v3","com.sightline.v3",2,3,"A".repeat(64)),"reject upper hex");
        ok(UpdatePolicy.validName("0.3-test").equals("0.3-test"),"version name");
        reject(()->UpdatePolicy.validName("bad\nname"),"multiline name");
        reject(()->UpdatePolicy.validChangelog(""),"empty changelog");
        System.out.println("PASS " + passed + " UpdatePolicy assertions");
    }
}
