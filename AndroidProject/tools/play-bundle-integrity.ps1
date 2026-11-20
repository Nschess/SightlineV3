function Assert-PlayManifest([xml]$Manifest, $ExpectedVersion) {
    $ns = 'http://schemas.android.com/apk/res/android'
    $root = $Manifest.DocumentElement
    $application = $Manifest.SelectSingleNode('/manifest/application')
    $sdk = $Manifest.SelectSingleNode('/manifest/uses-sdk')
    if ($root.GetAttribute('package') -cne 'com.sightline.v3') { throw 'Unexpected Play application ID.' }
    if ($root.GetAttribute('versionCode', $ns) -ne $ExpectedVersion.VERSION_CODE -or
        $root.GetAttribute('versionName', $ns) -cne $ExpectedVersion.PLAY_VERSION_NAME) {
        throw 'Play bundle version differs from app/version.properties.'
    }
    if (-not $sdk -or [int]$sdk.GetAttribute('targetSdkVersion', $ns) -lt 36) {
        throw 'Play bundle must target Android API 36 or higher.'
    }
    if (-not $application -or $application.GetAttribute('usesCleartextTraffic', $ns) -cne 'false') {
        throw 'Play bundle must deny cleartext traffic.'
    }
    if ($application.GetAttribute('debuggable', $ns) -eq 'true' -or $application.GetAttribute('testOnly', $ns) -eq 'true' -or
        $application.SelectSingleNode('profileable')) {
        throw 'Play bundle declares debugging, test-only or profiling capability.'
    }

    $excluded = 'REQUEST_INSTALL_PACKAGES|CHANGE_WIFI_STATE|CHANGE_WIFI_MULTICAST_STATE|WAKE_LOCK|FOREGROUND_SERVICE(?:_CONNECTED_DEVICE)?'
    foreach ($permission in $Manifest.SelectNodes('/manifest/*[starts-with(local-name(), "uses-permission")]')) {
        $name = $permission.GetAttribute('name', $ns)
        if ($name -match "^android\.permission\.($excluded)$") { throw "Play bundle declares a private-build permission: $name" }
    }
    foreach ($component in $application.SelectNodes('provider|service')) {
        $name = $component.GetAttribute('name', $ns)
        if ($name -match '(?:^|\.)(FileProvider|LanHostService)$' -or
            $component.GetAttribute('authorities', $ns) -eq 'com.sightline.v3.fileprovider' -or
            $component.GetAttribute('process', $ns) -eq ':lanhost') {
            throw "Play bundle retains an installer or phone-host component: $name"
        }
    }
    if ($Manifest.SelectSingleNode('/manifest/instrumentation')) { throw 'Play bundle declares instrumentation.' }
}

function Assert-PlayBundleAssets([string]$Bundle, [string]$AppRoot) {
    $root = Join-Path $AppRoot 'src/main/assets'
    $policy = Join-Path $AppRoot 'play-packaging'
    $excluded = @(Get-Content -LiteralPath (Join-Path $policy 'EXCLUDED-ASSETS.txt') | Where-Object { $_ })
    $expected = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
    foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse) {
        $relative = $file.FullName.Substring($root.Length + 1).Replace('\','/')
        if ($relative -cnotin $excluded) { $expected.Add("base/assets/$relative", $file.FullName) }
    }
    foreach ($notice in 'APACHE-2.0.txt', 'RUNTIME-DEPENDENCIES.txt') {
        $expected.Add("base/assets/third-party/$notice", (Join-Path $policy $notice))
    }
    foreach ($notice in 'www/threejs-license.txt', 'www/threejs-mit-license.txt',
        'phone-host/threejs-license.txt', 'phone-host/THREEJS-MIT-LICENSE.txt',
        'node-mobile-LICENSE.txt', 'third-party/APACHE-2.0.txt', 'third-party/RUNTIME-DEPENDENCIES.txt') {
        $name = "base/assets/$notice"
        if (-not $expected.ContainsKey($name) -or (-not (Test-Path -LiteralPath $expected[$name] -PathType Leaf)) -or
            (Get-Item -LiteralPath $expected[$name]).Length -eq 0) {
            throw "Required Play license or dependency evidence missing from source: $notice"
        }
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Bundle)
    try {
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName
            if ($name -match '(?:^/|\\|(?:^|/)\.{1,2}(?:/|$)|//)' -or -not $seen.Add($name)) {
                throw "Unsafe or duplicate Play bundle path: $name"
            }
            if ($name -match '^[^/]+/lib/[^/]' -or $name -match '\.so$') {
                throw "Unexpected native library in Play bundle: $name"
            }
            if ($name -cmatch '^[^/]+/manifest/AndroidManifest\.xml$' -and $name -cne 'base/manifest/AndroidManifest.xml') {
                throw "Unexpected feature module in Play bundle: $name"
            }
            if ($name.EndsWith('/') -or $name -cnotmatch '^[^/]+/assets/') { continue }
            if (-not $expected.ContainsKey($name)) { throw "Unexpected bundled Play asset: $name" }
            $stream = $entry.Open()
            try { $actual = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash } finally { $stream.Dispose() }
            if ($actual -ne (Get-FileHash -LiteralPath $expected[$name] -Algorithm SHA256).Hash) {
                throw "Bundled Play asset differs from its approved input: $name"
            }
            [void]$expected.Remove($name)
        }
        if ($expected.Count) { throw "Required Play assets or notices are missing: $($expected.Keys -join ', ')" }
    } finally { $zip.Dispose() }
}
