param(
    [string]$MarkerPath = "sandbox/selftest-pass.json"
)
$ErrorActionPreference = "Stop"
$output = docker run --rm --network pg-sandbox --entrypoint node phishguard-sandbox dist/src/services/dynamic/sandboxSelftest.js
$result = $output | ConvertFrom-Json
if (-not $result.ok) { Write-Error "Sandbox self-test failed: $output"; exit 1 }
$marker = @{ ok = $true; passedAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
$marker | Set-Content -LiteralPath $MarkerPath -Encoding utf8
Write-Output $marker
