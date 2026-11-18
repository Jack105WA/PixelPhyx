# PixelPhyx Local Server

Windows self-hosted multiplayer server. Photon is not required.

## Start

Run `Start Server.bat`. The launcher checks for updates, installs the small Node.js dependencies when needed, and starts the server. Keep the console open while hosting.

Node.js 20 or newer is required: https://nodejs.org/

## Connect

The server listens on all local network adapters by default:

- This PC: `ws://127.0.0.1:3000/pixelphyx`
- LAN: `ws://YOUR-LAN-IP:3000/pixelphyx`
- Internet: `ws://YOUR-PUBLIC-IP:3000/pixelphyx`

Forward the configured port as **TCP** to the hosting PC's LAN IP in your router. Allow Node.js through Windows Firewall on Private networks. Use the same address in the game's server connection field.

## Configuration

Edit `config.yml`:

- `bind`: normally keep `0.0.0.0`.
- `port`: TCP port to listen on.
- `max_players`: players allowed in each lobby.
- `lobby_count`: maximum number of active lobbies.
- `public_address`: optional public hostname/IP note.

The server relays game events and snapshots. The lobby host remains the authoritative physics simulator, matching the current PixelPhyx synchronization model. If the host leaves, server ownership transfers to another connected player; the new host requests a fresh world snapshot.

## Data and privacy

No external account or Photon service is used. The server keeps rooms and player state in memory; worlds are not saved to disk. Only connected players can exchange game messages.
