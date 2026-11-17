package com.sightline.v3;

/** Explicit private IPv4 + fixed-port policy. No DNS, public IPs, credentials or URL fragments. */
public final class HostPolicy {
    private HostPolicy() { }
    /** Interface-derived broadcast destinations may end in .255 (unlike a host input). */
    public static boolean isPrivateNetworkIPv4(String value) {
        if(value==null||!value.matches("[0-9.]+"))return false;
        String[] p=value.split("\\.",-1);if(p.length!=4)return false;
        int[] n=new int[4];
        for(int i=0;i<4;i++) {
            if(p[i].isEmpty()||p[i].length()>3||(p[i].length()>1&&p[i].charAt(0)=='0'))return false;
            n[i]=Integer.parseInt(p[i]);if(n[i]>255)return false;
        }
        return n[0]==10||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168);
    }
    public static String normalize(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.startsWith("http://")) value = value.substring(7);
        if (value.isEmpty() || value.length() > 21) return null;
        // A user enters the PC IP, optionally followed by the game port.
        if (value.endsWith(":8080")) value = value.substring(0, value.length()-5);
        if (!value.matches("[0-9.]+")) return null;
        String[] parts = value.split("\\.", -1);
        if (parts.length != 4) return null;
        int[] n = new int[4];
        for (int i=0; i<4; i++) {
            if (parts[i].length() < 1 || parts[i].length() > 3 || (parts[i].length() > 1 && parts[i].charAt(0)=='0')) return null;
            try { n[i] = Integer.parseInt(parts[i]); } catch (NumberFormatException e) { return null; }
            if (n[i] > 255) return null;
        }
        boolean privateIp = n[0]==10 || (n[0]==172 && n[1]>=16 && n[1]<=31) || (n[0]==192 && n[1]==168);
        if (!privateIp) return null;
        return n[0]+"."+n[1]+"."+n[2]+"."+n[3];
    }
}
