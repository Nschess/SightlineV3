# DEV22 Android stability

The WebView renderer exit path now removes and destroys the affected view directly, with no navigation or script work on the failed instance. An exit from a retired view cannot replace the current game. Each page's resource policy uses that view's selected host, and a late full-room notification from a retired page cannot open discovery over its replacement.

LAN readiness and shutdown completions that arrive while paused wait for Activity resume. Existing join and host generation checks still gate the result. Leaving the foreground or replacing discovery cancels the scan, and destroying the Activity drops deferred callbacks and the pending diagnostic payload.

The diagnostic file picker accepts a content URI. Picker permission failures and provider write failures report an error instead of escaping through the UI or export worker. The export remains diagnostic-only.

Verification covers Java source compilation with JDK 17, Android API 36 and the cached AndroidX libraries (generated Android constants stubbed for the compile), the foreground callback probe, and focused client and localhost checks. The socket fixtures now provide the disabled diagnostics variable initialized by the normal game bootstrap. The offline and phone-host runtime assets retain their DEV21 hashes.

Physical WebView renderer death and recovery, background audio, supported Android versions, rotation, and document providers still need testing in a packaged candidate. DEV20 device LAN and DEV21 clarity and performance acceptance remain open.

Android WebView contract: https://developer.android.com/reference/android/webkit/WebViewClient#onRenderProcessGone(android.webkit.WebView,%20android.webkit.RenderProcessGoneDetail)
