# Read-only comparison. Does not copy, overwrite, sign, upload, or reveal credentials.
param([Parameter(Mandatory=$true)][string]$LocalProjectRoot)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$local=(Resolve-Path $LocalProjectRoot).Path
$paths=@('app\src\main\java\com\sightline\v3\MainActivity.java',
 'app\src\main\java\com\sightline\v3\HostPolicy.java',
 'app\src\main\java\com\sightline\v3\UpdateManager.java',
 'app\src\main\java\com\sightline\v3\UpdatePolicy.java',
 'app\src\main\AndroidManifest.xml','app\build.gradle','app\version.properties',
 'app\src\main\assets\www\index.html')
Write-Host 'READ-ONLY COMPARISON. DIFFERING FILES REQUIRE REVIEW, NEVER AUTOMATIC REPLACEMENT.'
foreach($file in $paths){
 $a=Join-Path $root $file; $b=Join-Path $local $file
 if(!(Test-Path $b)){$status='MISSING IN LOCAL'}
 elseif(!(Test-Path $a)){$status='MISSING IN CANDIDATE'}
 elseif((Get-FileHash $a -Algorithm SHA256).Hash -eq (Get-FileHash $b -Algorithm SHA256).Hash){$status='IDENTICAL'}
 else{$status='DIFFERENT - MANUAL THREE-WAY MERGE REQUIRED'}
 Write-Host ('{0} : {1}' -f $status, $file)
}
$version=Join-Path $local 'app\version.properties'
if(Test-Path $version){Write-Host '--- Local version (DO NOT DOWNGRADE):'; Get-Content $version}
Write-Host 'Do NOT copy private signing material into a project or this archive.'
Write-Host 'Only the owner can identify/reuse the actual existing release keystore locally.'
