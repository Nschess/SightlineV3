# Run ONCE on your own PC only after confirming no prior release-signed Sightline APK/key exists.
param([switch]$CreateNewReleaseIdentity)
# Never store private keys or passwords in a shared ZIP/repository.
$ErrorActionPreference='Stop'
$keyHome=Join-Path $env:LOCALAPPDATA 'SightlineV3\ReleaseSigning'
$keyPath=if($env:SIGHTLINE_KEYSTORE_PATH){$env:SIGHTLINE_KEYSTORE_PATH}else{Join-Path $keyHome 'sightline-release.p12'}
if(Test-Path -LiteralPath $keyPath){
  Write-Host "Existing signing key detected; not generating or replacing: $keyPath"
  Write-Host 'Preserve this exact keystore for every signed public release.'
  exit 0
}
if(-not $CreateNewReleaseIdentity){throw 'Refusing to create a NEW signing identity without -CreateNewReleaseIdentity. First check whether an older release keystore already exists; if yes, reuse it using SIGHTLINE_KEYSTORE_PATH.'}
New-Item -ItemType Directory -Path (Split-Path $keyPath) -Force | Out-Null
if($env:JAVA_HOME){$keytool=Join-Path $env:JAVA_HOME 'bin\keytool.exe'}else{$keytool='keytool.exe'}
if(-not (Get-Command $keytool -ErrorAction SilentlyContinue)){throw 'keytool not found; install JDK 17 or set JAVA_HOME'}
Write-Host 'Creating ONE release key locally. Keytool will prompt for a strong unique password.'
& $keytool -genkeypair -alias sightline-release -keyalg RSA -keysize 3072 -validity 9125 -storetype PKCS12 -keystore $keyPath -dname 'CN=Sightline V3, O=Sightline, C=PH'
if($LASTEXITCODE -ne 0 -or -not (Test-Path $keyPath)){throw 'Keytool failed; do not attempt signing'}
Write-Host "Release keystore created locally: $keyPath"
Write-Host 'MAKE TWO ENCRYPTED OFFLINE BACKUPS. Keep password in your password manager.'
Write-Host 'Never upload this keystore or its password to ChatGPT, GitHub or your APK download host.'
