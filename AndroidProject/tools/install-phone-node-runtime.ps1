# Compatibility entry point. The historical 24.21 prerelease installer is superseded.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RuntimeRoot,[Parameter(Mandatory=$true)][string]$AndroidSdkRoot)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'setup-native-host-sdk.ps1') -RuntimeRoot $RuntimeRoot -AndroidSdkRoot $AndroidSdkRoot
