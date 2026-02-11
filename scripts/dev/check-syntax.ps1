$ErrorActionPreference = "Stop"

$failed = @()
$files = Get-ChildItem -Path "scripts" -Recurse -File -Filter *.js

foreach ($file in $files) {
  node --check $file.FullName *> $null
  if ($LASTEXITCODE -ne 0) {
    $failed += $file.FullName
  }
}

if ($failed.Count -gt 0) {
  Write-Error "Syntax check failed for the following files:`n$($failed -join "`n")"
  exit 1
}

Write-Host "node --check passed for $($files.Count) JS files."
