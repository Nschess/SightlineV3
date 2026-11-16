[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ApkPath)
$ErrorActionPreference = 'Stop'
$expected = 'acea893bb7689a207a46834b58b3dc0e60e8f4e68e06101b566b312c80b617f2'
$parentCommit = '77b2b6645df120c76a334c8a5ac2157feae68c2d'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = Join-Path $root 'recovery/hud51-runtime'
if (Test-Path -LiteralPath $output) { throw 'Recovery evidence already exists; refusing overwrite' }
if ((Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Not the exact owner-approved HUD51 APK' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($ApkPath)
$records = [Collections.Generic.List[object]]::new()
$copied = 0
try {
  foreach ($entry in @($zip.Entries | Where-Object {$_.FullName.StartsWith('assets/') -and -not $_.FullName.EndsWith('/')} | Sort-Object FullName)) {
    $name = $entry.FullName
    if ($name.Contains('\') -or @($name.Split('/') | Where-Object {$_ -eq '..' -or $_ -eq '.' -or $_ -eq ''}).Count) { throw 'Unsafe APK entry' }
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    $source = 'AndroidProject/app/src/main/' + $name
    $sourcePath = Join-Path $root $source
    $matches = (Test-Path -LiteralPath $sourcePath -PathType Leaf) -and ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $digest)
    $stored = $null
    if (-not $matches) {
      $stored = 'recovery/hud51-runtime/' + $name
      $destination = Join-Path $root $stored
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
      [IO.File]::WriteAllBytes($destination,$bytes)
      $copied++
    }
    $records.Add([ordered]@{entry=$name;bytes=$bytes.Length;sha256=$digest;existingSource=$source;matchesParent=$matches;storedOriginal=$stored})
  }
} finally { $zip.Dispose() }
$manifest = [ordered]@{
  provenance='Exact packaged runtime bytes from the hash-verified owner-approved APK. Not reconstructed source.'
  apkSha256=$expected
  existingSourceCommit=$parentCommit
  limitation='APK runtime assets are recoverable. Original editable workspace, native Java source, Gradle configuration and signing key are not recovered from compiled APK contents.'
  assets=@($records.ToArray())
}
[IO.Directory]::CreateDirectory($output) | Out-Null
[IO.File]::WriteAllText((Join-Path $output 'MANIFEST.json'),(($manifest | ConvertTo-Json -Depth 8)+"`n"),[Text.UTF8Encoding]::new($false))
if ((Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Protected APK changed during reading' }
Write-Output ('Recovered '+$records.Count+' asset fingerprints; '+$copied+' exact differing assets stored, '+($records.Count-$copied)+' reused from Git parent. Protected APK unchanged.')
