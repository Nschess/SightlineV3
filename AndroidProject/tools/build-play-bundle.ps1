[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$TlsHost,
    [Parameter(Mandatory=$true)][string]$BundletoolJar,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$BundletoolSha256,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$UploadCertificateSha256
)
$ErrorActionPreference = 'Stop'
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
$jarsigner = Join-Path $env:JAVA_HOME 'bin/jarsigner.exe'
$keytool = Join-Path $env:JAVA_HOME 'bin/keytool.exe'
$version = (& $java --version | Out-String)
if ($LASTEXITCODE -ne 0 -or $version -notmatch '\b17\.') { throw 'JDK 17 is required.' }
if (-not $env:SIGHTLINE_KEYSTORE_PATH -or -not $env:SIGHTLINE_KEYSTORE_PASSWORD -or
    -not $env:SIGHTLINE_KEY_PASSWORD -or -not $env:SIGHTLINE_KEY_ALIAS) {
    throw 'Load the registered Play upload key and its passwords into this process before building.'
}

Push-Location -LiteralPath $android
try {
    & .\gradlew.bat --no-daemon '-PenableLanHost=false' "-PsightlineLanTlsHost=$TlsHost" :app:bundleRelease
    if ($LASTEXITCODE -ne 0) { throw 'The production bundle task failed.' }
    $bundle = (Resolve-Path -LiteralPath 'app/build/outputs/bundle/release/app-release.aab').Path
    & $jarsigner -verify $bundle
    if ($LASTEXITCODE -ne 0) { throw 'The AAB signature did not verify.' }
    $cert = (& $keytool '-J-Duser.language=en' '-J-Duser.country=US' -printcert -jarfile $bundle | Out-String)
    $signer = [regex]::Match($cert, '(?im)^\s*SHA256:\s*([0-9A-F:]+)\s*$').Groups[1].Value.Replace(':','')
    if ($LASTEXITCODE -ne 0 -or $signer -ne $UploadCertificateSha256) { throw 'AAB upload signer does not match the registered certificate.' }

    & $java -jar $bundletool validate "--bundle=$bundle"
    if ($LASTEXITCODE -ne 0) { throw 'Bundletool rejected the AAB.' }
    $manifestText = (& $java -jar $bundletool dump manifest "--bundle=$bundle" '--module=base' | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the packaged manifest.' }
    [xml]$manifest = $manifestText
    $ns = 'http://schemas.android.com/apk/res/android'
    $expectedVersion = ConvertFrom-StringData (Get-Content -LiteralPath 'app/version.properties' -Raw)
    if ($manifest.manifest.package -ne 'com.sightline.v3' -or
        $manifest.manifest.GetAttribute('versionCode', $ns) -ne $expectedVersion.VERSION_CODE -or
        $manifest.manifest.GetAttribute('versionName', $ns) -ne $expectedVersion.PLAY_VERSION_NAME -or
        [int]($manifest.manifest.'uses-sdk'.GetAttribute('targetSdkVersion', $ns)) -lt 36 -or
        $manifest.manifest.application.GetAttribute('debuggable', $ns) -eq 'true' -or
        $manifest.manifest.application.GetAttribute('usesCleartextTraffic', $ns) -ne 'false') {
        throw 'Packaged application ID, version, SDK, debug or cleartext policy is incorrect.'
    }
    $excluded = 'REQUEST_INSTALL_PACKAGES|CHANGE_WIFI_STATE|CHANGE_WIFI_MULTICAST_STATE|WAKE_LOCK|FOREGROUND_SERVICE(?:_CONNECTED_DEVICE)?'
    $permissionNodes = $manifest.SelectNodes('/manifest/*[starts-with(local-name(), "uses-permission")]')
    foreach ($permission in $permissionNodes) {
        if ($permission.GetAttribute('name', $ns) -match "^android\.permission\.($excluded)$") { throw 'The AAB retains a private-build permission.' }
    }
    if ($manifestText -match 'androidx\.core\.content\.FileProvider|LanHostService') { throw 'The AAB retains an installer or phone-host component.' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($bundle)
    try {
        if ($zip.Entries | Where-Object { $_.FullName -match '/lib/[^/]+/[^/]+\.so$' }) {
            throw 'Unexpected native libraries in the Play bundle. Review ABI coverage and 16 KB alignment before changing this gate.'
        }
        $source = Join-Path $android 'app/src/main/assets'
        foreach ($tree in @('www', 'phone-host')) {
            $root = Join-Path $source $tree
            foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse) {
                $relative = $file.FullName.Substring($source.Length + 1).Replace('\', '/')
                $entry = $zip.GetEntry("base/assets/$relative")
                if (-not $entry) { throw "Missing bundled game asset: $relative" }
                $stream = $entry.Open()
                try { $digest = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash } finally { $stream.Dispose() }
                if ($digest -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
                    throw "Packaged game asset differs from the source: $relative"
                }
            }
        }
    } finally { $zip.Dispose() }

    [pscustomobject]@{
        Bundle = $bundle
        Sha256 = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
        ApplicationId = $manifest.manifest.package
        VersionCode = $manifest.manifest.GetAttribute('versionCode', $ns)
        VersionName = $manifest.manifest.GetAttribute('versionName', $ns)
        TargetSdk = $manifest.manifest.'uses-sdk'.GetAttribute('targetSdkVersion', $ns)
        UploadCertificateSha256 = $signer
        NativeLibraries = 0
        Assets = 'both game trees verified'
    }
} finally { Pop-Location }
