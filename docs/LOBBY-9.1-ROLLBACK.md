# Lobby 9.1 rollback

Keep the authoritative Gameplay Expansion 8.3 and Lobby 9.0 sources untouched. The exact Lobby 9.0 Offline and phone-host pages are retained in:

- `rollback/lobby-9.1-pre-change-2026-11-08/offline-index.html`
- `rollback/lobby-9.1-pre-change-2026-11-08/phone-host-index.html`

To revert only the Lobby 9.1 page changes in a separate working copy, restore those files to:

- `AndroidProject/app/src/main/assets/www/index.html`
- `AndroidProject/app/src/main/assets/phone-host/index.html`

Then refresh `AndroidProject/CURRENT-SOURCE-SHA256.txt` and `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS` with `node tools\refresh-current-asset-hashes.cjs`. Update `HOST_BUNDLE_SHA256` in `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` and the expected bundle hash in `tools\capture-lan-host-status.cjs` to the restored phone-host page and hash manifest, refresh hashes again, then run `SIGHTLINE.bat verify-full`.

This is a rollback recipe only. Do not restore pages into the protected parent tree or overwrite the original Lobby 9.0 package.
