param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$image = if ($env:PHISHGUARD_SANDBOX_IMAGE) { $env:PHISHGUARD_SANDBOX_IMAGE } else { 'phishguard-sandbox' }
$network = if ($env:PHISHGUARD_SANDBOX_NETWORK) { $env:PHISHGUARD_SANDBOX_NETWORK } else { 'pg-sandbox' }
$args = @('run', '--rm', '--read-only', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '1g', '--cpus', '1', '--tmpfs', '/tmp:rw,size=256m', '--tmpfs', '/profile:rw,size=128m', '--network', $network, $image, $Url, '{}')
$job = Start-Job -ScriptBlock { param($arguments) & docker @arguments } -ArgumentList (, $args)
if (-not (Wait-Job $job -Timeout $TimeoutSeconds)) { Stop-Job $job; docker kill (docker ps -q --filter ancestor=$image) 2>$null; throw 'sandbox timeout' }
Receive-Job $job; Remove-Job $job
