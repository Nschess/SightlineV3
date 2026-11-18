$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')
. (Join-Path $PSScriptRoot 'source-package-inventory.ps1')
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$paths = @(Get-CandidateInventory $root)
$rows = foreach ($relative in $paths) {
  $absolute = Join-Path $root $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
  $hash = (Get-SightlineSha256 $absolute).ToUpperInvariant()
  "$hash  $relative"
}
$fullManifest = Join-Path $root 'PACKAGE-CONTENTS-SHA256.local.txt'
[IO.File]::WriteAllText($fullManifest, (($rows -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$publicRows = @($rows | Where-Object {
  $relative = $_.Substring(66)
  $relative -notin $script:PublicManifestExcludedEvidence
})
$publicManifest = Join-Path $root 'PACKAGE-CONTENTS-SHA256.txt'
[IO.File]::WriteAllText($publicManifest, (($publicRows -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$fingerprint = Get-SightlineSha256 $fullManifest
$publicFingerprint = Get-SightlineSha256 $publicManifest
Write-Output "Updated full local manifest $fullManifest ($($paths.Count) files)"
Write-Output "Updated public source manifest $publicManifest ($($publicRows.Count) approved source files)"
Write-Output "Full local fingerprint: $fingerprint"
Write-Output "Public source fingerprint: $publicFingerprint"
