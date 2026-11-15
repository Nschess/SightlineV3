[CmdletBinding()]
param(
  [string]$OutputPath,
  [switch]$VerifyOnly,
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sha256.ps1')
. (Join-Path $PSScriptRoot 'local-android-studio-metadata.ps1')

function Get-CandidateInventory([string]$Root) {
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
  $items = [System.Collections.Generic.List[string]]::new()
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
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Candidate contains a directory link; refusing ambiguous inventory: $entry" }
        $pending.Push($entry)
        continue
      }
      $relative = $entry.Substring($prefix.Length).Replace('\','/')
      if (Test-SightlineLocalAndroidStudioMetadata $relative) { continue }
      if ($relative -ieq 'PACKAGE-CONTENTS-SHA256.txt' -or
          $relative -ieq 'acceptance/RELEASE-READINESS.json' -or
          $relative -ieq 'acceptance/ENGINEERING-OUTCOMES.json') { continue }
      $items.Add($relative)
    }
  }
  $items.Sort([StringComparer]::Ordinal)
  return @($items)
}

function Test-CandidateManifest([string]$Root) {
  $errors = [System.Collections.Generic.List[string]]::new()
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $manifestPath = Join-Path $rootFull 'PACKAGE-CONTENTS-SHA256.txt'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    $errors.Add('PACKAGE-CONTENTS-SHA256.txt is missing')
    return [pscustomobject]@{ Passed=$false; Errors=@($errors); Fingerprint='' }
  }
  $fingerprint = Get-SightlineSha256 $manifestPath
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $manifestPath) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s{2}(.+?)\s*$') { $errors.Add("Invalid manifest row: $line"); continue }
    $hash = $matches[1].ToLowerInvariant()
    $relative = $matches[2].Replace('\','/')
    if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or @($relative.Split('/') | Where-Object { $_ -in @('..','.','') }).Count -gt 0) {
      $errors.Add("Unsafe manifest path: $relative"); continue
    }
    if (Test-SightlineLocalAndroidStudioMetadata $relative) { continue }
    if ($map.ContainsKey($relative)) { $errors.Add("Duplicate manifest path: $relative"); continue }
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { $errors.Add("Manifest path escapes candidate: $relative"); continue }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $errors.Add("Manifest file is missing: $relative"); continue }
    if ((Get-SightlineSha256 $full) -ne $hash) { $errors.Add("Manifest hash mismatch: $relative") }
    $map[$relative] = $hash
  }
  if (-not $map.ContainsKey('AGENTS.md')) { $errors.Add('Root AGENTS.md is absent from the source manifest') }
  $actual = @(Get-CandidateInventory $rootFull)
  $listed = @($map.Keys | Sort-Object -CaseSensitive)
  $missing = @($actual | Where-Object { $_ -notin $map.Keys })
  $extra = @($listed | Where-Object { $_ -notin $actual })
  if ($missing.Count) { $errors.Add('Untracked candidate files: ' + ($missing -join ', ')) }
  if ($extra.Count) { $errors.Add('Manifest rows outside candidate inventory: ' + ($extra -join ', ')) }
  return [pscustomobject]@{ Passed=($errors.Count -eq 0); Errors=@($errors); Fingerprint=$fingerprint }
}

function Write-CandidateManifest([string]$Root) {
  $rootFull = [IO.Path]::GetFullPath($Root)
  $rows = foreach ($relative in Get-CandidateInventory $rootFull) {
    $full = Join-Path $rootFull $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
    "$(Get-SightlineSha256 $full)  $relative"
  }
  $path = Join-Path $rootFull 'PACKAGE-CONTENTS-SHA256.txt'
  [IO.File]::WriteAllText($path,(($rows -join "`n") + "`n"),[Text.UTF8Encoding]::new($false))
  return Get-SightlineSha256 $path
}

