# Compatibility shim for earlier instructions. The canonical build entrypoint
# is build-debug.bat; it respects Windows execution policy and does not require
# a separately installed Gradle distribution when the pinned wrapper is intact.
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$entry = Join-Path $project 'build-debug.bat'
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw "Missing debug build entrypoint: $entry" }
& $env:ComSpec /d /c ('"' + $entry + '"')
if ($LASTEXITCODE -ne 0) { throw 'Debug build entrypoint failed; see the CMD output above.' }
