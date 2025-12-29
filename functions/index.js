/**
 * VERITAS Live Poll - Backend Functions
 * Migrated from Google Apps Script to run essentially "at the edge".
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Update the Live Session State (The "Next Question" Signal).
 * Replaces the "broadcastSessionState" client-side hack and GAS backend delay.
 *
 * Usage from Client:
 * const result = await setLiveSessionState({
 *   pollId: '...',
 *   status: 'OPEN',
 *   questionIndex: 1
 * });
 */
exports.setLiveSessionState = onCall({cors: true}, async (request) => {
  // 1. Auth Check (Phase 1: trust caller with ID, Todo: Auth context)
  // const uid = request.auth.uid;

  const {pollId, status, questionIndex, questionText, options} = request.data;

  if (!pollId) {
    throw new HttpsError(
        "invalid-argument",
        "The function must be called with a pollId.",
    );
  }

  logger.info(`Session Update: ${pollId} -> ${status} (Q${questionIndex})`);

  // 2. The "Fast Path" is now the "Only Path"
  // Write directly to Realtime DB
  const sessionRef = admin.database().ref(`sessions/${pollId}/live_session`);

  const payload = {
    pollId: pollId,
    questionIndex: questionIndex,
    status: status || "OPEN",
    timestamp: admin.database.ServerValue.TIMESTAMP,
    questionText: questionText || "",
    options: options || [],
    serverProcessed: true, // Flag to prove it came from us
  };

  await sessionRef.set(payload);

  return {success: true, timestamp: Date.now()};
});
