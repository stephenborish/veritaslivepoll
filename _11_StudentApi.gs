// =============================================================================
// VERITAS LIVE POLL - STUDENT API MODULE
// =============================================================================
// Purpose: Student-facing methods with token validation
// Dependencies: Config, DataAccess, Models, TokenManager, StateVersionManager
// Phase: 2D - API/Routing Layer
// =============================================================================

Veritas.StudentApi = {};

// =============================================================================
// SECURITY HELPERS
// =============================================================================

/**
 * Validate token and extract student identity
 * @param {string} token - Session token
 * @returns {Object} {email, className, ...tokenData}
 * @throws {Error} If token is invalid or expired
 */
Veritas.StudentApi.validateToken = function(token) {
  if (!token) {
    throw new Error('Token required for student access');
  }

  var tokenData = TokenManager.validateToken(token);
  if (!tokenData) {
    throw new Error('Invalid or expired token');
  }

  return tokenData;
};

/**
 * Get student email from token (fallback to current user)
 * @param {string} token - Session token (optional)
 * @returns {string} Student email
 */
Veritas.StudentApi.getStudentEmail = function(token) {
  if (token) {
    return TokenManager.getStudentEmail(token);
  }
  return TokenManager.getCurrentStudentEmail();
};

// =============================================================================
// LIVE POLL STUDENT OPERATIONS
// =============================================================================

/**
 * Get student poll status (live poll or secure assessment)
 * Routes to appropriate session type based on metadata
 * @param {string} token - Session token
 * @param {Object} context - Client context {lastStateVersion, lastSuccessAt, failureCount}
 * @returns {Object} Poll status with question or waiting state
 */
