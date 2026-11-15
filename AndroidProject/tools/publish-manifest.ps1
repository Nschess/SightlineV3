# Generates an HTTPS manifest for the exact locally signed release APK. DOES NOT upload/publish.
param([Parameter(Mandatory=$true)][string]$Apk,
      [Parameter(Mandatory=$true)][string]$ApkHttpsUrl,
      [Parameter(Mandatory=$true)][string]$ManifestHttpsUrl,
      [Parameter(Mandatory=$true)][string]$Changelog,
      [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hashLibrary=(Resolve-Path (Join-Path $root '..\tools\sha256.ps1')).Path
. $hashLibrary
$releaseGate=Join-Path $root 'tools\require-release-acceptance.ps1'
if(-not (Test-Path -LiteralPath $releaseGate -PathType Leaf)){throw 'Fail-closed Android release acceptance gate is missing.'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $releaseGate -Mode AndroidRelease
if($LASTEXITCODE -ne 0){throw 'Android manifest creation blocked: current-candidate release acceptance is missing, stale, failed, or unverified.'}
$v=@{}; Get-Content (Join-Path $root 'app\version.properties') | ForEach-Object {if($_ -match '^([^=]+)=(.*)$'){$v[$matches[1]]=$matches[2]}}
$sha=Get-SightlineSha256 $Apk
if($ApkHttpsUrl -notmatch '^https://[A-Za-z0-9.-]+/[-A-Za-z0-9_./]+\.apk$'){throw 'APK URL must use your trusted HTTPS release host'}
if($ManifestHttpsUrl -notmatch '^https://[A-Za-z0-9.-]+/[-A-Za-z0-9_./]+\.json$') {throw 'Invalid HTTPS manifest URL'}
if(([uri]$ApkHttpsUrl).Host -ne ([uri]$ManifestHttpsUrl).Host){throw 'Manifest and APK URLs must use the same trusted host'}
if($Changelog.Length -lt 1 -or $Changelog.Length -gt 3000){throw 'Invalid changelog length'}
# Verify signature separately with Android SDK apksigner, and ensure manifest version matches APK aapt metadata!
$sdk=$env:ANDROID_HOME; if(-not $sdk){$sdk=$env:ANDROID_SDK_ROOT}
if(-not $sdk){throw 'Android SDK required to verify release APK before publishing manifest'}
$apksigner=Get-ChildItem (Join-Path $sdk 'build-tools') -Filter 'apksigner.bat' -Recurse | Sort-Object FullName -Descending | Select-Object -First 1
$aapt=Get-ChildItem (Join-Path $sdk 'build-tools') -Filter 'aapt.exe' -Recurse | Sort-Object FullName -Descending | Select-Object -First 1
if(-not $apksigner -or -not $aapt){throw 'Missing apksigner or aapt. Build tools required'}
& $apksigner.FullName verify --print-certs $Apk | Out-Null
if($LASTEXITCODE -ne 0){throw 'APK signature invalid'}
$packageLine=(& $aapt.FullName dump badging $Apk | Select-String '^package:').ToString()
if($LASTEXITCODE -ne 0 -or $packageLine -notmatch "name='com\.sightline\.v3'" -or
  $packageLine -notmatch "versionCode='$($v.VERSION_CODE)'" -or
  $packageLine -notmatch "versionName='$($v.VERSION_NAME)'") {throw 'APK metadata differs from app/version.properties'}
[ordered]@{schema=1;packageName='com.sightline.v3';versionCode=[int]$v.VERSION_CODE;
 versionName=$v.VERSION_NAME;changelog=$Changelog;apkUrl=$ApkHttpsUrl;sha256=$sha} |
 ConvertTo-Json -Depth 3 | ForEach-Object {[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($Output),$_,[System.Text.UTF8Encoding]::new($false))}
Write-Host "Created manifest: $Output (not hosted)."
Write-Host 'Verify APK signer, metadata and domain, then upload APK and manifest to your controlled HTTPS host.'
