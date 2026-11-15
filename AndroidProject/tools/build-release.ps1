# Invokes Gradle without copying private signing material into the project.
param([string]$ManifestUrl = '')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hashLibrary=(Resolve-Path (Join-Path $root '..\tools\sha256.ps1')).Path
. $hashLibrary
$releaseGate=Join-Path $root 'tools\require-release-acceptance.ps1'
if(-not (Test-Path -LiteralPath $releaseGate -PathType Leaf)){throw 'Fail-closed Android release acceptance gate is missing.'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $releaseGate -Mode AndroidRelease
if($LASTEXITCODE -ne 0){throw 'Android production release acceptance is missing, stale, failed, or unverified.'}
$keyPath=if($env:SIGHTLINE_KEYSTORE_PATH){$env:SIGHTLINE_KEYSTORE_PATH}else{Join-Path $env:LOCALAPPDATA 'SightlineV3\ReleaseSigning\sightline-release.p12'}
if(-not (Test-Path $keyPath)){throw 'No local release keystore. Run tools\provision-signing-key.ps1 ONCE.'}
if($ManifestUrl -and $ManifestUrl -notmatch '^https://[a-zA-Z0-9.-]+/[-a-zA-Z0-9_./]+\.json$'){throw 'Use your official HTTPS manifest URL, no placeholders or IP addresses'}
$env:SIGHTLINE_KEYSTORE_PATH=$keyPath
$env:SIGHTLINE_KEY_ALIAS='sightline-release'
# A blank URL keeps update checks disabled. Never inherit stale feed settings.
$env:SIGHTLINE_UPDATE_MANIFEST_URL=$ManifestUrl
if(-not $ManifestUrl){ Write-Host 'No official update URL: update checks disabled for this build.' }
if(-not $env:SIGHTLINE_KEYSTORE_PASSWORD){throw 'Set SIGHTLINE_KEYSTORE_PASSWORD temporarily for this process (never in source files).'}
if(-not $env:SIGHTLINE_KEY_PASSWORD){$env:SIGHTLINE_KEY_PASSWORD=$env:SIGHTLINE_KEYSTORE_PASSWORD}
Push-Location $root
try {
  $wrapper=Join-Path $root 'gradlew.bat'
  if(Test-Path $wrapper) { & $wrapper --no-daemon :app:assembleRelease }
  else { & gradle --no-daemon :app:assembleRelease }
  if($LASTEXITCODE -ne 0){throw 'Release Gradle build failed'}
  $apk=Join-Path $root 'app\build\outputs\apk\release\app-release.apk'
  if(-not (Test-Path $apk)){throw 'Missing signed release APK'}
  $hash=Get-SightlineSha256 $apk
  Write-Host "SHA-256: $hash"
  $sdk=$env:ANDROID_HOME; if(-not $sdk){$sdk=$env:ANDROID_SDK_ROOT}
  if(-not $sdk){throw 'Set ANDROID_HOME or ANDROID_SDK_ROOT for SDK signing verification.'}
  $apksigner=Get-ChildItem (Join-Path $sdk 'build-tools') -Filter 'apksigner.bat' -Recurse |
       Sort-Object FullName -Descending | Select-Object -First 1
  if(-not $apksigner){throw 'Android SDK apksigner.bat missing; cannot approve release build'}
  $signatureResult=(& $apksigner.FullName verify --verbose --print-certs $apk 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0){throw "APK signature verification failed: $signatureResult"}
  $match=[regex]::Match($signatureResult,'(?im)Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})')
  if(-not $match.Success){throw 'Signer certificate digest not found; check apksigner output manually'}
  $fingerprint=$match.Groups[1].Value.ToLowerInvariant()
  $pin=Join-Path (Split-Path $keyPath) 'release-certificate-sha256.txt'
  if(Test-Path $pin){
    if((Get-Content $pin -Raw).Trim().ToLowerInvariant() -ne $fingerprint) {
       throw 'Release certificate DIFFERENT from the first locally recorded signer. Refusing build.'
    }
  } else {
    $fingerprint | Set-Content -LiteralPath $pin -Encoding ascii
    Write-Host 'Pinned signer fingerprint locally for future releases. Back up this public pin with the key.'
  }
  Write-Host "Signer certificate SHA-256: $fingerprint"
} finally {Pop-Location}