Veritas.StudentApi.getStudentPollStatus = function(token, context) {
  return withErrorHandling(function() {
    var statusValues = DataAccess.liveStatus.get();
    var pollId = statusValues[0];
    var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;
    var questionIndex = statusValues[1];
    var pollStatus = statusValues[2];
    var sessionPhaseFromMetadata = metadata && metadata.sessionPhase ? metadata.sessionPhase : null;

    // ROUTING: Check if this is an Individual Timed Session
    if (isSecureSessionPhase_(sessionPhaseFromMetadata)) {
      Logger.log('Routing student to Secure Assessment session.');
      return Veritas.StudentApi.getIndividualTimedSessionState(token);
    }

    var endedAtMetadata = metadata && Object.prototype.hasOwnProperty.call(metadata, 'endedAt') ? metadata.endedAt : null;
    var sessionEnded = sessionPhaseFromMetadata === 'ENDED' || (!!endedAtMetadata && endedAtMetadata !== null && endedAtMetadata !== '');

    var pickMessage = function(choices, fallback) {
      if (Array.isArray(choices) && choices.length > 0) {
        var idx = Math.floor(Math.random() * choices.length);
        return choices[idx];
      }
      return fallback || '';
    };

    var studentEmail = Veritas.StudentApi.getStudentEmail(token);
    var heartbeatInfo = StateVersionManager.noteHeartbeat(studentEmail);
    var stateSnapshot = StateVersionManager.get();
    var now = new Date();
    var nowIso = now.toISOString();
    var lastStateVersion = (context && typeof context.lastStateVersion === 'number') ? context.lastStateVersion : null;
    var versionGap = (typeof lastStateVersion === 'number') ? (stateSnapshot.version - lastStateVersion) : 0;
    var sinceLastSuccess = (context && typeof context.lastSuccessAt === 'number') ? (now.getTime() - context.lastSuccessAt) : null;
    var clientFailures = (context && typeof context.failureCount === 'number') ? context.failureCount : 0;
    var needsResync = versionGap > 3;

    var connectionHealth = heartbeatInfo.health || 'HEALTHY';
    if (needsResync && connectionHealth === 'HEALTHY') {
      connectionHealth = 'RECOVERING';
    }
    if (sinceLastSuccess && sinceLastSuccess > StateVersionManager.OUTAGE_RECOVERY_THRESHOLD_MS && connectionHealth === 'HEALTHY') {
      connectionHealth = 'RECOVERING';
    }

    var baseInterval = 2500;
    var advisedPollIntervalMs = baseInterval + Math.min(1000, clientFailures * 350);
    if (connectionHealth === 'RECOVERING') {
      advisedPollIntervalMs = Math.max(advisedPollIntervalMs, 2800);
    } else if (connectionHealth === 'RECOVERED_AFTER_OUTAGE') {
      advisedPollIntervalMs = Math.max(advisedPollIntervalMs, 2600);
    }
    advisedPollIntervalMs = Math.min(5000, Math.max(2000, advisedPollIntervalMs));

    var fallbackPhase = function() {
      if (sessionEnded) {
        return 'ENDED';
      }
      if (sessionPhaseFromMetadata) {
        return sessionPhaseFromMetadata;
      }
      if (pollStatus === 'PAUSED') {
        return 'PAUSED';
      }
      if (pollStatus === 'OPEN') {
        return questionIndex >= 0 ? 'LIVE' : 'PRE_LIVE';
      }
      if (pollStatus === 'CLOSED') {
        return questionIndex >= 0 ? 'ENDED' : 'PRE_LIVE';
      }
      return questionIndex >= 0 ? 'LIVE' : 'PRE_LIVE';
    };

    var envelope = function(payload) {
      var response = {
        pollId: payload.pollId || stateSnapshot.pollId || pollId,
        questionIndex: payload.questionIndex !== undefined ? payload.questionIndex : (typeof stateSnapshot.questionIndex === 'number' ? stateSnapshot.questionIndex : undefined),
        status: payload.status || fallbackPhase(),
        message: payload.message,
        hasSubmitted: payload.hasSubmitted,
        stateVersion: stateSnapshot.version,
        stateUpdatedAt: stateSnapshot.updatedAt,
        authoritativeStatus: stateSnapshot.status,
        authoritativeReason: stateSnapshot.reason,
        serverTime: nowIso,
        staleAfterMs: 12000,
        teacherStateFingerprint: stateSnapshot.version + ':' + (stateSnapshot.updatedAt || ''),
        connectionHealth: connectionHealth,
        connectionLagMs: heartbeatInfo.deltaMs || 0,
        lastHeartbeatAt: heartbeatInfo.previousSeen || null,
        advisedPollIntervalMs: advisedPollIntervalMs
      };

      // Copy all other payload properties
      for (var key in payload) {
        if (payload.hasOwnProperty(key) && !response.hasOwnProperty(key)) {
          response[key] = payload[key];
        }
      }

      if (needsResync) {
        response.resyncSuggested = true;
        response.resyncHint = 'STATE_VERSION_GAP';
      }

      // Normalize status
      if (response.status === 'OPEN') {
        response.status = 'LIVE';
      } else if (response.status === 'WAITING') {
        response.status = fallbackPhase();
      } else if (response.status === 'CLOSED') {
        response.status = sessionEnded ? 'ENDED' : 'PRE_LIVE';
      }

      return response;
    };

    var baseWaiting = function(status, message, hasSubmitted) {
      return envelope({ status: status, message: message, hasSubmitted: hasSubmitted || false, pollId: pollId });
    };

    if (sessionEnded) {
      return envelope({
        status: 'ENDED',
        hasSubmitted: false,
        message: pickMessage([
          "That's a wrap! You just finished the poll — nicely done.",
          "Poll complete. You've officially survived science."
        ], "That's a wrap! You just finished the poll — nicely done."),
        pollId: pollId || ''
      });
    }

    if (!pollId || questionIndex < 0) {
      return baseWaiting('PRE_LIVE', pickMessage([
        "Hang tight — your teacher's loading the next challenge.",
        "Get your brain in gear. The poll's about to begin!"
      ], "Hang tight — your teacher's loading the next challenge."), false);
    }

    // Don't show PAUSED state if we're in results phase
    if ((pollStatus === "PAUSED" || sessionPhaseFromMetadata === 'PAUSED') &&
        sessionPhaseFromMetadata !== 'RESULTS_HOLD' &&
        sessionPhaseFromMetadata !== 'RESULTS_REVEALED') {
      var reason = metadata.reason || '';
      var message;
      if (reason === 'TIMER_EXPIRED') {
        message = pickMessage([
          "Time's up! Hope you picked wisely.",
          "That's the bell — time to see how you did."
        ], "Time's up! Hope you picked wisely.");
      } else {
        message = pickMessage([
          "Intermission! Your teacher's cooking up the next one.",
          "Breathe. Blink. Hydrate. A new question is on the way."
        ], "Intermission! Your teacher's cooking up the next one.");
      }
      return envelope({ status: 'PAUSED', message: message, hasSubmitted: false, pollId: pollId });
    }

    if (!studentEmail) {
      return envelope({
        status: "ERROR",
        message: "Authentication error. Please use your personalized poll link.",
        hasSubmitted: false
      });
    }

    var poll = DataAccess.polls.getById(pollId);

    if (!poll) {
      return envelope({
        status: 'ERROR',
        message: "Poll configuration error.",
        hasSubmitted: false
      });
    }

    if (!DataAccess.roster.isEnrolled(poll.className, studentEmail)) {
      return envelope({
        status: "NOT_ENROLLED",
        message: "You are not enrolled in this class.",
        hasSubmitted: false
      });
    }

    // Check authoritative proctor state
    var proctorState = ProctorAccess.getState(pollId, studentEmail, metadata && metadata.sessionId ? metadata.sessionId : null);
    var hasSubmitted = DataAccess.responses.hasAnswered(pollId, questionIndex, studentEmail);

    if (proctorState.status === 'BLOCKED') {
      return envelope({
        status: 'BLOCKED',
        message: "Your teacher has temporarily paused your ability to respond to this question.",
        hasSubmitted: hasSubmitted,
        pollId: pollId,
        blockedBy: proctorState.blockedBy || '',
        blockedAt: proctorState.blockedAt || ''
      });
    }

    if (proctorState.status === 'LOCKED' || proctorState.status === 'AWAITING_FULLSCREEN') {
      return envelope({
        status: proctorState.status,
        message: proctorState.status === 'LOCKED'
          ? pickMessage([
              "Oops — you left fullscreen. Your poll's been paused until your teacher lets you back in.",
              "You escaped fullscreen… sneaky! Hang tight until your teacher brings you back."
            ], "Oops — you left fullscreen. Your poll's been paused until your teacher lets you back in.")
          : pickMessage([
              "You're cleared for re-entry. Go fullscreen to get back in the game.",
              "All systems go. Click below to resume fullscreen and rejoin the action."
            ], "You're cleared for re-entry. Go fullscreen to get back in the game."),
        hasSubmitted: hasSubmitted,
        pollId: pollId
      });
    }

    var question = poll.questions[questionIndex];
    var normalizedQuestion = Veritas.Models.Poll.normalizeQuestionObject(question, poll.updatedAt);

    Logger.log('=== GET STUDENT POLL STATUS ===');
    Logger.log('Question metacognitionEnabled (before normalization): ' + question.metacognitionEnabled);
    Logger.log('Normalized question metacognitionEnabled: ' + normalizedQuestion.metacognitionEnabled);

    var isCollecting = (metadata && typeof metadata.isCollecting === 'boolean')
      ? metadata.isCollecting
      : (pollStatus === 'OPEN');
    var resultsVisibility = (metadata && metadata.resultsVisibility) ? metadata.resultsVisibility : 'HIDDEN';

    if (isCollecting) {
      if (hasSubmitted) {
        return baseWaiting('LIVE', pickMessage([
          "Answer received — nice work.",
          "Got it! Your response is locked in."
        ], "Answer received — nice work."), true);
      }

      Logger.log('Sending to student - metacognitionEnabled: ' + normalizedQuestion.metacognitionEnabled);

      var livePayload = {
        status: 'LIVE',
        pollId: pollId,
        questionIndex: questionIndex,
        totalQuestions: poll.questions.length,
        hasSubmitted: false,
        metadata: metadata
      };

      // Copy normalized question properties
      for (var prop in normalizedQuestion) {
        if (normalizedQuestion.hasOwnProperty(prop)) {
          livePayload[prop] = normalizedQuestion[prop];
        }
      }

      return envelope(livePayload);
    }

    var submissionsMap = buildSubmittedAnswersMap_(pollId, questionIndex);
    var basePayload = {
      status: resultsVisibility === 'REVEALED' ? 'RESULTS_REVEALED' : 'RESULTS_HOLD',
      pollId: pollId,
      questionIndex: questionIndex,
      totalQuestions: poll.questions.length,
      hasSubmitted: hasSubmitted,
      metadata: metadata,
      resultsVisibility: resultsVisibility,
      isCollecting: false
    };

    // Copy normalized question properties
    for (var prop in normalizedQuestion) {
      if (normalizedQuestion.hasOwnProperty(prop)) {
        basePayload[prop] = normalizedQuestion[prop];
      }
    }

    if (resultsVisibility === 'REVEALED') {
      var answerCounts = computeAnswerCounts_(normalizedQuestion, submissionsMap);
      var percentageData = computeAnswerPercentages_(answerCounts);
      var studentSubmission = submissionsMap.get(studentEmail) || null;

      basePayload.correctAnswer = question.correctAnswer || null;
      basePayload.results = answerCounts;
      basePayload.resultPercentages = percentageData.percentages;
      basePayload.totalResponses = percentageData.totalResponses;
      basePayload.studentAnswer = studentSubmission ? (studentSubmission.answer || null) : null;
      basePayload.studentIsCorrect = studentSubmission ? !!studentSubmission.isCorrect : null;
    } else {
      basePayload.totalResponses = submissionsMap.size;
      basePayload.correctAnswer = null;
    }

    return envelope(basePayload);
  })();
};

