# Lobby 9.1 Premium Reconstruction — Rollback

The pre-edit state was preserved before production HTML changes. Do not overwrite or delete either snapshot.

## External pre-edit snapshot

Location: `C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-ux-9.1-visual-quality-20261107\rollback-lobby-premium-reconstruction-2026-11-08`  
Manifest: `ROLLBACK-MANIFEST.json`  
Manifest SHA-256: `5193400cec9d65103f1de22eb4f93538d96f3cae0720561283a11235819c0ff7`  
Entries: **10**, all rechecked against their recorded sizes and SHA-256 values.

Restore each listed file from `files/<manifest path>` to the same relative path under this DEV root. Restore all listed files together so the Offline and phone-host pages, Android page pin, and asset manifests remain consistent. Verify with `node tools/verify-lobby-visual-source.cjs` and the Android parity check afterward.

## In-candidate baseline

The existing `DEV/rollback/lobby-9.1-visual-quality-baseline-2026-11-07/` snapshot contains seven source/UI rollback files and remains verified by the source verifier. It is unchanged.

## Safety

Do not restore the old source manifest as if it described the reconstructed page. It is retained as historical evidence. If rolling back, use the paired page, pin, hash-list, capture-tool, and verifier files recorded in the external 10-entry manifest.
