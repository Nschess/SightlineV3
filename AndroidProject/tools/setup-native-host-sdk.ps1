[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RuntimeRoot,[Parameter(Mandatory=$true)][string]$AndroidSdkRoot)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime=[IO.Path]::GetFullPath($RuntimeRoot)
if($runtime.StartsWith($project+'\',[StringComparison]::OrdinalIgnoreCase) -or $runtime -eq $project){throw 'Native SDK/cache must stay outside game source'}
$archiveSha='e04c4f818e4a613b705d009323175f0bfe3fe31a2220ca8aac4b2f73d231615d'
$libSha='b15f879257d05509751d12feb20ddd621f78c3ed3e7f65dcf1cd8d889816d4bf'
$headerSha='c35691764bac5a82c4139348ca57f5676163afe563a40ad78457cef8bfb57012'
$treeSha='610c70275900d97e31e36db0622f32250c86ab9211b543a449255a403c75b3c6'
[IO.Directory]::CreateDirectory($runtime) | Out-Null
$archive=Join-Path $runtime 'nodejs-mobile-android-lite-24.22.0-0.zip'
if(-not (Test-Path -LiteralPath $archive)){Invoke-WebRequest 'https://github.com/fogtape/nodejs-mobile/releases/download/v24.22.0-0/nodejs-mobile-android-lite-24.22.0-0.zip' -OutFile $archive}
if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $archiveSha){throw 'Pinned SDK archive hash mismatch'}
$sdk=Join-Path $runtime 'sdk'
if(-not (Test-Path -LiteralPath $sdk)){Expand-Archive -LiteralPath $archive -DestinationPath $sdk}
$lib=Join-Path $sdk 'bin/arm64-v8a/libnode.so';$headers=Join-Path $sdk 'include/node'
if((Get-FileHash $lib -Algorithm SHA256).Hash.ToLowerInvariant() -ne $libSha -or (Get-FileHash (Join-Path $headers 'node.h') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $headerSha){throw 'SDK library/header changed'}
$prefix=$headers.TrimEnd('\')+'\'
[string[]]$names=@(Get-ChildItem $headers -Recurse -File | ForEach-Object {$_.FullName.Substring($prefix.Length).Replace('\','/')})
[Array]::Sort($names,[StringComparer]::Ordinal)
$inventory=($names | ForEach-Object {(Get-FileHash (Join-Path $headers $_) -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+$_+"`n"}) -join ''
$digest=[Security.Cryptography.SHA256]::Create();try{$got=[BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($inventory))).Replace('-','').ToLowerInvariant()}finally{$digest.Dispose()}
if($got -ne $treeSha){throw 'SDK header tree changed'}
$readelf=Join-Path $AndroidSdkRoot 'ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-readelf.exe'
if(-not (Test-Path $readelf)){throw 'Isolated NDK 28.2.13676358 required for verification'}
$symbols=(& $readelf --dyn-syms $lib | Out-String);if($LASTEXITCODE -ne 0 -or $symbols -notmatch '_ZN4node5StartEiPPc'){throw 'Node embedding export missing'}
$dynamic=(& $readelf --dynamic $lib | Out-String);if($LASTEXITCODE -ne 0){throw 'ELF dependency inspection failed'}
foreach($m in [regex]::Matches($dynamic,'\(NEEDED\).*?\[(.*?)\]')){if($m.Groups[1].Value -notin @('libc.so','libm.so','libdl.so','liblog.so','libandroid.so','libz.so','libc++_shared.so','libatomic.so')){throw 'Unexpected native dependency'}}
$lock=@('VERSION=24.22.0-0',('RELEASE_ARCHIVE_SHA256='+$archiveSha),('LIBNODE_SHA256='+$libSha),('NODE_HEADER_SHA256='+$headerSha),('HEADERS_TREE_SHA256='+$treeSha),'NDK_VERSION=28.2.13676358','SOURCE=https://github.com/fogtape/nodejs-mobile/releases/tag/v24.22.0-0') -join "`n"
[IO.File]::WriteAllText((Join-Path $project 'app/phone-node-runtime.properties'),$lock+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: verified external ARM64 Node Mobile SDK: '+$sdk)
Write-Output 'Gradle additionally verifies the full header tree, library digest and 16 KiB ELF load alignment.'
