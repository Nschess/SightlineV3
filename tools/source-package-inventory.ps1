. (Join-Path $PSScriptRoot 'local-android-studio-metadata.ps1')

$script:PublicManifestExcludedEvidence = @(
  'AndroidProject/DEVICE-UPDATE-ACCEPTANCE.md',
  'AndroidProject/OWNER-ACCEPTANCE.md',
  'AndroidProject/SAMSUNG-ACCEPTANCE.md',
  'WIP-ACCEPTANCE-STATUS.txt',
  'docs/EXPANSION-8.2-ACCEPTANCE-REPORT.md',
  'docs/EXPANSION-8.3-ACCEPTANCE-REPORT.md'
)

function Get-CandidateInventory([string]$Root, [switch]$PublicOnly) {
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
  $items = [System.Collections.Generic.List[string]]::new()
  $excludedDirectories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in @('.git','.gradle','.cxx','build','outputs','.tmp')) { [void]$excludedDirectories.Add($name) }
  $pending = [Collections.Generic.Stack[string]]::new()
  $pending.Push($rootFull)
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
      if ($PublicOnly -and $relative -iin $script:PublicManifestExcludedEvidence) { continue }
      $items.Add($relative)
    }
  }
  $items.Sort([StringComparer]::Ordinal)
  return @($items)
}