function Assert-WipOutputPath([string]$Root,[string]$Path) {
  if (-not $Path) { throw 'Specify an output path for the WIP checkpoint ZIP.' }
  $full = [IO.Path]::GetFullPath($Path)
  if ([IO.Path]::GetExtension($full) -ine '.zip') { throw 'WIP checkpoint output must use the .zip extension.' }
  $name = [IO.Path]::GetFileNameWithoutExtension($full)
  if ($name -notmatch '(?i)WIP' -or $name -notmatch '(?i)UNVERIFIED') { throw 'Use a clear WIP-UNVERIFIED filename; runtime acceptance is not asserted by this package gate.' }
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  if ($full.StartsWith($rootFull,[StringComparison]::OrdinalIgnoreCase)) { throw 'Write the WIP ZIP outside the candidate tree.' }
  if (Test-Path -LiteralPath $full) { throw "Refusing to overwrite existing artifact: $full" }
  if (Test-Path -LiteralPath ($full + '.sha256')) { throw "Refusing to overwrite existing checksum: $full.sha256" }
  return $full
}

function Get-StreamSha256([IO.Stream]$Stream) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($Stream))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Assert-ZipMatchesTree([string]$ZipPath,[string]$TreeRoot) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $expected = @{}
  $treePrefix = [IO.Path]::GetFullPath($TreeRoot).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  foreach ($file in Get-ChildItem -LiteralPath $TreeRoot -File -Recurse -Force) {
    $relative = $file.FullName.Substring($treePrefix.Length).Replace('\','/')
    $expected[$relative] = Get-SightlineSha256 $file.FullName
  }
  $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $found = @{}
    foreach ($entry in $archive.Entries) {
      $relative = $entry.FullName.Replace('\','/')
      if ($relative.EndsWith('/')) { continue }
      if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or @($relative.Split('/') | Where-Object { $_ -in @('..','.','') }).Count -gt 0) { throw "Unsafe ZIP entry: $relative" }
      if ($found.ContainsKey($relative)) { throw "Duplicate ZIP entry: $relative" }
      $stream = $entry.Open()
      try { $hash = Get-StreamSha256 $stream } finally { $stream.Dispose() }
      $found[$relative] = $hash
    }
    $missing = @($expected.Keys | Where-Object { -not $found.ContainsKey($_) })
    $extra = @($found.Keys | Where-Object { -not $expected.ContainsKey($_) })
    if ($missing.Count -or $extra.Count) { throw "ZIP inventory mismatch (missing: $($missing -join ', '); extra: $($extra -join ', '))" }
    foreach ($relative in $expected.Keys) { if ($found[$relative] -ne $expected[$relative]) { throw "ZIP content hash mismatch: $relative" } }
  } finally { $archive.Dispose() }
  if (-not $expected.ContainsKey('AGENTS.md')) { throw 'Root AGENTS.md is missing from the archive.' }
  $agentHash = Get-SightlineSha256 (Join-Path $TreeRoot 'AGENTS.md')
  if ($expected['AGENTS.md'] -ne $agentHash) { throw 'Packaged AGENTS.md does not match the staged project instructions.' }
}

