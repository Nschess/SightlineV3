[CmdletBinding()]
param(
  [ValidateSet('WindowsRelease','AndroidRelease')][string]$Mode,
  [string]$ReadinessPath,
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')

$CommonChecks = @('sourceIntegrity','regressionSuite','gameplaySmoke','allModesAndObjectives','visualRuntime','performance','pcLanMultiplayer','audio','escapedDefectReview')
$AndroidChecks = @('androidDeviceRuntime','touchControls','pcToAndroidLan','androidAssetParity','androidPerformance','androidSigningPackage')

function Get-ProjectInventory([string]$Root) {
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $base = $rootFull + [IO.Path]::DirectorySeparatorChar
  $excludedDirectories = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in @('.git','.gradle','build','outputs','.tmp')) { [void]$excludedDirectories.Add($name) }
  $pending = [Collections.Generic.Stack[string]]::new()
  $pending.Push($rootFull)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($entry in [IO.Directory]::EnumerateFileSystemEntries($directory)) {
      $attributes = [IO.File]::GetAttributes($entry)
      $name = [IO.Path]::GetFileName($entry)
      if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) {
        if ($excludedDirectories.Contains($name)) { continue }
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Candidate contains a directory link; refusing ambiguous release inventory: $entry" }
        $pending.Push($entry)
        continue
      }
      $rel = $entry.Substring($base.Length).Replace('\','/')
      if ($rel -ieq 'PACKAGE-CONTENTS-SHA256.txt' -or $rel -ieq 'acceptance/RELEASE-READINESS.json' -or $rel -ieq 'acceptance/ENGINEERING-OUTCOMES.json') { continue }
      $rel
    }
  }
}

function Get-Manifest([string]$Root, [System.Collections.Generic.List[string]]$Errors) {
  $path = Join-Path $Root 'PACKAGE-CONTENTS-SHA256.txt'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $Errors.Add('PACKAGE-CONTENTS-SHA256.txt is missing'); return @{} }
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+?)\s*$') { $Errors.Add("Invalid manifest row: $line"); continue }
    $hash = $matches[1].ToLowerInvariant(); $rel = $matches[2].Replace('\','/')
    if ([IO.Path]::IsPathRooted($rel) -or @($rel.Split('/') | Where-Object { $_ -eq '..' }).Count -gt 0) { $Errors.Add("Unsafe manifest path: $rel"); continue }
    if ($map.ContainsKey($rel)) { $Errors.Add("Duplicate manifest path: $rel"); continue }
    $full = [IO.Path]::GetFullPath((Join-Path $Root $rel.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { $Errors.Add("Manifest path escapes project: $rel"); continue }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $Errors.Add("Manifest file missing: $rel"); continue }
    $actual = Get-SightlineSha256 $full
    if ($actual -ne $hash) { $Errors.Add("Manifest hash mismatch: $rel") }
    $map[$rel] = $hash
  }
  $actualInventory = @(Get-ProjectInventory $Root | Sort-Object)
  $manifestPaths = @($map.Keys | Sort-Object)
  $missing = @($actualInventory | Where-Object { $_ -notin $map.Keys })
  $extra = @($manifestPaths | Where-Object { $_ -notin $actualInventory })
  if ($missing.Count -or $extra.Count) {
    if ($missing.Count) { $Errors.Add('Untracked package files: ' + ($missing -join ', ')) }
    if ($extra.Count) { $Errors.Add('Manifest rows outside package inventory: ' + ($extra -join ', ')) }
  }
  return $map
}

