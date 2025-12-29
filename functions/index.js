/**
 * VERITAS Live Poll - Backend Functions
 * Migrated from Google Apps Script to run essentially "at the edge".
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onValueWritten} = require("firebase-functions/v2/database");
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

  const {
    pollId, status, questionIndex, questionText, options, correctAnswer,
  } = request.data;

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

  // 3. SECURE OPTION: Store the answer key internally (not exposed to students)
  if (correctAnswer !== undefined) {
    const keyPath = `sessions/${pollId}/answers_key/${questionIndex}`;
    const keyRef = admin.database().ref(keyPath);
    await keyRef.set(correctAnswer);
    logger.info(`Secure Key Stored for Q${questionIndex}`);
  }

  await sessionRef.set(payload);

  return {success: true, timestamp: Date.now()};
});

/**
 * Handle Student Answer Submission (The "Submit" Signal).
 * Listens to writes at /answers/{pollId}/{studentEmailKey}.
 *
 * Benefits:
 * 1. Async: Client writes/disconnects immediately.
 * 2. Atomic: Server updates student list.
 */
exports.onAnswerSubmitted = onValueWritten(
    {
      ref: "/answers/{pollId}/{studentEmailKey}",
    },
    async (event) => {
      const data = event.data.after.val(); // The answer object
      const pollId = event.params.pollId;
      const studentEmailKey = event.params.studentEmailKey;

      // Ignore deletions
      if (!data) return;

      logger.info(`Answer: Poll ${pollId} from ${studentEmailKey}`, data);

      // 1. Fetch Correct Answer from Secure Key Store
      let isCorrect = null;
      if (data.questionIndex !== undefined) {
        const keyPath = `sessions/${pollId}/answers_key/${data.questionIndex}`;
        const keyRef = admin.database().ref(keyPath);
        const keySnap = await keyRef.once("value");
        const correctVal = keySnap.val();

        if (correctVal !== null && data.answer) {
        // Simple string comparison for now.
        // TODO: Enhance for multi-select arrays if needed.
          const ansStr = String(data.answer).trim().toLowerCase();
          const keyStr = String(correctVal).trim().toLowerCase();
          isCorrect = (ansStr === keyStr);
        }
      }

      // 2. Update Teacher Dashboard View
      // Ideally, the 'answers' node should rely on the *studentKey*, not email.
      // For this migration, we assume client sends studentKey.

      const studentStatusPath =
      `sessions/${pollId}/students/${studentEmailKey}`;
      const studentStatusRef = admin.database().ref(studentStatusPath);

      // Check current status to avoid overwriting LOCKED state?
      // For now, simple set to FINISHED is consistent with legacy behavior.
      // We update status AND payload the correctness result if available
      const updatePayload = {
        status: "FINISHED",
        lastAnswerTimestamp: admin.database.ServerValue.TIMESTAMP,
      };

      if (isCorrect !== null) {
        updatePayload.lastAnswerCorrect = isCorrect;
      }

      await studentStatusRef.update(updatePayload);
      logger.info(
          `Student ${studentEmailKey} marked FINISHED (Correct: ${isCorrect})`,
      );
    });