/**
 * Submit live poll answer
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @param {string} answerText - Answer text
 * @param {string} token - Session token
 * @param {string} confidenceLevel - Confidence level (optional)
 * @returns {Object} {success, error}
 */
Veritas.StudentApi.submitLivePollAnswer = function(pollId, questionIndex, answerText, token, confidenceLevel) {
  return withErrorHandling(function() {
    var studentEmail = Veritas.StudentApi.getStudentEmail(token);

    if (!studentEmail) {
      return {
        success: false,
        error: 'Authentication error. Please use your personalized poll link.'
      };
    }

    try {
      RateLimiter.check('submit_' + studentEmail, 5, 60);
    } catch (e) {
      Logger.log('Rate limit hit: ' + studentEmail);
      return { success: false, error: e.message };
    }

    if (typeof answerText !== 'string' || answerText.length > 500) {
      return { success: false, error: 'Invalid answer format' };
    }

    var statusValues = DataAccess.liveStatus.get();
    var activePollId = statusValues[0];
    var activeQIndex = statusValues[1];
    var activeStatus = statusValues[2];

    if (activePollId !== pollId || activeQIndex !== questionIndex || activeStatus !== "OPEN") {
      Logger.log('Rejected late submission from ' + studentEmail);
      return {
        success: false,
        error: "Time's up! The poll for this question is closed."
      };
    }

    if (DataAccess.responses.hasAnswered(pollId, questionIndex, studentEmail)) {
      return {
        success: false,
        error: 'You have already answered this question.'
      };
    }

    var poll = DataAccess.polls.getById(pollId);
    var question = poll.questions[questionIndex];

    var isCorrect = (question.correctAnswer === answerText);
    var timestamp = new Date().getTime();
    var responseId = "R-" + Utilities.getUuid();

    // Validate confidence level if provided
    var validConfidenceLevels = ['guessing', 'somewhat-sure', 'very-sure', 'certain'];
    var finalConfidence = (confidenceLevel && validConfidenceLevels.indexOf(confidenceLevel) !== -1)
      ? confidenceLevel
      : null;

    DataAccess.responses.add([
      responseId,
      timestamp,
      pollId,
      questionIndex,
      studentEmail,
      answerText,
      isCorrect,
      finalConfidence
    ]);

    Logger.log('Answer submitted', {
      studentEmail: studentEmail,
      pollId: pollId,
      questionIndex: questionIndex,
      isCorrect: isCorrect,
      confidenceLevel: finalConfidence
    });

    return { success: true };
  })();
};

