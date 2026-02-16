/**
 * VERITAS Live Poll - Backend Functions
 * Migrated from Google Apps Script to run essentially "at the edge".
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const analyticsEngine = require("./analytics_engine");
const emailService = require("./email_service");

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
    pollId, status, questionIndex, questionText, options, correctAnswer, metadata,
    questionImageURL, totalQuestions, calculatorEnabled, shuffleOptions,
  } = request.data;

  if (!pollId) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a pollId.",
    );
  }

  logger.info(`Session Update: ${pollId} -> ${status} (Q${questionIndex})`);

  // DIAGNOSTIC: Log received question data
  logger.info(`Question data received:`, {
    questionText: questionText ? questionText.substring(0, 100) : 'EMPTY',
    optionsLength: options ? options.length : 0,
    options: options,
    questionImageURL: questionImageURL,
    totalQuestions: totalQuestions
  });

  // 2. The "Fast Path" is now the "Only Path"
  // Write directly to Realtime DB
  const sessionRef = admin.database().ref(`sessions/${pollId}/live_session`);

  // Merge with existing metadata if present
  const existingSnapshot = await sessionRef.child("metadata").once("value");
  const existingMetadata = existingSnapshot.val() || {};

  const payload = {
    pollId: pollId,
    questionIndex: questionIndex !== undefined ? questionIndex : (status === "PRE_LIVE" ? -1 : 0),
    status: status || "OPEN",
    timestamp: admin.database.ServerValue.TIMESTAMP,
    questionText: questionText || "",
    options: options || [],
    serverProcessed: true, // Flag to prove it came from us
    metadata: {
      ...existingMetadata,
      ...metadata,
    },
  };

  // Include optional fields if provided
  if (questionImageURL !== undefined) {
    payload.questionImageURL = questionImageURL;
  }
  if (totalQuestions !== undefined) {
    payload.totalQuestions = totalQuestions;
  }
  if (calculatorEnabled !== undefined) {
    payload.calculatorEnabled = calculatorEnabled;
  }
  if (shuffleOptions !== undefined) {
    payload.shuffleOptions = shuffleOptions;
  }

  // 3. SECURE OPTION: Store the answer key internally (not exposed to students)
  if (correctAnswer !== undefined && questionIndex !== undefined) {
    const keyPath = `sessions/${pollId}/answers_key/${questionIndex}`;
    const keyRef = admin.database().ref(keyPath);
    await keyRef.set(correctAnswer);
    logger.info(`Secure Key Stored for Q${questionIndex}`);
  }

  // REVEAL LOGIC: If results are revealed, expose the correct answer
  if (payload.metadata && payload.metadata.resultsVisibility === 'REVEALED' && questionIndex !== undefined) {
    const keyPath = `sessions/${pollId}/answers_key/${questionIndex}`;
    const keyRef = admin.database().ref(keyPath);
    const keySnap = await keyRef.once('value');
    const storedKey = keySnap.val();
    if (storedKey) {
      payload.correctAnswer = storedKey;
      logger.info(`Exposing correct answer for Q${questionIndex} (REVEALED)`);
    }
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
 *
 * PHASE 4: CONTEXTUAL GRADING & IDEMPOTENCY
 * - Validates questionIndex against current live_session state
 * - Checks if this exact answer has already been processed (via responseId)
 * - Uses transaction to prevent race conditions
 * - Can run multiple times for the same answer without corrupting data
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

    // PHASE 4: IDEMPOTENCY CHECK
    // Check if this exact submission has already been processed using responseId
    const responseId = data.responseId;
    const questionIndex = data.questionIndex;

    if (responseId) {
      // Check if this responseId was already processed
      const processedPath = `sessions/${pollId}/processed_answers/${studentEmailKey}/${questionIndex}`;
      const processedRef = admin.database().ref(processedPath);
      const processedSnap = await processedRef.once("value");

      if (processedSnap.exists()) {
        const processedData = processedSnap.val();
        if (processedData.responseId === responseId) {
          logger.info(`Answer already processed (idempotent skip): ${responseId}`);
          return; // Already processed, skip
        }
      }
    }

    // PHASE 4.1: CONTEXTUAL GRADING - Verify questionIndex matches live session
    // This prevents late submissions for Q1 being graded against Q2's key
    const liveSessionRef = admin.database().ref(`sessions/${pollId}/live_session`);
    const liveSessionSnap = await liveSessionRef.once("value");
    const liveSession = liveSessionSnap.val();

    let isLateSubmission = false;
    if (liveSession && liveSession.questionIndex !== undefined) {
      if (questionIndex < liveSession.questionIndex) {
        isLateSubmission = true;
        logger.warn(`Late submission detected: Student answering Q${questionIndex} while session is on Q${liveSession.questionIndex}`);
      }
    }

    // 1. Fetch Correct Answer from Secure Key Store
    // PHASE 4.1: Use the questionIndex from the answer payload, not the current live session
    let isCorrect = null;
    if (questionIndex !== undefined) {
      const keyPath = `sessions/${pollId}/answers_key/${questionIndex}`;
      const keyRef = admin.database().ref(keyPath);
      const keySnap = await keyRef.once("value");
      const correctVal = keySnap.val();

      if (correctVal !== null && data.answer) {
        // Simple string comparison for now.
        // Handle both string and array answers
        const ansStr = String(data.answer).trim().toLowerCase();
        const keyStr = String(correctVal).trim().toLowerCase();
        isCorrect = (ansStr === keyStr);

        // PHASE 4: Also handle True/False question type variations
        // Normalize T/F variations (true, True, TRUE, t, T, 1, yes, etc.)
        if (!isCorrect) {
          const trueVariations = ['true', 't', '1', 'yes', 'y'];
          const falseVariations = ['false', 'f', '0', 'no', 'n'];

          const ansNorm = trueVariations.includes(ansStr) ? 'true' :
            (falseVariations.includes(ansStr) ? 'false' : ansStr);
          const keyNorm = trueVariations.includes(keyStr) ? 'true' :
            (falseVariations.includes(keyStr) ? 'false' : keyStr);

          isCorrect = (ansNorm === keyNorm);
        }
      }
    }

    // 2. Update Teacher Dashboard View using TRANSACTION for safety
    const studentStatusPath = `sessions/${pollId}/students/${studentEmailKey}`;
    const studentStatusRef = admin.database().ref(studentStatusPath);

    // Use transaction to prevent race conditions and preserve other fields
    await studentStatusRef.transaction((currentData) => {
      if (!currentData) {
        // Student entry doesn't exist, create minimal entry
        return {
          status: "FINISHED",
          lastAnswerTimestamp: admin.database.ServerValue.TIMESTAMP,
          lastAnswerCorrect: isCorrect,
          lastAnswerQuestionIndex: questionIndex,
          isLateSubmission: isLateSubmission,
        };
      }

      // PHASE 4: Don't overwrite LOCKED status (security constraint)
      if (currentData.status === 'LOCKED' || currentData.status === 'BLOCKED') {
        // Preserve locked status but record the answer attempt
        currentData.lastAnswerTimestamp = admin.database.ServerValue.TIMESTAMP;
        currentData.lastAnswerCorrect = isCorrect;
        currentData.lastAnswerQuestionIndex = questionIndex;
        currentData.isLateSubmission = isLateSubmission;
        return currentData;
      }

      // Normal update
      currentData.status = "FINISHED";
      currentData.lastAnswerTimestamp = admin.database.ServerValue.TIMESTAMP;
      if (isCorrect !== null) {
        currentData.lastAnswerCorrect = isCorrect;
      }
      currentData.lastAnswerQuestionIndex = questionIndex;
      currentData.isLateSubmission = isLateSubmission;

      return currentData;
    });

    // PHASE 4: Mark this answer as processed (for idempotency)
    if (responseId && questionIndex !== undefined) {
      const processedPath = `sessions/${pollId}/processed_answers/${studentEmailKey}/${questionIndex}`;
      await admin.database().ref(processedPath).set({
        responseId: responseId,
        processedAt: admin.database.ServerValue.TIMESTAMP,
        isCorrect: isCorrect,
        isLateSubmission: isLateSubmission,
      });
    }

    logger.info(
      `Student ${studentEmailKey} marked FINISHED (Correct: ${isCorrect}, Q${questionIndex}, Late: ${isLateSubmission})`,
    );
  });
/**
 * Finalize Session (The "End Poll" Signal).
 * 1. Reads all answers for the poll.
 * 2. Writes a permanent history record.
 * 3. Clears the live session state.
 *
 * PHASE 4.2: ATOMIC UPDATES
 * - Uses multi-path update to atomically move data to history
 * - Ensures no data is lost during the transfer
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
  const studentsRef = db.ref(`sessions/${pollId}/students`);

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

  // 4. Fetch student status data for comprehensive history
  const studentsSnap = await studentsRef.once("value");
  const students = studentsSnap.val() || {};

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
    students: students, // Persist student status for proctoring audit trail
    sessionMetadata: sessionData.metadata || {}, // Preserve session settings
    // Todo: Add aggregated stats here
  };

  // PHASE 4.2: ATOMIC MULTI-PATH UPDATE
  // Write history and update session status atomically to prevent data loss
  const updates = {};
  updates[`history/${pollId}/${sessionId}`] = historyPayload;
  updates[`sessions/${pollId}/live_session/status`] = "ENDED";
  updates[`sessions/${pollId}/live_session/endedAt`] = admin.database.ServerValue.TIMESTAMP;
  updates[`sessions/${pollId}/live_session/finalizedSessionId`] = sessionId;

  try {
    // Atomic write - all succeed or all fail
    await db.ref().update(updates);
    logger.info(`Session Finalized (Atomic): ${pollId} -> ${sessionId}`);
  } catch (error) {
    logger.error(`Session Finalization Failed: ${pollId}`, error);
    throw new HttpsError("internal", "Failed to finalize session atomically");
  }

  return { success: true, sessionId: sessionId };
});

/**
 * Get Comprehensive Analytics (The "Analytics Hub" Signal).
 * Consolidates multiple legacy GAS endpoints into one powerful engine.
 */
