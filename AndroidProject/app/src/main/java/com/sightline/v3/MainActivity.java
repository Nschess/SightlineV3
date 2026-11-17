package com.sightline.v3;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.widget.CheckBox;
import androidx.core.content.FileProvider;
import java.io.File;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import androidx.webkit.WebResourceErrorCompat;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.net.InetAddress;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Simple isolated game WebView. No JS bridge, tracking, server, or external browser intents. */
public final class MainActivity extends Activity {
    private static final String ASSET_DOMAIN = "appassets.androidplatform.net";
    private static final String OFFLINE_URL = "https://" + ASSET_DOMAIN + "/assets/www/index.html";
    private static final String HOST_BUNDLE_SHA256 = "b1416d0df9e10d2c5e987edb719ffbacb6a1e8c6336836a7fe5436698b4eea4c";
    private static final String V17_HOST_BUNDLE_SHA256 = "54535061c2f0494c0ced44ae050d274d926b9bfc1ef3bc094af2a8d9d5ab3fe5";
    // Keep the recovered PC host compatible, alongside this exact development host.
    private static final String RECOVERY_HOST_BUNDLE_SHA256 = "a3606ca595d6973e71720c7adbd8c03b1949d08c748249e8365d1ba14284ec5b";
    private static final String HUD51_HOST_BUNDLE_SHA256 = "1be6c08ca8ef0460971f47c6f2986634003d22197c1b0b6e6dcd824a76a30b23";
    private static boolean acceptsHostBundle(String bundle) {
        return HOST_BUNDLE_SHA256.equals(bundle) || "b618ebb0f2a56ee3e00c52943e48eb5db6ddb59117c689781d6fe755f5486c1b".equals(bundle) || V17_HOST_BUNDLE_SHA256.equals(bundle) || RECOVERY_HOST_BUNDLE_SHA256.equals(bundle) || HUD51_HOST_BUNDLE_SHA256.equals(bundle);
    }
    private static final Set<String> FILES = new HashSet<>(Arrays.asList(
        "index.html", "three.min.js", "mp-transport-policy.js", "vr18-v31.js", "navigation.js", "squad-tactics.js", "bot-tactics.js", "character-poses.js", "zombie-counterplay.js", "thirdperson-hands.js", "character-prototypes.js", "character-realism.js", "character-realism-v12.js", "combat-foundation.js",
        "threejs-license.txt", "sightline-theme.mp3",
        "deathmatch-rules.js", "gameplay-mode-rules.js", "survivor-evasion.js", "squad-loadout.js", "zombie-balance.js",
        "zombie-hunt.js", "infection-evasion.js", "weapon-skins.js", "legend-overlay.js", "legendary-packs.js", "character-skins.js", "optics-v1.js", "weapon-realism.js",
        "rook117/rook117-model.js",
        "rook117/rook117_coated_gunmetal_albedo.png", "rook117/rook117_coated_gunmetal_normal.png", "rook117/rook117_coated_gunmetal_roughness.png",
        "rook117/rook117_parkerized_steel_albedo.png", "rook117/rook117_parkerized_steel_normal.png", "rook117/rook117_parkerized_steel_roughness.png",
        "rook117/rook117_graphite_polymer_albedo.png", "rook117/rook117_graphite_polymer_normal.png", "rook117/rook117_graphite_polymer_roughness.png",
        "rook117/rook117_recoil_rubber_albedo.png", "rook117/rook117_recoil_rubber_normal.png", "rook117/rook117_recoil_rubber_roughness.png",
        "rook117/rook117_sight_steel_albedo.png", "rook117/rook117_sight_steel_normal.png", "rook117/rook117_sight_steel_roughness.png",
        "rook117/rook117_recess_albedo.png", "rook117/rook117_recess_normal.png", "rook117/rook117_recess_roughness.png"));
    // Extra bundled modules used by the matching V12 multiplayer host payload.
    private static final Set<String> HOSTED_MODULES = new HashSet<>(Arrays.asList(
        "bot-tactics.js", "character-poses.js", "character-prototypes.js", "character-realism.js", "character-realism-v12.js", "zombie-counterplay.js", "mp-transport-policy.js",
        "weapon-skins.js", "legend-overlay.js", "legendary-packs.js", "character-skins.js", "deathmatch-rules.js", "gameplay-mode-rules.js", "optics-v1.js", "weapon-realism.js", "infection-evasion.js", "zombie-hunt.js"));
    private static final Set<String> LAN_PATHS = new HashSet<>(Arrays.asList("/", "/index.html", "/favicon.ico"));
    private WebView web;
    private String chosenLanHost;
    private volatile boolean phoneHostStarting;
    private int lanJoinGeneration;
    private boolean lanJoinPending;
    private WebViewAssetLoader assetLoader;
    private FrameLayout root;
    private boolean showingGame;
    private UpdateManager updater;
    private File verifiedUpdate;
    private boolean returnedFromInstallSettings;
    private String activePhoneHostIp;
    private final Set<String> reportedWebErrors = new HashSet<>();

