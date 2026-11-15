$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')
. (Join-Path $PSScriptRoot 'local-android-studio-metadata.ps1')
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$prefix = [IO.Path]::GetFullPath($root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$paths = [System.Collections.Generic.List[string]]::new()
$excludedDirectories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($name in @('.git','.gradle','build','outputs','.tmp')) { [void]$excludedDirectories.Add($name) }
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
    if (Test-SightlineLocalAndroidStudioMetadata $relative) { continue }
    if ($relative -ieq 'PACKAGE-CONTENTS-SHA256.txt' -or
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
$manifest = Join-Path $root 'PACKAGE-CONTENTS-SHA256.txt'
[IO.File]::WriteAllText($manifest, (($rows -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
$fingerprint = Get-SightlineSha256 $manifest
Write-Output "Updated $manifest ($($paths.Count) files)"
Write-Output "Candidate source fingerprint: $fingerprint"
