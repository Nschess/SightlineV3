# DEV24.2 mobile Settings and Match Rules

The source rollback is `414e7da859e03f2938f6e0f1518228d1b88171b6`. The mobile console is shared by the Android offline and phone-host pages. It reuses existing settings, rule messages and host checks.

- Settings groups touch controls and HUD preferences, sensitivity, graphics, audio and gameplay. Navigation and the control list scroll independently. DEV24.1 graphics settings and diagnostic reports remain available.
- Match Rules separates match setup, AI roster and mode-specific timing. Back to Lobby and Maps stay above the scrolling controls. Hosts have Cancel, Apply Rules and Start Match in the footer. Guests open a read-only view from their lobby.
- Draft edits survive menu navigation. Apply a LAN mode change separately because the host establishes new mode defaults. Apply waits for an authoritative lobby update. If confirmation is delayed, an update that still matches the pending draft in the same session can complete it. Cancel and subsequent edits invalidate that pending confirmation.
- Offline Apply commits only the edited fields locally.

## Isolated evidence

The baseline Settings captured at 667 × 375 showed two levels of categories above the controls. The candidate puts the five mobile categories beside the controls. The isolated preview covered 568 × 320, 667 × 375 and 844 × 390 CSS pixels. The smallest Settings preview used 125% text and simulated 24 px left, 22 px right and 10 px bottom safe areas. The checked panels stayed within their viewport and had no horizontal content overflow. The checked buttons measured at least 44 CSS px high.

Loopback previews exercised touch navigation, the host draft across Maps, Cancel, host confirmation of a Bomb mode change, Bomb timing, the guest's read-only view, and a two-client Tactical start. Focused source tests also cover discarding a late confirmation after the draft changes and committing offline edits.

Physical Android/WebView, device cutouts and LAN acceptance remain open. This is a source checkpoint.