exports.getAnalytics = onCall({ cors: true }, async (request) => {
  const { className, pollId, studentEmail } = request.data;
  const db = admin.database();

  logger.info(`Analytics Request: class=${className}, ` +
    `poll=${pollId}, student=${studentEmail}`);

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
    const sessions = Object.values(pollHistory)
      .sort((a, b) => b.timestamp - a.timestamp);
    const latestSession = sessions[0];

    if (!latestSession) {
      return { success: false, error: "No history found for this poll" };
    }

    const itemAnalysis = analyticsEngine.computeItemAnalysis(
      latestSession, latestSession.answers || {});

    return {
      success: true,
      pollId,
      pollName: latestSession.pollName,
      className: latestSession.className,
      questionCount: latestSession.questions ?
        latestSession.questions.length : 0,
      itemAnalysis,
    };
  }

  if (studentEmail && className) {
    // Specific Student Insights
    const roster = Object.values(rostersData[className] || {});
    const student = roster.find((s) => s.email === studentEmail);

    // Flatten all sessions for this person
    const allSessions = [];
    Object.keys(historyData).forEach((pId) => {
      Object.values(historyData[pId]).forEach((sess) => {
        if (sess.className === className) allSessions.push(sess);
      });
    });

    const insights = analyticsEngine.computeStudentInsights(
      allSessions, student ? [student] : []);
    return { success: true, studentEmail, insights: insights[0] };
  }

  // Default: Dashboard / Overview Analytics
  const results = analyticsEngine.computeAnalytics(historyData, rostersData);

  return {
    success: true,
    ...results,
  };
});
/**
 * Manage Proctoring Status (Teacher Actions).
 * Handles UNLOCK, BLOCK, UNBLOCK with atomic transactions.
 */
