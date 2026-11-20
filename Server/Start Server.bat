@echo off
setlocal EnableExtensions
title PixelPhyx Multiplayer Server
cd /d "%~dp0"

echo.
echo  PixelPhyx Multiplayer Server
echo  ===========================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Download it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or newer is required. Current version:
  node --version
  pause
  exit /b 1
)

echo Checking and repairing server files...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Stop'; $base='https://raw.githubusercontent.com/Jack105WA/PixelPhyx/main/Server';" ^
 "$updateAll=$false;" ^
 "try { $remote=Invoke-RestMethod ($base+'/version.json'); if(Test-Path 'version.json') { $local=Get-Content 'version.json' -Raw | ConvertFrom-Json; if($remote.version -ne $local.version) { $updateAll=$true; Write-Host ('Updating server to '+$remote.version) } } else { $updateAll=$true } } catch { Write-Host 'Version check unavailable; repairing missing files only.' }" ^
 "$required=@('server.js','download-website.js','package.json','version.json','README.md');" ^
 "foreach($f in $required) {" ^
 "  if($updateAll -or !(Test-Path -LiteralPath $f)) {" ^
 "    $tmp=$f+'.download'; Invoke-WebRequest -UseBasicParsing ($base+'/'+[uri]::EscapeDataString($f)) -OutFile $tmp; Move-Item -Force $tmp $f; Write-Host ('Installed '+$f)" ^
 "  }" ^
 "}" ^
 "if(!(Test-Path -LiteralPath 'config.yml')) { Invoke-WebRequest -UseBasicParsing ($base+'/config.yml') -OutFile 'config.yml'; Write-Host 'Installed config.yml' }"

if errorlevel 1 (
  echo Could not repair server files. Check your internet connection.
  pause
  exit /b 1
)

echo.
echo Windows Firewall setup:
echo   [T] Allow Tailscale connections only (recommended)
echo   [A] Allow connections from all networks
echo   [N] Skip firewall changes
choice /c TAN /n /m "Select T, A, or N: "
if errorlevel 3 goto firewall_done
if errorlevel 2 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configure Firewall.ps1" -Mode All
  goto firewall_done
)
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configure Firewall.ps1" -Mode Tailscale
)
:firewall_done

if not exist "node_modules\ws\package.json" (
  echo Installing server dependencies...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
if not exist "node_modules\playwright-core\package.json" (
  echo Installing headless browser support...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo Browser support installation failed.
    pause
    exit /b 1
  )
)

if not exist "server.js" (
  echo ERROR: server.js is still missing from:
  echo %CD%
  pause
  exit /b 1
)

echo.
node "%~dp0server.js"
echo.
echo Server stopped.
pause
