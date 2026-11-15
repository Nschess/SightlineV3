[CmdletBinding()]
param(
  [string]$TaskId,
  [ValidateSet('Accepted','Rejected')][string]$Verdict,
  [string]$SourceFingerprint,
  [string]$EvidencePath,
  [switch]$FirstPass,
  [switch]$EscapedDefect,
  [string]$RootCause,
  [string]$RegressionTest,
  [string]$TestingGap,
  [switch]$Summary,
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')

function Get-ValidatedManifest([string]$Root) {
  $manifestPath = Join-Path $Root 'PACKAGE-CONTENTS-SHA256.txt'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Current package source manifest is missing.' }
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $manifestPath) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+?)\s*$') { throw "Invalid source manifest row: $line" }
    $expected = $matches[1].ToLowerInvariant(); $rel = $matches[2].Replace('\','/')
    if ([IO.Path]::IsPathRooted($rel) -or @($rel.Split('/') | Where-Object { $_ -eq '..' }).Count -gt 0) { throw "Unsafe source manifest path: $rel" }
    if ($map.ContainsKey($rel)) { throw "Duplicate source manifest path: $rel" }
    $full = [IO.Path]::GetFullPath((Join-Path $Root $rel.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw "Manifest path escapes project: $rel" }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Manifest file is missing: $rel" }
    if ((Get-SightlineSha256 $full) -ne $expected) { throw "Manifest hash mismatch: $rel" }
    $map[$rel] = $expected
  }
  $base = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  $inventory = [System.Collections.Generic.List[string]]::new()
  $excludedDirectories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in @('.git','.gradle','build','outputs','.tmp')) { [void]$excludedDirectories.Add($name) }
  $pending = [Collections.Generic.Stack[string]]::new()
  $pending.Push([IO.Path]::GetFullPath($Root).TrimEnd('\','/'))
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)) {
      $attributes = [IO.File]::GetAttributes($entry)
      $name = [IO.Path]::GetFileName($entry)
      if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
        if ($excludedDirectories.Contains($name)) { continue }
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Candidate contains a directory link; refusing ambiguous outcome inventory: $entry" }
        $pending.Push($entry)
        continue
      }
      $rel = $entry.Substring($base.Length).Replace('\','/')
      if ($rel -ieq 'PACKAGE-CONTENTS-SHA256.txt' -or $rel -ieq 'acceptance/RELEASE-READINESS.json' -or $rel -ieq 'acceptance/ENGINEERING-OUTCOMES.json') { continue }
      $inventory.Add($rel)
    }
  }
  $missing = @($inventory | Where-Object { $_ -notin $map.Keys }); $extra = @($map.Keys | Where-Object { $_ -notin $inventory })
  if ($missing.Count -or $extra.Count) { throw ('Package inventory mismatch. Untracked files: ' + ($missing -join ', ') + '; stale manifest entries: ' + ($extra -join ', ')) }
  return [pscustomobject]@{ Map=$map; Fingerprint=(Get-SightlineSha256 $manifestPath) }
}