exports.manageProctoring = onCall({ cors: true }, async (request) => {
  const { pollId, studentEmail, action, expectedLockVersion } = request.data;
  // TODO: Auth check for teacher role

  if (!pollId || !studentEmail || !action) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  const emailKey = studentEmail.replace(/[.$#[\]]/g, "_");
  const studentRef = admin.database().ref(`sessions/${pollId}/students/${emailKey}`);

  const result = await studentRef.transaction((student) => {
    if (!student) return null;

    if (action === "UNLOCK") {
      // Validate lockVersion to prevent accidental unlocks of new violations
      if (student.lockVersion !== expectedLockVersion) {
        return undefined; // Abort
      }
      student.status = "AWAITING_FULLSCREEN";
      student.unlockApproved = true;
      student.unlockApprovedAt = admin.database.ServerValue.TIMESTAMP;
    } else if (action === "BLOCK") {
      student.status = "BLOCKED";
      student.isBlocked = true;
    } else if (action === "UNBLOCK") {
      student.status = "ACTIVE";
      student.isBlocked = false;
    } else if (action === "RESET") {
      student.status = "ACTIVE";
      student.lockVersion = 0;
      student.isBlocked = false;
    }

    return student;
  });

  if (result.committed) {
    return { success: true, status: result.snapshot.val().status };
  } else {
    return {
      success: false,
      reason: "version_mismatch_or_not_found",
      currentLockVersion: result.snapshot ? result.snapshot.val().lockVersion : -1,
    };
  }
});

/**
 * Report Student Violation (Student Signal).
 * Implements the "Poison Pill" logic and increments lockVersion.
 */
exports.reportStudentViolation = onCall({ cors: true }, async (request) => {
  const { pollId, studentEmail, reason } = request.data;

  if (!pollId || !studentEmail) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  const emailKey = studentEmail.replace(/[.$#[\]]/g, "_");
  const studentRef = admin.database().ref(`sessions/${pollId}/students/${emailKey}`);

  const result = await studentRef.transaction((student) => {
    if (!student) {
      // Create student entry if missing
      student = {
        email: studentEmail,
        status: "LOCKED",
        lockVersion: 1,
        violations: 1,
      };
    } else {
      student.status = "LOCKED";
      student.lockVersion = (student.lockVersion || 0) + 1;
      student.violations = (student.violations || 0) + 1;
    }

    student.lastViolationReason = reason || "unknown";
    student.lastViolationAt = admin.database.ServerValue.TIMESTAMP;

    return student;
  });

  // Log to activities for teacher dashboard to see
  const activityRef = admin.database().ref(`sessions/${pollId}/activities/${emailKey}`);
  await activityRef.push({
    type: "VIOLATION",
    reason: reason || "unknown",
    timestamp: admin.database.ServerValue.TIMESTAMP,
  });

  return {
    success: result.committed,
    lockVersion: result.snapshot ? result.snapshot.val().lockVersion : 1,
  };
});

/**
 * Create a new poll
 */
exports.createPoll = onCall({ cors: true }, async (request) => {
  const { pollName, className, questions, metadata } = request.data;

  if (!pollName || !className || !questions) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  const pollId = Date.now().toString();
  const db = admin.database();

  const pollData = {
    pollId,
    pollName,
    className,
    questions: questions || [],
    questionCount: (questions || []).length,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    // Metadata fields
    sessionType: metadata?.sessionType || "LIVE_POLL",
    timeLimitMinutes: metadata?.timeLimitMinutes || 0,
    accessCode: metadata?.accessCode || "",
    availableFrom: metadata?.availableFrom || "",
    dueBy: metadata?.dueBy || "",
    secureSettings: metadata?.secureSettings || {},
    missionControlState: metadata?.missionControlState || "",
  };

  await db.ref(`polls/${pollId}`).set(pollData);

  logger.info(`Poll created: ${pollId} - ${pollName}`);

  return {
    success: true,
    pollId,
    poll: pollData,
  };
});

/**
 * Update an existing poll
 */
exports.updatePoll = onCall({ cors: true }, async (request) => {
  const { pollId, pollName, className, questions, metadata } = request.data;

  if (!pollId) {
    throw new HttpsError("invalid-argument", "Missing pollId");
  }

  const db = admin.database();
  const pollRef = db.ref(`polls/${pollId}`);

  // Check if poll exists
  const snapshot = await pollRef.once("value");
  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Poll not found");
  }

  const updateData = {
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  };

  if (pollName) updateData.pollName = pollName;
  if (className) updateData.className = className;
  if (questions) {
    updateData.questions = questions;
    updateData.questionCount = questions.length;
  }

  // Update metadata if provided
  if (metadata) {
    if (metadata.sessionType) updateData.sessionType = metadata.sessionType;
    if (metadata.timeLimitMinutes !== undefined) {
      updateData.timeLimitMinutes = metadata.timeLimitMinutes;
    }
    if (metadata.accessCode !== undefined) {
      updateData.accessCode = metadata.accessCode;
    }
    if (metadata.availableFrom !== undefined) {
      updateData.availableFrom = metadata.availableFrom;
    }
    if (metadata.dueBy !== undefined) updateData.dueBy = metadata.dueBy;
    if (metadata.secureSettings) {
      updateData.secureSettings = metadata.secureSettings;
    }
    if (metadata.missionControlState !== undefined) {
      updateData.missionControlState = metadata.missionControlState;
    }
  }

  await pollRef.update(updateData);

  logger.info(`Poll updated: ${pollId}`);

  return {
    success: true,
    pollId,
  };
});

/**
 * Delete a poll and all associated data
 */
exports.deletePoll = onCall({ cors: true }, async (request) => {
  const { pollId } = request.data;

  if (!pollId) {
    throw new HttpsError("invalid-argument", "Missing pollId");
  }

  const db = admin.database();

  // Atomic multi-path delete
  const updates = {};
  updates[`polls/${pollId}`] = null;
  updates[`answers/${pollId}`] = null;
  updates[`history/${pollId}`] = null;
  updates[`sessions/${pollId}`] = null;

  await db.ref().update(updates);

  logger.info(`Poll deleted: ${pollId}`);

  return { success: true, pollId };
});

/**
 * Manage roster operations (CRUD)
 * renameClass, deleteClassRecord
 */
exports.manageRoster = onCall({ cors: true }, async (request) => {
  // 0. Auth Check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { action, className, newClassName, students, pollId } = request.data;
  const uid = request.auth.uid; // Available if needed for personalized rosters

  // GET_DATA is the only action that doesn't strictly require a className
  if (!action || (!className && action !== 'GET_DATA')) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  const db = admin.database();
  const rosterRef = db.ref(`rosters/rosters/${className}`);

  switch (action) {
    case "SAVE":
      // Save/replace entire roster
      if (!students || !Array.isArray(students)) {
        throw new HttpsError("invalid-argument", "Students array required");
      }

      await rosterRef.set(students);
      logger.info(`Roster saved: ${className} (${students.length} students) by ${uid}`);

      return {
        success: true,
        className,
        studentCount: students.length,
      };

    case "BULK_ADD":
      // Add students to existing roster
      if (!students || !Array.isArray(students)) {
        throw new HttpsError("invalid-argument", "Students array required");
      }

      const existingSnapshot = await rosterRef.once("value");
      const existingRoster = existingSnapshot.val() || [];
      const existingEmails = new Set(
        existingRoster.map((s) => s.email.toLowerCase()),
      );

      const newStudents = students.filter(
        (s) => !existingEmails.has(s.email.toLowerCase()),
      );
      const updatedRoster = [...existingRoster, ...newStudents];

      await rosterRef.set(updatedRoster);
      logger.info(
        `Roster bulk add: ${className} (+${newStudents.length} students)`,
      );

      return {
        success: true,
        className,
        addedCount: newStudents.length,
        totalCount: updatedRoster.length,
      };

    case "RENAME":
      // Rename class (move roster to new name)
      if (!newClassName) {
        throw new HttpsError("invalid-argument", "newClassName required");
      }

      const snapshot = await rosterRef.once("value");
      if (!snapshot.exists()) {
        throw new HttpsError("not-found", "Class not found");
      }

      const rosterData = snapshot.val();
      const newRosterRef = db.ref(`rosters/rosters/${newClassName}`);

      // Check if new name already exists
      const newSnapshot = await newRosterRef.once("value");
      if (newSnapshot.exists()) {
        throw new HttpsError(
          "already-exists",
          "A class with that name already exists",
        );
      }

      // Copy to new location and delete old
      await newRosterRef.set(rosterData);
      await rosterRef.remove();

      // Also update all polls with this className
      const pollsRef = db.ref("polls");
      const pollsSnapshot = await pollsRef.once("value");
      const polls = pollsSnapshot.val() || {};

      const updates = {};
      Object.keys(polls).forEach((pollId) => {
        if (polls[pollId].className === className) {
          updates[`polls/${pollId}/className`] = newClassName;
        }
      });

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }

      // Update classes index
      const classesRef = db.ref("rosters/classes");
      const classesSnap = await classesRef.once("value");
      let classes = classesSnap.val() || [];

      classes = classes.filter(c => c !== className);
      if (!classes.includes(newClassName)) {
        classes.push(newClassName);
      }
      await classesRef.set(classes);

      logger.info(`Class renamed: ${className} -> ${newClassName}`);

      return {
        success: true,
        oldClassName: className,
        newClassName,
        pollsUpdated: Object.keys(updates).length,
      };

    case "DELETE":
      // Delete class roster
      const deleteSnapshot = await rosterRef.once("value");
      if (deleteSnapshot.exists()) {
        await rosterRef.remove();
        logger.info(`Class deleted: ${className}`);
      } else {
        logger.info(`Class delete requested but not found (already deleted): ${className}`);
      }

      // Update classes index
      const classesIndexRef = db.ref("rosters/classes");
      const classesIndexSnap = await classesIndexRef.once("value");
      let classesList = classesIndexSnap.val() || [];

      const originalLength = classesList.length;
      classesList = classesList.filter(c => c !== className);

      if (classesList.length !== originalLength) {
        await classesIndexRef.set(classesList);
        logger.info(`Class removed from index: ${className}`);
      }

      return {
        success: true,
        className,
      };

    case "GET_LINKS":
      // Generate/Retrieve tokens and short URLs for all students in a class
      const snapshotLinks = await rosterRef.once("value");
      if (!snapshotLinks.exists()) {
        throw new HttpsError("not-found", "Class not found");
      }

      const roster = snapshotLinks.val() || [];
      const tokensRef = db.ref("tokens");
      const tokensLinksIndexRef = db.ref(`tokens_index/${className}`);

      const existingTokensSnapshot = await tokensLinksIndexRef.once("value");
      const existingTokens = existingTokensSnapshot.val() || {};

      const links = await Promise.all(
        roster.map(async (student) => {
          const studentEmail = student.email.toLowerCase();
          let token = existingTokens[studentEmail.replace(/\./g, "_")];

          if (!token) {
            // Generate new token if not exists
            token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30); // 30 days expiry

            await tokensRef.child(token).set({
              email: student.email,
              className: className,
              created: Date.now(),
              expires: expiryDate.getTime(),
            });

            await tokensLinksIndexRef.child(studentEmail.replace(/\./g, "_")).set(token);
          }

          // In a real environment, we might call a URL shortener here.
          // For now, we return the structured link data.
          return {
            name: student.name,
            email: student.email,
            token: token,
            hasActiveLink: true,
          };
        }),
      );

      return {
        success: true,
        links: links,
      };

    case "GET_DATA":
      // Fetch all rosters and classes
      const rostersSnapshotData = await db.ref("rosters").once("value");
      const rostersRaw = rostersSnapshotData.val() || {};

      return {
        success: true,
        rosters: rostersRaw.rosters || {},
        classes: rostersRaw.classes || [],
      };

    case "SEND_EMAILS":
      // Prepare email data and return to client to use a mail bridge
      // This ensures token logic is in CF, while GAS only handles the actual 'send'

      // RECURSIVE CALL FIX: Call the 'GET_LINKS' logic directly instead of invoking the function again
      // to avoid context issues or recursion limits.
      // We can just call manageRoster logic again by creating a "virtual request" if we wanted,
      // but simpler is to extract the logic or just duplicate the few lines for now.
      // Better yet, let's just use the same logic flow above if we refactored, but since we are inside the function,
      // we can't easily self-invoke onCall handlers properly without network.
      // So detailed implementation of GET_LINKS logic here matches best practice.

      // Duplicate GET_LINKS logic for safety and speed:
      const snapE = await rosterRef.once("value");
      if (!snapE.exists()) throw new HttpsError("not-found", "Class not found");
      const rosE = snapE.val() || [];
      const tokRef = db.ref("tokens");
      const tokIdxRef = db.ref(`tokens_index/${className}`);
      const exTokSnap = await tokIdxRef.once("value");
      const exTok = exTokSnap.val() || {};

      const studentLinks = await Promise.all(
        rosE.map(async (student) => {
          const sEmail = student.email.toLowerCase();
          let token = exTok[sEmail.replace(/\./g, "_")];
          if (!token) {
            token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const exp = new Date();
            exp.setDate(exp.getDate() + 30);
            await tokRef.child(token).set({
              email: student.email, className, created: Date.now(), expires: exp.getTime()
            });
            await tokIdxRef.child(sEmail.replace(/\./g, "_")).set(token);
          }
          return { name: student.name, email: student.email, token, hasActiveLink: true };
        })
      );

      const pollSnapshot = await db.ref(`polls/${pollId}`).once("value");
      const pollData = pollSnapshot.val() || { pollName: "Veritas Poll" };

      const emailDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      const isSecure = (pollData.sessionType || "").toUpperCase().includes("SECURE");
      const subject = isSecure ?
        `Your VERITAS Secure Assessment Link – ${emailDate}` :
        `Your VERITAS Live Poll Link – ${emailDate}`;

      return {
        success: true,
        subject: subject,
        pollName: pollData.pollName,
        links: studentLinks,
      };

    default:
      throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
  }
});

/**
 * Confirm Fullscreen (Student Signal).
 * Resets student status from 'AWAITING_FULLSCREEN' to 'ACTIVE'
 * if lockVersion matches.
 */
exports.confirmFullscreen = onCall({ cors: true }, async (request) => {
  const { pollId, studentEmail, lockVersion } = request.data;

  if (!pollId || !studentEmail || lockVersion === undefined) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  const emailKey = studentEmail.replace(/[.$#[\]]/g, "_");
  const studentRef = admin.database().ref(`sessions/${pollId}/students/${emailKey}`);

  const result = await studentRef.transaction((student) => {
    if (!student) return;

    if (student.status !== "AWAITING_FULLSCREEN") {
      return; // Not in the state that allows confirmation
    }

    if (student.lockVersion !== lockVersion) {
      return; // Version mismatch
    }

    student.status = "ACTIVE";
    student.lastFullscreenConfirmationAt = admin.database.ServerValue.TIMESTAMP;

    return student;
  });

  if (result.committed && result.snapshot.exists()) {
    // Log activity
    const activityRef = admin.database().ref(`sessions/${pollId}/activities/${emailKey}`);
    await activityRef.push({
      type: "FULLSCREEN_CONFIRM",
      timestamp: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true };
  } else {
    return {
      success: false,
      reason: result.snapshot.exists() ? "invalid_state_or_version" : "student_not_found",
    };
  }
});

/**
 * Simulated Email Sending (Migration Stub).
 * Replace this with SendGrid/SMTP logic when ready.
 */
exports.sendEmail = onCall({ cors: true }, async (request) => {
  const { recipientEmail, subject, body, students } = request.data;
  const nodemailer = require('nodemailer');

  // SMTP Configuration
  // Note: Password must be set via .env file or Secret Manager (Gen 2 requirement)
  const smtpPassword = process.env.SMTP_PASSWORD;

  if (!smtpPassword) {
    logger.error("[Email Service] SMTP Password not found in process.env.SMTP_PASSWORD");
    throw new HttpsError('failed-precondition', 'SMTP Configuration missing. Please check .env file or secrets.');
  }

  const transporter = nodemailer.createTransport({
    host: "mail.spacemail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user: "email@veritas.courses",
      pass: smtpPassword
    }
  });

  const mailOptions = {
    from: '"Veritas Live" <email@veritas.courses>',
  };

  try {
    // Batch Mode
    if (students && Array.isArray(students)) {
      logger.info(`[Email Service] Processing batch of ${students.length} emails`);
      let sentCount = 0;
      let errors = [];

      // Process sequentially to avoid rate limits
      for (const s of students) {
        if (s.email) {
          try {
            await transporter.sendMail({
              ...mailOptions,
              to: s.email,
              subject: s.subject || subject,
              html: s.body || body // Support per-student body if needed
            });
            sentCount++;
          } catch (err) {
            logger.error(`[Email Service] Failed to send to ${s.email}:`, err);
            errors.push({ email: s.email, error: err.message });
          }
        }
      }
      return { success: true, sentCount, errors };
    }

    // Single Mode
    if (!recipientEmail || !subject || !body) {
      throw new HttpsError("invalid-argument", "Missing email fields");
    }

    const info = await transporter.sendMail({
      ...mailOptions,
      to: recipientEmail,
      subject: subject,
      html: body
    });

    logger.info(`[Email Service] Sent to: ${recipientEmail}, MessageID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    logger.error("[Email Service] Fatal Error:", error);
    throw new HttpsError("internal", "Failed to send email", error);
  }
});

/**
 * Exam Management Functions
 * Handles CRUD for Exams, Student Sessions, and Submissions.
 */

/**
 * Manage Exams (Teacher Actions)
 * Actions: CREATE, UPDATE_STATUS, GET_ALL
 */
exports.manageExams = onCall({ cors: true }, async (request) => {
  const { action, examId, data } = request.data;

  const db = admin.database();

  if (action === "CREATE") {
    if (!data || !data.examName || !data.classId) {
      throw new HttpsError("invalid-argument", "Missing exam data");
    }
    const newExamId = Date.now().toString();
    const examData = {
      examId: newExamId,
      ...data,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      isOpen: data.isOpen || false
    };

    // Populate questions if Poll Source
    if (data.sourceType === 'Poll' && data.sourcePollId) {
      const pollSnap = await db.ref(`polls/${data.sourcePollId}`).once('value');
      if (pollSnap.exists()) {
        const poll = pollSnap.val();
        examData.questions = poll.questions || [];
        examData.questionCount = (poll.questions || []).length;
      }
    } else if (data.sourceType === 'QuestionBank') {
      // TODO: Support Question Bank Source (requires QB migration)
      // For now, empty questions array
      examData.questions = [];
      examData.questionCount = 0;
    }

    // Store in exams path
    await db.ref(`exams/${newExamId}`).set(examData);

    // Index by class if needed, for now just returning success
    return { success: true, examId: newExamId };

  } else if (action === "UPDATE_STATUS") {
    if (!examId || data.isOpen === undefined) {
      throw new HttpsError("invalid-argument", "Missing examId or isOpen status");
    }
    await db.ref(`exams/${examId}/isOpen`).set(data.isOpen);
    return { success: true };

  } else if (action === "GET_ALL") {
    // Phase 1: Return all exams. TODO: Filter by teacher/class
    const snapshot = await db.ref('exams').once('value');
    const examsObj = snapshot.val() || {};
    // Convert to array
    const exams = Object.values(examsObj).sort((a, b) => b.createdAt - a.createdAt);
    return { success: true, exams };

  } else if (action === "GET_CLASSES") {
    const snapshot = await db.ref('rosters/rosters').once('value');
    const classesObj = snapshot.val() || {};
    return { success: true, classes: Object.keys(classesObj) };

  } else if (action === "GET_POLLS") {
    const snapshot = await db.ref('polls').once('value');
    const pollsObj = snapshot.val() || {};
    // Return simplified list for selector
    const polls = Object.values(pollsObj).map(p => ({
      pollId: p.pollId,
      pollName: p.pollName,
      questionCount: p.questionCount || 0
    }));
    return { success: true, polls };
  }

  throw new HttpsError("invalid-argument", "Unknown action");
});

/**
 * Manage Exam Session (Student/Teacher Actions)
 * Actions: START, VIOLATION, UNLOCK, RESUME
 */
exports.manageExamSession = onCall({ cors: true }, async (request) => {
  const { action, examId, studentId, studentName, reason } = request.data;

  if (!examId || !studentId) {
    throw new HttpsError("invalid-argument", "Missing required params");
  }

  const db = admin.database();
  // Use studentId directly if it's safe, or hash/clean it. 
  // For consistency with Polls, we might want to sanitize email if used as ID.
  // Assuming studentId is a safe string or email.
  const studentKey = studentId.replace(/[.$#[\]]/g, "_");
  const sessionRef = db.ref(`sessions/${examId}/students/${studentKey}`);

  if (action === "START") {
    await sessionRef.set({
      status: "ACTIVE",
      studentId,
      studentName,
      startedAt: admin.database.ServerValue.TIMESTAMP,
      lastActivity: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true };

  } else if (action === "VIOLATION") {
    await sessionRef.update({
      status: "LOCKED",
      lastViolation: reason,
      lastViolationAt: admin.database.ServerValue.TIMESTAMP,
      violationCount: admin.database.ServerValue.increment(1)
    });
    // Start Log Trace
    await db.ref(`sessions/${examId}/logs/${studentKey}`).push({
      type: "VIOLATION",
      reason,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true };

  } else if (action === "UNLOCK") {
    await sessionRef.update({
      status: "ACTIVE",
      unlockedAt: admin.database.ServerValue.TIMESTAMP
    });
    await db.ref(`sessions/${examId}/logs/${studentKey}`).push({
      type: "UNLOCK",
      by: "Teacher", // TODO: Add teacher auth info
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true };

  } else if (action === "RESUME") {
    // Student resuming (Soft Lock)
    await sessionRef.update({
      status: "ACTIVE",
      resumedAt: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true };

  } else if (action === "GET_QUESTIONS") {
    const examSnap = await db.ref(`exams/${examId}`).once('value');
    if (!examSnap.exists()) return { success: false, questions: [] };
    const exam = examSnap.val();
    // Secure: Maybe remove answers? 
    // For now return raw questions as stored (like Polls)
    return { success: true, questions: exam.questions || [] };
  }

  throw new HttpsError("invalid-argument", "Unknown action");
});

/**
 * Submit Exam Answers
 */
exports.submitExam = onCall({ cors: true }, async (request) => {
  const { examId, studentId, answers } = request.data;

  if (!examId || !studentId || !answers) {
    throw new HttpsError("invalid-argument", "Missing params");
  }

  const studentKey = studentId.replace(/[.$#[\]]/g, "_");
  const db = admin.database();

  // 1. Save Answers
  await db.ref(`exams/${examId}/submissions/${studentKey}`).set({
    answers,
    submittedAt: admin.database.ServerValue.TIMESTAMP
  });

  // 2. Update Status
  await db.ref(`sessions/${examId}/students/${studentKey}`).update({
    status: "FINISHED",
    submittedAt: admin.database.ServerValue.TIMESTAMP
  });

  // 3. (Optional) Auto-Grade if key exists?
  // For now, return basic success. 
  // Could calculate score here if we had the key.

  return { success: true };
});


/**
 * Verify if the authenticated user is an authorized teacher.
 */
exports.verifyTeacher = onCall({ cors: true }, async (request) => {
  // Check if user is authenticated via Firebase Auth
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const email = request.auth.token.email;
  if (!email) {
    return { isTeacher: false, reason: "No email associated with account." };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Authorized Teacher List (Ported from Core_Config.gs)
  const authorizedTeachers = [
    "sborish@malvernprep.org",
    "teacher@veritas.app" // Add demo account to whitelist to stop warnings
  ];

  const isAuthorized = authorizedTeachers.includes(normalizedEmail);

  if (isAuthorized) {
    logger.info(`Teacher Authorized: ${normalizedEmail}`);
    return { isTeacher: true };
  } else {
    logger.warn(`Unauthorized Access Attempt: ${normalizedEmail}`);
    return { isTeacher: false };
  }
});

/**
 * NEW EXAM LOGIC (Firestore Based)
 */

/**
 * Create a new Exam Session (Teacher Action)
 * Creates a document in Firestore /sessions with status 'WAITING' and a random 6-digit access code.
 */
exports.createExamSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { examId } = request.data;
  if (!examId) {
    throw new HttpsError("invalid-argument", "Missing examId");
  }

  const db = admin.firestore();
  const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

  const sessionData = {
    examId,
    teacherId: request.auth.uid,
    accessCode,
    status: 'WAITING',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const sessionRef = await db.collection("sessions").add(sessionData);

  return {
    success: true,
    sessionId: sessionRef.id,
    accessCode,
  };
});

/**
 * Join an Exam Session (Student Action)
 * Finds the session by accessCode and creates a student document.
 */
exports.joinSession = onCall({ cors: true }, async (request) => {
  const { accessCode, studentName } = request.data;
  if (!accessCode || !studentName) {
    throw new HttpsError("invalid-argument", "Missing accessCode or studentName");
  }

  const db = admin.firestore();
  const sessionSnap = await db.collection("sessions")
    .where("accessCode", "==", accessCode)
    .where("status", "!=", "CLOSED")
    .limit(1)
    .get();

  if (sessionSnap.empty) {
    throw new HttpsError("not-found", "Session not found or already closed.");
  }

  const sessionDoc = sessionSnap.docs[0];
  const sessionId = sessionDoc.id;

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Student must be authenticated (e.g. Anonymous).");
  }

  const studentId = request.auth.uid;
  const studentRef = sessionDoc.ref.collection("students").doc(studentId);

  await studentRef.set({
    name: studentName,
    status: "ACTIVE",
    answers: {},
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    sessionId,
    studentId, // acting as the token for further requests
  };
});

/**
 * Send Exam Link (Teacher Action)
 * Uses the email service to send a direct link to the student.
 */
exports.sendExamLink = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { studentEmail, sessionId } = request.data;
  if (!studentEmail || !sessionId) {
    throw new HttpsError("invalid-argument", "Missing studentEmail or sessionId");
  }

  const examLink = `https://veritas.courses/exam/${sessionId}`;
  const html = `
    <h1>Your Veritas Exam Link</h1>
    <p>Please click the link below to join your exam session:</p>
    <p><a href="${examLink}">${examLink}</a></p>
  `;

  try {
    await emailService.sendEmail({
      to: studentEmail,
      subject: "Your Veritas Exam Link",
      html: html,
    });
    return { success: true };
  } catch (error) {
    logger.error("Failed to send exam link", error);
    throw new HttpsError("internal", "Failed to send email.");
  }
});

/**
 * Submit Proctor Log (Student Signal)
 * Updates the student's status to 'LOCKED' on violation.
 */
exports.submitProctorLog = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId, violationType } = request.data;
  if (!sessionId || !violationType) {
    throw new HttpsError("invalid-argument", "Missing sessionId or violationType");
  }

  const db = admin.firestore();
  const studentId = request.auth.uid;
  const studentRef = db.collection("sessions").doc(sessionId).collection("students").doc(studentId);

  await studentRef.update({
    status: "LOCKED",
    lastViolation: violationType,
    lastViolationAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

/**
 * ROSTER MANAGEMENT (Firestore Based)
 */



/**
 * MISSION CONTROL DASHBOARD LOGIC
 */

/**
 * Update Session State (Teacher Action - Live Poll Mode)
 * Controls the flow of a synchronous poll (e.g. Next Question, Reveal).
 */
exports.updateSessionState = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId, newState } = request.data;
  if (!sessionId || !newState) {
    throw new HttpsError("invalid-argument", "Missing sessionId or newState");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Session not found");
  }

  // Verify ownership
  if (sessionSnap.data().teacherId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "You can only update your own sessions.");
  }

  // Update state (e.g., status, currentQuestionIndex)
  await sessionRef.update({
    ...newState,
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

/**
 * Unlock Student (Teacher Action - Secure Assessment Mode)
 * Resets a student's status to 'ACTIVE' after a lock triggering event.
 */
exports.unlockStudent = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId, studentId } = request.data;
  if (!sessionId || !studentId) {
    throw new HttpsError("invalid-argument", "Missing sessionId or studentId");
  }

  const db = admin.firestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();

  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Session not found");
  }

  if (sessionSnap.data().teacherId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "You can only manage your own sessions.");
  }

  const studentRef = sessionRef.collection("students").doc(studentId);

  await studentRef.update({
    status: "ACTIVE",
    unlockCount: admin.firestore.FieldValue.increment(1),
    unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
    unlockedBy: request.auth.uid
  });

  return { success: true };
});

/**
 * ANALYTICS & GRADING ENGINE
 */

/**
 * Submit Response (Student Action)
 * Records a student's answer and metacognition confidence.
 * Triggers grading logic via Firestore triggers.
 */
exports.submitResponse = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId, questionId, answer, confidence } = request.data;
  if (!sessionId || !questionId || answer === undefined) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  const db = admin.firestore();
  const responseData = {
    studentId: request.auth.uid,
    questionId,
    answer,
    confidence: confidence || null,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    isGraded: false // Pending grading trigger
  };

  // Add to responses sub-collection
  await db.collection("sessions").doc(sessionId).collection("responses").add(responseData);

  return { success: true };
});

