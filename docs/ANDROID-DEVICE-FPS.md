# Android device-aware frame targets

The rollback checkpoint is DEV24.7 source 974e944efbb9a28a1b21a50d0d6909eba8baa778.

Native Android reports the active effective refresh rate, active mode and advertised refresh rates at the current resolution. The app uses those values for scheduling and requests only an available refresh rate. Battery Saver releases the window preference and caps gameplay at 60 FPS or the active rate, whichever is lower. Backgrounding and retiring a WebView release the preference. A lower Android rate takes effect immediately and a higher rate must stay available for 1.8 seconds.

New native Android profiles default to Auto. Balanced Auto aims for up to 90 FPS and High Quality or Low Auto prioritizes up to 60. Competitive selects up to 120 FPS. Players can choose Up to 120 independently from the graphics preset. Existing saved limits remain in force. The game stays capped at 120 on faster panels. If native display information is missing, the native bridge path starts at a conservative 60 FPS ceiling.

When adaptive quality is enabled, sustained pressure reduces effects and resolution before dropping to a lower target. A load-limited ceiling stays in place until the graphics preset, frame limit or adaptive setting changes, or the page reloads. A capped sample cannot demonstrate headroom for restoring the cap. The mobile high-refresh pixel budget is held after entering that tier to avoid resizing when Android changes refresh.

On phones, record the effective refresh, panel mode, requested rate, callback cadence, game FPS and P95 frame interval separately. Compare 60, 90 and 120 Hz devices with Battery Saver on and off, then check pause and resume, adaptive fallback, and sustained performance in offline and LAN matches. Browser render submissions do not measure physical presentation or thermals.