// =============================================================================
// SECURE ASSESSMENT STUDENT OPERATIONS
// =============================================================================

/**
 * Get individual timed session state for student
 * @param {string} token - Session token
 * @returns {Object} Session state
 */
Veritas.StudentApi.getIndividualTimedSessionState = function(token) {
  return withErrorHandling(function() {
    var tokenData = Veritas.StudentApi.validateToken(token);
    var studentEmail = tokenData.email;

    // Delegate to Models layer
    return Veritas.Models.Session.getIndividualTimedSessionState(null, studentEmail);
  })();
};

/**
 * Begin individual timed attempt (student first access)
 * @param {string} pollId - Poll ID
 * @param {string} token - Session token
 * @returns {Object} Initial state
 */
Veritas.StudentApi.beginIndividualTimedAttempt = function(pollId, token) {
  return withErrorHandling(function() {
    var tokenData = Veritas.StudentApi.validateToken(token);
    var studentEmail = tokenData.email;

    // Delegate to Models layer
    return Veritas.Models.Session.beginIndividualTimedAttempt(pollId, studentEmail);
  })();
};

/**
 * Get current question for student in individual timed session
 * @param {string} pollId - Poll ID
 * @param {string} token - Session token
 * @returns {Object} Question data
 */
Veritas.StudentApi.getIndividualTimedQuestion = function(pollId, token) {
  return withErrorHandling(function() {
    var tokenData = Veritas.StudentApi.validateToken(token);
    var studentEmail = tokenData.email;

    // Delegate to Models layer
    return Veritas.Models.Session.getIndividualTimedQuestion(pollId, studentEmail);
  })();
};