/**
 * Grade Response (Firestore Trigger)
 * Listens for new responses, fetches the correct answer, scores it, and updates the document.
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

exports.gradeResponse = onDocumentCreated("sessions/{sessionId}/responses/{responseId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    return;
  }

  const response = snapshot.data();
  // Extract sessionId from the document path, not from response data
  const sessionId = event.params.sessionId;
  const { questionId, answer } = response;

  if (response.isGraded) return; // Already graded

  const db = admin.firestore();

  // 1. Get Exam ID from Session
  const sessionSnap = await db.collection("sessions").doc(sessionId).get();
  if (!sessionSnap.exists) return;
  const examId = sessionSnap.data().examId || sessionSnap.data().pollId; // flexible for legacy poll vs new exam

  if (!examId) return;

  // 2. Fetch Question Key (Source: Exams or Polls)
  // Optimizing: This read could be expensive at scale. Ideally, cache exam key in session or similar.
  // For now, consistent with requirements: fetch from source.
  // Checks both collections as we support both.
  let questionDoc = null;
  const examQRef = db.collection("exams").doc(examId).collection("questions").doc(questionId);
  const examQSnap = await examQRef.get();

  if (examQSnap.exists) {
    questionDoc = examQSnap.data();
  } else {
    // Try Polls
    const pollQRef = db.collection("polls").doc(examId).collection("questions").doc(questionId);
    const pollQSnap = await pollQRef.get();
    if (pollQSnap.exists) questionDoc = pollQSnap.data();
  }

  if (!questionDoc) {
    console.warn(`Question key not found for ${questionId}`);
    return;
  }

  // 3. Compare Answer
  let isCorrect = false;
  let score = 0;
  const correctVal = questionDoc.correctAnswer;
  const points = questionDoc.points || 1;

  // Simple equality check. Can be expanded for multi-select arrays.
  if (String(answer).trim().toLowerCase() === String(correctVal).trim().toLowerCase()) {
    isCorrect = true;
    score = points;
  }

  // 4. Update Response
  return snapshot.ref.update({
    isCorrect,
    score,
    isGraded: true,
    gradedAt: admin.firestore.FieldValue.serverTimestamp()
  });
});

/**
 * Generate Session Report (Teacher Action)
 * Aggregates all responses to calculate item analytics and metacognition stats.
 */
