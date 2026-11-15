# Lobby 10 + LAN smoothing integration rollback

This candidate was built from the Codex LAN smoothing WIP. The untouched pre-integration copies of all five shared runtime/integrity files are under `rollback/claude-lobby10-premerge-20261114/` and are listed in that folder's `SHA256SUMS.txt`.

From the candidate's `DEV` directory in PowerShell, restore the exact pre-integration state with:

```powershell
$root = (Get-Location).Path
$snapshot = Join-Path $root 'rollback\claude-lobby10-premerge-20261114'
Copy-Item (Join-Path $snapshot 'AndroidProject\app\src\main\assets\www\index.html') (Join-Path $root 'AndroidProject\app\src\main\assets\www\index.html') -Force
Copy-Item (Join-Path $snapshot 'AndroidProject\app\src\main\assets\phone-host\index.html') (Join-Path $root 'AndroidProject\app\src\main\assets\phone-host\index.html') -Force
Copy-Item (Join-Path $snapshot 'AndroidProject\app\src\main\java\com\sightline\v3\MainActivity.java') (Join-Path $root 'AndroidProject\app\src\main\java\com\sightline\v3\MainActivity.java') -Force
Copy-Item (Join-Path $snapshot 'AndroidProject\app\src\main\assets\phone-host\SHA256SUMS') (Join-Path $root 'AndroidProject\app\src\main\assets\phone-host\SHA256SUMS') -Force
Copy-Item (Join-Path $snapshot 'AndroidProject\CURRENT-SOURCE-SHA256.txt') (Join-Path $root 'AndroidProject\CURRENT-SOURCE-SHA256.txt') -Force
node tools\refresh-current-asset-hashes.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools\update-package-content-manifest.ps1
```

This restores the LAN smoothing source state and its original host bundle pin. To make a clean baseline-only copy, omit the integration-only `lobby-10/`, `docs/integration/lobby10/`, `tools/apply-lobby10-overlay.mjs`, and `tests/lobby10-lan-smoothing-integration.test.mjs` files from that copy. Keep the rollback snapshot and both original input archives.