function Add-Outcome([string]$ProjectRoot,[string]$Id,[string]$Decision,[string]$Fingerprint,[string]$Proof,[bool]$IsFirstPass,[bool]$Escaped,[string]$Cause,[string]$TestPath,[string]$Gap) {
  if (-not $Id -or $Id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$') { throw 'TaskId must be 3-100 safe characters.' }
  if ($Fingerprint -notmatch '^[a-fA-F0-9]{64}$') { throw 'SourceFingerprint must be a SHA-256.' }
  if ($Decision -eq 'Rejected' -and $IsFirstPass) { throw 'A rejected outcome cannot count as first-pass accepted.' }
  if ($Escaped -and (-not $Cause -or ((-not $TestPath) -and (-not $Gap)))) { throw 'Escaped defects require a root cause and a regression-test path or documented testing gap.' }
  $manifestInfo = Get-ValidatedManifest $ProjectRoot
  $actualFingerprint = $manifestInfo.Fingerprint
  if ($Fingerprint.ToLowerInvariant() -ne $actualFingerprint) { throw 'SourceFingerprint is stale; regenerate the package manifest after source changes.' }
  if (-not $Proof) { throw 'EvidencePath is required.' }
  if (-not [IO.Path]::IsPathRooted($Proof)) { $Proof = Join-Path $ProjectRoot $Proof }
  $proofFull = [IO.Path]::GetFullPath($Proof)
  $rootPrefix = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  if (-not $proofFull.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence must be stored inside the candidate project.' }
  if (-not (Test-Path -LiteralPath $proofFull -PathType Leaf)) { throw 'Evidence artifact does not exist.' }
  $relative = $proofFull.Substring($rootPrefix.Length).Replace('\','/')
  $rows = $manifestInfo.Map
  if (-not $rows.ContainsKey($relative)) { throw 'Evidence artifact is not covered by PACKAGE-CONTENTS-SHA256.txt.' }
  $proofHash = Get-SightlineSha256 $proofFull
  if ($proofHash -ne $rows[$relative]) { throw 'Evidence artifact hash differs from the current source manifest.' }
  $store = Join-Path $ProjectRoot 'acceptance\ENGINEERING-OUTCOMES.json'
  if (Test-Path -LiteralPath $store -PathType Leaf) { $doc = Get-Content -LiteralPath $store -Raw | ConvertFrom-Json }
  else { $doc = [pscustomobject]@{ schemaVersion=1; records=@() } }
  if ($doc.schemaVersion -ne 1) { throw 'Unsupported outcome record schema.' }
  foreach ($record in @($doc.records)) {
    if ($record.taskId -eq $Id -and $record.sourceFingerprint -eq $actualFingerprint) { throw 'This task and candidate outcome is already recorded.' }
  }
  $record = [pscustomobject]@{
    taskId=$Id; verdict=$Decision; firstPassAccepted=([bool]($Decision -eq 'Accepted' -and $IsFirstPass)); escapedDefect=$Escaped
    sourceFingerprint=$actualFingerprint; recordedUtc=[DateTime]::UtcNow.ToString('o')
    evidence=[pscustomobject]@{path=$relative;sha256=$proofHash}; rootCause=$Cause; regressionTest=$TestPath; testingGap=$Gap
  }
  $records = @($doc.records) + @($record)
  $out = [pscustomobject]@{ schemaVersion=1; records=$records }
  $dir = Split-Path -Parent $store; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  [IO.File]::WriteAllText($store,($out | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  return $out
}

function Show-Summary($Document,[string]$ProjectRoot) {
  $records = @()
  $base = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  foreach ($record in @($Document.records)) {
    $rel = [string]$record.evidence.path
    if (-not $rel -or [IO.Path]::IsPathRooted($rel) -or @($rel.Replace('\','/').Split('/') | Where-Object { $_ -eq '..' }).Count -gt 0) { continue }
    $full = [IO.Path]::GetFullPath((Join-Path $ProjectRoot $rel.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    if (-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
    if ((Get-SightlineSha256 $full) -ne ([string]$record.evidence.sha256).ToLowerInvariant()) { continue }
    $records += $record
  }
  $tasks = @($records | Group-Object taskId)
  $firstPass = 0
  foreach ($group in $tasks) {
    $first = @($group.Group | Sort-Object recordedUtc | Select-Object -First 1)[0]
    if ($first.firstPassAccepted) { $firstPass++ }
  }
  $rate = if ($tasks.Count) { [math]::Round(100.0*$firstPass/$tasks.Count,2) } else { $null }
  $escaped = @($records | Where-Object { $_.escapedDefect }).Count
  [pscustomobject]@{ recordedTasks=$tasks.Count; firstPassAccepted=$firstPass; firstPassAcceptancePercent=$rate; escapedDefectRecords=$escaped; excludedStaleEvidence=(@($Document.records).Count-$records.Count) }
}

function Invoke-SelfTest {
  $root = Join-Path ([IO.Path]::GetTempPath()) ('sightline-outcomes-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $root | Out-Null
  try {
    New-Item -ItemType Directory -Path (Join-Path $root 'acceptance') | Out-Null
    $proof = Join-Path $root 'proof.txt'; [IO.File]::WriteAllText($proof,'test-evidence',[Text.UTF8Encoding]::new($false))
    $proofHash=Get-SightlineSha256 $proof
    [IO.File]::WriteAllText((Join-Path $root 'PACKAGE-CONTENTS-SHA256.txt'),"$($proofHash.ToUpperInvariant())  proof.txt`n",[Text.UTF8Encoding]::new($false))
    $fp=Get-SightlineSha256 (Join-Path $root 'PACKAGE-CONTENTS-SHA256.txt')
    $empty=[pscustomobject]@{schemaVersion=1;records=@()}; $sum=Show-Summary $empty $root
    if ($null -eq $sum.firstPassAcceptancePercent -and $sum.recordedTasks -eq 0) { Write-Host 'PASS: empty history has no fabricated rate' } else { throw 'Empty history rate self-test failed' }
    $saved=Add-Outcome $root 'selftest-task' 'Accepted' $fp 'proof.txt' $true $false '' '' ''
    $sum=Show-Summary $saved $root
    if ($sum.firstPassAcceptancePercent -eq 100 -and $sum.escapedDefectRecords -eq 0) { Write-Host 'PASS: evidence-backed first-pass metric derived' } else { throw 'Outcome metric self-test failed' }
    try { Add-Outcome $root 'escaped-test' 'Accepted' $fp 'proof.txt' $false $true '' '' '' | Out-Null; throw 'Missing escape record was accepted' } catch { if ($_.Exception.Message -eq 'Missing escape record was accepted') { throw }; Write-Host 'PASS: escaped defect requires cause and test/gap' }
    [IO.File]::WriteAllText($proof,'changed evidence',[Text.UTF8Encoding]::new($false))
    $sum=Show-Summary $saved $root
    if ($sum.recordedTasks -eq 0 -and $sum.excludedStaleEvidence -eq 1 -and $null -eq $sum.firstPassAcceptancePercent) { Write-Host 'PASS: altered evidence excluded from reliability metrics' } else { throw 'Stale evidence was counted in metrics' }
    Write-Host 'PASS: source fingerprint and evidence hashes validated'
    return 0
  } finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($SelfTest) { $rc=Invoke-SelfTest; exit $rc }
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($Summary) {
  $store = Join-Path $projectRoot 'acceptance\ENGINEERING-OUTCOMES.json'
  if (Test-Path -LiteralPath $store -PathType Leaf) { $doc = Get-Content -LiteralPath $store -Raw | ConvertFrom-Json }
  else { $doc = [pscustomobject]@{schemaVersion=1;records=@()} }
  if ($doc.schemaVersion -ne 1) { Write-Output 'BLOCKED: unsupported outcome record schema'; exit 2 }
  Write-Output (Show-Summary $doc $projectRoot | ConvertTo-Json -Compress)
  exit 0
}
try {
  $result=Add-Outcome $projectRoot $TaskId $Verdict $SourceFingerprint $EvidencePath ([bool]$FirstPass) ([bool]$EscapedDefect) $RootCause $RegressionTest $TestingGap
  $summary=Show-Summary $result $projectRoot
  Write-Output ($summary | ConvertTo-Json -Compress)
  exit 0
} catch { Write-Output ("BLOCKED: " + $_.Exception.Message); exit 2 }
