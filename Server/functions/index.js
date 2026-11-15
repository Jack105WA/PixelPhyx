const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueDeleted } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");

initializeApp();

const DATABASE_INSTANCE = "pixelphyx-backend-default-rtdb";
const CLEANUP_GRACE_MS = 2000;

exports.clearEmptyRoom = onValueDeleted(
  {
    ref: "/rooms/{roomId}/players/{playerId}",
    instance: DATABASE_INSTANCE,
    region: "us-central1"
  },
  async (event) => {
    const { roomId, playerId } = event.params;
    const roomRef = getDatabase().ref(`rooms/${roomId}`);

    // Give every other client's onDisconnect handler time to remove its presence.
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_GRACE_MS));

    // A transaction makes the empty check and deletion atomic. If anyone has
    // joined again, abort and preserve the room and its current world.
    const result = await roomRef.transaction((room) => {
      if (!room) return;
      const players = room.players;
      if (players && Object.keys(players).length !== 0) return;
      return null;
    });

    if (result.committed) {
      logger.info("Deleted empty PixelPhyx room", { roomId, departedPlayerId: playerId });
    } else {
      logger.info("Kept PixelPhyx room because it is active or already removed", { roomId });
    }
  }
);
