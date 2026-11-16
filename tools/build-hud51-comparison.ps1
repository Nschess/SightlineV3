[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$JavaHome,
  [Parameter(Mandatory=$true)][string]$SdkRoot,
  [Parameter(Mandatory=$true)][string]$GradleBin,
  [Parameter(Mandatory=$true)][string]$GradleUserHome,
  [Parameter(Mandatory=$true)][string]$PrivateHome,
  [Parameter(Mandatory=$true)][string]$PhoneNodeSdkRoot
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateFull=[IO.Path]::GetFullPath($PrivateHome)
if($privateFull.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $privateFull -eq $root){throw 'Keep the private debug-key home outside the source repository'}
if(-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/javac.exe')) -or -not ((Get-Content -LiteralPath (Join-Path $JavaHome 'release') -Raw) -match 'JAVA_VERSION="17\.')){throw 'An isolated JDK 17 is required'}
if(-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms/android-36/android.jar'))){throw 'SDK platform 36 is required'}
if(-not (Test-Path -LiteralPath $GradleBin -PathType Leaf)){throw 'Existing Gradle 8.13 executable required'}
$env:JAVA_HOME=$JavaHome
$env:ANDROID_HOME=$SdkRoot
$env:ANDROID_SDK_ROOT=$SdkRoot
$env:GRADLE_USER_HOME=$GradleUserHome
$env:ANDROID_USER_HOME=Join-Path $privateFull '.android'
$env:ANDROID_SDK_HOME=$privateFull
$env:JAVA_TOOL_OPTIONS='-Duser.home='+$privateFull
$env:PATH=(Join-Path $JavaHome 'bin')+';'+$env:PATH
[IO.Directory]::CreateDirectory($privateFull) | Out-Null
$shell=(Get-Process -Id $PID).Path
& $GradleBin '-p' (Join-Path $root 'AndroidProject') ':app:assembleDiagnostic' '--offline' '--no-daemon' '--console=plain' ('-PsightlinePowerShell='+$shell) '-PenableLanHost=true' ('-PphoneNodeSdkRoot='+$PhoneNodeSdkRoot)
if($LASTEXITCODE -ne 0){throw 'Comparison APK build failed; no APK acceptance claimed'}
