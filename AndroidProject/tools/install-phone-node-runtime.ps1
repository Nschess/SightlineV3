<# Install exactly one pinned, community-maintained Android ARM64 Node.js Mobile SDK.
    Run on Windows with Android Studio SDK/NDK installed. No local npm/Termux required.
    A build artifact is NOT trusted merely because a GitHub page advertises compatibility.
#>
param(
    [string]$ArchivePath = '',
    [string]$ChecksumsPath = ''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release='24.21.0-0' # Based on an official upstream 24.21.0 tag, not 24.22 proposal snapshot.
$artifact="nodejs-mobile-android-lite-$release.zip"
$download="https://github.com/fogtape/nodejs-mobile/releases/download/v$release"
$work=Join-Path ([System.IO.Path]::GetTempPath()) ('sightline-node-verify-'+[Guid]::NewGuid().ToString('N'))
New-Item $work -ItemType Directory | Out-Null
try {
    if (([string]::IsNullOrWhiteSpace($ArchivePath)) -ne ([string]::IsNullOrWhiteSpace($ChecksumsPath))) { throw 'Provide both -ArchivePath and -ChecksumsPath, or neither.' }
    if (-not $ArchivePath) {
        $ArchivePath=Join-Path $work $artifact
        $ChecksumsPath=Join-Path $work 'SHA256SUMS'
        Write-Host "Downloading pinned prerelease from $download"
        Invoke-WebRequest -Uri "$download/$artifact" -OutFile $ArchivePath -MaximumRedirection 5
        Invoke-WebRequest -Uri "$download/SHA256SUMS" -OutFile $ChecksumsPath -MaximumRedirection 5
    }
    $ArchivePath=(Resolve-Path $ArchivePath).Path
    $ChecksumsPath=(Resolve-Path $ChecksumsPath).Path
    $lines=Get-Content -LiteralPath $ChecksumsPath
    $checksumEntries=@($lines | Where-Object { $_ -match ('^[A-Fa-f0-9]{64}\s+\*?'+[regex]::Escape($artifact)+'$') })
    if ($checksumEntries.Count -ne 1) { throw "Exactly one published checksum entry is required for $artifact" }
    $expected=([regex]::Match($checksumEntries[0],'^[A-Fa-f0-9]{64}').Value).ToLowerInvariant()
    $got=(Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $got) { throw "Download SHA-256 mismatch: expected $expected, found $got" }
    $sdk=Join-Path $work 'sdk';Expand-Archive -LiteralPath $ArchivePath -DestinationPath $sdk
    $libs=@(Get-ChildItem -LiteralPath $sdk -Recurse -File -Filter 'libnode.so' | Where-Object { $_.FullName -match '[\\/]arm64-v8a[\\/]' })
    $headers=@(Get-ChildItem -LiteralPath $sdk -Recurse -File -Filter 'node.h' | Where-Object { $_.FullName -match '[\\/]include[\\/]node[\\/]node.h$' })
    if ($libs.Count -ne 1 -or $headers.Count -ne 1) { throw 'SDK requires exactly one ARM64 libnode.so and matching include/node/node.h' }
    $b=[System.IO.File]::ReadAllBytes($libs[0].FullName)
    if ($b.Length -lt 65536 -or $b[0] -ne 127 -or $b[1] -ne 69 -or $b[2] -ne 76 -or $b[3] -ne 70 -or $b[4] -ne 2 -or $b[5] -ne 1 -or [BitConverter]::ToUInt16($b,18) -ne 183 -or [BitConverter]::ToUInt16($b,16) -ne 3) { throw 'Not an ELF64 little-endian shared library for Android ARM64' }
    $phoff=[BitConverter]::ToUInt64($b,32);$entrySize=[BitConverter]::ToUInt16($b,54);$phnum=[BitConverter]::ToUInt16($b,56)
    if ($entrySize -lt 56 -or $phnum -lt 2 -or $phnum -gt 100 -or $phoff -gt ($b.Length - ($entrySize*$phnum))) {throw 'Invalid ELF program headers'}
    $loads=0
    for ($i=0;$i -lt $phnum;$i++) {
        $off=[int]($phoff + $i*$entrySize)
        if ([BitConverter]::ToUInt32($b,$off) -ne 1) { continue }
        $loads++
        $fileOffset=[BitConverter]::ToUInt64($b,$off+8)
        $address=[BitConverter]::ToUInt64($b,$off+16)
        $alignment=[BitConverter]::ToUInt64($b,$off+48)
        if ($alignment -lt 16384 -or (($address -band 16383) -ne ($fileOffset -band 16383))) {throw '16 KiB ELF PT_LOAD alignment verification failed'}
    }
    if ($loads -lt 2) {throw 'Missing ELF PT_LOAD segments'}
    $sdkHome=$env:ANDROID_HOME;if(-not $sdkHome){$sdkHome=$env:ANDROID_SDK_ROOT};if(-not $sdkHome -and (Test-Path (Join-Path $env:LOCALAPPDATA 'Android/Sdk'))){$sdkHome=Join-Path $env:LOCALAPPDATA 'Android/Sdk'}
    if(-not $sdkHome){throw 'Set ANDROID_HOME to your Android Studio SDK directory; NDK r28+ is required'}
    $ndks=@(Get-ChildItem (Join-Path $sdkHome 'ndk') -Directory -ErrorAction Stop | Sort-Object Name -Descending)
    if(-not $ndks){throw 'Install Android NDK 28.2.13676358 in Android Studio SDK Manager'}
    $ndk=@($ndks | Where-Object { $_.Name -eq '28.2.13676358' })
    if($ndk.Count -ne 1){throw 'Install pinned NDK 28.2.13676358 for reproducible 16 KiB builds'}
    $tool=Join-Path $ndk[0].FullName 'toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-readelf.exe'
    if(-not (Test-Path $tool)){throw 'NDK llvm-readelf.exe was not found; cannot validate exported symbols and dynamic dependencies'}
    $dyn=(& $tool --dynamic $libs[0].FullName 2>&1 | Out-String);if($LASTEXITCODE -ne 0){throw "ELF dynamic read failed: $dyn"}
    $symbol=(& $tool --dyn-syms $libs[0].FullName 2>&1 | Out-String);if($LASTEXITCODE -ne 0 -or $symbol -notmatch '_ZN4node5StartEiPPc'){ throw 'Node embedding symbol node::Start(int,char**) not exported by this build' }
    $needed=@([regex]::Matches($dyn,'\(NEEDED\).*?\[(.*?)\]') | ForEach-Object { $_.Groups[1].Value })
    $known=@('libc.so','libm.so','libdl.so','liblog.so','libandroid.so','libz.so','libc++_shared.so','libatomic.so')
    foreach($name in $needed) {if($known -notcontains $name){throw "Unexpected native dependency: $name"}}
    $out=Join-Path $project 'app/src/main/jniLibs/arm64-v8a';$include=Join-Path $project 'app/libnode/include/node'
    New-Item $out -ItemType Directory -Force | Out-Null;New-Item $include -ItemType Directory -Force | Out-Null
    Copy-Item $libs[0].FullName (Join-Path $out 'libnode.so') -Force
    $headerDir=Split-Path $headers[0].FullName -Parent
    Copy-Item (Join-Path $headerDir '*') $include -Recurse -Force
    if($needed -contains 'libc++_shared.so') {
        # AGP/CMake packages the same NDK r28 shared STL once. Do not copy a second
        # manual libc++_shared.so into jniLibs (duplicate packaging/ABI drift).
        Write-Host 'libc++_shared.so dependency: CMake -DANDROID_STL=c++_shared will package NDK STL'
    }
    $libsha=(Get-FileHash -LiteralPath (Join-Path $out 'libnode.so') -Algorithm SHA256).Hash.ToLowerInvariant()
    $headsha=(Get-FileHash -LiteralPath (Join-Path $include 'node.h') -Algorithm SHA256).Hash.ToLowerInvariant()
    @("VERSION=$release","RELEASE_ARCHIVE_SHA256=$got","LIBNODE_SHA256=$libsha","NODE_HEADER_SHA256=$headsha","NDK_VERSION=28.2.13676358","SOURCE=https://github.com/fogtape/nodejs-mobile/releases/tag/v$release") | Set-Content -LiteralPath (Join-Path $project 'app/phone-node-runtime.properties') -Encoding ASCII
    Write-Host "Verified ARM64 library and staged pinned Node SDK version $release"
    Write-Host 'Next: gradle :app:assembleDebug -PenableLanHost=true'
    Write-Warning 'Source/authenticity trust still depends on the GitHub release. Independent runtime execution and device behavior remain to be validated.'
} finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
