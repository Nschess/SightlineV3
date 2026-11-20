[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$TlsHost,
    [Parameter(Mandatory=$true)][string]$PrivacyPolicyUrl,
    [Parameter(Mandatory=$true)][string]$BundletoolJar,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$BundletoolSha256,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$UploadCertificateSha256
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'play-bundle-integrity.ps1')
$android = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = (Resolve-Path (Join-Path $android '..')).Path
$gate = Join-Path $project 'tools/require-release-acceptance.ps1'
if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { throw 'Android release acceptance gate is missing.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $gate -Mode AndroidRelease
if ($LASTEXITCODE -ne 0) { throw 'Android production acceptance is still blocked.' }

$bundletool = (Resolve-Path -LiteralPath $BundletoolJar).Path
if ((Get-FileHash -LiteralPath $bundletool -Algorithm SHA256).Hash -ne $BundletoolSha256) {
    throw 'Bundletool SHA-256 does not match the approved tool.'
}
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to the approved JDK 17 for this process.' }
$java = Join-Path $env:JAVA_HOME 'bin/java.exe'
$version = (& $java --version | Out-String)
if ($LASTEXITCODE -ne 0 -or $version -notmatch '\b17\.') { throw 'JDK 17 is required.' }
if (-not $env:SIGHTLINE_KEYSTORE_PATH -or -not $env:SIGHTLINE_KEYSTORE_PASSWORD -or
    -not $env:SIGHTLINE_KEY_PASSWORD -or -not $env:SIGHTLINE_KEY_ALIAS) {
    throw 'Load the registered Play upload key and its passwords into this process before building.'
}

Push-Location -LiteralPath $android
try {
    & .\gradlew.bat --no-daemon '-PenableLanHost=false' "-PsightlineLanTlsHost=$TlsHost" "-PsightlinePrivacyPolicyUrl=$PrivacyPolicyUrl" :app:bundleRelease
    if ($LASTEXITCODE -ne 0) { throw 'The production bundle task failed.' }
    $bundle = (Resolve-Path -LiteralPath 'app/build/outputs/bundle/release/app-release.aab').Path
    & $java (Join-Path $PSScriptRoot 'VerifyPlayBundleSigning.java') $bundle $UploadCertificateSha256
    if ($LASTEXITCODE -ne 0) { throw 'AAB payload signature or upload certificate verification failed.' }

    & $java -jar $bundletool validate "--bundle=$bundle"
    if ($LASTEXITCODE -ne 0) { throw 'Bundletool rejected the AAB.' }
    $manifestText = (& $java -jar $bundletool dump manifest "--bundle=$bundle" '--module=base' | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the packaged manifest.' }
    [xml]$manifest = $manifestText
    $ns = 'http://schemas.android.com/apk/res/android'
    $expectedVersion = ConvertFrom-StringData (Get-Content -LiteralPath 'app/version.properties' -Raw)
    Assert-PlayManifest $manifest $expectedVersion
    Assert-PlayBundleAssets $bundle (Join-Path $android 'app')

    [pscustomobject]@{
        Bundle = $bundle
        Sha256 = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
        ApplicationId = $manifest.manifest.package
        VersionCode = $manifest.manifest.GetAttribute('versionCode', $ns)
        VersionName = $manifest.manifest.GetAttribute('versionName', $ns)
        TargetSdk = $manifest.manifest.'uses-sdk'.GetAttribute('targetSdkVersion', $ns)
        UploadCertificateSha256 = $UploadCertificateSha256.ToLowerInvariant()
        NativeLibraries = 0
        Assets = 'exact production asset inventory and notices verified'
    }
} finally { Pop-Location }
