@echo off
setlocal EnableExtensions
title PixelPhyx Local Server
cd /d "%~dp0"

echo.
echo  PixelPhyx Local Server
echo  ======================
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
 "  foreach($f in @('server.js','package.json','version.json','README.md','Start Server.bat')) { Invoke-WebRequest -UseBasicParsing ($base+'/'+$f) -OutFile $f; };" ^
 "  Write-Host ('Updated server files to '+$remote.version);" ^
 "} else { Write-Host ('Server files are current ('+$local.version+').') };" ^
 "if(!(Test-Path 'public/index.html') -or $remote.version -ne $local.version) {" ^
 "  Write-Host 'Downloading the matching PixelPhyx game files...';" ^
 "  $tmp=Join-Path $env:TEMP ('PixelPhyx-'+[guid]::NewGuid().ToString('N'));" ^
 "  New-Item -ItemType Directory -Path $tmp | Out-Null;" ^
 "  $zip=Join-Path $tmp 'source.zip';" ^
 "  Invoke-WebRequest -UseBasicParsing 'https://codeload.github.com/Jack105WA/PixelPhyx/zip/refs/heads/local-server' -OutFile $zip;" ^
 "  Expand-Archive -LiteralPath $zip -DestinationPath $tmp;" ^
 "  $root=Get-ChildItem $tmp -Directory | Select-Object -First 1;" ^
 "  if(!(Test-Path (Join-Path $root.FullName 'Website/index.html'))) { throw 'Website files were not found in the update archive.' };" ^
 "  if(Test-Path 'public') { Remove-Item 'public' -Recurse -Force; };" ^
 "  Copy-Item (Join-Path $root.FullName 'Website') 'public' -Recurse;" ^
 "  New-Item -ItemType Directory -Force 'public/pkg' | Out-Null;" ^
 "  foreach($f in @('pixelphyx_wasm.js','pixelphyx_wasm_bg.wasm')) { Invoke-WebRequest -UseBasicParsing ('https://jack105wa.github.io/PixelPhyx/pkg/'+$f) -OutFile ('public/pkg/'+$f); };" ^
 "  Remove-Item $tmp -Recurse -Force;" ^
 "  Write-Host 'Game files updated.';" ^
 "}"
if errorlevel 1 (
  echo Update check or game download failed.
  echo The server will try to start using the existing files.
)

if not exist "public\index.html" (
  echo Game files are missing. Update/download failed.
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

echo.
node server.js
echo.
echo Server stopped.
pause
