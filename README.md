# PixelPhyx

PixelPhyx is a pixel-art 2D physics and chemistry sandbox with optional Firebase multiplayer.

## Run locally

Open `index.html` through a local web server (for example, VS Code Live Server). Firebase's browser SDK is loaded from Google's CDN, so an internet connection is required.

## Firebase multiplayer setup

1. Create a Firebase project and register a Web App.
2. Create a **Realtime Database**.
3. Copy the Web App configuration JSON into the game's **Firebase** dialog.
4. Ensure the config includes `databaseURL`.
5. Publish the database rules below.

Example starter rules for a public experimental sandbox (anyone with the database URL can read/write room data; do not use these rules for private or production data):

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$room": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

For production, add Firebase Authentication and validate room membership and payload sizes in rules or through a trusted backend. The starter game intentionally uses anonymous room codes and does not provide account security.

## Controls

- Draw with the selected material; right-click to erase.
- Choose Draw, Line, Rope, Box, Detonate, Heat, or Cool.
- Space pauses/resumes; mouse wheel changes brush size.
- Connect Firebase, then join the same room code to experiment together.

## GitHub Pages

The repository includes a GitHub Actions workflow to publish the static site from the `main` branch.
