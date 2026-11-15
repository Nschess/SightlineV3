package com.sightline.v3;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Pure, independently unit-testable controls for the first-party update feed. */
public final class UpdatePolicy {
    private static final Pattern HASH = Pattern.compile("[a-f0-9]{64}");
    private static final Pattern DNS = Pattern.compile("(?i)[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?");
    private UpdatePolicy() {}

    public static URI trustedManifest(String raw) {
        if (raw == null || raw.isEmpty()) return null; // Updates intentionally disabled until configured.
        URI u = parse(raw);
        if (!validHttps(u) || !u.getPath().endsWith(".json")) throw new IllegalArgumentException("Invalid HTTPS manifest URL");
        return u;
    }

    /** No cross-site APK, query-string redirects, special schemes, IPs or authentication. */
    public static URI trustedApk(URI manifest, String raw) {
        URI u = parse(raw);
        if (manifest == null || !validHttps(u) || !manifest.getHost().equalsIgnoreCase(u.getHost())
            || normalizedPort(manifest) != normalizedPort(u) || !u.getPath().toLowerCase(Locale.ROOT).endsWith(".apk")) {
            throw new IllegalArgumentException("APK must be HTTPS on manifest host");
        }
        return u;
    }

    public static boolean newer(String packageName, String expectedPackage, long installed, long offered,
                                String sha256) {
        return expectedPackage.equals(packageName) && offered > installed && offered <= Integer.MAX_VALUE
                && sha256 != null && HASH.matcher(sha256).matches();
    }

    public static String validChangelog(String raw) {
        if (raw == null || raw.trim().isEmpty() || raw.length() > 3000) throw new IllegalArgumentException("Invalid changelog");
        return raw.trim();
    }
    public static String validName(String raw) {
        if (raw == null || raw.trim().isEmpty() || raw.length() > 70 || raw.contains("\n"))
            throw new IllegalArgumentException("Invalid version name");
        return raw.trim();
    }
    private static URI parse(String raw) {
        if (raw == null || raw.length() > 2048) throw new IllegalArgumentException("Invalid URL");
        try { return new URI(raw).parseServerAuthority(); }
        catch (URISyntaxException ex) { throw new IllegalArgumentException("Invalid URL", ex); }
    }
    private static int normalizedPort(URI u) { return u.getPort() == -1 ? 443 : u.getPort(); }
    private static boolean validHttps(URI u) {
        return "https".equalsIgnoreCase(u.getScheme()) && u.getHost() != null
                && DNS.matcher(u.getHost()).matches() && u.getHost().contains(".")
                && !u.getHost().matches("[0-9.]+") && normalizedPort(u) == 443
                && u.getUserInfo() == null && u.getRawQuery() == null && u.getRawFragment() == null
                && u.getPath() != null && u.getPath().startsWith("/")
                && !u.getPath().contains("..") && !u.getPath().contains("\\");
    }
}
