package com.sightline.v3;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.Process;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;

/** Experimental real Node host; runs in a disposable dedicated process (Node cannot safely restart in-process). */
public final class LanHostService extends Service {
    public static final String STOP = "com.sightline.v3.STOP_PHONE_HOST";
    private static final int NOTIF_ID=8842;
    private static final String LAST_ERROR_FILE="phone-host-last-error.txt";
    private volatile boolean started;
    private android.os.PowerManager.WakeLock cpuLock;
    private android.net.wifi.WifiManager.MulticastLock discoveryLock;
    private native int runNode(String[] argv, String home, String temp);
    @Override public IBinder onBind(Intent intent) { return null; }
    public static java.util.Map<String,String> lanAddresses() {
        java.util.Map<String,String> result=new java.util.LinkedHashMap<>();
        try {
            Enumeration<NetworkInterface> nets=NetworkInterface.getNetworkInterfaces();
            while(nets!=null&&nets.hasMoreElements()) {
                NetworkInterface it=nets.nextElement();String n=it.getName().toLowerCase(java.util.Locale.ROOT);
                if(!(n.startsWith("wlan")||n.startsWith("ap")||n.startsWith("swlan")||n.startsWith("softap"))||!it.isUp()||it.isLoopback()||it.isVirtual())continue;
                for(java.net.InterfaceAddress row:it.getInterfaceAddresses()) {
                    java.net.InetAddress addr=row.getAddress();short prefix=row.getNetworkPrefixLength();
                    if(addr instanceof Inet4Address && prefix>0 && prefix<31 && HostPolicy.normalize(addr.getHostAddress())!=null)
                        result.put(addr.getHostAddress(),it.getDisplayName()==null?it.getName():it.getDisplayName());
                }
            }
        } catch(Exception e) { android.util.Log.w("SightlineHost","Cannot enumerate Wi-Fi interfaces",e); }
        return result;
    }
    public static boolean hasLanAddress(String address) { return address!=null&&lanAddresses().containsKey(address); }
    private static String hex(byte[] bytes) {
        StringBuilder b=new StringBuilder(); for(byte x:bytes)b.append(String.format(java.util.Locale.ROOT,"%02x",x&255));return b.toString();
    }
    private void writeFailure(String message) {
        // This app-private file is visible to the Activity even though the server has its own process.
        try {
            String safe=message==null ? "Unknown native hosting failure" : message.replaceAll("[\r\n]+"," ");
            if(safe.length()>350) safe=safe.substring(0,350);
            File file=new File(getFilesDir(), LAST_ERROR_FILE);
            try(FileOutputStream output=new FileOutputStream(file,false)) {
                output.write(safe.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                output.getFD().sync();
            }
        } catch(Exception ignored) { android.util.Log.e("SightlineHost","Failed to persist host error"); }
    }
    private File stage() throws Exception {
        File d=new File(getFilesDir(),"authoritative-host-v12"); if(!d.isDirectory()&&!d.mkdirs()) throw new Exception("Unable to create host data directory");
        Map<String,String> hashes=new HashMap<>();
        try(InputStream stream=getAssets().open("phone-host/SHA256SUMS")) {
            String content=new String(readAll(stream),java.nio.charset.StandardCharsets.US_ASCII);
            for(String line:content.split("\n")) if(!line.trim().isEmpty()) {
                String[] parts=line.trim().split("  ",2);
                if(parts.length!=2 || !parts[0].matches("[0-9a-f]{64}") || !parts[1].matches("[a-z0-9][a-z0-9._/-]*") || parts[1].contains("//")) throw new Exception("Bad asset manifest");
                for(String segment:parts[1].split("/")) if(segment.isEmpty() || segment.equals(".") || segment.equals("..")) throw new Exception("Bad asset path");
                hashes.put(parts[1],parts[0]);
            }
        }
        if(hashes.size()!=32 || !hashes.containsKey("lan-discovery.cjs") || !hashes.containsKey("server.js") || !hashes.containsKey("index.html") || !hashes.containsKey("sightline-theme.mp3") || !hashes.containsKey("mp-transport-policy.js") || !hashes.containsKey("gameplay-mode-rules.js") || !hashes.containsKey("character-realism-v12.js") || !hashes.containsKey("zombie-hunt.js") || !hashes.containsKey("weapon-realism.js") || !hashes.containsKey("legendary-packs.js") || !hashes.containsKey("engagement-prototypes.js")) throw new Exception("Incomplete host bundle");
        for(Map.Entry<String,String> item:hashes.entrySet()) {
            String name=item.getKey();
            byte[] buf;
            try(InputStream in=getAssets().open("phone-host/"+name)) {buf=readAll(in);}
            if(!item.getValue().equals(hex(MessageDigest.getInstance("SHA-256").digest(buf)))) throw new Exception("Host asset corrupted: "+name);
            File dest=new File(d,name);File parent=dest.getParentFile();
            if(!parent.isDirectory() && !parent.mkdirs()) throw new Exception("Host asset folder could not be created: "+name);
            if(!dest.getCanonicalPath().startsWith(d.getCanonicalPath()+File.separator)) throw new Exception("Host asset path escaped staging directory");
            File tmp=new File(parent,dest.getName()+".pending");
            try(FileOutputStream out=new FileOutputStream(tmp)){out.write(buf);out.getFD().sync();}
            if(!tmp.renameTo(dest)) throw new Exception("Asset installation failed: "+name);
        }
        return d;
    }
    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream b=new java.io.ByteArrayOutputStream();byte[] buf=new byte[16384];int n;
        while((n=in.read(buf))!=-1) {b.write(buf,0,n);if(b.size()>16_000_000)throw new Exception("Host file too large");}
        return b.toByteArray();
    }
    private Notification notification(String status) {
        String channel="sightline-lan-host";
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(channel,"LAN hosting",NotificationManager.IMPORTANCE_LOW));
        Intent stop=new Intent(this,LanHostService.class).setAction(STOP);
        PendingIntent pending=PendingIntent.getService(this,12,stop,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,channel).setContentTitle("Sightline phone LAN host")
            .setContentText(status).setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop hosting",pending).build()).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(intent!=null && STOP.equals(intent.getAction())) {stopSelf();return START_NOT_STICKY;}
        if(started) return START_NOT_STICKY;
        started=true;
        try {
            if(Build.VERSION.SDK_INT>=29) startForeground(NOTIF_ID,notification("Starting local server"),ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else startForeground(NOTIF_ID,notification("Starting local server"));
        } catch(RuntimeException e) {
            writeFailure("Foreground LAN service unavailable: " + e.getClass().getSimpleName());
            android.util.Log.e("SightlineHost","Android refused foreground service",e);
            stopSelf(); return START_NOT_STICKY;
        }
        final String selectedAddress=intent==null?null:intent.getStringExtra("lan-address");
        new Thread(()->{
            try {
                if(!BuildConfig.LAN_HOST_ENABLED) throw new Exception("Native runtime not installed");
                String ip=selectedAddress;
                if(!hasLanAddress(ip))throw new Exception("Selected Wi-Fi network is unavailable");
                File error=new File(getFilesDir(), LAST_ERROR_FILE);
                if(error.exists()&&!error.delete()) throw new Exception("Cannot clear previous hosting failure");
                File root=stage();
                android.os.PowerManager power=(android.os.PowerManager)getSystemService(POWER_SERVICE);
                cpuLock=power.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,"Sightline:LanHost");
                cpuLock.acquire(); // Active, user-visible foreground host only; released on every shutdown.
                android.net.wifi.WifiManager wifi=(android.net.wifi.WifiManager)getApplicationContext().getSystemService(WIFI_SERVICE);
                if(wifi!=null){discoveryLock=wifi.createMulticastLock("sightline-host-discovery");discoveryLock.setReferenceCounted(false);discoveryLock.acquire();}
                final String initialIp=ip;
                new Thread(()->{
                    while(started) {
                        try {Thread.sleep(3000);} catch(InterruptedException e) {return;}
                        if(!hasLanAddress(initialIp)) { writeFailure("Wi-Fi changed. Rejoin Wi-Fi and create a new match.");stopSelf(); return; }
                    }
                },"sightline-host-network-watch").start();
                System.loadLibrary("node"); System.loadLibrary("sightline_host");
                getSystemService(NotificationManager.class).notify(NOTIF_ID, notification("Hosting on "+ip+":8080 · trusted Wi-Fi only"));
                int exit=runNode(new String[]{"node",new File(root,"server.js").getAbsolutePath(),"--transport","dev","--bind",ip,"--port","8080","--max","4","--total","68","--bots","0","--discover-lan","--wait-for-host","--room","Phone Match"},getFilesDir().getAbsolutePath(), getCacheDir().getAbsolutePath());
                android.util.Log.w("SightlineHost","Node exited: "+exit);
                writeFailure("Authoritative server stopped (native exit " + exit + ")");
            } catch(Throwable t) {android.util.Log.e("SightlineHost","Native server unavailable",t); writeFailure("Native host failed: " + t.getClass().getSimpleName() + (t.getMessage()!=null ? ": " + t.getMessage() : ""));}
            finally {stopSelf();}
        },"sightline-node-host").start();
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() {
        started=false;
        if(discoveryLock!=null&&discoveryLock.isHeld())discoveryLock.release();
        if(cpuLock!=null&&cpuLock.isHeld())cpuLock.release();
        super.onDestroy();
        // Only the dedicated :lanhost process is terminated; the game Activity and its save data survive.
        Process.killProcess(Process.myPid());
    }
}

