# Sightline V3 privacy policy draft

Internal draft for the Android Play edition. Complete the bracketed details and verify the deployed host and final build before publication.

- Operator — [Legal publisher name]
- Privacy inquiries and requests — [Contact address and request process]
- Effective date — [Date]

## Offline play and device data

Sightline V3 can be played offline. The game stores settings, controls, graphics preferences, profile and cosmetic choices, loadouts, progress and records in this app's Android and WebView storage. It remembers LAN preferences, including the chosen nickname and address where applicable. These settings and records stay in app storage unless an action below uses part of them. Offline and secure LAN game pages have separate WebView origins. The Play build is configured to disable Android app backup. Verify cloud and device-transfer behavior on the supported devices before publication.

You can remove the locally retained information by clearing Sightline V3's storage in Android Settings. Clearing storage removes local preferences, progress and records for both game origins. The reviewed version has no account creation or account sign-in.

## Optional multiplayer

When you select **Join Secure LAN Game** and confirm, the Play app contacts the configured host [approved hostname and host operator] over HTTPS and connects to the match over WSS. The host receives your connection IP and timing, chosen nickname, game and appearance choices used in the session, and gameplay actions such as movement and combat. Other players see your nickname, selected appearance and relevant game actions, scores and match state. The host relays play, so it can read session data. HTTPS/WSS encrypts traffic in transit to the host.

The Play app takes its hostname from the release configuration and uses Android's certificate validation. The Play app does not scan the network for rooms or provide phone hosting. The separately installed development/Acceptance build can discover and host matches on private networks and can use unencrypted LAN traffic. Its optional diagnostic export writes to a location the tester chooses.

The reviewed host code maintains active player state and transient connection and performance records in memory. It removes the player entry when the session closes. Its Play-compatible secure mode omits nicknames from routine connection messages in host logs. The deployed host and any DNS, reverse-proxy, support or logging services require separate retention verification. [Describe the actual recipients, locations, logs, purpose, retention and deletion process. Identify the operator and any service providers before publishing.]

## Sharing, services and choices

If you use the loadout share or copy action, the selected text is handed to the operating system share sheet or clipboard. The destination you choose can handle it under its own policy. LAN traffic is optional and offline play stays available. The Privacy Policy button opens the policy page in a browser only when tapped. [Identify the site operator and describe its actual browser requests, logs, cookies, and any third-party handling.]

The reviewed Play app has no in-app update downloads, ads, billing or app-managed analytics integration. Android supplies the WebView and platform APIs. [Confirm the tested bundle, provider behavior and observed outbound destinations before making final claims.]

For privacy questions, or to request access or deletion of any information held by the operator, contact [privacy contact]. [Describe verification, response time, and any legally required retention. Explain any copies the operator cannot delete, such as on other participants' devices.]
