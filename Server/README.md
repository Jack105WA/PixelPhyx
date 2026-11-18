# PixelPhyx Multiplayer Server

The server downloads the current game website from the `local-server` branch into `Server/Website` on first startup and refreshes it when the website changes. It serves that local copy and starts one isolated headless browser session for each lobby. The hidden simulation is the authoritative room host.

## Start

Run `Start Server.bat`. An internet connection is needed the first time so the server can download the website files and install Node dependencies. Website downloads are cached; unchanged files are not downloaded again.

Requirements: Node.js 20+ and an installed supported browser. The server detects Google Chrome, Microsoft Edge, Brave, Vivaldi, Chromium, and Firefox on common Windows, Linux, and macOS install paths. Chromium-based browsers and Firefox are launched headlessly through Playwright; no visible browser window is opened.

If your browser is installed somewhere non-standard, set `PIXELPHYX_BROWSER_PATH` to its executable path. For an unusual browser build, set `PIXELPHYX_BROWSER_ENGINE=chromium` or `firefox` as well. The old `PIXELPHYX_CHROME_PATH` and `CHROME_PATH` variables remain supported.

Open `http://localhost:3000/` to play. The WebSocket endpoint is `/pixelphyx`. Creating a lobby starts a separate headless browser profile and an authenticated simulation session.

## Missing server files

The launcher repairs missing server files from GitHub before running Node. It always changes into its own folder and runs `server.js` using its absolute path, so starting the batch file from Downloads, Explorer, or another working directory does not change which server file is loaded.

## Remote players

Players open the server's public IP/hostname on port 3000, then select Online. Forward TCP port 3000 to the hosting PC and allow Node.js through Windows Firewall. HTTPS deployments require a TLS reverse proxy and WSS.

## Configuration

Edit `config.yml`: `server.bind`, `server.port`, `server.max_players`, `server.lobby_count`; and `network.snapshot_interval_ms`, `network.rope_update_interval_ms`, `network.cursor_updates`, `network.cursor_update_interval_ms`, `network.snapshot_chunk_bytes`, `network.max_snapshot_bytes`, `network.max_payload_bytes`, `network.max_buffered_bytes`.

Downloaded website files are stored in `Server/Website`. Room state is held in memory and is not saved to disk.
