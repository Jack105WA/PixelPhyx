# PixelPhyx Multiplayer Server

This folder contains only the dedicated multiplayer relay server. It does **not** host, download, or bundle the PixelPhyx website/game client.

## Start

Run `Start Server.bat`. It checks for server updates, installs the small Node.js dependencies if needed, and starts the WebSocket server.

Node.js 20 or newer is required: https://nodejs.org/

## Connect

Open the PixelPhyx game client separately (for example, from GitHub Pages or another static web host). Select **Online**, enter the server IP/hostname, and press **Connect to server**.

The default port is `3000`. The WebSocket endpoint is `/pixelphyx`.

- Same PC: `127.0.0.1:3000`
- Local network: `192.168.x.x:3000`
- Internet: `YOUR-PUBLIC-IP:3000`

Forward the configured port as **TCP** to the hosting PC's LAN IP in your router. Allow Node.js through Windows Firewall on Private networks.

A game client loaded over HTTPS needs a secure WebSocket (WSS) endpoint. A plain server started by this folder uses WS; put it behind a TLS reverse proxy for HTTPS clients.

## Configuration

Edit `config.yml`:

- `bind`: normally keep `0.0.0.0`.
- `port`: TCP port to listen on.
- `max_players`: players allowed in each lobby.
- `lobby_count`: maximum number of active lobbies.
- `public_address`: optional public hostname/IP note.

The server keeps rooms and player state in memory. Worlds are not saved to disk.
