# Lobby 9.0 rollback

The untouched parent is the `work/gameplay-expansion-8.3-20261107/DEV` source tree. Keep it as the Expansion 8.3 rollback baseline.

Within this candidate, the exact pre-lobby production pages are preserved at:

- `rollback/lobby-9.0-pre-change-2026-11-07/offline-index.html`
- `rollback/lobby-9.0-pre-change-2026-11-07/phone-host-index.html`

To revert only the lobby presentation in a separate working copy, restore those files to:

- `AndroidProject/app/src/main/assets/www/index.html`
- `AndroidProject/app/src/main/assets/phone-host/index.html`

Then regenerate the two Android hash inventories with `node tools\refresh-current-asset-hashes.cjs`, update the phone-host page pin in `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` and `tools/capture-lan-host-status.cjs`, refresh the inventories once more, and rerun `node tools\run-expansion8.1-full-verify.cjs`. Do not copy rollback pages into the parent or any protected package. Keep the Lobby 9.0 screenshots and reports as historical evidence.
