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
    pollId, status, questionIndex, questionText, options, correctAnswer, metadata,
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

  // 3. SECURE OPTION: Store the answer key internally (not exposed to students)
  if (correctAnswer !== undefined && questionIndex !== undefined) {
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
 * Replaces google.script.run.createNewPoll
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
 * Replaces google.script.run.updatePoll
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
 * Manage roster operations (CRUD)
 * Replaces google.script.run.saveRoster, bulkAddStudentsToRoster,
 * renameClass, deleteClassRecord
 */
exports.manageRoster = onCall({ cors: true }, async (request) => {
  const { action, className, newClassName, students } = request.data;

  if (!action || !className) {
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
      logger.info(`Roster saved: ${className} (${students.length} students)`);

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
      if (!deleteSnapshot.exists()) {
        throw new HttpsError("not-found", "Class not found");
      }

      await rosterRef.remove();
      logger.info(`Class deleted: ${className}`);

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
        })
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
      const res = await exports.manageRoster.run({
        data: { action: "GET_LINKS", className: className },
      });
      const studentLinks = res.links;

      const pollSnapshot = await db.ref(`polls/${pollId}`).once("value");
      const pollData = pollSnapshot.val() || { pollName: "Veritas Poll" };

      const emailDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      const isSecure = (pollData.sessionType || "").toUpperCase().includes("SECURE");
      const subject = isSecure
        ? `Your VERITAS Secure Assessment Link – ${emailDate}`
        : `Your VERITAS Live Poll Link – ${emailDate}`;

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
      reason: result.snapshot.exists() ? "invalid_state_or_version" : "student_not_found"
    };
  }
});

/**
 * Simulated Email Sending (Migration Stub).
 * Replace this with SendGrid/SMTP logic when ready.
 */
exports.sendEmail = onCall({ cors: true }, async (request) => {
  const { recipientEmail, subject, body, students } = request.data;

  // Batch Mode
  if (students && Array.isArray(students)) {
    logger.info(`[Email Simulation] Processing batch of ${students.length} emails`);
    let sentCount = 0;
    students.forEach((s) => {
      if (s.email) {
        logger.info(`[Email Simulation] To: ${s.email}, Subject: ${s.subject || subject}`);
        sentCount++;
      }
    });
    return { success: true, sentCount: sentCount, simulated: true };
  }

  // Single Mode
  if (!recipientEmail || !subject || !body) {
    throw new HttpsError("invalid-argument", "Missing email fields");
  }

  logger.info(`[Email Simulation] To: ${recipientEmail}, Subject: ${subject}`);
  logger.info(`[Email Simulation] Body length: ${body.length}`);

  // In a real implementation:
  // await sendGrid.send({ to: recipientEmail, subject, html: body });

  return { success: true, simulated: true };
});

