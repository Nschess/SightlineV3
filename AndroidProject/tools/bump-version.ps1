param([Parameter(Mandatory=$true)][ValidatePattern('^[0-9A-Za-z][0-9A-Za-z._-]{0,69}$')][string]$VersionName)
$ErrorActionPreference='Stop'
$versionFile=Join-Path $PSScriptRoot '..\app\version.properties'
$p=Get-Content -LiteralPath $versionFile
$line=($p | Where-Object {$_ -match '^VERSION_CODE=\d+$'})
if(@($line).Count -ne 1){throw 'Expected one VERSION_CODE entry'}
$current=[int](($line -split '=')[1]); if($current -lt 2 -or $current -ge 2100000000){throw 'Invalid versionCode'}
$oldName=($p|Where-Object {$_ -match '^VERSION_NAME='}) -replace '^VERSION_NAME=',''
if($VersionName -eq $oldName){throw 'Use a new versionName for each release'}
$newCode=$current+1
"VERSION_CODE=$newCode`nVERSION_NAME=$VersionName`n" | Set-Content -LiteralPath $versionFile -Encoding ascii -NoNewline
Write-Host "Updated versionCode: $current -> $newCode ($VersionName). Commit/checkpoint these values with each signed release."
