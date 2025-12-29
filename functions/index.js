/**
 * VERITAS Live Poll - Backend Functions
 * Migrated from Google Apps Script to run essentially "at the edge".
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const analyticsEngine = require("./analytics_engine");

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
exports.setLiveSessionState = onCall({ cors: true }, async (request) => {
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

  return { success: true, timestamp: Date.now() };
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
/**
 * Finalize Session (The "End Poll" Signal).
 * 1. Reads all answers for the poll.
 * 2. Writes a permanent history record.
 * 3. Clears the live session state.
 */
exports.finalizeSession = onCall({ cors: true }, async (request) => {
  const { pollId } = request.data;
  if (!pollId) {
    throw new HttpsError("invalid-argument", "Missing pollId");
  }

  const db = admin.database();
  const answersRef = db.ref(`answers/${pollId}`);
  const liveSessionRef = db.ref(`sessions/${pollId}/live_session`);
  const historyRef = db.ref(`history/${pollId}`);

  // 1. Fetch all answers
  const answersSnap = await answersRef.once("value");
  const answers = answersSnap.val() || {};

  // 2. Fetch poll metadata (name, class)
  const pollRef = db.ref(`polls/${pollId}`);
  const pollSnap = await pollRef.once("value");
  const pollMeta = pollSnap.val() || {};

  // 3. Fetch session metadata (question index, etc)
  const sessionSnap = await liveSessionRef.once("value");
  const sessionData = sessionSnap.val() || {};

  const sessionId = Date.now().toString(); // Simple ID

  const historyPayload = {
    sessionId: sessionId,
    timestamp: admin.database.ServerValue.TIMESTAMP,
    pollId: pollId,
    pollName: pollMeta.pollName || "Untitled Poll",
    className: pollMeta.className || "Unassigned",
    finalQuestionIndex: sessionData.questionIndex || 0,
    totalResponses: Object.keys(answers).length,
    answers: answers, // Persist raw answers
    questions: pollMeta.questions || [], // Snapshot of questions at time of run
    // Todo: Add aggregated stats here
  };

  // 3. Write to History
  await historyRef.child(sessionId).set(historyPayload);

  // 4. Clear/Reset Live Session (Optional, or just mark as CLOSED)
  // For now, we just mark it as ended
  await liveSessionRef.update({
    status: "ENDED",
    endedAt: admin.database.ServerValue.TIMESTAMP,
  });

  logger.info(`Session Finalized: ${pollId} -> ${sessionId}`);
  return { success: true, sessionId: sessionId };
});

/**
 * Get Comprehensive Analytics (The "Analytics Hub" Signal).
 * Consolidates multiple legacy GAS endpoints into one powerful engine.
 */
exports.getAnalytics = onCall({ cors: true }, async (request) => {
  const { className, pollId, studentEmail } = request.data;
  const db = admin.database();

  logger.info(`Analytics Request: class=${className}, poll=${pollId}, student=${studentEmail}`);

  // 1. Fetch Data
  const historySnap = await db.ref("history").once("value");
  const historyData = historySnap.val() || {};

  const rostersSnap = await db.ref("rosters").once("value");
  const rostersData = rostersSnap.val() || {};

  const pollsSnap = await db.ref("polls").once("value");
  const pollsData = pollsSnap.val() || {};

  // 2. Process based on request scope
  if (pollId) {
    // Specific Post-Poll Analytics
    const poll = pollsData[pollId];
    if (!poll) throw new HttpsError("not-found", "Poll not found");

    // Get all sessions for this poll from history
    const pollHistory = historyData[pollId] || {};
    // For post-poll analysis, we usually look at the latest session
    const sessions = Object.values(pollHistory).sort((a, b) => b.timestamp - a.timestamp);
    const latestSession = sessions[0];

    if (!latestSession) {
      return { success: false, error: "No history found for this poll" };
    }

    const itemAnalysis = analyticsEngine.computeItemAnalysis(latestSession, latestSession.answers || {});

    return {
      success: true,
      pollId,
      pollName: latestSession.pollName,
      className: latestSession.className,
      questionCount: latestSession.questions ? latestSession.questions.length : 0,
      itemAnalysis
    };
  }

  if (studentEmail && className) {
    // Specific Student Insights
    const roster = Object.values(rostersData[className] || {});
    const student = roster.find(s => s.email === studentEmail);

    // Flatten all sessions for this person
    const allSessions = [];
    Object.keys(historyData).forEach(pId => {
      Object.values(historyData[pId]).forEach(sess => {
        if (sess.className === className) allSessions.push(sess);
      });
    });

    const insights = analyticsEngine.computeStudentInsights(allSessions, student ? [student] : []);
    return { success: true, studentEmail, insights: insights[0] };
  }

  // Default: Dashboard / Overview Analytics
  const results = analyticsEngine.computeAnalytics(historyData, rostersData);

  return {
    success: true,
    ...results
  };
});
