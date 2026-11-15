# Match Rules Back button rollback — 2026-11-14

This focused rollback restores the five Offline/phone-host and Android integrity files exactly as they were immediately before adding the Match Rules Back control. It leaves other candidate source, tests, docs, and the earlier Lobby 10 integration rollback untouched.

Snapshot: `rollback/lobby10-match-rules-back-prechange-20261114/`

From the candidate `DEV` directory in PowerShell:

```powershell
$root = (Get-Location).Path
$snapshot = Join-Path $root 'rollback\lobby10-match-rules-back-prechange-20261114'
$files = @(
  'AndroidProject\app\src\main\assets\www\index.html',
  'AndroidProject\app\src\main\assets\phone-host\index.html',
  'AndroidProject\app\src\main\java\com\sightline\v3\MainActivity.java',
  'AndroidProject\app\src\main\assets\phone-host\SHA256SUMS',
  'AndroidProject\CURRENT-SOURCE-SHA256.txt'
)
foreach ($relative in $files) {
  $destination = Join-Path $root $relative
  Copy-Item -LiteralPath (Join-Path $snapshot $relative) -Destination $destination -Force
}
node tools\refresh-current-asset-hashes.cjs
. .\tools\update-package-content-manifest.ps1
```

The snapshot's `SHA256SUMS.txt` lists all five file hashes. This rollback removes only the Rules Back change and restores the matching Android bundle/source pins.