function New-WipCheckpoint([string]$Root,[string]$Output) {
  $outputFull = Assert-WipOutputPath $Root $Output
  $sourceCheck = Test-CandidateManifest $Root
  if (-not $sourceCheck.Passed) { throw ('Source integrity failed: ' + ($sourceCheck.Errors -join '; ')) }
  $rootFull = [IO.Path]::GetFullPath($Root)
  $stage = Join-Path ([IO.Path]::GetTempPath()) ('sightline-wip-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null
  try {
    foreach ($relative in Get-CandidateInventory $rootFull) {
      $source = Join-Path $rootFull $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
      $destination = Join-Path $stage $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
      $parent = Split-Path -Parent $destination
      if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      Copy-Item -LiteralPath $source -Destination $destination
    }
    $status = @(
      'Artifact class: PRIVATE WIP SOURCE CHECKPOINT',
      'Runtime/gameplay acceptance: UNVERIFIED by this packaging operation.',
      'Production release status: NOT RELEASE READY.',
      ('Source manifest fingerprint: ' + $sourceCheck.Fingerprint),
      ('Created UTC: ' + [DateTime]::UtcNow.ToString('o')),
      'This archive is a reversible development/test package. It does not claim rendered, gameplay, device, multiplayer, or release acceptance.'
    ) -join "`n"
    [IO.File]::WriteAllText((Join-Path $stage 'WIP-ACCEPTANCE-STATUS.txt'),($status+"`n"),[Text.UTF8Encoding]::new($false))
    $stagedFingerprint = Write-CandidateManifest $stage
    $stageCheck = Test-CandidateManifest $stage
    if (-not $stageCheck.Passed) { throw ('Staged source integrity failed: ' + ($stageCheck.Errors -join '; ')) }
    $parentDir = Split-Path -Parent $outputFull
    if (-not (Test-Path -LiteralPath $parentDir)) { New-Item -ItemType Directory -Path $parentDir -Force | Out-Null }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($stage,$outputFull,[IO.Compression.CompressionLevel]::Optimal,$false)
    Assert-ZipMatchesTree $outputFull $stage
    if (-not $script:WipSelfTestMode) {
      $nodeVerifier = Join-Path $PSScriptRoot 'preserve_sightline_dev_instructions.mjs'
      $node = Get-Command node -ErrorAction SilentlyContinue
      if ($node -and (Test-Path -LiteralPath $nodeVerifier -PathType Leaf)) {
        # The Node verifier mirrors the Python helper's fail-closed verify
        # semantics for root instruction markers, uniqueness, and byte equality.
        & $node.Source $nodeVerifier verify $root --archive $outputFull
        if ($LASTEXITCODE -ne 0) { throw 'Node project-instructions ZIP verifier rejected the WIP archive.' }
      } else {
        $instructionHelper = Join-Path $PSScriptRoot 'preserve_sightline_dev_instructions.py'
        if (-not (Test-Path -LiteralPath $instructionHelper -PathType Leaf)) { throw 'Project AGENTS ZIP-verification helper is missing.' }
        $python = Get-Command py -ErrorAction SilentlyContinue
        if ($python) { & $python.Source -3 $instructionHelper verify $root --archive $outputFull }
        else {
          $python = Get-Command python -ErrorAction SilentlyContinue
          if (-not $python) { throw 'Python and the equivalent Node project-instructions verifier are unavailable.' }
          & $python.Source $instructionHelper verify $root --archive $outputFull
        }
        if ($LASTEXITCODE -ne 0) { throw 'Project AGENTS ZIP-verification helper rejected the WIP archive.' }
      }
    }
    $zipHash = Get-SightlineSha256 $outputFull
    [IO.File]::WriteAllText(($outputFull+'.sha256'),("$zipHash  $([IO.Path]::GetFileName($outputFull))`n"),[Text.UTF8Encoding]::new($false))
    Write-Output "WIP-UNVERIFIED ZIP: $outputFull"
    Write-Output "ZIP SHA-256: $zipHash"
    Write-Output "Staged source fingerprint: $stagedFingerprint"
    Write-Output 'Runtime/gameplay acceptance: UNVERIFIED; production release remains blocked.'
  } catch {
    Remove-Item -LiteralPath $outputFull -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath ($outputFull+'.sha256') -Force -ErrorAction SilentlyContinue
    throw
  } finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}

function Invoke-SelfTest {
  $script:WipSelfTestMode = $true
  $temp = Join-Path ([IO.Path]::GetTempPath()) ('sightline-wip-gate-' + [guid]::NewGuid().ToString('N'))
  $source = Join-Path $temp 'source'
  $outDir = Join-Path $temp 'out'
  New-Item -ItemType Directory -Path $source | Out-Null
  New-Item -ItemType Directory -Path $outDir | Out-Null
  try {
    [IO.File]::WriteAllText((Join-Path $source 'AGENTS.md'),'test instructions',[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $source 'game.js'),'test source',[Text.UTF8Encoding]::new($false))
    $protectedAndroidAsset = Join-Path $source 'AndroidProject\app\src\main\assets\www\index.html'
    New-Item -ItemType Directory -Path (Split-Path -Parent $protectedAndroidAsset) -Force | Out-Null
    [IO.File]::WriteAllText($protectedAndroidAsset,'protected Android game asset',[Text.UTF8Encoding]::new($false))
    [void](Write-CandidateManifest $source)
    $ok = Test-CandidateManifest $source
    if (-not $ok.Passed) { throw ('Valid source manifest rejected: '+($ok.Errors -join '; ')) }
    Write-Output 'PASS: valid complete source inventory accepted'

    $metadataPaths = @(
      'AndroidProject/.idea/.gitignore',
      'AndroidProject/.idea/.name',
      'AndroidProject/.idea/AndroidProjectSystem.xml',
      'AndroidProject/.idea/caches/deviceStreaming.xml',
      'AndroidProject/.idea/compiler.xml',
      'AndroidProject/.idea/deploymentTargetSelector.xml',
      'AndroidProject/.idea/gradle.xml',
      'AndroidProject/.idea/migrations.xml',
      'AndroidProject/.idea/misc.xml',
      'AndroidProject/.idea/workspace.xml',
      'AndroidProject/local.properties'
    )
    foreach ($relative in $metadataPaths) {
      $full = Join-Path $source $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
      $parent = Split-Path -Parent $full
      if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      [IO.File]::WriteAllText($full,'generated local Android Studio metadata',[Text.UTF8Encoding]::new($false))
    }
    $inventory = @(Get-CandidateInventory $source)
    if (@($inventory | Where-Object { Test-SightlineLocalAndroidStudioMetadata $_ }).Count) { throw 'Recognized Android Studio metadata entered the source inventory' }
    if (-not (Test-CandidateManifest $source).Passed) { throw 'Recognized Android Studio metadata incorrectly invalidated the source manifest' }
    $manifestPath = Join-Path $source 'PACKAGE-CONTENTS-SHA256.txt'
    $manifestText = Get-Content -LiteralPath $manifestPath -Raw
    foreach ($relative in $metadataPaths) {
      $full = Join-Path $source $relative.Replace('/',[IO.Path]::DirectorySeparatorChar)
      $manifestText += "$(Get-SightlineSha256 $full)  $relative`n"
    }
    [IO.File]::WriteAllText($manifestPath,$manifestText,[Text.UTF8Encoding]::new($false))
    if (-not (Test-CandidateManifest $source).Passed) { throw 'Legacy manifest rows for recognized Android Studio metadata were not ignored consistently' }
    [void](Write-CandidateManifest $source)
    Write-Output 'PASS: exact Android Studio local metadata is excluded from inventory and manifest comparison'

    $unknownIdeaFile = Join-Path $source 'AndroidProject\.idea\runConfigurations\unexpected.xml'
    New-Item -ItemType Directory -Path (Split-Path -Parent $unknownIdeaFile) -Force | Out-Null
    [IO.File]::WriteAllText($unknownIdeaFile,'not on the local metadata allowlist',[Text.UTF8Encoding]::new($false))
    if ((Test-CandidateManifest $source).Passed) { throw 'Unknown Android Studio metadata was incorrectly excluded' }
    Remove-Item -LiteralPath $unknownIdeaFile
    Write-Output 'PASS: unrecognized .idea files remain subject to the source gate'

    [IO.File]::WriteAllText($protectedAndroidAsset,'tampered protected Android game asset',[Text.UTF8Encoding]::new($false))
    if ((Test-CandidateManifest $source).Passed) { throw 'Protected Android asset mutation was not blocked' }
    [void](Write-CandidateManifest $source)
    Write-Output 'PASS: protected Android game asset mutation remains blocked'

    $ignoredBuildOutput = Join-Path $source 'AndroidProject\app\build\intermediates\generated.bin'
    New-Item -ItemType Directory -Path (Split-Path -Parent $ignoredBuildOutput) -Force | Out-Null
    [IO.File]::WriteAllText($ignoredBuildOutput,'ephemeral build output',[Text.UTF8Encoding]::new($false))
    if ('AndroidProject/app/build/intermediates/generated.bin' -in (Get-CandidateInventory $source)) { throw 'Generated build output entered the source inventory' }
    if (-not (Test-CandidateManifest $source).Passed) { throw 'Generated build output incorrectly invalidated the source inventory' }
    Write-Output 'PASS: generated build directories are pruned before enumeration and excluded from source inventory'

    $zip = Join-Path $outDir 'SightlineV3-WIP-UNVERIFIED-test.zip'
    New-WipCheckpoint $source $zip | Out-Null
    if (-not (Test-Path -LiteralPath ($zip+'.sha256'))) { throw 'ZIP checksum sidecar missing' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $arc = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
      $names = @($arc.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
      if ('AGENTS.md' -notin $names -or 'WIP-ACCEPTANCE-STATUS.txt' -notin $names) { throw 'Required root instructions or WIP status missing from ZIP' }
      $statusEntry = $arc.GetEntry('WIP-ACCEPTANCE-STATUS.txt'); $reader = [IO.StreamReader]::new($statusEntry.Open())
      try { $statusText = $reader.ReadToEnd() } finally { $reader.Dispose() }
      if ($statusText -notmatch 'Runtime/gameplay acceptance: UNVERIFIED' -or $statusText -notmatch 'NOT RELEASE READY') { throw 'WIP status does not clearly distinguish release acceptance' }
    } finally { $arc.Dispose() }
    if ((Get-SightlineSha256 $zip) -ne ((Get-Content -LiteralPath ($zip+'.sha256') -Raw).Split(' ')[0])) { throw 'ZIP checksum sidecar mismatch' }
    Write-Output 'PASS: WIP archive contains root AGENTS, explicit UNVERIFIED status, and matching SHA-256'

    [IO.File]::WriteAllText((Join-Path $source 'game.js'),'modified source',[Text.UTF8Encoding]::new($false))
    if ((Test-CandidateManifest $source).Passed) { throw 'Stale manifest mutation was not blocked' }
    Write-Output 'PASS: stale source mutation blocked'
    [void](Write-CandidateManifest $source)
    [IO.File]::WriteAllText((Join-Path $source 'untracked.js'),'untracked',[Text.UTF8Encoding]::new($false))
    if ((Test-CandidateManifest $source).Passed) { throw 'Untracked source file was not blocked' }
    Remove-Item -LiteralPath (Join-Path $source 'untracked.js')
    Write-Output 'PASS: untracked source blocked'
    try { [void](Assert-WipOutputPath $source (Join-Path $outDir 'SightlineV3-test.zip')); throw 'Unlabeled output accepted' } catch { if ($_.Exception.Message -eq 'Unlabeled output accepted') { throw } }
    Write-Output 'PASS: unlabeled test artifact filename blocked'
    try { New-WipCheckpoint $source $zip; throw 'Existing WIP ZIP overwrite was accepted' } catch { if ($_.Exception.Message -eq 'Existing WIP ZIP overwrite was accepted') { throw } }
    Write-Output 'PASS: existing ZIP/checksum overwrite blocked'
    return 0
  } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue; $script:WipSelfTestMode = $false }
}

if ($SelfTest) { Invoke-SelfTest | Out-Host; exit 0 }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($VerifyOnly) {
  $check = Test-CandidateManifest $root
  if ($check.Passed) { Write-Output "PASS: source manifest and instruction file match candidate $($check.Fingerprint)"; exit 0 }
  Write-Output "BLOCKED: source integrity for candidate $($check.Fingerprint)"
  foreach ($item in $check.Errors) { Write-Output (' - ' + $item) }
  exit 2
}
try { New-WipCheckpoint $root $OutputPath; exit 0 }
catch { Write-Output ('BLOCKED: ' + $_.Exception.Message); exit 2 }
