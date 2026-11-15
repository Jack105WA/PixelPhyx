const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueDeleted } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");

initializeApp();

const CLEANUP_GRACE_MS = 2000;

exports.clearEmptyRoom = onValueDeleted(
  "/rooms/{roomId}/players/{playerId}",
  async (event) => {
    const roomId = event.params.roomId;
    const roomRef = getDatabase().ref(`rooms/${roomId}`);

    // Allow concurrent disconnects to finish before deciding the room is empty.
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_GRACE_MS));

    const players = await roomRef.child("players").get();
    if (players.exists() && players.hasChildren()) {
      return;
    }

    // Recheck immediately before clearing so a newly joined player keeps the room.
    const latestPlayers = await roomRef.child("players").get();
    if (latestPlayers.exists() && latestPlayers.hasChildren()) {
      return;
    }

    await Promise.all([
      roomRef.child("world").remove(),
      roomRef.child("operations").remove(),
    ]);

    logger.info("Cleared empty PixelPhyx room", { roomId });
  }
);
