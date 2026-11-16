const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueDeleted } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");

initializeApp();

const DATABASE_INSTANCE = "pixelphyx-backendv2-default-rtdb";
const CLEANUP_GRACE_MS = 2000;

exports.clearEmptyRoom = onValueDeleted(
  {
    ref: "/rooms/{roomId}/players/{playerId}",
    instance: DATABASE_INSTANCE,
    region: "us-central1"
  },
  async (event) => {
    const { roomId, playerId } = event.params;
    const database = getDatabase();
    const roomRef = database.ref(`rooms/${roomId}`);

    // Allow the remaining clients' onDisconnect handlers to finish first.
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_GRACE_MS));

    // Delete only if the room is still empty. A concurrent rejoin aborts this.
    const result = await roomRef.transaction((room) => {
      if (!room) return;
      if (room.players && Object.keys(room.players).length !== 0) return;
      return null;
    });

    if (!result.committed) {
      logger.info("Kept PixelPhyx room because it is active or already removed", { roomId });
      return;
    }

    // Remove the public gallery entry and its reserved slot as well.
    const directoryRef = database.ref(`lobbyDirectory/${roomId}`);
    const directorySnapshot = await directoryRef.get();
    const slot = directorySnapshot.child("slot").val();

    await directoryRef.transaction((current) => {
      if (!current || current.room !== roomId) return;
      return null;
    });

    if (typeof slot === "string" && /^slot-\d{2}$/.test(slot)) {
      await database.ref(`lobbySlots/${slot}`).transaction((current) => {
        if (!current || current.room !== roomId) return;
        return null;
      });
    }

    logger.info("Deleted empty PixelPhyx room and lobby listing", {
      roomId,
      departedPlayerId: playerId,
      slot: slot || null
    });
  }
);
