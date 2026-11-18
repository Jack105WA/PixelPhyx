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
 "$ErrorActionPreference='Stop'; $base='https://raw.githubusercontent.com/Jack105WA/PixelPhyx/local-server/Server';" ^
 "$required=@('server.js','download-website.js','package.json','config.yml','version.json','Start Server.bat','README.md');" ^
 "foreach($f in $required) {" ^
 "  $download=$false;" ^
 "  if(!(Test-Path -LiteralPath $f)) { $download=$true }" ^
 "  elseif($f -eq 'version.json') {" ^
 "    try { $remote=Invoke-RestMethod ($base+'/version.json'); $local=Get-Content $f -Raw | ConvertFrom-Json; if($remote.version -ne $local.version) { $download=$true } } catch { Write-Host 'Update check unavailable; keeping existing files.' }" ^
 "  }" ^
 "  if($download) { $tmp=$f+'.download'; Invoke-WebRequest -UseBasicParsing ($base+'/'+[uri]::EscapeDataString($f)) -OutFile $tmp; Move-Item -Force $tmp $f; Write-Host ('Installed '+$f) }" ^
 "}"
if errorlevel 1 (
  echo Could not repair server files. Check your internet connection.
  pause
  exit /b 1
)

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
