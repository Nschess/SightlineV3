# A single Windows command for a fail-closed debug APK build with verified native runtime.
param([switch]$UseLocalRuntime)
$ErrorActionPreference='Stop'
$project=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $UseLocalRuntime) {
    & (Join-Path $PSScriptRoot 'install-phone-node-runtime.ps1')
    if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'Node runtime installation failed'}
}
$gradle=Join-Path $project 'gradlew.bat'
if(-not (Test-Path $gradle)) {
    if(-not (Get-Command gradle -ErrorAction SilentlyContinue)){throw 'Install official Gradle 8.13 or use Android Studio to generate the wrapper; do not invent a wrapper JAR'}
    Push-Location $project
    try { & gradle wrapper --gradle-version 8.13 --distribution-type bin;if($LASTEXITCODE -ne 0){throw 'Gradle wrapper generation failed'}} finally {Pop-Location}
}
if(-not (Test-Path (Join-Path $project 'gradle/wrapper/gradle-wrapper.jar'))) {throw 'Gradle wrapper JAR missing'}
Push-Location $project
try {
    & .\gradlew.bat :app:assembleDebug -PenableLanHost=true --stacktrace
    if($LASTEXITCODE -ne 0){throw 'Gate 3 native Android debug build failed'}
    $apk=Join-Path $project 'app/build/outputs/apk/debug/app-debug.apk'
    if(-not (Test-Path $apk)){throw 'Gradle reported success but no APK exists'}
    Write-Host "Native APK SHA-256: $((Get-FileHash $apk -Algorithm SHA256).Hash)"
    $sdk=$env:ANDROID_HOME;if(-not $sdk){$sdk=$env:ANDROID_SDK_ROOT};if(-not $sdk){$sdk=Join-Path $env:LOCALAPPDATA 'Android/Sdk'}
    $align=Join-Path $sdk 'build-tools/36.0.0/zipalign.exe'
    if(-not (Test-Path $align)){throw 'SDK Build Tools 36.0.0 zipalign missing; cannot verify 16 KiB APK alignment'}
    & $align -P 16 -c -v 4 $apk
    if($LASTEXITCODE -ne 0){throw 'APK native shared library ZIP 16 KiB alignment failed'}
    Write-Host "BUILD PASS (device tests still required): $apk"
} finally {Pop-Location}
