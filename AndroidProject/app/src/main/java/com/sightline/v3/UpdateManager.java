package com.sightline.v3;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Opt-in, HTTPS-only update discovery + explicit integrity-checked download. No silent install. */
public final class UpdateManager {
    private static final int MANIFEST_LIMIT = 24 * 1024;
    private static final long APK_LIMIT = 200L * 1024L * 1024L;
    private final Context context;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final URI feed;

    public interface Callback<T> { void done(T result, String error); }
    public static final class UpdateInfo {
        public final String versionName, notes, sha256;
        public final long versionCode;
        public final URI apkUri;
        UpdateInfo(String name, String notes, String hash, long code, URI uri) {
            versionName=name; this.notes=notes; sha256=hash; versionCode=code; apkUri=uri;
        }
    }

    public UpdateManager(Context context) {
        this.context=context.getApplicationContext();
        feed=UpdatePolicy.trustedManifest(BuildConfig.UPDATE_MANIFEST_URL);
    }
    public boolean enabled() { return feed != null; }
    public void shutdown() { worker.shutdownNow(); }

    /** Called from the launcher, never blocks gameplay rendering. */
    public void check(Callback<UpdateInfo> callback) {
        if (!enabled()) { ui.post(() -> callback.done(null, "No official HTTPS update feed is configured.")); return; }
        worker.execute(() -> {
            try {
                byte[] json = fetchSmall(feed, MANIFEST_LIMIT);
                JSONObject obj = new JSONObject(new String(json, java.nio.charset.StandardCharsets.UTF_8));
                if (obj.getInt("schema") != 1) throw new IllegalArgumentException("Unsupported update manifest");
                String id=obj.getString("packageName");
                long offered=obj.getLong("versionCode");
                String hash=obj.getString("sha256");
                long installed=installedCode();
                if (!getPackageName().equals(id)) throw new IllegalArgumentException("Update package does not match Sightline");
                if (offered <= installed) { ui.post(() -> callback.done(null,null)); return; }
                if (!UpdatePolicy.newer(id,getPackageName(),installed,offered,hash))
                    throw new IllegalArgumentException("Invalid update version or checksum");
                String name=UpdatePolicy.validName(obj.getString("versionName"));
                String notes=UpdatePolicy.validChangelog(obj.getString("changelog"));
                URI apkUri=UpdatePolicy.trustedApk(feed,obj.getString("apkUrl"));
                UpdateInfo result=new UpdateInfo(name,notes,hash,offered,apkUri);
                ui.post(() -> callback.done(result,null));
            } catch (Exception ex) { ui.post(() -> callback.done(null,"Update check unavailable: " + ex.getMessage())); }
        });
    }
    private String getPackageName() { return context.getPackageName(); }
    private long installedCode() throws Exception {
        PackageInfo info=context.getPackageManager().getPackageInfo(getPackageName(),0);
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    /** Never starts until user taps the explicit Download & verify action. */
    public void downloadAndVerify(UpdateInfo info, Callback<File> callback) {
        worker.execute(() -> {
            File temp=null, verified=null;
            try {
                if (info.versionCode <= installedCode()) throw new SecurityException("Update no longer newer than this app");
                File dir=new File(context.getCacheDir(),"verified-updates");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("Update cache unavailable");
                temp=File.createTempFile("incoming-", ".apk",dir);
                verified=new File(dir,"sightline-verified-update.apk");
                MessageDigest digest=MessageDigest.getInstance("SHA-256");
                HttpURLConnection conn=connect(info.apkUri);
                try {
                    long length=conn.getContentLengthLong();
                    if (length > APK_LIMIT) throw new SecurityException("APK exceeds download limit");
                    long total=0;
                    try (InputStream in=new BufferedInputStream(conn.getInputStream());
                         FileOutputStream out=new FileOutputStream(temp)) {
                        byte[] buffer=new byte[32768]; int n;
                        while ((n=in.read(buffer))!=-1) {
                            total+=n;
                            if (total > APK_LIMIT) throw new SecurityException("APK exceeds download limit");
                            digest.update(buffer,0,n); out.write(buffer,0,n);
                        }
                        out.getFD().sync();
                    }
                    if (total < 1024 || (length>=0 && total!=length)) throw new SecurityException("Incomplete APK");
                } finally { conn.disconnect(); }
                if (!hex(digest.digest()).equals(info.sha256)) throw new SecurityException("APK checksum mismatch");
                if (verified.exists() && !verified.delete()) throw new IllegalStateException("Cannot replace old verified download");
                if (!temp.renameTo(verified)) throw new IllegalStateException("Cannot stage verified APK");
                temp=null;
                validateApk(verified,info);
                File ready=verified;
                ui.post(() -> callback.done(ready,null));
            } catch (Exception ex) {
                if (verified!=null) verified.delete();
                String error=ex.getMessage();
                ui.post(() -> callback.done(null,"Update rejected: " + error));
            } finally { if (temp!=null) temp.delete(); }
        });
    }

    /** Recheck package identity, increasing version and APK signing certificate before installer handoff. */
    private void validateApk(File file, UpdateInfo info) throws Exception {
        PackageManager pm=context.getPackageManager();
        PackageInfo apk=pm.getPackageArchiveInfo(file.getAbsolutePath(),
            Build.VERSION.SDK_INT>=28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
        PackageInfo current=pm.getPackageInfo(getPackageName(),
            Build.VERSION.SDK_INT>=28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
        if (apk==null || !getPackageName().equals(apk.packageName)) throw new SecurityException("Invalid APK package");
        long code=Build.VERSION.SDK_INT>=28 ? apk.getLongVersionCode() : apk.versionCode;
        if (code!=info.versionCode || code<=installedCode()) throw new SecurityException("APK version differs from manifest");
        if (!info.versionName.equals(apk.versionName)) throw new SecurityException("APK version name differs from manifest");
        Signature[] oldSigners=signers(current), newSigners=signers(apk);
        if (oldSigners==null || newSigners==null || oldSigners.length==0 || newSigners.length!=oldSigners.length)
            throw new SecurityException("Signing certificate unavailable or changed");
        // First-party self-hosted releases retain one certificate; deliberate key rotation is not automatic.
        for (int i=0;i<oldSigners.length;i++) {
            boolean found=false;
            for (Signature candidate:newSigners) if (Arrays.equals(oldSigners[i].toByteArray(),candidate.toByteArray())) found=true;
            if (!found) throw new SecurityException("APK signing certificate mismatch");
        }
    }
    private static Signature[] signers(PackageInfo info) {
        if (Build.VERSION.SDK_INT>=28) {
            if (info.signingInfo==null) return null;
            return info.signingInfo.getApkContentsSigners();
        }
        return info.signatures;
    }

    private static byte[] fetchSmall(URI uri,int max) throws Exception {
        HttpURLConnection conn=connect(uri);
        try (InputStream in=conn.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096]; int total=0, count;
            while ((count=in.read(buffer))!=-1) {
                total+=count; if (total>max) throw new SecurityException("Manifest too large");
                out.write(buffer,0,count);
            }
            return out.toByteArray();
        } finally { conn.disconnect(); }
    }
    private static HttpURLConnection connect(URI uri) throws Exception {
        if (!"https".equals(uri.getScheme())) throw new SecurityException("HTTPS required");
        HttpURLConnection conn=(HttpURLConnection)uri.toURL().openConnection();
        conn.setInstanceFollowRedirects(false); // no HTTPS -> HTTP or cross-host redirects
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(12000);
        conn.setUseCaches(false);
        conn.setRequestProperty("Accept","application/json, application/vnd.android.package-archive");
        int status=conn.getResponseCode();
        if (status!=200) { conn.disconnect(); throw new IllegalStateException("HTTPS server returned "+status); }
        return conn;
    }
    private static String hex(byte[] bytes) {
        char[] digits="0123456789abcdef".toCharArray(); StringBuilder s=new StringBuilder(64);
        for (byte b:bytes) { int n=b&255; s.append(digits[n>>>4]).append(digits[n&15]); }
        return s.toString();
    }
}
