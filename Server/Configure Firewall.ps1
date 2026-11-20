param([ValidateSet('Tailscale','All')][string]$Mode = 'Tailscale')
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'config.yml'
$port = 3000
if (Test-Path -LiteralPath $configPath) {
    $configText = Get-Content -LiteralPath $configPath -Raw
    if ($configText -match '(?m)^\s*port:\s*(\d+)\s*(?:#.*)?$') { $port = [int]$Matches[1] }
}
$ruleName = "PixelPhyx Server TCP $port ($Mode)"
$remoteAddress = if ($Mode -eq 'Tailscale') { '100.64.0.0/10' } else { 'Any' }
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host 'Administrator permission is required to configure Windows Firewall.'
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Mode ' + $Mode
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        if ($process.ExitCode -ne 0) { Write-Warning 'Firewall setup failed. The server will still start.'; exit 1 }
        exit 0
    }
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Allow -Profile Any
        Write-Host "Existing firewall rule enabled: TCP $port ($Mode)."
    } else {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort $port -RemoteAddress $remoteAddress -Profile Any | Out-Null
        Write-Host "Created firewall rule: TCP $port ($Mode)."
    }
} catch {
    Write-Warning "Could not configure Windows Firewall: $($_.Exception.Message)"
    exit 1
}
