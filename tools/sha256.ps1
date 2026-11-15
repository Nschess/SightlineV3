function Get-SightlineSha256([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "SHA-256 input file not found: $Path" }
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $algorithm.ComputeHash($stream)
    return ([BitConverter]::ToString($digest)).Replace('-','').ToLowerInvariant()
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}