function Test-ReleaseCandidate([string]$Root,[string]$ReleaseMode,[string]$EvidencePath) {
  $errors = [System.Collections.Generic.List[string]]::new()
  $manifest = Get-Manifest $Root $errors
  $manifestFile = Join-Path $Root 'PACKAGE-CONTENTS-SHA256.txt'
  $fingerprint = if (Test-Path -LiteralPath $manifestFile -PathType Leaf) { Get-SightlineSha256 $manifestFile } else { '' }
  if (-not $EvidencePath) { $EvidencePath = Join-Path $Root 'acceptance\RELEASE-READINESS.json' }
  elseif (-not [IO.Path]::IsPathRooted($EvidencePath)) { $EvidencePath = Join-Path $Root $EvidencePath }
  if (-not (Test-Path -LiteralPath $EvidencePath -PathType Leaf)) {
    $errors.Add('Current-candidate release evidence is missing; runtime/device acceptance must be recorded first.')
    return [pscustomobject]@{ Passed=$false; Fingerprint=$fingerprint; Errors=@($errors) }
  }
  try { $doc = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json } catch { $errors.Add('Release evidence JSON is invalid'); return [pscustomobject]@{Passed=$false;Fingerprint=$fingerprint;Errors=@($errors)} }
  if ($doc.schemaVersion -ne 1) { $errors.Add('Unsupported readiness schemaVersion') }
  if ($doc.releaseMode -ne $ReleaseMode) { $errors.Add("Evidence releaseMode must be $ReleaseMode") }
  if ($doc.decision -ne 'GO') { $errors.Add('Evidence decision is not GO') }
  if (-not $fingerprint -or $doc.candidateFingerprint -ne $fingerprint) { $errors.Add('Evidence fingerprint is missing or stale for the current package manifest') }
  $required = @($CommonChecks); if ($ReleaseMode -eq 'AndroidRelease') { $required += $AndroidChecks }
  foreach ($name in $required) {
    $check = $doc.checks.$name
    if (-not $check) { $errors.Add("Required check is missing: $name"); continue }
    if ($check.status -ne 'PASS') { $errors.Add("Required check is not PASS: $name ($($check.status))") }
    if ($check.sourceFingerprint -ne $fingerprint) { $errors.Add("Check evidence is stale or for another source: $name") }
    if (-not $check.evidence -or @($check.evidence).Count -eq 0) { $errors.Add("Evidence artifact is missing: $name"); continue }
    foreach ($item in @($check.evidence)) {
      $rel = [string]$item.path; $expected = ([string]$item.sha256).ToLowerInvariant()
      if (-not $rel -or [IO.Path]::IsPathRooted($rel) -or @($rel.Replace('\','/').Split('/') | Where-Object { $_ -eq '..' }).Count -gt 0) { $errors.Add("Unsafe evidence path for $name"); continue }
      $key = $rel.Replace('\','/')
      if (-not $manifest.ContainsKey($key)) { $errors.Add("Evidence is not in the fingerprinted package: $key ($name)"); continue }
      if ($expected -notmatch '^[a-f0-9]{64}$' -or $manifest[$key] -ne $expected) { $errors.Add("Evidence hash does not match the package manifest: $key ($name)"); continue }
      $full = Join-Path $Root $key.Replace('/',[IO.Path]::DirectorySeparatorChar)
      if (-not (Test-Path -LiteralPath $full -PathType Leaf) -or (Get-SightlineSha256 $full) -ne $expected) { $errors.Add("Evidence artifact hash verification failed: $key ($name)") }
    }
  }
  return [pscustomobject]@{ Passed=($errors.Count -eq 0); Fingerprint=$fingerprint; Errors=@($errors) }
}

function Invoke-SelfTest {
  $testRoot = Join-Path ([IO.Path]::GetTempPath()) ('sightline-release-gate-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $testRoot | Out-Null
  try {
    $null = New-Item -ItemType Directory -Path (Join-Path $testRoot 'acceptance')
    $proof = Join-Path $testRoot 'proof.txt'; [IO.File]::WriteAllText($proof,'evidence',[Text.UTF8Encoding]::new($false))
    $hash = Get-SightlineSha256 $proof
    $manifest = "$($hash.ToUpperInvariant())  proof.txt`n"
    [IO.File]::WriteAllText((Join-Path $testRoot 'PACKAGE-CONTENTS-SHA256.txt'),$manifest,[Text.UTF8Encoding]::new($false))
    $finger = Get-SightlineSha256 (Join-Path $testRoot 'PACKAGE-CONTENTS-SHA256.txt')
    $checks = [ordered]@{}
    foreach ($n in @($CommonChecks + $AndroidChecks)) { $checks[$n] = @{status='PASS';sourceFingerprint=$finger;evidence=@(@{path='proof.txt';sha256=$hash})} }
    $ready = @{schemaVersion=1;releaseMode='AndroidRelease';decision='GO';candidateFingerprint=$finger;checks=$checks}
    $readyPath = Join-Path $testRoot 'acceptance\RELEASE-READINESS.json'
    $failures = 0
    $write = { param($obj) [IO.File]::WriteAllText($readyPath,($obj | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false)) }
    $windowsReady = $ready.Clone(); $windowsReady.releaseMode = 'WindowsRelease'; & $write $windowsReady
    $r = Test-ReleaseCandidate $testRoot 'WindowsRelease' $readyPath
    if ($r.Passed) { Write-Host 'PASS: valid Windows evidence accepted' } else { Write-Host 'FAIL: valid Windows evidence accepted'; $failures++ }
    & $write $ready
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if ($r.Passed) { Write-Host 'PASS: valid evidence accepted' } else { Write-Host 'FAIL: valid evidence accepted'; $failures++ }
    Remove-Item -LiteralPath $readyPath -Force
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if (-not $r.Passed) { Write-Host 'PASS: missing evidence blocked' } else { Write-Host 'FAIL: missing evidence blocked'; $failures++ }
    $bad = $ready.Clone(); $bad.candidateFingerprint = ('0'*64); & $write $bad
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if (-not $r.Passed) { Write-Host 'PASS: stale fingerprint blocked' } else { Write-Host 'FAIL: stale fingerprint blocked'; $failures++ }
    $bad = $ready.Clone(); $bad.checks.regressionSuite.status = 'NOT_VERIFIED'; & $write $bad
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if (-not $r.Passed) { Write-Host 'PASS: unverified required check blocked' } else { Write-Host 'FAIL: unverified required check blocked'; $failures++ }
    $bad = $ready.Clone(); $bad.checks.audio.evidence[0].sha256 = ('0'*64); & $write $bad
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if (-not $r.Passed) { Write-Host 'PASS: evidence hash mismatch blocked' } else { Write-Host 'FAIL: evidence hash mismatch blocked'; $failures++ }
    & $write $ready
    [IO.File]::WriteAllText((Join-Path $testRoot 'untracked.txt'),'untracked',[Text.UTF8Encoding]::new($false))
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if (-not $r.Passed) { Write-Host 'PASS: untracked source blocked' } else { Write-Host 'FAIL: untracked source blocked'; $failures++ }
    Remove-Item -LiteralPath (Join-Path $testRoot 'untracked.txt') -Force
    [IO.File]::WriteAllText($proof,'modified source',[Text.UTF8Encoding]::new($false))
    $r = Test-ReleaseCandidate $testRoot 'AndroidRelease' $readyPath
    if (-not $r.Passed) { Write-Host 'PASS: modified tracked source blocked' } else { Write-Host 'FAIL: modified tracked source blocked'; $failures++ }
    if ($failures) { return 1 }
    return 0
  } finally { Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($SelfTest) { $rc = Invoke-SelfTest; exit $rc }
if (-not $Mode) { Write-Output 'BLOCKED: specify -Mode WindowsRelease or -Mode AndroidRelease'; exit 2 }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$result = Test-ReleaseCandidate $projectRoot $Mode $ReadinessPath
if ($result.Passed) { Write-Output "PASS: $Mode evidence matches candidate $($result.Fingerprint)"; exit 0 }
Write-Output "BLOCKED: $Mode release gate for candidate $($result.Fingerprint)"
foreach ($reason in $result.Errors) { Write-Output " - $reason" }
exit 2