exports.generateSessionReport = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { sessionId } = request.data;
  const db = admin.firestore();

  // 1. Fetch all responses
  const responsesSnap = await db.collection("sessions").doc(sessionId).collection("responses").get();
  const responses = responsesSnap.docs.map(d => d.data());

  if (responses.length === 0) {
    return { success: false, message: "No responses found." };
  }

  // 2. Aggregate Data
  const questionStats = {}; // { qId: { correct: 0, total: 0 } }
  const studentScores = {}; // { studentId: totalScore }

  // Metacognition Buckets
  const metaMatrix = {
    mastery: 0,       // Confident & Correct
    misconception: 0, // Confident & Wrong
    guessing: 0,      // Unsure & Correct
    gap: 0            // Unsure & Wrong
  };

  responses.forEach(r => {
    // Item Analysis Prep
    if (!questionStats[r.questionId]) questionStats[r.questionId] = { correct: 0, total: 0 };
    questionStats[r.questionId].total++;
    if (r.isCorrect) questionStats[r.questionId].correct++;

    // Student Scores Prep (for Point Biserial later if needed)
    if (!studentScores[r.studentId]) studentScores[r.studentId] = 0;
    studentScores[r.studentId] += (r.score || 0);

    // Metacognition
    if (r.confidence !== null) {
      if (r.confidence && r.isCorrect) metaMatrix.mastery++;
      else if (r.confidence && !r.isCorrect) metaMatrix.misconception++;
      else if (!r.confidence && r.isCorrect) metaMatrix.guessing++;
      else if (!r.confidence && !r.isCorrect) metaMatrix.gap++;
    }
  });

  // 3. Calculate Item Statistics
  const itemAnalysis = Object.keys(questionStats).map(qId => {
    const stats = questionStats[qId];
    const difficulty = stats.total > 0 ? (stats.correct / stats.total) : 0;
    // Note: Point Biserial requires more complex array processing, using simplified difficulty for now.
    // analyticsEngine.calculateDiscriminationIndex could be used if we passed full arrays.

    return {
      questionId: qId,
      difficulty: parseFloat(difficulty.toFixed(2)),
      totalResponses: stats.total
    };
  });

  // 4. Save Report
  await db.collection("reports").doc(sessionId).set({
    sessionId,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    itemAnalysis,
    metacognition: metaMatrix,
    totalParticipants: Object.keys(studentScores).length
  });

  return { success: true, reportId: sessionId };
});