    private void logWebPageMetrics(WebView view, String phase) {
        if (!BuildConfig.DEBUG || view == null || view != web || isFinishing()) return;
        final String probe = "(function(){function box(s){var e=document.querySelector(s);if(!e)return null;var r=e.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,pointerEvents:getComputedStyle(e).pointerEvents}}function hit(s){var e=document.querySelector(s);if(!e)return null;var r=e.getBoundingClientRect(),t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return t?t.tagName.toLowerCase()+(t.id?'#'+t.id:'')+'.'+String(t.className||'').toString().replace(/\\s+/g,'.'):null}var c=document.getElementById('gl'),v=window.visualViewport;return JSON.stringify({inner:[innerWidth,innerHeight],visual:v?[Math.round(v.width),Math.round(v.height),v.scale]:null,dpr:devicePixelRatio,orientation:screen.orientation?screen.orientation.type:null,route:document.body.getAttribute('data-sl-route'),bodyClass:document.body.className,webview:" + view.getWidth() + "+'x'+" + view.getHeight() + ",stage:box('#stage'),canvas:box('#gl'),canvasPixels:c?[c.width,c.height]:null,intro:{box:box('#sl-intro'),hidden:document.getElementById('sl-intro')?document.getElementById('sl-intro').hidden:null,phase:document.getElementById('sl-intro')&&document.getElementById('sl-intro').getAttribute('data-phase')},sound:box('#mn-sound'),soundSvg:box('#mn-sound svg'),deploy:box('#btn-start'),deployHit:hit('#btn-start'),introBegin:box('#si-begin'),introBeginHit:hit('#si-begin'),introSkip:box('#si-skip'),introSkipHit:hit('#si-skip')})})()";
        view.evaluateJavascript(probe, value -> Log.i("SightlineV6", phase + " layout=" + value));
    }

    private void installWebInputProbe(WebView view) {
        if (!BuildConfig.DEBUG || view == null) return;
        final String probe = "(function(){if(window.__slAndroidInputProbe)return 'already-installed';window.__slAndroidInputProbe=true;['pointerdown','click'].forEach(function(type){document.addEventListener(type,function(e){var b=e.target&&e.target.closest&&e.target.closest('#si-begin,#si-skip,#btn-start,#btn-rules-back,#mn-sound,#mn-nav button,#mn-subnav button,[data-act=rules-back]');if(b)console.info('[SL_ANDROID_INPUT] '+type+' '+(b.id||b.getAttribute('data-act')||b.textContent.trim().slice(0,32)));},true);});return 'installed';})()";
        view.evaluateJavascript(probe, value -> Log.i("SightlineV6", "input probe=" + value));
    }

