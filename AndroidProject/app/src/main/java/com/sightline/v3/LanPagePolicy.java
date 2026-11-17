package com.sightline.v3;

/** The LAN URL is a virtual origin for bundled assets, never a remote HTML download.
 * Keeping the selected server origin preserves strict same-origin WS/WSS policy. */
public final class LanPagePolicy {
    private LanPagePolicy() { }
    public static String pageUrl(String host, boolean secure, boolean autoJoin) {
        return (secure ? "https://" : "http://") + host + ":8080/" + (autoJoin ? "?join=1" : "");
    }
    public static String assetPath(String path, boolean mainFrame) {
        if (mainFrame) return "/".equals(path) || "/index.html".equals(path) ? "phone-host/index.html" : null;
        if (path == null || !path.startsWith("/") || path.contains("..") || path.contains("\\") || path.contains("%")) return null;
        return "phone-host" + path;
    }
    public static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".mp3")) return "audio/mpeg";
        return "text/plain";
    }
}
