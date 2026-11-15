# Runs only on owner's Windows PC with installed Gradle 8.13 and Android SDK.
# A complete wrapper cannot be generated in this offline source-packaging environment.
$ErrorActionPreference='Stop'
$project=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if(-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
  throw 'Install official Gradle 8.13 first; only an installed Gradle can generate a genuine wrapper. Do not use an unverified wrapper JAR.'
}
Push-Location $project
try {
  & gradle --version
  if($LASTEXITCODE -ne 0){throw 'Gradle is not runnable'}
  & gradle wrapper --gradle-version 8.13 --distribution-type bin
  if($LASTEXITCODE -ne 0){throw 'Gradle wrapper generation failed'}
  foreach($f in @('gradlew','gradlew.bat','gradle/wrapper/gradle-wrapper.jar','gradle/wrapper/gradle-wrapper.properties')) {
    if(-not (Test-Path $f)){throw "Wrapper incomplete: $f"}
  }
  & .\gradlew.bat --version
  if($LASTEXITCODE -ne 0){throw 'Generated wrapper failed'}
} finally { Pop-Location }
