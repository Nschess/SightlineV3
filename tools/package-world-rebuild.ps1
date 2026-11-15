param(
  [Parameter(Mandatory=$true)][string]$Name,
  [switch]$CleanExtract
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputRoot = Join-Path $projectRoot 'outputs'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$archivePath = Join-Path $outputRoot $Name
if ([IO.Path]::GetExtension($archivePath) -ne '.zip') { throw 'Package name must end with .zip' }
if (Test-Path -LiteralPath $archivePath) { throw "Refusing to overwrite existing archive: $archivePath" }
$manifestPath = Join-Path $projectRoot 'PACKAGE-CONTENTS-SHA256.txt'
$excludedDirectory = '\\(?:\.git|node_modules|\.gradle|build|outputs)\\'
$files = @(Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Force | Where-Object {
  $_.FullName -notmatch $excludedDirectory -and
  $_.Extension.ToLowerInvariant() -notin @('.zip','.pem','.key','.p12','.log','.keystore','.jks') -and
  $_.Name -notin @('local.properties','PACKAGE-CONTENTS-SHA256.txt')
} | Sort-Object FullName)
$rows = foreach ($file in $files) {
  $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $relative"
}
[IO.File]::WriteAllLines($manifestPath, [string[]]$rows, [Text.UTF8Encoding]::new($false))
$agentsPath = Join-Path $projectRoot 'AGENTS.md'
$agentsBytes = [IO.File]::ReadAllBytes($agentsPath)
$agentsText = [Text.Encoding]::UTF8.GetString($agentsBytes)
foreach ($marker in @('# Sightline V3 Project Instructions','Protected baselines and scope','Three.js r128','Acceptance evidence')) {
  if (-not $agentsText.Contains($marker)) { throw "AGENTS.md is missing required instruction section: $marker" }
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$manifestPath,'PACKAGE-CONTENTS-SHA256.txt',[IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally { $zip.Dispose() }
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($archivePath+'.sha256',"$archiveHash  $([IO.Path]::GetFileName($archivePath))`r`n",[Text.UTF8Encoding]::new($false))
$entryCount = $files.Count + 1
if ($CleanExtract) {
  $verifyRoot = Join-Path $outputRoot ('clean-extract-' + [IO.Path]::GetFileNameWithoutExtension($Name))
  if (Test-Path -LiteralPath $verifyRoot) { throw "Refusing to reuse extraction directory: $verifyRoot" }
  [IO.Compression.ZipFile]::ExtractToDirectory($archivePath,$verifyRoot)
  $packedAgents = [IO.File]::ReadAllBytes((Join-Path $verifyRoot 'AGENTS.md'))
  if ([Convert]::ToBase64String($packedAgents) -ne [Convert]::ToBase64String($agentsBytes)) { throw 'Extracted root AGENTS.md differs from the DEV instructions' }
  $manifestLines = [IO.File]::ReadAllLines((Join-Path $verifyRoot 'PACKAGE-CONTENTS-SHA256.txt'))
  foreach ($line in $manifestLines) {
    if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw "Malformed package manifest row: $line" }
    $expected=$Matches[1];$relative=$Matches[2].Replace('/',[IO.Path]::DirectorySeparatorChar);$target=Join-Path $verifyRoot $relative
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Clean extraction missing: $relative" }
    $actual=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Clean extraction checksum mismatch: $relative" }
  }
  $actualFiles=@(Get-ChildItem -LiteralPath $verifyRoot -Recurse -File -Force).Count
  if ($actualFiles -ne ($manifestLines.Count + 1)) { throw "Clean extraction file count mismatch: $actualFiles versus $($manifestLines.Count + 1)" }
}
[pscustomobject]@{Archive=$archivePath;ArchiveSha256=$archiveHash;Manifest=$manifestPath;ManifestEntries=$rows.Count;ArchiveEntries=$entryCount;CleanExtraction=[bool]$CleanExtract;ExtractionRoot=if($CleanExtract){$verifyRoot}else{$null}} | ConvertTo-Json -Depth 3