/**
 * Submit answer for individual timed session
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @param {string} answerText - Answer text
 * @param {string} token - Session token
 * @param {string} confidenceLevel - Confidence level (optional)
 * @returns {Object} Result
 */
Veritas.StudentApi.submitIndividualTimedAnswer = function(pollId, questionIndex, answerText, token, confidenceLevel) {
  return withErrorHandling(function() {
    var tokenData = Veritas.StudentApi.validateToken(token);
    var studentEmail = tokenData.email;

    // Delegate to Models layer
    return Veritas.Models.Session.submitIndividualTimedAnswer(
      pollId,
      studentEmail,
      questionIndex,
      answerText,
      confidenceLevel
    );
  })();
};

/**
 * Report student violation (fullscreen exit, etc.)
 * @param {string} pollId - Poll ID
 * @param {string} token - Session token
 * @param {string} violationType - Violation type
 * @returns {Object} Result
 */
Veritas.StudentApi.reportStudentViolation = function(pollId, token, violationType) {
  return withErrorHandling(function() {
    var tokenData = Veritas.StudentApi.validateToken(token);
    var studentEmail = tokenData.email;

    // Delegate to Models layer
    return Veritas.Models.Session.reportStudentViolation(pollId, studentEmail, violationType);
  })();
};

/**
 * Student confirms fullscreen mode
 * @param {string} pollId - Poll ID
 * @param {string} token - Session token
 * @returns {Object} Result
 */
Veritas.StudentApi.studentConfirmFullscreen = function(pollId, token) {
  return withErrorHandling(function() {
    var tokenData = Veritas.StudentApi.validateToken(token);
    var studentEmail = tokenData.email;

    // Delegate to Models layer
    return Veritas.Models.Session.studentConfirmFullscreen(pollId, studentEmail);
  })();
};

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================

/**
 * Legacy wrapper for getStudentPollStatus
 */
function getStudentPollStatus(token, context) {
  return Veritas.StudentApi.getStudentPollStatus(token, context);
}

/**
 * Legacy wrapper for submitLivePollAnswer
 */
function submitLivePollAnswer(pollId, questionIndex, answerText, token, confidenceLevel) {
  return Veritas.StudentApi.submitLivePollAnswer(pollId, questionIndex, answerText, token, confidenceLevel);
}
