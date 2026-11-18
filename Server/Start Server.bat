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

echo Checking for server updates...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Stop'; $base='https://raw.githubusercontent.com/Jack105WA/PixelPhyx/local-server/Server';" ^
 "$remote=Invoke-RestMethod ($base+'/version.json'); $local=Get-Content 'version.json' -Raw | ConvertFrom-Json;" ^
 "if($remote.version -ne $local.version) {" ^
 "  foreach($f in @('server.js','package.json','config.yml','version.json','README.md','Start Server.bat')) { Invoke-WebRequest -UseBasicParsing ($base+'/'+$f) -OutFile $f; };" ^
 "  Write-Host ('Updated multiplayer server to '+$remote.version);" ^
 "} else { Write-Host ('Server files are current ('+$local.version+').') }"
if errorlevel 1 (
  echo Update check failed. Continuing with existing server files.
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

echo.
node server.js
echo.
echo Server stopped.
pause