/**
 * POLL CREATOR BACKEND (Rebuilt)
 */

/**
 * Generate a Signed URL for Image Upload (Teacher Action)
 * Assets are stored in poll_assets/{teacherId}/{timestamp}.{extension}
 */
exports.getUploadSignedUrl = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { extension, contentType } = request.data;
  if (!extension || !contentType) {
    throw new HttpsError("invalid-argument", "Missing extension or contentType");
  }

  const bucket = admin.storage().bucket();
  const fileName = `poll_assets/${request.auth.uid}/${Date.now()}.${extension}`;
  const file = bucket.file(fileName);

  // Generate a signed URL for a direct upload (PUT)
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
  });

  return {
    success: true,
    uploadUrl: url,
    fileUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
  };
});

/**
 * Save Poll (Teacher Action)
 * Uses a Firestore Batch to write the poll metadata and all questions atomically.
 *
 * Validation Schema:
 * - Title must not be empty
 * - Must have at least 1 question
 * - Every question must have text AND a marked correct answer
 *
 * Write Strategy (Batch):
 * - Generate a new pollId
 * - Operation A: Set the polls/{pollId} document (Metadata + Settings)
 * - Operation B: Iterate through questions array, save each as unique document in polls/{pollId}/questions sub-collection
 *
 * Why Sub-collections? To ensure we can scale to 100+ questions without hitting Firestore document size limits.
 */
