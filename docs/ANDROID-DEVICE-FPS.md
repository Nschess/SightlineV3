# Android device-aware frame targets

The DEV24.8 rollback checkpoint is 1f7a38aa01771bbd37e50c9f1903a82bb4d986ef.

Native Android reports the active effective refresh rate, active mode and advertised refresh rates at the current resolution. The app uses those values for scheduling and requests only an available refresh rate. Battery Saver releases the window preference and caps gameplay at 60 FPS or the active rate, whichever is lower. Backgrounding and retiring a WebView release the preference. A lower Android rate takes effect immediately and a higher rate must stay available for 1.8 seconds.

New native Android profiles default to Auto. Balanced Auto aims for up to 90 FPS and High Quality or Low Auto prioritizes up to 60. Competitive selects up to 120 FPS. Players can choose Up to 120 independently from the graphics preset. Existing saved limits remain in force. The game stays capped at 120 on faster panels. If native display information is missing, the native bridge path starts at a conservative 60 FPS ceiling.

DEV24.8 measures completed live frame intervals in 750 ms windows and accounts for normal refresh quantization. With adaptive quality enabled, it trims cosmetic effects and shadows before changing resolution, then lowers the FPS target if pressure continues at the graphics floor. Resolution changes take effect before a subsequent frame is drawn. The mobile high-refresh pixel budget stays in its selected tier across display-rate changes.

Rate recovery requires at least 18 seconds of clean intervals and CPU headroom. The controller holds graphics quality during a trial of the next available target and commits the increase after sustained clean frames at that rate. Android must first expose the higher effective refresh if required. Failures return to the prior ceiling and increase the retry cooldown from 20 seconds up to two minutes. Leaving active play discards a trial.

Where Android provides thermal status, severe throttling caps the game at 60 FPS, and critical or higher status caps it at 30 FPS. Moderate throttling blocks recovery trials. After a Battery Saver or thermal cap clears, the controller waits 12 seconds before relaxing the power restriction. Display and user ceilings still apply.

On phones, record the effective refresh, panel mode, requested rate, callback cadence, game FPS and P95 frame interval separately. Also record thermal status and failed, successful or OS-denied recovery trials. Compare 60, 90 and 120 Hz devices with Battery Saver on and off, then check pause and resume, adaptive fallback, and sustained performance in offline and LAN matches. Browser render submissions do not measure physical presentation or thermals.
