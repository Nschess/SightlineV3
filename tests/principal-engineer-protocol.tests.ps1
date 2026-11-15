$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$gate = Join-Path $root 'tools\require-release-acceptance.ps1'
$outcomes = Join-Path $root 'tools\record-engineering-outcome.ps1'
$hashHelper = Join-Path $root 'tools\sha256.ps1'
. $hashHelper
$globalInstructions = Join-Path $env:USERPROFILE '.codex\AGENTS.md'
$workspaceInstructions = $null
$cursor = Get-Item -LiteralPath $root
while ($cursor -and -not $workspaceInstructions) {
  $candidateInstructions = Join-Path $cursor.FullName 'AGENTS.md'
  if ((Test-Path -LiteralPath $candidateInstructions -PathType Leaf) -and (Get-Content -LiteralPath $candidateInstructions -Raw) -match 'Sightline V3 Workspace Instructions') { $workspaceInstructions = $candidateInstructions; break }
  $cursor = $cursor.Parent
}
$projectInstructions = Join-Path $root 'AGENTS.md'
foreach ($path in @($globalInstructions,$workspaceInstructions,$projectInstructions)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing persistent instructions: $path" }
}
if ((Get-Content $globalInstructions -Raw) -notmatch 'Principal Game Engineer Protocol' -or (Get-Content $globalInstructions -Raw) -notmatch 'Lineage ownership and safe continuation') { throw 'Global protocol markers missing' }
if ((Get-Content $workspaceInstructions -Raw) -notmatch 'production release fail-closed' -or (Get-Content $workspaceInstructions -Raw) -notmatch 'Source WIP/checkpoint ZIPs') { throw 'Workspace artifact/production protocol markers missing' }
if ((Get-Content $projectInstructions -Raw) -notmatch 'require-release-acceptance\.ps1' -or (Get-Content $projectInstructions -Raw) -notmatch 'private PC test packages') { throw 'Project release/WIP gate instructions missing' }
Write-Output 'PASS: global, workspace and canonical Sightline instructions present'
$hashVector = Join-Path ([IO.Path]::GetTempPath()) ('sightline-sha256-' + [guid]::NewGuid().ToString('N') + '.txt')
try {
  [IO.File]::WriteAllText($hashVector,'abc',[Text.UTF8Encoding]::new($false))
  if ((Get-SightlineSha256 $hashVector) -ne 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') { throw 'SHA-256 helper known-vector check failed' }
  Write-Output 'PASS: module-independent SHA-256 helper known vector'
} finally { Remove-Item -LiteralPath $hashVector -Force -ErrorAction SilentlyContinue }
$gradle = Get-Content -LiteralPath (Join-Path $root 'AndroidProject\app\build.gradle') -Raw
if ($gradle -notmatch 'taskGraph\.whenReady' -or $gradle -notmatch 'require-release-acceptance\.ps1' -or $gradle -notmatch 'AndroidRelease') { throw 'Direct Gradle production release is missing its acceptance gate' }
if ($gradle -notmatch 'debugPackageTasks' -or $gradle -notmatch 'package-candidate\.ps1' -or $gradle -notmatch "'-VerifyOnly'") { throw 'Direct Gradle private debug packaging is missing its source-integrity gate' }
foreach ($scriptPath in @('AndroidProject\tools\build-release.ps1','AndroidProject\tools\publish-manifest.ps1')) {
  $source = Get-Content -LiteralPath (Join-Path $root $scriptPath) -Raw
  if ($source -notmatch 'require-release-acceptance\.ps1') { throw "Production Android entry point is ungated: $scriptPath" }
  if ($source -notmatch 'sha256\.ps1' -or $source -match 'Get-FileHash') { throw "Production Android entry point has an unverified hash dependency: $scriptPath" }
}
foreach ($scriptPath in @('tools\require-release-acceptance.ps1','tools\record-engineering-outcome.ps1','tools\update-package-content-manifest.ps1')) {
  $source = Get-Content -LiteralPath (Join-Path $root $scriptPath) -Raw
  if ($source -notmatch 'sha256\.ps1' -or $source -match 'Get-FileHash') { throw "Project gate/manifest tool has an unverified hash dependency: $scriptPath" }
}
if ((Get-Content -LiteralPath (Join-Path $root 'SIGHTLINE.bat') -Raw) -notmatch 'release-check' -or (Get-Content -LiteralPath (Join-Path $root 'SIGHTLINE.bat') -Raw) -notmatch 'powershell\.exe') { throw 'Windows production release gate command or executable is missing' }
Write-Output 'PASS: Windows and Android production entry points are wired to acceptance gates'
$wipTool = Join-Path $root 'tools\package-candidate.ps1'
if (-not (Test-Path -LiteralPath $wipTool -PathType Leaf)) { throw 'Separate WIP/source integrity gate is missing' }
$wipText = Get-Content -LiteralPath $wipTool -Raw
if ($wipText -notmatch 'WIP-UNVERIFIED' -or $wipText -notmatch 'Test-CandidateManifest' -or $wipText -notmatch 'Assert-ZipMatchesTree') { throw 'WIP gate is missing required label, source integrity, or archive verification' }
$batText = Get-Content -LiteralPath (Join-Path $root 'SIGHTLINE.bat') -Raw
if ($batText -notmatch 'wip-zip' -or $batText -notmatch 'package-candidate\.ps1') { throw 'Windows WIP source-package command is missing' }
$debugBat = Get-Content -LiteralPath (Join-Path $root 'AndroidProject\build-debug.bat') -Raw
if ($debugBat -notmatch '(?s)package-candidate\.ps1.*VerifyOnly' -or $debugBat -notmatch 'assembleDebug|build-debug\.ps1|bootstrap-build\.ps1') { throw 'Android debug build is not source-integrity checked' }
if ($debugBat -match 'require-release-acceptance\.ps1') { throw 'Private debug build was incorrectly coupled to production release acceptance' }
Write-Output 'PASS: private WIP and debug build gates are distinct from production acceptance; direct Gradle debug packaging is source-checked'
& $gate -SelfTest
if ($LASTEXITCODE -ne 0) { throw 'Fail-closed release gate self-test failed' }
& $wipTool -SelfTest
if ($LASTEXITCODE -ne 0) { throw 'WIP package/source-integrity gate self-test failed' }
& $outcomes -SelfTest
if ($LASTEXITCODE -ne 0) { throw 'Evidence-based outcome recorder self-test failed' }
$helper = Join-Path $root 'tools\preserve_sightline_dev_instructions.py'
$helperText = Get-Content -LiteralPath $helper -Raw
if (($helperText -notmatch 'canonical not in contents' -and $helperText -notmatch 'packed != contents') -or $helperText -notmatch 'preserved without overwrite') { throw 'Instruction helper no longer verifies root instruction retention and conflict preservation' }
Write-Output 'PASS: instruction helper source retains canonical rules and non-overwrite guard'
Write-Output 'PASS: Principal Game Engineer protocol checks complete'