exports.savePoll = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const {
    pollId: providedPollId,
    title,
    classId,
    sessionType,
    settings,
    questions,
    metacognitionEnabled
  } = request.data;

  // ============================================================================
  // VALIDATION SCHEMA
  // ============================================================================

  // 1. Title must not be empty
  if (!title || title.trim() === "") {
    throw new HttpsError("invalid-argument", "Poll title is required and cannot be empty.");
  }

  // 2. Must have at least 1 question
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    throw new HttpsError("invalid-argument", "A poll must have at least one question.");
  }

  // 3. Every question must have text AND a marked correct answer
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    // Check question has text (stemHtml)
    if (!q.stemHtml || q.stemHtml.trim() === "" || q.stemHtml === "<p><br></p>") {
      throw new HttpsError(
        "invalid-argument",
        `Question ${i + 1} must have question text.`
      );
    }

    // Check correct answer is marked
    if (q.correctAnswer === null || q.correctAnswer === undefined) {
      throw new HttpsError(
        "invalid-argument",
        `Question ${i + 1} must have a correct answer marked.`
      );
    }

    // Check options exist and correct answer is valid
    if (!q.options || !Array.isArray(q.options) || q.options.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        `Question ${i + 1} must have answer options.`
      );
    }

    if (q.correctAnswer < 0 || q.correctAnswer >= q.options.length) {
      throw new HttpsError(
        "invalid-argument",
        `Question ${i + 1} has an invalid correct answer index.`
      );
    }
  }

  // Additional validation for Secure Assessments
  if (sessionType === 'SECURE_ASSESSMENT' && (!settings || !settings.timeLimitMinutes)) {
    throw new HttpsError("invalid-argument", "SECURE_ASSESSMENT requires a timeLimitMinutes setting.");
  }

  // ============================================================================
  // WRITE STRATEGY (BATCH)
  // ============================================================================

  const db = admin.firestore();
  const batch = db.batch();
  const pollId = providedPollId || db.collection("polls").doc().id;
  const pollRef = db.collection("polls").doc(pollId);

  // Operation A: Set the polls/{pollId} document (Metadata + Settings)
  const pollData = {
    pollId: pollId,
    title: title.trim(),
    classId: classId || null,
    teacherId: request.auth.uid,
    sessionType: sessionType || 'LIVE_POLL',
    settings: settings || {},
    metacognitionEnabled: !!metacognitionEnabled,
    questionCount: questions.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!providedPollId) {
    pollData.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  batch.set(pollRef, pollData, { merge: true });

  // Operation B: Iterate through questions array, save each as unique document
  // in polls/{pollId}/questions sub-collection
  // Note: Batch limit is 500 operations. If questions > 499, this will need chunking.
  // For typical use cases, we assume a reasonable number of questions (<100).
  questions.forEach((q, index) => {
    const questionId = q.id || `q_${index}`; // Use provided ID or generate one
    const questionRef = pollRef.collection("questions").doc(questionId);

    batch.set(questionRef, {
      stemHtml: q.stemHtml,
      mediaUrl: q.mediaUrl || null,
      options: q.options || [], // Array of { text, imageUrl }
      correctAnswer: q.correctAnswer,
      points: q.points || 1,
      order: index,
      metacognitionEnabled: q.metacognitionEnabled || false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();

  logger.info(`Poll saved: ${pollId} - "${title}" by ${request.auth.uid} (${questions.length} questions)`);

  return {
    success: true,
    pollId,
  };
});

/**
 * QUESTION BANK MANAGEMENT (Teacher Action)
 * Supports SAVE, DELETE, and SEARCH operations for questions.
 */
exports.manageQuestionBank = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { action, questionData, filters, limit: limitVal } = request.data;
  const db = admin.firestore();
  const bankRef = db.collection("question_bank");

  // 1. SAVE QUESTION
  if (action === 'SAVE') {
    const { id, text, options, correctAnswer, tags, difficulty } = questionData;

    if (!text || !options) {
      throw new HttpsError("invalid-argument", "Missing required question fields.");
    }

    const docId = id || bankRef.doc().id;
    const docRef = bankRef.doc(docId);

    // Verify ownership if updating
    if (id) {
      const snap = await docRef.get();
      if (snap.exists && snap.data().teacherId !== request.auth.uid) {
        throw new HttpsError("permission-denied", "You can only edit your own questions.");
      }
    }

    await docRef.set({
      teacherId: request.auth.uid,
      text,
      options, // Array of { text, imageURL }
      correctAnswer,
      tags: tags || [],
      difficulty: difficulty || 'medium',
      createdAt: id ? undefined : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, questionId: docId };
  }

  // 2. DELETE QUESTION
  if (action === 'DELETE') {
    const { id } = questionData;
    if (!id) throw new HttpsError("invalid-argument", "Missing question ID.");

    const docRef = bankRef.doc(id);
    const snap = await docRef.get();

    if (!snap.exists) return { success: true }; // Idempotent

    if (snap.data().teacherId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "You can only delete your own questions.");
    }

    await docRef.delete();
    return { success: true };
  }

  // 3. SEARCH / LIST QUESTIONS
  if (action === 'SEARCH' || action === 'GET') {
    let query = bankRef.where('teacherId', '==', request.auth.uid);

    // Apply Filters
    if (filters) {
      if (filters.difficulty) {
        query = query.where('difficulty', '==', filters.difficulty);
      }
      if (filters.tags && filters.tags.length > 0) {
        // Firestore 'array-contains-any' limitation: can only use one
        query = query.where('tags', 'array-contains-any', filters.tags);
      }
    }

    // Default Order
    query = query.orderBy('updatedAt', 'desc');

    // Limit
    const fetchLimit = limitVal && limitVal <= 50 ? limitVal : 20;
    query = query.limit(fetchLimit);

    const snapshot = await query.get();
    const questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { success: true, questions };
  }

  throw new HttpsError("invalid-argument", "Valid action required (SAVE, DELETE, SEARCH).");
});

// ============================================================================
// CLASS MANAGER FUNCTIONS (Firestore Based)
// ============================================================================

/**
 * Create a new Class
 * @typedef {Object} CreateClassRequest
 * @property {string} className - The name of the class
 *
 * @typedef {Object} CreateClassResponse
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} classId - The ID of the created class
 * @property {string} [message] - Optional error or success message
 */
exports.createClass = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { className } = request.data;

  if (!className || className.trim() === "") {
    throw new HttpsError("invalid-argument", "className is required and cannot be empty.");
  }

  const db = admin.firestore();
  const teacherId = request.auth.uid;

  // Check for duplicate class name for this teacher
  const existingClassQuery = await db.collection("classes")
    .where("teacherId", "==", teacherId)
    .where("className", "==", className.trim())
    .limit(1)
    .get();

  if (!existingClassQuery.empty) {
    throw new HttpsError(
      "already-exists",
      "A class with this name already exists for your account."
    );
  }

  // Create the class document
  const classRef = db.collection("classes").doc();
  const classData = {
    classId: classRef.id,
    className: className.trim(),
    teacherId: teacherId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await classRef.set(classData);

  logger.info(`Class created: ${classRef.id} - ${className} by ${teacherId}`);

  return {
    success: true,
    classId: classRef.id,
    message: `Class "${className}" created successfully.`,
  };
});

