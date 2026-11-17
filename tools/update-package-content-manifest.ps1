$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')
. (Join-Path $PSScriptRoot 'local-android-studio-metadata.ps1')
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$prefix = [IO.Path]::GetFullPath($root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$publicEvidenceExclusions = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($relative in @(
  'AndroidProject/DEVICE-UPDATE-ACCEPTANCE.md',
  'AndroidProject/OWNER-ACCEPTANCE.md',
  'AndroidProject/SAMSUNG-ACCEPTANCE.md',
  'WIP-ACCEPTANCE-STATUS.txt',
  'docs/EXPANSION-8.2-ACCEPTANCE-REPORT.md',
  'docs/EXPANSION-8.3-ACCEPTANCE-REPORT.md'
)) { [void]$publicEvidenceExclusions.Add($relative) }
$paths = [System.Collections.Generic.List[string]]::new()
$excludedDirectories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($name in @('.git','.gradle','.cxx','build','outputs','.tmp')) { [void]$excludedDirectories.Add($name) }
$pending = [Collections.Generic.Stack[string]]::new()
$pending.Push($root)
while ($pending.Count -gt 0) {
  $directory = $pending.Pop()
  foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)) {
    $attributes = [IO.File]::GetAttributes($entry)
    $name = [IO.Path]::GetFileName($entry)
    if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
      if ($excludedDirectories.Contains($name)) { continue }
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Candidate contains a directory link; refusing ambiguous inventory: $entry" }
      $pending.Push($entry)
      continue
    }
    $relative = $entry.Substring($prefix.Length).Replace('\','/')
    if ($relative -ieq '.git') { continue }
    if (Test-SightlineLocalAndroidStudioMetadata $relative) { continue }
    if ($relative -ieq 'PACKAGE-CONTENTS-SHA256.txt' -or
        $relative -ieq 'PACKAGE-CONTENTS-SHA256.local.txt' -or
        $relative -ieq 'acceptance/RELEASE-READINESS.json' -or
        $relative -ieq 'acceptance/ENGINEERING-OUTCOMES.json') { continue }
    $paths.Add($relative)
  }
}
$paths.Sort([StringComparer]::Ordinal)
$rows = foreach ($relative in $paths) {
  $absolute = Join-Path $root $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
  $hash = (Get-SightlineSha256 $absolute).ToUpperInvariant()
  "$hash  $relative"
}
$fullManifest = Join-Path $root 'PACKAGE-CONTENTS-SHA256.local.txt'
[IO.File]::WriteAllText($fullManifest, (($rows -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$publicRows = @($rows | Where-Object {
  $relative = $_.Substring(66)
  -not $publicEvidenceExclusions.Contains($relative)
})
$publicManifest = Join-Path $root 'PACKAGE-CONTENTS-SHA256.txt'
[IO.File]::WriteAllText($publicManifest, (($publicRows -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$fingerprint = Get-SightlineSha256 $fullManifest
$publicFingerprint = Get-SightlineSha256 $publicManifest
Write-Output "Updated full local manifest $fullManifest ($($paths.Count) files)"
Write-Output "Updated public source manifest $publicManifest ($($publicRows.Count) approved source files)"
Write-Output "Full local fingerprint: $fingerprint"
Write-Output "Public source fingerprint: $publicFingerprint"
