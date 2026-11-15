# One-tap LAN discovery (development candidate)

This candidate uses a short private IPv4 UDP query/reply on port **49192**. The
existing game connection remains on TCP/WebSocket port **8080** and still uses
the Protocol V2 handshake. No internet service, account, router forwarding, or
public discovery endpoint is involved. The PC host answers only private-source
probes and returns minimal lobby status; the client validates `/status` before
showing a host. Full hosts are listed as full. Manual private IP remains a
fallback for networks that suppress broadcast traffic.

## Windows PC host

Run `START-HOST.bat` and keep its window open. If Windows Firewall asks, allow
Node.js only on **Private networks**; do not add a Public-network exception and
do not forward port 8080. The host prints its ordinary LAN address as before.

## Windows PC client

In the client PC's extracted copy of this candidate, run:

```cmd
SIGHTLINE.bat lan-client
```

Keep that window open. In another Command Prompt run:

```cmd
SIGHTLINE.bat open-offline
```

Open **Multiplayer**. Available Games scans automatically and refreshes while
that page is open. Select a listed compatible host to join. If the router blocks
broadcast discovery, enter the host's private IPv4 address in the manual field.

## Android client

On Android, choose **Join Development LAN Game**. The native launcher sends the
same discovery query, validates each candidate against the expected game,
Protocol V2, development transport, and bundled host-page fingerprint, then
shows available games. Tap a non-full host to connect. **Manual IP** remains
available from the discovery dialog.

Android hosting is unchanged and is not part of this phase. Secure HTTPS/WSS
release builds do not use UDP discovery or fall back to HTTP/WS.

## Current verification boundary

The offer parser, subnet selection, source filtering, nonce/version checks,
duplicate handling, status validation, timeout path, launch wiring, UI routing,
and release-transport separation have deterministic tests. Real Windows-to-PC
and Windows-to-Android broadcasts, firewall behavior, and join timing still need
testing on actual devices and a private Wi-Fi network. Routers with AP/client
isolation or disabled broadcast require manual IP fallback.

## CMD preview

On the host PC:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lan-one-tap-discovery-20261110\DEV"
START-HOST.bat
```

On another Windows PC, from its copy of this candidate:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lan-one-tap-discovery-20261110\DEV"
SIGHTLINE.bat lan-client
```

Keep that command window running. In a second Command Prompt on the client PC:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lan-one-tap-discovery-20261110\DEV"
SIGHTLINE.bat open-offline
```

Open **Multiplayer**; the list scans automatically and refreshes while visible.
For Android, tap **Join Development LAN Game**, then tap the discovered host.

## Focused source checks

- `node --test tests/lan-discovery.test.cjs tests/lan-discovery-integration.test.cjs tests/secure-transport-policy.test.cjs tests/mp-protocol-v2-security.test.cjs` — 27/27 passed.
- `node tests/phase2-android-asset-parity.mjs` — 48/48 host assets, 15/15 shared libraries, HTML syntax blocks, and native bundle pin passed.
- `node --check` passed for `tools/lan-discovery.cjs`, `tools/offline-static-server.cjs`, and the phone-host `server.js`.

No APK was built, no host was started, and no live UDP, TCP, browser, Android,
or Wi-Fi test was run from this isolated environment.
