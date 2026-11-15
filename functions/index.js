const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueDeleted } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");

initializeApp();

const CLEANUP_GRACE_MS = 1500;

exports.clearEmptyRoom = onValueDeleted(
  "/rooms/{roomId}/players/{playerId}",
  async (event) => {
    const roomId = event.params.roomId;
    const roomRef = getDatabase().ref(`rooms/${roomId}`);

    // Wait for other clients' onDisconnect handlers to remove their presence too.
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_GRACE_MS));

    // Delete the complete room atomically only if it is still empty. A concurrent
    // join changes the room value and prevents this transaction from deleting it.
    const result = await roomRef.transaction((room) => {
      if (!room || !room.players || Object.keys(room.players).length > 0) {
        return;
      }
      return null;
    });

    if (result.committed) {
      logger.info("Deleted empty PixelPhyx room", { roomId });
    }
  }
);