    @Override public void onCreate(Bundle state) {
        setTheme(R.style.Theme_Sightline); // Switch from the OS branded startup theme without delaying startup.
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                             WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams p = getWindow().getAttributes();
            p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(p);
        }
        immersive();
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(14, 21, 25));
        setContentView(root);
        updater = new UpdateManager(this);
        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        // Start in the bundled Lobby v10 WebView. The native Offline / LAN
        // launcher remains reachable through Android Back and is not removed.
        openGame(null);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void immersive() {
        // Native immersive fullscreen is distinct from CSS viewport sizing and
        // from browser requestFullscreen (which requires a user gesture).
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller=getWindow().getInsetsController();
            if (controller!=null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive(); // Restore landscape immersive flags after Android dialogs.
    }

    private TextView label(String text, int size) {
        TextView view = new TextView(this);
        view.setText(text); view.setTextSize(size); view.setTextColor(0xffe2eedf);
        view.setPadding(12, 9, 12, 9);
        return view;
    }
    private Button button(String text, Runnable action) {
        Button b = new Button(this);
        b.setText(text); b.setAllCaps(false); b.setMinHeight(52);
        b.setOnClickListener(v -> action.run());
        return b;
    }
    private void showHome() {
        lanJoinGeneration++; lanJoinPending=false;
        showingGame = false;
        chosenLanHost = null;
        disposeWeb();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(20, 12, 20, 18);
        ImageView brand = new ImageView(this);
        brand.setImageResource(R.drawable.sightline_launcher_brand);
        brand.setScaleType(ImageView.ScaleType.FIT_CENTER);
        brand.setContentDescription("Sightline V3 tactical FPS");
        layout.addView(brand, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            Math.round(104 * getResources().getDisplayMetrics().density)));
        layout.addView(label("ANDROID INSTALLATION TEST  ·  NOT A PUBLIC RELEASE", 13));
        layout.addView(label("Offline mode uses game files packaged inside this app. It does not require a PC or internet connection.", 14));
        layout.addView(button("Play Offline", () -> openGame(null)));
        if (BuildConfig.LAN_HOST_ENABLED) {
            layout.addView(label("Create a match on this phone, or find a match on your Wi-Fi. No PC is needed.", 13));
            layout.addView(button("CREATE MATCH", this::startPhoneHost));
            if (activePhoneHostIp != null) {
                layout.addView(label("Host address for Phone B: http://" + activePhoneHostIp + ":8080",14));
                layout.addView(button("Copy Phone Join Address", () -> copyJoinAddress(activePhoneHostIp)));
                layout.addView(button("Stop Phone Host", this::stopPhoneHost));
            }
        }
        if (BuildConfig.SECURE_LAN_RELEASE) {
            layout.addView(label("Release LAN joins use HTTPS/WSS to the approved host and Android's normal certificate validation.", 14));
            layout.addView(button("Join Secure LAN Game", this::askForHost));
        } else {
            layout.addView(label("Development LAN uses unencrypted HTTP/WS. Use only an isolated trusted Wi-Fi or hotspot with no internet exposure or sensitive data.", 14));
            layout.addView(button("FIND LAN MATCH", this::discoverLanHosts));
        }
        layout.addView(label("UPDATES  ·  Optional and free", 17));
        if (updater.enabled()) {
            layout.addView(button("Check for Updates", () -> checkForUpdates(true)));
            CheckBox automatic = new CheckBox(this);
            automatic.setText("Check for updates when I open the launcher");
            automatic.setTextColor(0xffd3e6e1);
            automatic.setChecked(getPreferences(Context.MODE_PRIVATE).getBoolean("optional-update-checks", false));
            automatic.setOnCheckedChangeListener((b, enabled) ->
                getPreferences(Context.MODE_PRIVATE).edit().putBoolean("optional-update-checks",enabled).apply());
            layout.addView(automatic);
            if (verifiedUpdate != null && verifiedUpdate.isFile())
                layout.addView(button("Install Previously Verified Update", this::showInstallDialog));
        } else {
            layout.addView(label("Update checks are disabled until an official HTTPS release feed is configured. Offline play always works.", 12));
        }
        layout.addView(label("Use Android Back to return here. No public servers, accounts, or payments. Local LAN traffic is unencrypted; use only trusted Wi-Fi/hotspot.", 12));
        scroll.addView(layout);
        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        immersive();
        if (updater.enabled() && getPreferences(Context.MODE_PRIVATE).getBoolean("optional-update-checks",false))
            checkForUpdates(false);
    }

    private void checkForUpdates(boolean manual) {
        if (!updater.enabled()) { if (manual) toast("No trusted update feed configured"); return; }
        updater.check((info, error) -> {
            if (showingGame || isFinishing() || isDestroyed()) return; // Never interrupt live matches.
            if (error != null) { if (manual) toast(error); return; }
            if (info == null) { if (manual) toast("Sightline is up to date"); return; }
            new AlertDialog.Builder(this)
                .setTitle("Update Available — " + info.versionName)
                .setMessage("Version " + info.versionName + " (" + info.versionCode + ")\n\n"
                    + info.notes + "\n\nOfficial HTTPS APK: " + info.apkUri
                    + "\n\nDownload and verification are optional. Offline play remains available.")
                .setPositiveButton("Download & Verify", (d,w) -> downloadUpdate(info))
                .setNegativeButton("Later",null)
                .show();
        });
    }

    private void downloadUpdate(UpdateManager.UpdateInfo info) {
        toast("Downloading on a background thread. Offline play remains available.");
        updater.downloadAndVerify(info,(file,error) -> {
            if (isFinishing() || isDestroyed()) return;
            if (error != null) { toast(error); return; }
            verifiedUpdate=file;
            if (!showingGame) showInstallDialog();
            else toast("Verified update is ready. Return Home to install it.");
        });
    }
    private void showInstallDialog() {
        if (verifiedUpdate==null || !verifiedUpdate.isFile()) {
            toast("Verified file is unavailable. Download the update again."); return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Verified Sightline Update")
            .setMessage("APK SHA-256, package name, version and installed signing certificate were checked. "
                + "Android will request your explicit approval. This app will not install anything silently.")
            .setPositiveButton("Open Android Installer", (d,w) -> requestInstall())
            .setNegativeButton("Not Now",null).show();
    }
    private void requestInstall() {
        if (getPackageManager().canRequestPackageInstalls()==false) {
            new AlertDialog.Builder(this).setTitle("Android installation permission")
                .setMessage("Android requires your approval before this app may request an APK installation. "
                    + "Enable only if you trust this source. Return and tap 'Install Previously Verified Update' to continue.")
                .setPositiveButton("Open Android Settings", (d,w) -> {
                    returnedFromInstallSettings=true;
                    Intent settings=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:"+getPackageName()));
                    startActivity(settings);
                }).setNegativeButton("Cancel",null).show();
            return;
        }
        try {
            Uri content=FileProvider.getUriForFile(this,getPackageName()+".fileprovider",verifiedUpdate);
            Intent install=new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(content,"application/vnd.android.package-archive");
            install.setClipData(ClipData.newRawUri("Verified Sightline APK",content));
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install); // Android installer enforces user approval and signature continuity.
        } catch (ActivityNotFoundException | IllegalArgumentException ex) {
            toast("Android installer unavailable: " + ex.getMessage());
        }
    }
    private String selectedLanAddress;
    private volatile int phoneHostGeneration;
    private void chooseLanNetwork(Runnable action) {
        java.util.Map<String,String> networks=LanHostService.lanAddresses();
        if(selectedLanAddress!=null&&!networks.containsKey(selectedLanAddress)){selectedLanAddress=null;lanJoinGeneration++;lanJoinPending=false;phoneHostGeneration++;phoneHostStarting=false;if(activePhoneHostIp!=null){stopService(new Intent(this,LanHostService.class));activePhoneHostIp=null;}new AlertDialog.Builder(this).setTitle("Network changed").setMessage("Select a network to continue.").setPositiveButton("Choose network",(d,w)->chooseLanNetwork(()->{})).setNegativeButton("Back",null).show();return;}
        if(networks.isEmpty()){selectedLanAddress=null;toast("Connect to Wi-Fi and try again.");return;}
        if(networks.size()==1){selectedLanAddress=networks.keySet().iterator().next();action.run();return;}
        if(selectedLanAddress!=null&&networks.containsKey(selectedLanAddress)){action.run();return;}
        selectedLanAddress=null;java.util.List<String> addresses=new java.util.ArrayList<>(networks.keySet());
        String[] labels=new String[addresses.size()];for(int i=0;i<labels.length;i++){String ip=addresses.get(i);labels[i]=networks.get(ip)+" · "+ip;}
        new AlertDialog.Builder(this).setTitle("Choose network").setItems(labels,(d,index)->{selectedLanAddress=addresses.get(index);action.run();}).setNegativeButton("Back",null).show();
    }
    private void startPhoneHost() { chooseLanNetwork(this::startPhoneHostOnNetwork); }
    private void startPhoneHostOnNetwork() {
        if (!BuildConfig.LAN_HOST_ENABLED) { toast("This build does not contain the phone host runtime."); return; }
        if (phoneHostStarting) { toast("Your match is still starting…"); return; }
        if (activePhoneHostIp != null && !new File(getFilesDir(),"phone-host-last-error.txt").exists()) { openGame(activePhoneHostIp,true); return; }
        String ip=selectedLanAddress;
        if(ip==null) {toast("Connect to private Wi-Fi or activate a hotspot first");return;}
        toast("Starting your match…");
        activePhoneHostIp=ip;
        phoneHostStarting=true;
        final int hostGeneration=++phoneHostGeneration;
        try {
            Intent start=new Intent(this,LanHostService.class);
            start.putExtra("lan-address",ip);
            if(Build.VERSION.SDK_INT>=26) startForegroundService(start); else startService(start);
        } catch(Exception e) {activePhoneHostIp=null;phoneHostStarting=false;toast("Hosting could not start: "+e.getMessage());return;}
        new Thread(()->{
            boolean ready=false;
            for(int i=0;i<51 && hostGeneration==phoneHostGeneration;i++) {
                try {
                    java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL("http://"+ip+":8080/status").openConnection();
                    c.setConnectTimeout(400);c.setReadTimeout(400);
                    try {ready=c.getResponseCode()==200; if(ready) {
                        java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream();
                        try(java.io.InputStream input=c.getInputStream()) { byte[] bytes=new byte[512];int n;while((n=input.read(bytes))!=-1) {buffer.write(bytes,0,n);if(buffer.size()>2048)break;} }
                        String body=new String(buffer.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
                        try {
                            org.json.JSONObject status = new org.json.JSONObject(body);
                            ready = status.optBoolean("ok",false) &&
                                "sightline-v12-host-prototype".equals(status.optString("game")) &&
                                acceptsHostBundle(status.optString("bundle"));
                        } catch(org.json.JSONException error) { ready=false; }
                    }} finally {c.disconnect();}
                    if(ready)break;
                } catch(Exception ignored) { }
                try {Thread.sleep(160);}catch(InterruptedException e){Thread.currentThread().interrupt();break;}
            }
            final boolean available=ready;
            runOnUiThread(()->{
                if(isFinishing()||isDestroyed()||hostGeneration!=phoneHostGeneration)return;
                phoneHostStarting=false;
                if(!ip.equals(activePhoneHostIp))return;
                if(available) {
                    openGame(ip,true);
                } else {
                    String reason="Host did not become ready";
                    try {
                        File report=new File(getFilesDir(),"phone-host-last-error.txt");
                        if(report.isFile() && report.length()<1024) {
                            byte[] buf=java.nio.file.Files.readAllBytes(report.toPath());
                            reason=new String(buf,java.nio.charset.StandardCharsets.UTF_8);
                        }
                    } catch(Exception ignored) { }
                    Log.w("SightlineLAN", "Host startup failed: " + reason);
                    stopService(new Intent(this,LanHostService.class));
                    activePhoneHostIp=null;
                    new AlertDialog.Builder(this).setTitle("Unable to host")
                        .setMessage("Check your network connection and try again.")
                        .setPositiveButton("Retry",(d,w)->startPhoneHost())
                        .setNegativeButton("Back",null).show();
                }
            });
        },"sightline-lan-ready").start();
    }
    private void copyJoinAddress(String ip) {
        if (HostPolicy.normalize(ip)==null) return;
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard!=null) clipboard.setPrimaryClip(ClipData.newPlainText("Sightline LAN address", "http://"+ip+":8080"));
        toast("Join address copied. Share it only on your trusted LAN.");
    }
    private void stopPhoneHost() { phoneHostGeneration++; phoneHostStarting=false;
        stopService(new Intent(this,LanHostService.class));
        activePhoneHostIp=null;
        showHome();
    }
    private void askForHost() {
        if (BuildConfig.SECURE_LAN_RELEASE) {
            String host = BuildConfig.LAN_TLS_HOST;
            if (host == null || host.isEmpty()) { toast("This release has no approved secure host configuration"); return; }
            new AlertDialog.Builder(this)
                .setTitle("Join approved secure LAN host")
                .setMessage("Connect to " + host + ":8080 over HTTPS/WSS. Android will validate the host certificate normally; no override is available.")
                .setPositiveButton("Connect", (d, w) -> openGame(host))
                .setNegativeButton("Cancel", null).show();
            return;
        }
        discoverLanHosts();
    }

    private static final int DISCOVERY_PORT = 49192;
    private static final class LanHostCandidate {
        String address, id, mode, map, phase, name; int players, maxPlayers; long lastSeen;
        boolean full() { return players >= maxPlayers; }
        String label() { return (full() ? "FULL · " : "") + (name==null?"Sightline Match":name)+" · " + players + "/" + maxPlayers + " · " + mode + " · " + map; }
    }
    private static boolean privateLanAddress(String value) {
        if (value == null) return false;
        String[] p=value.split("\\."); if(p.length!=4)return false;
        int[] n=new int[4];
        try { for(int i=0;i<4;i++){if(p[i].isEmpty()||p[i].length()>3)return false;n[i]=Integer.parseInt(p[i]);if(n[i]<0||n[i]>255)return false;} }
        catch(NumberFormatException e) { return false; }
        return n[0]==10||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168);
    }
    private static boolean validPrivateBroadcast(InetAddress address) {
        return address instanceof java.net.Inet4Address && HostPolicy.isPrivateNetworkIPv4(address.getHostAddress());
    }
    private static InetAddress directedBroadcast(java.net.InterfaceAddress iface) {
        InetAddress configured=iface.getBroadcast();
        if(configured!=null)return configured;
        InetAddress local=iface.getAddress();short prefix=iface.getNetworkPrefixLength();
        if(!(local instanceof java.net.Inet4Address)||prefix<1||prefix>30)return null;
        byte[] bytes=local.getAddress();int ip=((bytes[0]&255)<<24)|((bytes[1]&255)<<16)|((bytes[2]&255)<<8)|(bytes[3]&255);
        int mask=(int)(0xffffffffL<<(32-prefix));int broadcast=(ip&mask)|~mask;
        byte[] out=new byte[]{(byte)(broadcast>>>24),(byte)(broadcast>>>16),(byte)(broadcast>>>8),(byte)broadcast};
        try{return InetAddress.getByAddress(out);}catch(java.net.UnknownHostException ignored){return null;}
    }
    private void discoverLanHosts() { chooseLanNetwork(this::discoverLanHostsOnNetwork); }
    private void discoverLanHostsOnNetwork() {
        final java.util.concurrent.atomic.AtomicBoolean cancelled=new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.List<LanHostCandidate> hosts=new java.util.ArrayList<>();
        final android.widget.ArrayAdapter<String> rows=new android.widget.ArrayAdapter<>(this,android.R.layout.simple_list_item_1,new java.util.ArrayList<>());
        final android.widget.ListView list=new android.widget.ListView(this); list.setAdapter(rows);
        final android.widget.LinearLayout content=new android.widget.LinearLayout(this);content.setOrientation(android.widget.LinearLayout.VERTICAL);
        final android.widget.TextView state=new android.widget.TextView(this);state.setText("Searching for nearby matches…");
        int inset=(int)(16*getResources().getDisplayMetrics().density);content.setPadding(inset,inset,inset,inset);content.addView(state);content.addView(list);
        final AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Find LAN Match").setView(content)
            .setPositiveButton("Refresh",(d,w)->discoverLanHosts()).setNeutralButton("Advanced",(d,w)->showManualHostEntry())
            .setNegativeButton("Back",null).create();
        dialog.setOnDismissListener(d->cancelled.set(true));
        list.setOnItemClickListener((parent,view,position,id)->{
            if(position<0||position>=hosts.size())return;LanHostCandidate host=hosts.get(position);
            if(host.full()){toast("Match full — choose another room.");return;}
            cancelled.set(true);dialog.dismiss();getPreferences(Context.MODE_PRIVATE).edit().putString("lan-ip",host.address).apply();openGame(host.address,true);
        });
        dialog.show();
        new Thread(()->{
            android.net.wifi.WifiManager.MulticastLock multicast=null;
            try {
                android.net.wifi.WifiManager wifi=(android.net.wifi.WifiManager)getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if(wifi!=null){multicast=wifi.createMulticastLock("sightline-discovery");multicast.setReferenceCounted(false);multicast.acquire();}
                while(!cancelled.get()) {
                    scanLanHosts(cancelled,host->runOnUiThread(()->{
                        if(cancelled.get()||!dialog.isShowing()||isFinishing()||isDestroyed())return;
                        host.lastSeen=android.os.SystemClock.elapsedRealtime();int index=-1;
                        for(int i=0;i<hosts.size();i++)if(hosts.get(i).id.equals(host.id)){index=i;break;}
                        if(index<0){hosts.add(host);rows.add(host.label());}
                        else {hosts.set(index,host);rows.remove(rows.getItem(index));rows.insert(host.label(),index);}
                        state.setText("Select a match to join.");
                    }));
                    runOnUiThread(()->{
                        if(cancelled.get()||!dialog.isShowing())return;
                        long cutoff=android.os.SystemClock.elapsedRealtime()-15000;
                        for(int i=hosts.size()-1;i>=0;i--)if(hosts.get(i).lastSeen<cutoff){hosts.remove(i);rows.remove(rows.getItem(i));}
                        if(hosts.isEmpty())state.setText("No matches found on this Wi-Fi.");
                    });
                    for(int i=0;i<20&&!cancelled.get();i++)Thread.sleep(250);
                }
            } catch(Exception e) {
                Log.w("SightlineLAN","Discovery failed",e);
                runOnUiThread(()->{if(!cancelled.get()&&dialog.isShowing())state.setText("Unable to search — check your network connection.");});
            } finally {if(multicast!=null&&multicast.isHeld())multicast.release();}
        },"sightline-lan-discovery").start();
    }
    private java.util.List<LanHostCandidate> scanLanHosts(java.util.concurrent.atomic.AtomicBoolean cancelled, java.util.function.Consumer<LanHostCandidate> onVerified) throws Exception {
        byte[] nonceBytes=new byte[16]; new java.security.SecureRandom().nextBytes(nonceBytes);
        StringBuilder nonce=new StringBuilder(32); for(byte b:nonceBytes)nonce.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        org.json.JSONObject probe=new org.json.JSONObject(); probe.put("service","sightline-v3-lan");probe.put("kind","probe");probe.put("version",1);probe.put("nonce",nonce.toString());
        byte[] payload=probe.toString().getBytes(StandardCharsets.UTF_8);
        java.util.Set<String> targets=new java.util.LinkedHashSet<>();
        java.util.Enumeration<java.net.NetworkInterface> interfaces=java.net.NetworkInterface.getNetworkInterfaces();
        while(interfaces!=null&&interfaces.hasMoreElements()&&targets.size()<8) {
            java.net.NetworkInterface network=interfaces.nextElement();
            try { if(!network.isUp()||network.isLoopback()||network.isVirtual())continue; } catch(Exception ignored) { continue; }
            for(java.net.InterfaceAddress ia:network.getInterfaceAddresses()) {
                InetAddress local=ia.getAddress(),broadcast=directedBroadcast(ia);
                if(local==null||!(local instanceof java.net.Inet4Address)||!local.getHostAddress().equals(selectedLanAddress)||!privateLanAddress(local.getHostAddress())||!validPrivateBroadcast(broadcast))continue;
                targets.add(broadcast.getHostAddress()); if(targets.size()>=8)break;
            }
        }
        if(targets.isEmpty())return new java.util.ArrayList<>();
        java.util.Map<String,LanHostCandidate> candidates=new java.util.LinkedHashMap<>();
        try(java.net.DatagramSocket socket=new java.net.DatagramSocket(null)) {
            socket.setReuseAddress(false);socket.setBroadcast(true);socket.bind(new java.net.InetSocketAddress(InetAddress.getByName(selectedLanAddress),0));
            java.net.DatagramPacket request=new java.net.DatagramPacket(payload,payload.length);
            for(String target:targets){request.setAddress(InetAddress.getByName(target));request.setPort(DISCOVERY_PORT);socket.send(request);}
            long deadline=android.os.SystemClock.elapsedRealtime()+1250;
            byte[] buffer=new byte[1024];
            while(!cancelled.get() && android.os.SystemClock.elapsedRealtime()<deadline) {
                int left=(int)Math.max(40,Math.min(250,deadline-android.os.SystemClock.elapsedRealtime()));
                try { socket.setSoTimeout(left);java.net.DatagramPacket reply=new java.net.DatagramPacket(buffer,buffer.length);socket.receive(reply);
                    String source=reply.getAddress().getHostAddress();if(!privateLanAddress(source))continue;
                    org.json.JSONObject offer=new org.json.JSONObject(new String(reply.getData(),reply.getOffset(),reply.getLength(),StandardCharsets.UTF_8));
                    if(!"sightline-v3-lan".equals(offer.optString("service"))||!"offer".equals(offer.optString("kind"))||offer.optInt("version")!=1||!nonce.toString().equals(offer.optString("nonce"))||offer.optInt("protocol")!=2||!"dev".equals(offer.optString("transport"))||offer.optInt("port")!=8080)continue;
                    String id=offer.optString("id");if(!id.matches("(?i)[a-f0-9-]{16,64}"))continue;
                    LanHostCandidate c=new LanHostCandidate();c.address=source;c.id=id;c.name=offer.optString("name","Sightline Match");c.players=offer.optInt("players",0);c.maxPlayers=offer.optInt("maxPlayers",0);c.mode=offer.optString("mode","lobby");c.map=offer.optString("map","map");c.phase=offer.optString("phase","lobby");
                    if(c.players<0||c.maxPlayers<2||c.players>c.maxPlayers||c.maxPlayers>32)continue;
                    LanHostCandidate prior=candidates.get(id);if(prior==null&&candidates.size()<32){ candidates.put(id,c); LanHostCandidate verified=verifyLanHost(c); if(verified!=null&&!cancelled.get())onVerified.accept(verified); }
                } catch(java.net.SocketTimeoutException ignored) { }
            }
        }
        return new java.util.ArrayList<>(candidates.values());
    }
    private LanHostCandidate verifyLanHost(LanHostCandidate candidate) {
        java.net.HttpURLConnection connection=null;
        try {
            connection=(java.net.HttpURLConnection)new java.net.URL("http://"+candidate.address+":8080/status").openConnection();
            connection.setConnectTimeout(700);connection.setReadTimeout(700);connection.setUseCaches(false);connection.setRequestProperty("Accept","application/json");
            if(connection.getResponseCode()!=200)return null;
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
            try(java.io.InputStream in=connection.getInputStream()){byte[] b=new byte[512];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>4096)return null;}}
            org.json.JSONObject status=new org.json.JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            if(!status.optBoolean("ok")||!"sightline-v12-host-prototype".equals(status.optString("game"))||status.optInt("protocol")!=2||!"dev".equals(status.optString("transport"))||!acceptsHostBundle(status.optString("bundle")))return null;
            int players=status.optInt("players",-1),max=status.optInt("maxPlayers",-1);if(players<0||max<2||players>max||max>32)return null;
            if(status.has("instanceId")&&!candidate.id.equals(status.optString("instanceId")))return null;candidate.name=status.optString("name",candidate.name);candidate.players=players;candidate.maxPlayers=max;candidate.mode=status.optString("mode",candidate.mode);candidate.map=status.optString("map",candidate.map);candidate.phase=status.optString("phase",candidate.phase);return candidate;
        } catch(Exception ignored) { return null; }
        finally { if(connection!=null)connection.disconnect(); }
    }
    private void showLanHostResults(java.util.List<LanHostCandidate> hosts,String error) {
        String message=hosts.isEmpty()?(error.isEmpty()?"No matches found on this Wi-Fi.":error):"Select a compatible Sightline V3 host to join. Full hosts are shown but cannot be selected.";
        String[] rows=new String[hosts.size()];for(int i=0;i<hosts.size();i++)rows[i]=hosts.get(i).label();
        AlertDialog.Builder builder=new AlertDialog.Builder(this).setTitle("Find LAN Match")
            .setPositiveButton("Refresh",(d,w)->discoverLanHosts())
            .setNeutralButton("Manual IP",(d,w)->showManualHostEntry())
            .setNegativeButton("Back",null);
        if(rows.length==0)builder.setMessage(message);
        if(rows.length>0)builder.setItems(rows,(d,which)->{
            LanHostCandidate host=hosts.get(which);if(host.full()){toast("That LAN host is full");return;}
            getPreferences(Context.MODE_PRIVATE).edit().putString("lan-ip",host.address).apply();openGame(host.address,true);
        });
        builder.show();
    }
    private void showManualHostEntry() {
        EditText address = new EditText(this);
        address.setSingleLine(true);
        address.setText(getPreferences(Context.MODE_PRIVATE).getString("lan-ip",
            getPreferences(Context.MODE_PRIVATE).getString("pc-ip", "")));
        address.setHint("192.168.1.20");
        address.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        int inset = (int)(16 * getResources().getDisplayMetrics().density);
        FrameLayout wrap = new FrameLayout(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1,-2);
        lp.setMargins(inset, 0, inset, 0); wrap.addView(address, lp);
        new AlertDialog.Builder(this)
            .setTitle("Join trusted LAN game")
            .setMessage("Enter Phone A's or the PC host's private IPv4 address. Both devices must share the same Wi-Fi or hosting phone hotspot. Port 8080.")
            .setView(wrap)
            .setPositiveButton("Connect", (d, w) -> {
                String ip = HostPolicy.normalize(address.getText().toString());
                if (ip == null) { toast("Enter a private LAN IPv4 address, e.g. 192.168.1.20"); return; }
                getPreferences(Context.MODE_PRIVATE).edit().putString("lan-ip", ip).apply();
                openGame(ip,true);
            }).setNegativeButton("Cancel", null).show();
    }

    private boolean allowed(Uri uri, boolean mainFrame) {
        if (uri == null) return false;
        String scheme=uri.getScheme(), host=uri.getHost(), path=uri.getPath();
        if (scheme == null || host == null || path == null || uri.getUserInfo() != null) return false;
        if ("https".equals(scheme) && ASSET_DOMAIN.equalsIgnoreCase(host) && uri.getPort() == -1
                && chosenLanHost == null && path.startsWith("/assets/www/")) {
            return FILES.contains(path.substring("/assets/www/".length()));
        }
        boolean approvedLanOrigin = chosenLanHost != null && uri.getPort() == 8080 &&
            (BuildConfig.SECURE_LAN_RELEASE
                ? "https".equals(scheme) && BuildConfig.LAN_TLS_HOST.equalsIgnoreCase(host)
                : "http".equals(scheme) && chosenLanHost.equals(host));
        boolean autoJoinQuery=mainFrame&&"join=1".equals(uri.getQuery());
        if (approvedLanOrigin && (uri.getQuery() == null || autoJoinQuery) && uri.getFragment() == null) {
            if (mainFrame) return path.equals("/") || path.equals("/index.html");
            return LAN_PATHS.contains(path) || (path.startsWith("/") && (FILES.contains(path.substring(1)) || HOSTED_MODULES.contains(path.substring(1))));
        }
        return false;
    }
    private WebResourceResponse blockedResponse() {
        byte[] bytes = "Blocked external request".getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
            java.util.Collections.emptyMap(), new ByteArrayInputStream(bytes));
    }
    private void openGame(String lanHost) {
        openGame(lanHost,lanHost != null);
    }
    private void openGame(String lanHost, boolean autoJoin) {
        if (lanHost != null) {
            if (BuildConfig.SECURE_LAN_RELEASE) {
                if (BuildConfig.LAN_TLS_HOST == null || BuildConfig.LAN_TLS_HOST.isEmpty()) {
                    toast("This release has no approved secure host configuration"); return;
                }
                if (!BuildConfig.LAN_TLS_HOST.equalsIgnoreCase(lanHost)) {
                    toast("This release can connect only to its approved secure host"); return;
                }
                lanHost = BuildConfig.LAN_TLS_HOST;
            } else {
                lanHost = HostPolicy.normalize(lanHost);
                if (lanHost == null) { toast("Enter a valid private LAN IPv4 address"); return; }
            }
        }
        if (lanHost == null) {
            lanJoinGeneration++; lanJoinPending=false;
            openVerifiedGame(null,false); return;
        }
        if (lanJoinPending) { toast("Checking the selected match…"); return; }
        final String target=lanHost;
        final int generation=++lanJoinGeneration;
        lanJoinPending=true;
        toast("Checking the match connection…");
        new Thread(() -> {
            String failure=null;
            try { readLanStatus(target); }
            catch (Exception e) {
                Log.e("SightlineLAN","Host readiness failed before opening bundled LAN client",e);
                if (e instanceof java.net.ConnectException) failure="Host unavailable — try again.";
                else if (e instanceof java.net.SocketTimeoutException) failure="Connection timed out — check that both devices use the same Wi-Fi.";
                else if ("MATCH_FULL".equals(e.getMessage())) failure="Match is full. Choose another room.";
                else failure="Host unavailable — try again.";
            }
            final String error=failure;
            runOnUiThread(() -> {
                if (generation!=lanJoinGeneration || isFinishing() || isDestroyed()) return;
                lanJoinPending=false;
                if ("Match is full. Choose another room.".equals(error)) { toast(error); discoverLanHosts(); return; }
                if (error==null) openVerifiedGame(target,autoJoin);
                else new AlertDialog.Builder(this).setTitle("Could not join match")
                    .setMessage(error+" Your game remains open.")
                    .setPositiveButton("Find LAN Match",(d,w)->discoverLanHosts())
                    .setNeutralButton("Retry",(d,w)->openGame(target,autoJoin))
                    .setNegativeButton("Back",null).show();
            });
        },"sightline-lan-connect").start();
    }
    private org.json.JSONObject readLanStatus(String host) throws Exception {
        java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(
            (BuildConfig.SECURE_LAN_RELEASE?"https://":"http://")+host+":8080/status").openConnection();
        c.setConnectTimeout(1800); c.setReadTimeout(1800); c.setUseCaches(false);
        c.setInstanceFollowRedirects(false);
        try {
            if(c.getResponseCode()!=200) throw new java.io.IOException("Host readiness returned HTTP "+c.getResponseCode());
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
            try(java.io.InputStream input=c.getInputStream()) {
                byte[] b=new byte[512];int n;
                while((n=input.read(b))!=-1) {out.write(b,0,n);if(out.size()>4096)throw new java.io.IOException("Invalid host response size");}
            }
            org.json.JSONObject status=new org.json.JSONObject(out.toString("UTF-8"));
            if(!status.optBoolean("ok") || !"sightline-v12-host-prototype".equals(status.optString("game")) ||
                status.optInt("protocol")!=2 || !(BuildConfig.SECURE_LAN_RELEASE?"release":"dev").equals(status.optString("transport")) ||
                !acceptsHostBundle(status.optString("bundle"))) throw new java.io.IOException("This host is not a compatible Sightline build");
            int players=status.optInt("players",-1),max=status.optInt("maxPlayers",-1);
            if(players<0||max<2||max>32||players>max)throw new java.io.IOException("Invalid host capacity");
            if(players==max)throw new java.io.IOException("MATCH_FULL");
            return status;
        } finally { c.disconnect(); }
    }
    private void openVerifiedGame(String lanHost, boolean autoJoin) {
        chosenLanHost = lanHost;
        disposeWeb();
        root.removeAllViews();
        web = new WebView(this);
        web.setBackgroundColor(0xff111a1c);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(false);
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString()+" SightlineAndroid");
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        reportedWebErrors.clear();
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (BuildConfig.DEBUG && message != null) {
                    String text = message.message() + " @ " + message.sourceId() + ":" + message.lineNumber();
                    if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR ||
                        message.messageLevel() == ConsoleMessage.MessageLevel.WARNING ||
                        text.startsWith("[SL_ANDROID_INPUT]")) {
                        if (reportedWebErrors.add(text)) Log.e("SightlineV6", "Web console " + message.messageLevel() + ": " + text);
                    }
                }
                return super.onConsoleMessage(message);
            }
        });
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                if (!BuildConfig.DEBUG || v != web) return;
                Log.i("SightlineV6", "page finished url=" + url + " webview=" + v.getWidth() + "x" + v.getHeight());
                installWebInputProbe(v);
                logWebPageMetrics(v, "loaded");
                v.postDelayed(() -> logWebPageMetrics(v, "after-intro"), 1600);
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest request, WebResourceErrorCompat error) {
                if (BuildConfig.DEBUG && request != null && error != null) {
                    String text = "asset error code=" + error.getErrorCode() + " url=" + request.getUrl();
                    if (reportedWebErrors.add(text)) Log.e("SightlineV6", text);
                }
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(v, request, response);
                if (BuildConfig.DEBUG && request != null && response != null && response.getStatusCode() >= 400) {
                    String text = "HTTP " + response.getStatusCode() + " url=" + request.getUrl();
                    if (reportedWebErrors.add(text)) Log.e("SightlineV6", text);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri action=request.getUrl();
                if (request.isForMainFrame() && "sightlinelan".equals(action.getScheme())) {
                    if (request.hasGesture() && OFFLINE_URL.equals(v.getUrl())) {
                        if ("create".equals(action.getHost())) startPhoneHost();
                        else if ("find".equals(action.getHost())) discoverLanHosts();
                        else if ("join".equals(action.getHost())) {
                            String host=HostPolicy.normalize(action.getQueryParameter("host"));
                            if(host==null)toast("Enter a valid private LAN host address");
                            else openGame(host,true);
                        }
                    } else toast("Open Multiplayer in the main lobby to create or find a match.");
                    return true;
                }
                if (!allowed(request.getUrl(), true)) {
                    runOnUiThread(() -> toast("Blocked a navigation outside Sightline"));
                    return true;
                }
                return false;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                Uri u=request.getUrl();
                if (!allowed(u, request.isForMainFrame())) return blockedResponse();
                if (chosenLanHost==null) {
                    WebResourceResponse response=assetLoader.shouldInterceptRequest(u);
                    return response == null ? blockedResponse() : response;
                }
                // Never download executable UI from the host. This virtual selected-host
                // origin serves the APK's assets; only the multiplayer socket uses LAN.
                if ("/favicon.ico".equals(u.getPath())) return new WebResourceResponse("image/png",null,204,"No Content",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                String asset=LanPagePolicy.assetPath(u.getPath(),request.isForMainFrame());
                if(asset==null)return blockedResponse();
                try {
                    String mime=LanPagePolicy.mimeType(asset);
                    return new WebResourceResponse(mime,(mime.startsWith("text/")||mime.equals("application/javascript"))?"UTF-8":null,200,"OK",
                        java.util.Collections.singletonMap("Cache-Control","no-store"),getAssets().open(asset));
                } catch(java.io.IOException e) {
                    Log.e("SightlineLAN","Bundled LAN asset missing: "+asset,e);
                    return new WebResourceResponse("text/plain","UTF-8",500,"Missing bundled asset",java.util.Collections.emptyMap(),new ByteArrayInputStream("Missing bundled game asset".getBytes(StandardCharsets.UTF_8)));
                }
            }
            @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail detail) {
                if (BuildConfig.DEBUG) Log.e("SightlineV6", "WebView renderer process gone; crashed=" + detail.didCrash());
                runOnUiThread(() -> { showHome(); toast("WebView restarted after a rendering process failure"); });
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1,-1, Gravity.CENTER));
        showingGame=true;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (lanHost == null) web.loadUrl(OFFLINE_URL);
        else web.loadUrl(LanPagePolicy.pageUrl(lanHost,BuildConfig.SECURE_LAN_RELEASE,autoJoin));
        immersive();
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void disposeWeb() {
        if (web != null) {
            WebView old = web; web=null;
            old.stopLoading(); old.loadUrl("about:blank");
            if (old.getParent() instanceof ViewGroup) ((ViewGroup)old.getParent()).removeView(old);
            old.destroy();
        }
    }
    private void handleBack() {
        if (showingGame) {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
            new AlertDialog.Builder(this).setTitle("Return to launcher?")
                .setMessage("Return to game selection? This player leaves the match. A hosted match keeps running until Stop Hosting.")
                .setPositiveButton("Return", (d,w) -> showHome())
                .setNegativeButton("Keep playing", null).show();
        } else finish();
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() {
        if (web!=null) {
            web.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
            web.onPause();
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); immersive();
        if (web!=null) web.onResume();
        if (returnedFromInstallSettings && !showingGame && root != null) {
            returnedFromInstallSettings=false;
            showHome(); // Re-expose an explicit install button, never auto-launch installer.
        }
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration); immersive();
    }
    @Override protected void onDestroy() {
        if (updater!=null) updater.shutdown();
        disposeWeb(); super.onDestroy();
    }
}