/**
 * Bulk Add Students to a Class
 * @typedef {Object} BulkAddStudentsRequest
 * @property {string} classId - The ID of the class
 * @property {Array<{name: string, email: string}>} students - Array of students to add
 *
 * @typedef {Object} BulkAddStudentsResponse
 * @property {boolean} success - Whether the operation succeeded
 * @property {number} addedCount - Number of students successfully added
 * @property {number} skippedCount - Number of students skipped (duplicates)
 * @property {string} [message] - Optional error or success message
 */
exports.bulkAddStudents = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { classId, students } = request.data;

  // Validation
  if (!classId || !students || !Array.isArray(students)) {
    throw new HttpsError("invalid-argument", "classId and students array are required.");
  }

  if (students.length === 0) {
    throw new HttpsError("invalid-argument", "Students array cannot be empty.");
  }

  const db = admin.firestore();
  const teacherId = request.auth.uid;

  // Verify class exists and belongs to the teacher
  const classRef = db.collection("classes").doc(classId);
  const classDoc = await classRef.get();

  if (!classDoc.exists) {
    throw new HttpsError("not-found", "Class not found.");
  }

  const classData = classDoc.data();
  if (classData.teacherId !== teacherId) {
    throw new HttpsError(
      "permission-denied",
      "You do not have permission to modify this class."
    );
  }

  // Get existing students to check for duplicates
  const studentsCollectionRef = classRef.collection("students");
  const existingStudentsSnap = await studentsCollectionRef.get();
  const existingEmails = new Set(
    existingStudentsSnap.docs.map(doc => doc.data().email.toLowerCase())
  );

  // Prepare batch write (Firestore batch limit is 500 operations)
  const batch = db.batch();
  let addedCount = 0;
  let skippedCount = 0;

  for (const student of students) {
    if (!student.name || !student.email) {
      logger.warn(`Skipping invalid student entry: ${JSON.stringify(student)}`);
      skippedCount++;
      continue;
    }

    const email = student.email.trim().toLowerCase();
    const name = student.name.trim();

    // Skip duplicates
    if (existingEmails.has(email)) {
      logger.info(`Skipping duplicate student: ${email}`);
      skippedCount++;
      continue;
    }

    // Create email hash (MD5 equivalent using crypto)
    const crypto = require("crypto");
    const emailHash = crypto.createHash("md5").update(email).digest("hex");

    // Create student document
    const studentRef = studentsCollectionRef.doc();
    const studentData = {
      studentId: studentRef.id,
      name: name,
      email: email,
      emailHash: emailHash,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    batch.set(studentRef, studentData);
    existingEmails.add(email); // Prevent duplicates within the same batch
    addedCount++;

    // Firestore batch limit check
    if (addedCount >= 500) {
      logger.warn("Batch limit reached (500 operations). Consider chunking large imports.");
      break;
    }
  }

  // Commit the batch
  if (addedCount > 0) {
    await batch.commit();
  }

  logger.info(
    `Bulk add students to class ${classId}: Added ${addedCount}, Skipped ${skippedCount}`
  );

  return {
    success: true,
    addedCount,
    skippedCount,
    message: `Successfully added ${addedCount} student(s). Skipped ${skippedCount} duplicate(s).`,
  };
});
