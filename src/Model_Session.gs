// =============================================================================
// VERITAS LIVE POLL - MODELS: SESSION MODULE
// =============================================================================
// Purpose: Live session control, secure assessments, proctoring, timing
// Dependencies: Config, Logging, DataAccess, Utils, Models.Poll
// Phase: 2C Complete - All session functions extracted from Code.gs
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.Models = Veritas.Models || {};
Veritas.Models.Session = Veritas.Models.Session || {};

// Defensive DataAccess binding to avoid load-order issues in Apps Script
// Falls back to Veritas.Data if the legacy DataAccess global is not yet defined.
if (typeof DataAccess === 'undefined') {
  var DataAccess = Veritas.Data;
}
if (!DataAccess.individualSessionState && Veritas.Data && Veritas.Data.individualSessionState) {
  DataAccess.individualSessionState = Veritas.Data.individualSessionState;
}
var IndividualSessionState = (DataAccess && DataAccess.individualSessionState)
  ? DataAccess.individualSessionState
  : (Veritas.Data && Veritas.Data.individualSessionState ? Veritas.Data.individualSessionState : null);

/**
 * Helper: Get individualSessionState with lazy evaluation to avoid load-order issues
 */
function getIndividualSessionState_() {
  if (DataAccess && DataAccess.individualSessionState) {
    return DataAccess.individualSessionState;
  }
  if (Veritas.Data && Veritas.Data.individualSessionState) {
    return Veritas.Data.individualSessionState;
  }
  return null;
}

// =============================================================================
// LIVE POLL SESSION CONTROL
// =============================================================================

/**
 * Start a live poll session
 */
Veritas.Models.Session.startPoll = function(pollId) {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      if (!pollId) throw new Error('Poll ID is required');

      // CACHE FIX: Invalidate polls cache before fetching to avoid stale data
      // This ensures we get the latest poll data, especially important if poll was just created
      CacheManager.invalidate('ALL_POLLS_DATA');

      const poll = DataAccess.polls.getById(pollId);
      if (!poll) {
        Logger.log('Poll not found in startPoll', { pollId: pollId });
        throw new Error('Poll not found: ' + pollId + '. Try refreshing the page or checking if the poll still exists.');
      }

      const nowIso = new Date().toISOString();
      const sessionId = pollId + '::' + Utilities.getUuid();
      DataAccess.liveStatus.set(pollId, 0, "OPEN", {
        reason: 'RUNNING',
        sessionPhase: 'LIVE',
        startedAt: nowIso,
        endedAt: null,
        timer: null,
        isCollecting: true,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: null,
        revealedAt: null,
        sessionId: sessionId
      });

      Veritas.Models.Session.ProctorAccess.resetForNewSession(pollId, sessionId);

      Logger.log('Poll started', { pollId: pollId, pollName: poll.pollName });

      return getLivePollData(pollId, 0);
    });
  })();
};

/**
 * Advance to next question
 */
Veritas.Models.Session.nextQuestion = function() {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      const currentStatus = DataAccess.liveStatus.get();
      const pollId = currentStatus[0];

      if (!pollId) return Veritas.Models.Session.stopPoll();

      let newIndex = currentStatus[1] + 1;
      const poll = DataAccess.polls.getById(pollId);

      if (!poll || newIndex >= poll.questions.length) {
        Logger.log('Poll completed', { pollId: pollId });
        return Veritas.Models.Session.stopPoll();
      }

      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set(pollId, newIndex, "OPEN", {
        ...previousMetadata,
        reason: 'RUNNING',
        advancedAt: nowIso,
        timer: null,
        startedAt: previousMetadata.startedAt || nowIso,
        endedAt: null,
        sessionPhase: 'LIVE',
        isCollecting: true,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: null,
        revealedAt: null
      });

      Logger.log('Next question', { pollId: pollId, questionIndex: newIndex });

      return getLivePollData(pollId, newIndex);
    });
  })();
};

/**
 * Go back to previous question
 */
Veritas.Models.Session.previousQuestion = function() {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      const currentStatus = DataAccess.liveStatus.get();
      const pollId = currentStatus[0];

      if (!pollId) {
        throw new Error('No active poll');
      }

      let newIndex = currentStatus[1] - 1;
      const poll = DataAccess.polls.getById(pollId);

      if (!poll || newIndex < 0) {
        throw new Error('Already at first question');
      }

      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set(pollId, newIndex, "OPEN", {
        ...previousMetadata,
        reason: 'RUNNING',
        movedBackAt: nowIso,
        timer: null,
        startedAt: previousMetadata.startedAt || nowIso,
        endedAt: null,
        sessionPhase: 'LIVE',
        isCollecting: true,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: null,
        revealedAt: null
      });

      Logger.log('Previous question', { pollId: pollId, questionIndex: newIndex });

      return getLivePollData(pollId, newIndex);
    });
  })();
};

/**
 * Stop poll (pause responses, hide results)
 */
Veritas.Models.Session.stopPoll = function() {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      const currentStatus = DataAccess.liveStatus.get();
      const pollId = currentStatus[0];
      const questionIndex = currentStatus[1];

      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
        ...previousMetadata,
        reason: 'RESPONSES_CLOSED',
        pausedAt: nowIso,
        startedAt: previousMetadata.startedAt || nowIso,
        endedAt: null,
        sessionPhase: 'RESULTS_HOLD',
        isCollecting: false,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: nowIso,
        revealedAt: null
      });

      Logger.log('Responses closed for question', { pollId: pollId, questionIndex: questionIndex });

      return getLivePollData(pollId, questionIndex);
    });
  })();
};

/**
 * Resume poll after stopping
 */
Veritas.Models.Session.resumePoll = function() {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      const currentStatus = DataAccess.liveStatus.get();
      const pollId = currentStatus[0];
      const questionIndex = currentStatus[1];

      if (!pollId || questionIndex < 0) {
        throw new Error('No poll to resume');
      }

      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set(pollId, questionIndex, "OPEN", {
        ...previousMetadata,
        reason: 'RUNNING',
        resumedAt: nowIso,
        startedAt: previousMetadata.startedAt || nowIso,
        endedAt: null,
        sessionPhase: 'LIVE',
        isCollecting: true,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: null,
        revealedAt: null
      });

      Logger.log('Poll resumed', { pollId: pollId, questionIndex: questionIndex });

      return getLivePollData(pollId, questionIndex);
    });
  })();
};

/**
 * Close poll completely
 */
Veritas.Models.Session.closePoll = function() {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      const currentStatus = DataAccess.liveStatus.get();
      const pollId = currentStatus[0];

      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set("", -1, "CLOSED", {
        ...previousMetadata,
        reason: 'COMPLETED',
        sessionPhase: 'ENDED',
        endedAt: nowIso,
        startedAt: previousMetadata.startedAt || null,
        isCollecting: false,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: previousMetadata.responsesClosedAt || nowIso,
        revealedAt: null
      });

      Logger.log('Poll closed completely', { pollId: pollId });

      return { status: "ENDED" };
    });
  })();
};

/**
 * Pause poll when timer expires
 */
Veritas.Models.Session.pausePollForTimerExpiry = function() {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      const currentStatus = DataAccess.liveStatus.get();
      const pollId = currentStatus[0];
      const questionIndex = currentStatus[1];

      if (!pollId || questionIndex < 0) {
        throw new Error('No active question to pause');
      }

      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
        ...previousMetadata,
        reason: 'TIMER_EXPIRED',
        pausedAt: nowIso,
        startedAt: previousMetadata.startedAt || nowIso,
        endedAt: null,
        sessionPhase: 'RESULTS_HOLD',
        isCollecting: false,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: nowIso,
        revealedAt: null
      });

      Logger.log('Responses closed due to timer expiry', { pollId: pollId, questionIndex: questionIndex });

      return getLivePollData(pollId, questionIndex);
    });
  })();
};

/**
 * Reveal results to students
 */
Veritas.Models.Session.revealResultsToStudents = function() {
  return withErrorHandling(function() {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    if (!pollId || questionIndex < 0) {
      throw new Error('No closed question to reveal.');
    }

    const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
    if (previousMetadata && typeof previousMetadata.isCollecting === 'boolean' && previousMetadata.isCollecting) {
      throw new Error('Responses are still collecting. Close the question before revealing results.');
    }
    const nowIso = new Date().toISOString();

    DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
      ...previousMetadata,
      reason: 'RESULTS_REVEALED',
      pausedAt: previousMetadata.pausedAt || nowIso,
      startedAt: previousMetadata.startedAt || nowIso,
      endedAt: null,
      sessionPhase: 'RESULTS_REVEALED',
      isCollecting: false,
      resultsVisibility: 'REVEALED',
      responsesClosedAt: previousMetadata.responsesClosedAt || nowIso,
      revealedAt: nowIso
    });

    Logger.log('Results revealed to students', { pollId: pollId, questionIndex: questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
};

/**
 * Hide results from students
 */
Veritas.Models.Session.hideResultsFromStudents = function() {
  return withErrorHandling(function() {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    if (!pollId || questionIndex < 0) {
      throw new Error('No active question to hide results for.');
    }

    const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
    if (previousMetadata && typeof previousMetadata.isCollecting === 'boolean' && previousMetadata.isCollecting) {
      throw new Error('Results can only be hidden after responses close.');
    }
    const nowIso = new Date().toISOString();

    DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
      ...previousMetadata,
      reason: 'RESULTS_HIDDEN',
      pausedAt: previousMetadata.pausedAt || nowIso,
      startedAt: previousMetadata.startedAt || nowIso,
      endedAt: null,
      sessionPhase: 'RESULTS_HOLD',
      isCollecting: false,
      resultsVisibility: 'HIDDEN',
      responsesClosedAt: previousMetadata.responsesClosedAt || nowIso,
      revealedAt: null
    });

    Logger.log('Results hidden from students', { pollId: pollId, questionIndex: questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
};

/**
 * End question and reveal results immediately
 */
Veritas.Models.Session.endQuestionAndRevealResults = function() {
  return withErrorHandling(function() {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    if (!pollId || questionIndex < 0) {
      throw new Error('No active question to end.');
    }

    const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
    const nowIso = new Date().toISOString();

    DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
      ...previousMetadata,
      reason: 'RESULTS_REVEALED',
      pausedAt: nowIso,
      startedAt: previousMetadata.startedAt || nowIso,
      endedAt: null,
      sessionPhase: 'RESULTS_REVEALED',
      isCollecting: false,
      resultsVisibility: 'REVEALED',
      responsesClosedAt: nowIso,
      revealedAt: nowIso
    });

    Logger.log('Question ended and results revealed', { pollId: pollId, questionIndex: questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
};

/**
 * Reset live question (optionally clear responses)
 */
Veritas.Models.Session.resetLiveQuestion = function(pollId, questionIndex, clearResponses) {
  return withErrorHandling(function() {
    return Veritas.Utils.withLock(function() {
      if (!pollId) {
        throw new Error('Poll ID is required');
      }

      if (typeof questionIndex !== 'number' || questionIndex < 0) {
        throw new Error('Valid question index is required');
      }

      const poll = DataAccess.polls.getById(pollId);
      if (!poll) {
        throw new Error('Poll not found');
      }

      if (!poll.questions[questionIndex]) {
        throw new Error('Question not found');
      }

      if (clearResponses) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const responsesSheet = ss.getSheetByName('Responses');

        // NULL CHECK: Responses sheet might not exist yet
        if (responsesSheet) {
          const values = getDataRangeValues_(responsesSheet);
          const keepRows = values.filter(function(row) { return !(row[2] === pollId && row[3] === questionIndex); });

          if (keepRows.length < values.length) {
            if (values.length > 0) {
              responsesSheet.getRange(2, 1, values.length, responsesSheet.getLastColumn()).clearContent();
            }
            if (keepRows.length > 0) {
              responsesSheet.getRange(2, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
            }
          }
        }
      }

      const currentStatus = DataAccess.liveStatus.get();
      const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
      const nowIso = new Date().toISOString();
      DataAccess.liveStatus.set(pollId, questionIndex, "OPEN", {
        ...previousMetadata,
        reason: 'RUNNING',
        resetAt: nowIso,
        clearedResponses: !!clearResponses,
        startedAt: previousMetadata.startedAt || nowIso,
        endedAt: null,
        sessionPhase: 'LIVE',
        isCollecting: true,
        resultsVisibility: 'HIDDEN',
        responsesClosedAt: null,
        revealedAt: null
      });

      Logger.log('Question reset', {
        pollId: pollId,
        questionIndex: questionIndex,
        cleared: !!clearResponses
      });

      return getLivePollData(pollId, questionIndex);
    });
  })();
};

// =============================================================================
// SECURE ASSESSMENT SESSION CONTROL
// =============================================================================

/**
 * Start secure assessment session
 */
Veritas.Models.Session.startIndividualTimedSession = function(pollId) {
  return withErrorHandling(function() {
    if (!pollId) throw new Error('Poll ID is required');

    // CACHE FIX: Invalidate polls cache before fetching to avoid stale data
    CacheManager.invalidate('ALL_POLLS_DATA');

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      Logger.log('Poll not found in startIndividualTimedSession', { pollId: pollId });
      throw new Error('Poll not found: ' + pollId + '. Try refreshing the page.');
    }

    if (!Veritas.Models.Poll.isSecureSessionType(poll.sessionType)) {
      throw new Error('This poll is not configured as a Secure Assessment');
    }

    if (!poll.timeLimitMinutes || poll.timeLimitMinutes <= 0) {
      throw new Error('Time limit must be set for Secure Assessments');
    }

    const nowIso = new Date().toISOString();
    const sessionId = pollId + '::' + Utilities.getUuid();

    DataAccess.liveStatus.set(pollId, -1, "OPEN", {
      reason: 'SECURE_ASSESSMENT_RUNNING',
      sessionPhase: Veritas.Config.SECURE_SESSION_PHASE,
      startedAt: nowIso,
      endedAt: null,
      timeLimitMinutes: poll.timeLimitMinutes,
      secureDefaultTimeAdjustmentMinutes: 0,
      isCollecting: true,
      resultsVisibility: 'HIDDEN',
      sessionId: sessionId
    });

    Veritas.Models.Session.ProctorAccess.resetForNewSession(pollId, sessionId);

    Logger.log('Secure assessment session started', {
      pollId: pollId,
      pollName: poll.pollName,
      timeLimitMinutes: poll.timeLimitMinutes
    });

    return {
      success: true,
      pollId: pollId,
      sessionId: sessionId,
      pollName: poll.pollName,
      className: poll.className,
      timeLimitMinutes: poll.timeLimitMinutes,
      questionCount: poll.questions.length
    };
  })();
};

/**
 * End secure assessment session (lock all students)
 */
Veritas.Models.Session.endIndividualTimedSession = function(pollId) {
  return withErrorHandling(function() {
    if (Veritas.Dev.getCurrentUser() !== Veritas.Config.TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    const liveStatus = DataAccess.liveStatus.get();
    const activePollId = liveStatus[0];

    if (activePollId !== pollId) {
      throw new Error('This poll is not the active session.');
    }

    const previousMetadata = (liveStatus && liveStatus.metadata) ? liveStatus.metadata : {};
    const sessionId = previousMetadata.sessionId || '';

    // Lock all unlocked students
    if (sessionId) {
      const allStudents = IndividualSessionState ? IndividualSessionState.getAllForSession(pollId, sessionId) : [];
      allStudents.forEach(function(student) {
        if (!student.isLocked) {
          IndividualSessionState.lockStudent(pollId, sessionId, student.studentEmail);
        }
      });
    }

    const nowIso = new Date().toISOString();
    DataAccess.liveStatus.set("", -1, "CLOSED", {
      ...previousMetadata,
      reason: 'COMPLETED',
      sessionPhase: 'ENDED',
      endedAt: nowIso,
      startedAt: previousMetadata.startedAt || null,
      isCollecting: false,
      resultsVisibility: 'HIDDEN',
      responsesClosedAt: previousMetadata.responsesClosedAt || nowIso,
      revealedAt: null
    });

    Logger.log('Individual timed session ended by teacher', { pollId: pollId, sessionId: sessionId });

    return { success: true, sessionId: sessionId };
  })();
};

/**
 * Begin individual timed attempt (student starts assessment)
 */
Veritas.Models.Session.beginIndividualTimedAttempt = function(pollId, sessionId, token, options) {
  return withErrorHandling(function() {
    const studentEmail = TokenManager.getStudentEmail(token);
    if (!studentEmail) {
      throw new Error('Invalid or expired session token.');
    }

    const liveStatus = DataAccess.liveStatus.get();
    const metadata = liveStatus && liveStatus.metadata ? liveStatus.metadata : {};
    if (liveStatus[0] !== pollId || metadata.sessionId !== sessionId || !Veritas.Models.Poll.isSecureSessionPhase(metadata.sessionPhase)) {
      throw new Error('Secure Assessment is not currently active.');
    }

    const poll = DataAccess.polls.getById(pollId);
    if (!poll || !Veritas.Models.Poll.isSecureSessionType(poll.sessionType)) {
      throw new Error('Secure Assessment configuration not found.');
    }

    const availability = Veritas.Models.Poll.buildSecureAvailabilityDescriptor(poll);
    if (availability.windowStatus === 'NOT_YET_OPEN') {
      throw new Error('This assessment is not open yet.');
    }
    if (availability.windowStatus === 'PAST_DUE') {
      throw new Error('This assessment window has closed.');
    }

    const requiresAccess = poll.accessCode && poll.accessCode.toString().trim() !== '';
    if (requiresAccess) {
      const providedCode = (options && options.accessCode ? options.accessCode : '').toString().trim();
      if (!providedCode) {
        throw new Error('Access code is required to begin.');
      }
      const normalizedProvided = providedCode.toUpperCase();
      const normalizedExpected = poll.accessCode.toString().trim().toUpperCase();
      if (normalizedProvided !== normalizedExpected) {
        throw new Error('Access code is incorrect. Please try again.');
      }
    }

    const existingState = IndividualSessionState ? IndividualSessionState.getByStudent(pollId, sessionId, studentEmail) : null;
    if (existingState) {
      return { success: true, alreadyStarted: true };
    }

    const questionIndices = poll.questions.map(function(_, idx) { return idx; });
    const shuffledIndices = Veritas.Models.Session.shuffleArray(questionIndices);
    const answerOrders = Veritas.Models.Session.buildInitialAnswerOrderMap(poll);

    const defaultAdjustmentMinutes = Math.max(0, Number(metadata.secureDefaultTimeAdjustmentMinutes || 0));

    if (!IndividualSessionState) {
      throw new Error('Secure session storage unavailable');
    }
    IndividualSessionState.initStudent(
      pollId,
      sessionId,
      studentEmail,
      shuffledIndices,
      answerOrders,
      {
        displayName: Veritas.Models.Session.lookupStudentDisplayName(poll.className, studentEmail),
        questionOrderSeed: shuffledIndices.join('-'),
        answerChoiceMap: answerOrders,
        additionalMetadata: { className: poll.className },
        timeAdjustmentMinutes: defaultAdjustmentMinutes
      }
    );

    Logger.log('Student began secure assessment attempt', { pollId: pollId, sessionId: sessionId, studentEmail: studentEmail });

    return { success: true, sessionId: sessionId };
  })();
};

/**
 * Get current state for student in secure assessment
 */
Veritas.Models.Session.getIndividualTimedSessionState = function(token) {
  return withErrorHandling(function() {
    const studentEmail = TokenManager.getStudentEmail(token);
    if (!studentEmail) {
      throw new Error('Invalid or expired session token.');
    }

    const liveStatus = DataAccess.liveStatus.get();
    const pollId = liveStatus[0];
    const metadata = liveStatus.metadata || {};
    const sessionId = metadata.sessionId;

    if (!pollId || !sessionId || !Veritas.Models.Poll.isSecureSessionPhase(metadata.sessionPhase)) {
      return { status: 'ENDED' };
    }

    const poll = DataAccess.polls.getById(pollId);
    if (!poll || !Veritas.Models.Poll.isSecureSessionType(poll.sessionType)) {
      return { status: 'ENDED' };
    }

    const heartbeatInfo = StateVersionManager.noteHeartbeat(studentEmail);
    const connectionMeta = Veritas.Models.Session.deriveSecureConnectionMeta(heartbeatInfo);
    const studentState = IndividualSessionState ? IndividualSessionState.getByStudent(pollId, sessionId, studentEmail) : null;

    // Enforce proctor lock state for secure assessments before proceeding
    var proctorState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, sessionId);
    if (proctorState.status && proctorState.status !== 'OK') {
      return Veritas.Models.Session.applyConnectionMetaToPayload({
        status: proctorState.status,
        sessionType: Veritas.Config.SESSION_TYPES.SECURE,
        message: proctorState.status === 'BLOCKED'
          ? 'Your teacher has paused your session.'
          : 'Fullscreen required. Wait for your teacher to unlock and return to fullscreen.',
        pollId: pollId,
        sessionId: sessionId,
        lockVersion: proctorState.lockVersion || 0
      }, connectionMeta);
    }

    if (!studentState) {
      return Veritas.Models.Session.applyConnectionMetaToPayload(
        Veritas.Models.Session.buildSecureAssessmentLobbyState(poll, sessionId),
        connectionMeta
      );
    }

    DataAccess.individualSessionState.touchHeartbeat(pollId, sessionId, studentEmail, connectionMeta, studentState);

    if (studentState.isLocked) {
      return Veritas.Models.Session.applyConnectionMetaToPayload({
        status: 'LOCKED',
        sessionType: Veritas.Config.SESSION_TYPES.SECURE,
        message: 'Your session has ended.',
        pollId: pollId,
        sessionId: sessionId
      }, connectionMeta);
    }

    return Veritas.Models.Session.applyConnectionMetaToPayload(
      Veritas.Models.Session.getIndividualTimedQuestion(pollId, sessionId, studentEmail, studentState),
      connectionMeta
    );
  })();
};

/**
 * Get current question for student
 */
Veritas.Models.Session.getIndividualTimedQuestion = function(pollId, sessionId, studentEmail, existingState) {
  return withErrorHandling(function() {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    const studentState = existingState || Veritas.Models.Session.initializeIndividualTimedStudent(pollId, sessionId, studentEmail);

    if (studentState.isLocked) {
      return {
        locked: true,
        status: 'LOCKED',
        sessionType: Veritas.Models.Poll.normalizeSessionTypeValue(poll.sessionType),
        message: 'Time limit expired or session completed',
        currentQuestionIndex: studentState.currentQuestionIndex,
        totalQuestions: poll.questions.length
      };
    }

    // Check if completed all questions
    if (studentState.currentQuestionIndex >= poll.questions.length) {
      DataAccess.individualSessionState.lockStudent(pollId, sessionId, studentEmail);
      return {
        completed: true,
        status: 'COMPLETED',
        sessionType: Veritas.Models.Poll.normalizeSessionTypeValue(poll.sessionType),
        message: 'All questions completed',
        totalQuestions: poll.questions.length
      };
    }

    const actualQuestionIndex = studentState.questionOrder[studentState.currentQuestionIndex];
    const question = poll.questions[actualQuestionIndex];

    const answerOrderMap = studentState.answerOrders || {};
    let answerOrder = answerOrderMap[actualQuestionIndex];
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;

    if (!Array.isArray(answerOrder) || answerOrder.length !== optionCount) {
      const freshOrder = optionCount > 0
        ? Veritas.Models.Session.shuffleArray(question.options.map(function(_, idx) { return idx; }))
        : [];
      answerOrderMap[actualQuestionIndex] = freshOrder;
      DataAccess.individualSessionState.setAnswerOrders(pollId, sessionId, studentEmail, answerOrderMap);
      answerOrder = freshOrder;
    }

    const shuffledOptions = Array.isArray(question.options)
      ? answerOrder.map(function(idx) { return question.options[idx]; })
      : [];

    const questionPayload = Object.assign({}, question, { options: shuffledOptions });

    const metadata = DataAccess.liveStatus.getMetadata();
    const timingState = Veritas.Models.Session.computeSecureTimingState(studentState, poll, metadata);
    const timeLimitMinutes = timingState.timeLimitMinutes || poll.timeLimitMinutes;
    const remainingMs = timingState.remainingMs;

    if (timingState.allowedMs > 0 && timingState.remainingMs <= 0) {
      DataAccess.individualSessionState.lockStudent(pollId, sessionId, studentEmail);
      return {
        locked: true,
        status: 'LOCKED',
        sessionType: Veritas.Models.Poll.normalizeSessionTypeValue(poll.sessionType),
        pollId: pollId,
        sessionId: sessionId,
        currentQuestionIndex: studentState.currentQuestionIndex,
        totalQuestions: poll.questions.length,
        message: 'Time limit expired. Your responses have been secured.'
      };
    }

    return {
      status: 'ACTIVE',
      sessionType: Veritas.Models.Poll.normalizeSessionTypeValue(poll.sessionType),
      sessionId: sessionId,
      pollId: pollId,
      question: questionPayload,
      actualQuestionIndex: actualQuestionIndex,
      progressIndex: studentState.currentQuestionIndex,
      totalQuestions: poll.questions.length,
      timeRemainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      startTime: studentState.startTime,
      timeLimitMinutes: timeLimitMinutes,
      answerOrder: answerOrder,
      timeAdjustmentMinutes: studentState.timeAdjustmentMinutes || 0
    };
  })();
};

/**
 * Initialize student state (randomize questions/answers)
 */
Veritas.Models.Session.initializeIndividualTimedStudent = function(pollId, sessionId, studentEmail) {
  const poll = DataAccess.polls.getById(pollId);
  if (!poll) throw new Error('Poll not found');

  let studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);

  if (!studentState) {
    const questionIndices = poll.questions.map(function(q, idx) { return idx; });
    const shuffledIndices = Veritas.Models.Session.shuffleArray(questionIndices);
    const answerOrders = Veritas.Models.Session.buildInitialAnswerOrderMap(poll);

    studentState = DataAccess.individualSessionState.initStudent(
      pollId,
      sessionId,
      studentEmail,
      shuffledIndices,
      answerOrders,
      {
        displayName: Veritas.Models.Session.lookupStudentDisplayName(poll.className, studentEmail),
        questionOrderSeed: shuffledIndices.join('-'),
        answerChoiceMap: answerOrders,
        additionalMetadata: { className: poll.className }
      }
    );
  } else if (!studentState.answerOrders || typeof studentState.answerOrders !== 'object') {
    const regeneratedOrders = Veritas.Models.Session.buildInitialAnswerOrderMap(poll);
    studentState.answerOrders = regeneratedOrders;
    DataAccess.individualSessionState.setAnswerOrders(pollId, sessionId, studentEmail, regeneratedOrders);
  }

  const metadata = DataAccess.liveStatus.getMetadata();
  const timingState = Veritas.Models.Session.computeSecureTimingState(studentState, poll, metadata);

  if (timingState.allowedMs > 0 && timingState.remainingMs <= 0 && !studentState.isLocked) {
    DataAccess.individualSessionState.lockStudent(pollId, sessionId, studentEmail);
    studentState.isLocked = true;
    studentState.endTime = new Date().toISOString();
  }

  return studentState;
};

/**
 * Submit answer for secure assessment (token-based)
 */
Veritas.Models.Session.submitAnswerIndividualTimed = function(token, answerDetails) {
  return withErrorHandling(function() {
    const studentEmail = TokenManager.getStudentEmail(token);
    if (!studentEmail) {
      throw new Error('Invalid or expired session token.');
    }

    const pollId = answerDetails.pollId;
    const sessionId = answerDetails.sessionId;
    const actualQuestionIndex = answerDetails.actualQuestionIndex;
    const answer = answerDetails.answer;
    const confidenceLevel = answerDetails.confidenceLevel;

    if (!pollId || !sessionId || typeof actualQuestionIndex !== 'number' || typeof answer !== 'string') {
      throw new Error('Invalid submission data');
    }

    return Veritas.Models.Session.submitIndividualTimedAnswer(
      pollId,
      sessionId,
      studentEmail,
      actualQuestionIndex,
      answer,
      confidenceLevel
    );
  })();
};

/**
 * Submit answer for secure assessment (core logic)
 * CRITICAL CONCURRENCY FIX: Wrap entire operation in single lock to prevent race conditions
 * when 20+ students submit simultaneously (the "Submission Spike" scenario)
 */
Veritas.Models.Session.submitIndividualTimedAnswer = function(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel) {
  const poll = DataAccess.polls.getById(pollId);
  if (!poll) throw new Error('Poll not found');

  // CONCURRENCY FIX: Wrap entire read-check-write sequence in a SINGLE lock
  // This prevents TOCTOU (Time-of-Check-Time-of-Use) race conditions
  return Veritas.Utils.withLock(function() {
    // Re-fetch student state INSIDE the lock to ensure fresh data
    let studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);

    // Auto-heal if the student row is missing (e.g., sheet latency) by re-initializing
    if (!studentState) {
      studentState = Veritas.Models.Session.initializeIndividualTimedStudent(pollId, sessionId, studentEmail);
    }
    if (!studentState) {
      throw new Error('Student not initialized for this session');
    }

    if (studentState.isLocked) {
      throw new Error('Session is locked - time expired or already completed');
    }

    // Enforce proctoring lock/block for secure assessments
    var proctorState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, sessionId);
    if (proctorState.status && proctorState.status !== 'OK') {
      throw new Error('Session is locked. Wait for your teacher to unlock you.');
    }

    // Check elapsed time to prevent submissions after time limit
    const metadata = DataAccess.liveStatus.getMetadata();
    const timingState = Veritas.Models.Session.computeSecureTimingState(studentState, poll, metadata);

    if (timingState.allowedMs > 0 && timingState.remainingMs <= 0) {
      // Use unlocked version since we're already in a lock
      DataAccess.individualSessionState._lockStudentNoLock(studentState);
      Logger.log('Submission rejected: time limit exceeded', {
        pollId: pollId,
        studentEmail: studentEmail,
        elapsedMs: timingState.elapsedMs,
        allowedMs: timingState.allowedMs
      });
      throw new Error('Time limit exceeded. Your session has been locked and this response cannot be recorded.');
    }

    // Verify this is the current question
    const expectedQuestionIndex = studentState.questionOrder[studentState.currentQuestionIndex];

    // FIX: Resync if client state is out of sync but valid
    // If the client submits an answer for a question we *think* they've already passed (or haven't reached),
    // but it matches their actualQuestionIndex, it might be a race condition or retry.
    if (actualQuestionIndex !== expectedQuestionIndex) {
      Logger.log('Question index mismatch', {
          expected: expectedQuestionIndex,
          received: actualQuestionIndex,
          progress: studentState.currentQuestionIndex
      });

      // If they are submitting for the *previous* question (maybe network lag), reject gracefully
      // If they are submitting for a future question, that's impossible.
      // We strictly enforce current question index from server state.
      throw new Error('Cannot submit answer for non-current question (Expected: ' + expectedQuestionIndex + ', Received: ' + actualQuestionIndex + ')');
    }

    // Check if already answered (check INSIDE lock with fresh data)
    const alreadyAnswered = DataAccess.responses.hasAnswered(pollId, actualQuestionIndex, studentEmail);
    if (alreadyAnswered) {
      throw new Error('Question already answered');
    }

    const question = poll.questions[actualQuestionIndex];
    if (!question) throw new Error('Question not found');

    const isCorrect = (answer === question.correctAnswer);

    // Record response using unlocked version (we're already in a lock)
    const responseId = Utilities.getUuid();
    const timestamp = new Date().toISOString();
    DataAccess.responses._addNoLock([
      responseId,
      timestamp,
      pollId,
      actualQuestionIndex,
      studentEmail,
      answer,
      isCorrect,
      confidenceLevel || null
    ]);

    // Advance to next question using unlocked version
    const nextProgressIndex = studentState.currentQuestionIndex + 1;
    DataAccess.individualSessionState._updateProgressNoLock(studentState, nextProgressIndex);

    // Update metadata using unlocked version
    const existingCorrect = (studentState.additionalMetadata && typeof studentState.additionalMetadata.correctCount === 'number')
      ? studentState.additionalMetadata.correctCount
      : 0;
    const updatedMetadata = {
      mergeAdditionalMetadata: {
        correctCount: existingCorrect + (isCorrect ? 1 : 0),
        answeredCount: nextProgressIndex
      }
    };
    DataAccess.individualSessionState._updateFieldsNoLock(studentState, updatedMetadata);

    // Check if completed all questions
    const isComplete = nextProgressIndex >= poll.questions.length;
    if (isComplete) {
      // Use unlocked version since we're already in a lock
      DataAccess.individualSessionState._lockStudentNoLock(studentState);
    }

    Logger.log('Individual timed answer submitted', {
      pollId: pollId,
      studentEmail: studentEmail,
      actualQuestionIndex: actualQuestionIndex,
      isCorrect: isCorrect,
      nextProgressIndex: nextProgressIndex,
      isComplete: isComplete
    });

    return {
      success: true,
      isCorrect: isCorrect,
      isComplete: isComplete,
      nextProgressIndex: nextProgressIndex,
      totalQuestions: poll.questions.length
    };
  });
};

/**
 * Get teacher view for secure assessment (Mission Control)
 */
Veritas.Models.Session.getIndividualTimedSessionTeacherView = function(pollId, sessionId) {
  return withErrorHandling(function() {
    // Verify teacher authorization
    const currentUser = Veritas.Dev.getCurrentUser();
    if (currentUser !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(currentUser)) {
      throw new Error('Unauthorized');
    }

    // Validate inputs
    if (!pollId) {
      throw new Error('Poll ID is required for mission control view');
    }

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      // More descriptive error for deleted polls
      Logger.log('Poll not found in getIndividualTimedSessionTeacherView', { pollId: pollId, sessionId: sessionId });
      throw new Error('Poll not found');
    }

    const liveStatus = DataAccess.liveStatus.get();
    const liveMetadata = (liveStatus && liveStatus.metadata) ? liveStatus.metadata : {};
    const effectiveSessionId = sessionId || liveMetadata.sessionId || '';

    if (!effectiveSessionId) {
      Logger.log('No session ID found for mission control', { pollId: pollId, providedSessionId: sessionId, metadataSessionId: liveMetadata.sessionId });
      throw new Error('Secure assessment session not found.');
    }

    const roster = DataAccess.roster.getByClass(poll.className);
    if (!roster || roster.length === 0) {
      Logger.log('No roster found for poll class', { pollId: pollId, className: poll.className });
      throw new Error('No students found in roster for class: ' + poll.className);
    }

    const allStudentStates = DataAccess.individualSessionState.getAllForSession(pollId, effectiveSessionId);
    const studentStateMap = new Map();
    allStudentStates.forEach(function(state) {
      studentStateMap.set(state.studentEmail, state);
    });

    const studentEmails = roster.map(function(s) { return s.email; });
    const proctorStates = Veritas.Models.Session.ProctorAccess.getStatesBatch(pollId, studentEmails, effectiveSessionId);

    const responsesByStudent = new Map();
    const pollResponses = DataAccess.responses.getByPoll(pollId) || [];
    pollResponses.forEach(function(row) {
      const email = row[4];
      if (!email) return;
      if (!responsesByStudent.has(email)) {
        responsesByStudent.set(email, []);
      }
      const timestampValue = row[1] ? Date.parse(row[1]) : NaN;
      responsesByStudent.get(email).push({
        timestamp: timestampValue,
        isCorrect: row[6] === true || row[6] === 'TRUE'
      });
    });

    const timeLimitMinutes = poll.timeLimitMinutes || 0;
    const totalQuestions = poll.questions.length;
    const now = Date.now();

    const summary = {
      total: roster.length,
      notStarted: 0,
      inProgress: 0,
      locked: 0,
      completed: 0,
      paused: 0
    };

    const students = roster.map(function(student) {
      const email = student.email;
      const state = studentStateMap.get(email);
      const proctorState = proctorStates.get(email) || { status: 'OK', lockVersion: 0 };

      let status = 'Not Started';
      let statusTone = 'idle';
      let progress = 0;
      let answered = 0;
      let correctCount = 0;
      let timeRemainingSeconds = timeLimitMinutes * 60;
      let pauseActive = false;
      let connectionMeta = { status: 'GRAY', heartbeatLagMs: null, lastHeartbeatAt: null };
      let summaryBucket = 'notStarted';

      if (state) {
        const timingState = Veritas.Models.Session.computeSecureTimingState(state, poll, liveMetadata);
        if (timingState && typeof timingState.remainingMs === 'number') {
          timeRemainingSeconds = Math.max(0, Math.floor(timingState.remainingMs / 1000));
        }

        pauseActive = !!(state.additionalMetadata && state.additionalMetadata.pauseActive);

        const answeredFromMetadata = state.additionalMetadata && typeof state.additionalMetadata.answeredCount === 'number'
          ? state.additionalMetadata.answeredCount
          : null;
        const correctFromMetadata = state.additionalMetadata && typeof state.additionalMetadata.correctCount === 'number'
          ? state.additionalMetadata.correctCount
          : null;

        let answeredFromResponses = null;
        let correctFromResponses = null;
        if ((answeredFromMetadata === null || correctFromMetadata === null) && state.startTime && responsesByStudent.has(email)) {
          const startMs = Date.parse(state.startTime);
          if (!isNaN(startMs)) {
            const endMs = state.endTime ? Date.parse(state.endTime) : null;
            const bucket = responsesByStudent.get(email) || [];
            const relevant = bucket.filter(function(entry) {
              if (isNaN(entry.timestamp)) { return false; }
              if (entry.timestamp < startMs) { return false; }
              if (endMs && entry.timestamp > endMs) { return false; }
              return true;
            });
            answeredFromResponses = relevant.length;
            correctFromResponses = relevant.filter(function(entry) { return entry.isCorrect === true; }).length;
          }
        }

        answered = typeof answeredFromMetadata === 'number'
          ? answeredFromMetadata
          : (answeredFromResponses != null ? answeredFromResponses : Math.max(0, state.currentQuestionIndex || 0));
        progress = answered;
        correctCount = typeof correctFromMetadata === 'number'
          ? correctFromMetadata
          : (correctFromResponses != null ? correctFromResponses : 0);

        if (pauseActive) {
          status = 'Paused';
          statusTone = 'warning';
          summaryBucket = 'paused';
        } else if (state.isLocked && state.endTime) {
          status = 'Submitted';
          statusTone = 'success';
          summaryBucket = 'completed';
        } else if (state.isLocked) {
          status = 'Locked';
          statusTone = 'critical';
          summaryBucket = 'locked';
        } else {
          status = 'In Progress';
          statusTone = 'active';
          summaryBucket = 'inProgress';
        }

        const lastHeartbeatMs = Number(state.lastHeartbeatMs || 0);
        if (lastHeartbeatMs) {
          connectionMeta = Veritas.Models.Session.deriveSecureConnectionMeta({
            deltaMs: now - lastHeartbeatMs,
            lastSeen: new Date(lastHeartbeatMs).toISOString()
          });
        }
      }

      if (proctorState.status === 'LOCKED') {
        status = 'Locked - Violation';
        statusTone = 'critical';
        summaryBucket = 'locked';
      } else if (proctorState.status === 'BLOCKED') {
        status = 'Blocked';
        statusTone = 'critical';
        summaryBucket = 'locked';
      } else if (proctorState.status === 'AWAITING_FULLSCREEN') {
        status = 'Awaiting Fullscreen';
        statusTone = 'warning';
      }

      if (summaryBucket && Object.prototype.hasOwnProperty.call(summary, summaryBucket)) {
        summary[summaryBucket] = (summary[summaryBucket] || 0) + 1;
      }

      const progressPct = totalQuestions > 0
        ? Math.min(100, Math.round((answered / totalQuestions) * 100))
        : 0;
      const scorePct = totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100)
        : null;

      return {
        name: student.name,
        email: email,
        status: status,
        statusTone: statusTone,
        progress: answered,
        totalQuestions: totalQuestions,
        progressPct: progressPct,
        correctCount: correctCount,
        scorePct: scorePct,
        timeRemainingSeconds: timeRemainingSeconds,
        pauseActive: pauseActive,
        connection: connectionMeta,
        proctorStatus: proctorState.status || 'OK',
        lockVersion: proctorState.lockVersion || 0,
        isLocked: !!(state && state.isLocked),
        hasSubmitted: !!(state && state.endTime),
        timeAdjustmentMinutes: state ? state.timeAdjustmentMinutes || 0 : 0,
        additionalMetadata: state ? state.additionalMetadata || {} : {},
        lastHeartbeatMs: state ? state.lastHeartbeatMs || 0 : 0,
        startTime: state ? state.startTime : null,
        endTime: state ? state.endTime : null,
        violationCode: state ? state.violationCode || '' : '',
        questionIndex: state ? state.currentQuestionIndex || 0 : 0
      };
    });

    return {
      pollId: pollId,
      sessionId: effectiveSessionId,
      pollName: poll.pollName,
      className: poll.className,
      timeLimitMinutes: timeLimitMinutes,
      totalQuestions: totalQuestions,
      students: students,
      summary: summary,
      generatedAt: new Date().toISOString()
    };
  })();
};

// =============================================================================
// TIMING & ADJUSTMENTS
// =============================================================================

/**
 * Adjust time for one student
 */
Veritas.Models.Session.adjustSecureAssessmentTime = function(pollId, sessionId, studentEmail, deltaMinutes) {
  return withErrorHandling(function() {
    if (!pollId || !sessionId || !studentEmail) {
      throw new Error('Poll, session, and student are required');
    }

    const teacherEmail = Veritas.Dev.getCurrentUser();
    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(teacherEmail)) {
      throw new Error('Unauthorized');
    }

    const numericDelta = Number(deltaMinutes);
    if (isNaN(numericDelta) || numericDelta === 0) {
      throw new Error('A non-zero time adjustment is required');
    }

    const result = Veritas.Models.Session.applySecureAssessmentTimeAdjustment(
      pollId,
      sessionId,
      studentEmail,
      numericDelta,
      teacherEmail,
      true
    );

    return { success: true, timeAdjustmentMinutes: result.timeAdjustmentMinutes };
  })();
};

/**
 * Adjust time for multiple students
 */
Veritas.Models.Session.adjustSecureAssessmentTimeBulk = function(pollId, sessionId, studentEmails, deltaMinutes) {
  return withErrorHandling(function() {
    if (!pollId || !sessionId) {
      throw new Error('Poll and session are required');
    }
    const teacherEmail = Veritas.Dev.getCurrentUser();
    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(teacherEmail)) {
      throw new Error('Unauthorized');
    }
    if (!Array.isArray(studentEmails) || studentEmails.length === 0) {
      throw new Error('At least one student must be selected');
    }
    const numericDelta = Number(deltaMinutes);
    if (isNaN(numericDelta) || numericDelta === 0) {
      throw new Error('A non-zero time adjustment is required');
    }

    const uniqueEmails = Array.from(new Set(studentEmails.filter(function(email) { return !!email; })));
    const updates = uniqueEmails.map(function(email) {
      return Veritas.Models.Session.applySecureAssessmentTimeAdjustment(pollId, sessionId, email, numericDelta, teacherEmail, false);
    }).filter(function(result) { return !result.skipped; });

    return { success: true, updated: updates, requested: uniqueEmails.length };
  })();
};

/**
 * Adjust time for all students in session
 */
Veritas.Models.Session.adjustSecureAssessmentTimeForAll = function(pollId, sessionId, deltaMinutes) {
  return withErrorHandling(function() {
    if (!pollId || !sessionId) {
      throw new Error('Poll and session are required');
    }
    const teacherEmail = Veritas.Dev.getCurrentUser();
    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(teacherEmail)) {
      throw new Error('Unauthorized');
    }
    const numericDelta = Number(deltaMinutes);
    if (isNaN(numericDelta) || numericDelta === 0) {
      throw new Error('A non-zero time adjustment is required');
    }

    const liveMetadata = DataAccess.liveStatus.getMetadata() || {};
    const previousGlobal = Number(liveMetadata.secureDefaultTimeAdjustmentMinutes || 0);
    const nextGlobal = Math.max(0, previousGlobal + numericDelta);
    const nextMetadata = Object.assign({}, liveMetadata, { secureDefaultTimeAdjustmentMinutes: nextGlobal });
    DataAccess.liveStatus.setMetadata_(nextMetadata);

    const allStates = DataAccess.individualSessionState.getAllForSession(pollId, sessionId);
    const emails = Array.from(new Set(allStates.map(function(state) { return state.studentEmail; }).filter(Boolean)));
    const updates = emails.length
      ? emails.map(function(email) {
          return Veritas.Models.Session.applySecureAssessmentTimeAdjustment(pollId, sessionId, email, numericDelta, teacherEmail, false);
        }).filter(function(result) { return !result.skipped; })
      : [];

    return {
      success: true,
      updated: updates,
      requested: emails.length,
      globalAdjustmentMinutes: nextGlobal
    };
  })();
};

/**
 * Internal helper: Apply time adjustment to student
 */
Veritas.Models.Session.applySecureAssessmentTimeAdjustment = function(pollId, sessionId, studentEmail, numericDelta, actorEmail, throwIfMissing) {
  // Use lazy evaluation to get individualSessionState at runtime
  var sessionState = getIndividualSessionState_();
  if (!sessionState) {
    if (throwIfMissing) {
      throw new Error('Secure session storage unavailable. Please refresh and try again.');
    }
    return { email: studentEmail, skipped: true, error: 'storage_unavailable' };
  }
  
  const studentState = sessionState.getByStudent(pollId, sessionId, studentEmail);
  if (!studentState) {
    if (throwIfMissing) {
      throw new Error('Student session not initialized');
    }
    return { email: studentEmail, skipped: true };
  }

  const currentAdjustment = Number(studentState.timeAdjustmentMinutes || 0);
  const nextAdjustment = Math.max(0, currentAdjustment + numericDelta);

  DataAccess.individualSessionState.updateFields(pollId, sessionId, studentEmail, {
    timeAdjustmentMinutes: nextAdjustment
  });

  Veritas.Models.Session.logAssessmentEvent(pollId, sessionId, studentEmail, 'TIME_ADJUSTED', {
    deltaMinutes: numericDelta,
    totalAdjustmentMinutes: nextAdjustment,
    actor: actorEmail
  });

  return { email: studentEmail, timeAdjustmentMinutes: nextAdjustment };
};

/**
 * Teacher pauses student's assessment
 */
Veritas.Models.Session.pauseSecureAssessmentStudent = function(pollId, sessionId, studentEmail) {
  return withErrorHandling(function() {
    if (!pollId || !sessionId || !studentEmail) {
      throw new Error('Poll, session, and student are required');
    }

    const teacherEmail = Veritas.Dev.getCurrentUser();
    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(teacherEmail)) {
      throw new Error('Unauthorized');
    }

    const studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);
    if (!studentState) {
      throw new Error('Student session not initialized');
    }

    const metadata = Object.assign({}, studentState.additionalMetadata || {});
    if (metadata.pauseActive) {
      return { success: true, pauseActive: true };
    }

    metadata.pauseActive = true;
    metadata.pauseStartedAt = new Date().toISOString();

    DataAccess.individualSessionState.updateFields(pollId, sessionId, studentEmail, {
      additionalMetadata: metadata
    });

    Veritas.Models.Session.logAssessmentEvent(pollId, sessionId, studentEmail, 'PAUSED', {
      actor: teacherEmail
    });

    return { success: true, pauseActive: true };
  })();
};

/**
 * Teacher resumes student's assessment
 */
Veritas.Models.Session.resumeSecureAssessmentStudent = function(pollId, sessionId, studentEmail) {
  return withErrorHandling(function() {
    if (!pollId || !sessionId || !studentEmail) {
      throw new Error('Poll, session, and student are required');
    }

    const teacherEmail = Veritas.Dev.getCurrentUser();
    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(teacherEmail)) {
      throw new Error('Unauthorized');
    }

    const studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);
    if (!studentState) {
      throw new Error('Student session not initialized');
    }

    const metadata = Object.assign({}, studentState.additionalMetadata || {});
    const pauseStartedAt = metadata.pauseStartedAt ? Date.parse(metadata.pauseStartedAt) : null;
    if (!metadata.pauseActive || !pauseStartedAt) {
      metadata.pauseActive = false;
      metadata.pauseStartedAt = null;
      DataAccess.individualSessionState.updateFields(pollId, sessionId, studentEmail, {
        additionalMetadata: metadata
      });
      return { success: true, pauseActive: false };
    }

    const elapsedMs = Math.max(0, Date.now() - pauseStartedAt);
    const nextPauseDuration = Number(studentState.pauseDurationMs || 0) + elapsedMs;

    metadata.pauseActive = false;
    metadata.pauseStartedAt = null;

    DataAccess.individualSessionState.updateFields(pollId, sessionId, studentEmail, {
      pauseDurationMs: nextPauseDuration,
      additionalMetadata: metadata
    });

    Veritas.Models.Session.logAssessmentEvent(pollId, sessionId, studentEmail, 'RESUMED', {
      actor: teacherEmail,
      addedPauseMs: elapsedMs
    });

    return { success: true, pauseActive: false };
  })();
};

/**
 * Teacher force-submits student's assessment
 */
Veritas.Models.Session.forceSubmitSecureAssessmentStudent = function(pollId, sessionId, studentEmail) {
  return withErrorHandling(function() {
    if (!pollId || !sessionId || !studentEmail) {
      throw new Error('Poll, session, and student are required');
    }

    const teacherEmail = Veritas.Dev.getCurrentUser();
    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL && !isAdditionalTeacher_(teacherEmail)) {
      throw new Error('Unauthorized');
    }

    const studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);
    if (!studentState) {
      throw new Error('Student session not initialized');
    }

    const nowIso = new Date().toISOString();
    const totalQuestions = Array.isArray(studentState.questionOrder)
      ? studentState.questionOrder.length
      : studentState.currentQuestionIndex || 0;

    DataAccess.individualSessionState.updateFields(pollId, sessionId, studentEmail, {
      isLocked: true,
      endTime: nowIso,
      currentQuestionIndex: totalQuestions,
      proctorStatus: 'FORCED_COMPLETE'
    });

    const proctorState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, sessionId);
    proctorState.status = 'LOCKED';
    proctorState.lockReason = 'FORCED_SUBMIT';
    proctorState.lockedAt = nowIso;
    Veritas.Models.Session.ProctorAccess.setState(proctorState);

    Veritas.Models.Session.logAssessmentEvent(pollId, sessionId, studentEmail, 'FORCED_SUBMIT', {
      actor: teacherEmail
    });

    return { success: true };
  })();
};

/**
 * Teacher resets student's response for a question
 */
Veritas.Models.Session.resetStudentResponse = function(studentEmail, pollId, questionIndex) {
  return withErrorHandling(function() {
    if (!studentEmail || !pollId || typeof questionIndex === 'undefined') {
      throw new Error('Student email, poll ID, and question index are required');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Responses");

    // NULL CHECK: Responses sheet might not exist yet
    if (!sheet) {
      Logger.log('Responses sheet not found in resetStudentResponse', { pollId: pollId, studentEmail: studentEmail });
      return { success: true, rowsDeleted: 0 };
    }

    if (sheet.getLastRow() < 2) {
      return { success: true, rowsDeleted: 0 };
    }

    const range = sheet.getDataRange();
    const values = range.getValues();
    const header = values[0];

    const pollCol = header.indexOf('PollID');
    const questionCol = header.indexOf('QuestionIndex');
    const emailCol = header.indexOf('StudentEmail');

    if (pollCol === -1 || questionCol === -1 || emailCol === -1) {
      throw new Error('Responses sheet is missing required columns');
    }

    const normalizedQuestionIndex = typeof questionIndex === 'string'
      ? parseInt(questionIndex, 10)
      : questionIndex;

    const rowsToDelete = [];
    for (let i = values.length - 1; i >= 1; i--) {
      const row = values[i];
      if (row[pollCol] === pollId &&
          row[emailCol] === studentEmail &&
          row[questionCol] === normalizedQuestionIndex) {
        rowsToDelete.push(i + 1);
      }
    }

    rowsToDelete.forEach(function(rowIndex) {
      sheet.deleteRow(rowIndex);
    });

    Logger.log('Student response reset', {
      studentEmail: studentEmail,
      pollId: pollId,
      questionIndex: normalizedQuestionIndex,
      rowsDeleted: rowsToDelete.length
    });

    return { success: true, rowsDeleted: rowsToDelete.length };
  })();
};

// =============================================================================
// PROCTORING (ATOMIC STATE MACHINE)
// =============================================================================

/**
 * Proctoring telemetry - toggleable logging for audit trail
 */
Veritas.Models.Session.ProctorTelemetry = {
  enabled: true,

  log: function(event, studentEmail, pollId, extra) {
    if (!this.enabled) return;

    var extraData = extra || {};
    var entry = {
      timestamp: new Date().toISOString(),
      event: event,
      studentEmail: studentEmail,
      pollId: pollId
    };
    for (var key in extraData) {
      if (extraData.hasOwnProperty(key)) {
        entry[key] = extraData[key];
      }
    }

    Logger.log('PROCTOR_EVENT: ' + JSON.stringify(entry));

    var enableSheetLogging = PropertiesService.getScriptProperties().getProperty('PROCTOR_SHEET_LOGGING');
    if (enableSheetLogging === 'true') {
      try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('ProctorLog');
        if (!sheet) {
          sheet = ss.insertSheet('ProctorLog');
          sheet.getRange('A1:G1').setValues([[
            'Timestamp', 'Event', 'StudentEmail', 'PollID', 'LockVersion', 'Status', 'Extra'
          ]]).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
          sheet.setFrozenRows(1);
        }

        sheet.appendRow([
          entry.timestamp,
          event,
          studentEmail,
          pollId,
          extraData.lockVersion || '',
          extraData.status || '',
          JSON.stringify(extraData)
        ]);
      } catch (e) {
        Logger.error('Telemetry sheet write failed', e);
      }
    }
  }
};

/**
 * Hydrate proctor block fields from state
 */
Veritas.Models.Session.hydrateProctorBlockFields = function(state) {
  if (!state) return state;
  var reason = state.lockReason || '';
  var blockedBy = '';
  var blockedNote = '';
  if (reason && reason.indexOf('teacher-block::') === 0) {
    var remainder = reason.substring('teacher-block::'.length) || '';
    var parts = remainder.split('::');
    blockedBy = parts[0] || '';
    if (parts.length > 1) {
      blockedNote = parts.slice(1).join('::');
    }
  }

  return {
    pollId: state.pollId,
    studentEmail: state.studentEmail,
    status: state.status,
    lockVersion: state.lockVersion,
    lockReason: state.lockReason,
    lockedAt: state.lockedAt,
    unlockApproved: state.unlockApproved,
    unlockApprovedBy: state.unlockApprovedBy,
    unlockApprovedAt: state.unlockApprovedAt,
    sessionId: state.sessionId,
    rowIndex: state.rowIndex,
    blockedBy: blockedBy,
    blockedAt: state.status === 'BLOCKED' ? (state.lockedAt || '') : '',
    blockedNote: blockedNote
  };
};

/**
 * ProctorAccess - Atomic state machine for proctoring
 */
Veritas.Models.Session.ProctorAccess = {
  /**
   * Get proctoring state for a student
   */
  getState: function(pollId, studentEmail, currentSessionId) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('ProctorState');

    if (!sheet) {
      sheet = ss.insertSheet('ProctorState');
      sheet.getRange('A1:J1').setValues([[
        'PollID', 'StudentEmail', 'Status', 'LockVersion', 'LockReason',
        'LockedAt', 'UnlockApproved', 'UnlockApprovedBy', 'UnlockApprovedAt', 'SessionId'
      ]]).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === pollId && data[i][1] === studentEmail) {
        var status = 'OK';
        if (typeof data[i][2] === 'string' && Veritas.Config.PROCTOR_STATUS_VALUES.includes(data[i][2])) {
          status = data[i][2];
        } else if (data[i][2] === true || data[i][2] === 'TRUE') {
          status = 'LOCKED';
        }

        var stateSessionId = data[i][9] || null;
        var baseState = {
          pollId: data[i][0],
          studentEmail: data[i][1],
          status: status,
          lockVersion: typeof data[i][3] === 'number' ? data[i][3] : 0,
          lockReason: data[i][4] || '',
          lockedAt: data[i][5] || '',
          unlockApproved: data[i][6] === true || data[i][6] === 'TRUE',
          unlockApprovedBy: data[i][7] || null,
          unlockApprovedAt: data[i][8] || null,
          sessionId: stateSessionId,
          rowIndex: i + 1
        };

        if (currentSessionId) {
          var needsReset = !stateSessionId || stateSessionId === '' || stateSessionId !== currentSessionId;
          if (needsReset) {
            // Preserve any active lock/block state while syncing to the current session ID so
            // violations are not cleared when session metadata updates mid-run.
            if (status === 'LOCKED' || status === 'AWAITING_FULLSCREEN' || status === 'BLOCKED') {
              baseState.sessionId = currentSessionId;
              return Veritas.Models.Session.hydrateProctorBlockFields(baseState);
            }

            return Veritas.Models.Session.hydrateProctorBlockFields({
              pollId: pollId,
              studentEmail: studentEmail,
              status: 'OK',
              lockVersion: 0,
              lockReason: '',
              lockedAt: '',
              unlockApproved: false,
              unlockApprovedBy: null,
              unlockApprovedAt: null,
              sessionId: currentSessionId,
              rowIndex: i + 1
            });
          }
        }

        return Veritas.Models.Session.hydrateProctorBlockFields(baseState);
      }
    }

    return Veritas.Models.Session.hydrateProctorBlockFields({
      pollId: pollId,
      studentEmail: studentEmail,
      status: 'OK',
      lockVersion: 0,
      lockReason: '',
      lockedAt: '',
      unlockApproved: false,
      unlockApprovedBy: null,
      unlockApprovedAt: null,
      sessionId: currentSessionId || null,
      rowIndex: null
    });
  },

  /**
   * Batch get proctoring states (100x faster than getState loop)
   */
  getStatesBatch: function(pollId, studentEmails, currentSessionId) {
    var stateMap = new Map();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('ProctorState');

    if (!sheet) {
      sheet = ss.insertSheet('ProctorState');
      sheet.getRange('A1:J1').setValues([[
        'PollID', 'StudentEmail', 'Status', 'LockVersion', 'LockReason',
        'LockedAt', 'UnlockApproved', 'UnlockApprovedBy', 'UnlockApprovedAt', 'SessionId'
      ]]).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    var data = sheet.getDataRange().getValues();

    var existingStates = new Map();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === pollId) {
        var email = data[i][1];

        var status = 'OK';
        if (typeof data[i][2] === 'string' && Veritas.Config.PROCTOR_STATUS_VALUES.includes(data[i][2])) {
          status = data[i][2];
        } else if (data[i][2] === true || data[i][2] === 'TRUE') {
          status = 'LOCKED';
        }

        var stateSessionId = data[i][9] || null;
        var baseState = {
          pollId: data[i][0],
          studentEmail: email,
          status: status,
          lockVersion: typeof data[i][3] === 'number' ? data[i][3] : 0,
          lockReason: data[i][4] || '',
          lockedAt: data[i][5] || '',
          unlockApproved: data[i][6] === true || data[i][6] === 'TRUE',
          unlockApprovedBy: data[i][7] || null,
          unlockApprovedAt: data[i][8] || null,
          sessionId: stateSessionId,
          rowIndex: i + 1
        };

        if (currentSessionId) {
          var needsReset = !stateSessionId || stateSessionId === '' || stateSessionId !== currentSessionId;
          if (needsReset) {
            // When session metadata shifts, keep any active lock state instead of clearing it so
            // violations remain enforced and visible to teachers.
            if (status === 'LOCKED' || status === 'AWAITING_FULLSCREEN' || status === 'BLOCKED') {
              baseState.sessionId = currentSessionId;
              existingStates.set(email, Veritas.Models.Session.hydrateProctorBlockFields(baseState));
            } else {
              existingStates.set(email, Veritas.Models.Session.hydrateProctorBlockFields({
                pollId: pollId,
                studentEmail: email,
                status: 'OK',
                lockVersion: 0,
                lockReason: '',
                lockedAt: '',
                unlockApproved: false,
                unlockApprovedBy: null,
                unlockApprovedAt: null,
                sessionId: currentSessionId,
                rowIndex: i + 1
              }));
            }
          } else {
            existingStates.set(email, Veritas.Models.Session.hydrateProctorBlockFields(baseState));
          }
        } else {
          existingStates.set(email, Veritas.Models.Session.hydrateProctorBlockFields(baseState));
        }
      }
    }

    studentEmails.forEach(function(email) {
      if (existingStates.has(email)) {
        stateMap.set(email, existingStates.get(email));
      } else {
        stateMap.set(email, Veritas.Models.Session.hydrateProctorBlockFields({
          pollId: pollId,
          studentEmail: email,
          status: 'OK',
          lockVersion: 0,
          lockReason: '',
          lockedAt: '',
          unlockApproved: false,
          unlockApprovedBy: null,
          unlockApprovedAt: null,
          sessionId: currentSessionId || null,
          rowIndex: null
        }));
      }
    });

    return stateMap;
  },

  /**
   * Set proctoring state with validation
   */
  /**
   * Internal unlocked version of setState for use within withLock callbacks
   * @private
   */
  _setStateNoLock: function(state) {
    var validStatuses = Veritas.Config.PROCTOR_STATUS_VALUES;
    if (!validStatuses.includes(state.status)) {
      throw new Error('Invalid proctor status: ' + state.status + '. Must be one of: ' + validStatuses.join(', '));
    }

    if (typeof state.lockVersion !== 'number' || state.lockVersion < 0) {
      throw new Error('Invalid lockVersion: ' + state.lockVersion + '. Must be non-negative number.');
    }

    if (state.status === 'AWAITING_FULLSCREEN' && !state.unlockApproved) {
      throw new Error('State AWAITING_FULLSCREEN requires unlockApproved=true (teacher must approve first)');
    }

    if (state.status === 'LOCKED' && state.unlockApproved) {
      throw new Error('State LOCKED requires unlockApproved=false (approval must be cleared on new violation)');
    }

    if (state.status === 'BLOCKED') {
      state.unlockApproved = false;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('ProctorState');

    if (!sheet) {
      Veritas.Models.Session.ProctorAccess.getState(state.pollId, state.studentEmail);
      sheet = ss.getSheetByName('ProctorState');
    }

    var rowData = [
      state.pollId,
      state.studentEmail,
      state.status || 'OK',
      state.lockVersion,
      state.lockReason || '',
      state.lockedAt || '',
      state.unlockApproved || false,
      state.unlockApprovedBy || '',
      state.unlockApprovedAt || '',
      state.sessionId || ''
    ];

    if (state.rowIndex) {
      sheet.getRange(state.rowIndex, 1, 1, 10).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  },

  /**
   * Set proctoring state with validation (public API with locking)
   */
  setState: function(state) {
    var self = this;
    return Veritas.Utils.withLock(function() {
      self._setStateNoLock(state);
    });
  },

  /**
   * Reset all proctor states for new session
   */
  resetForNewSession: function(pollId, sessionId) {
    if (!pollId) {
      return;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('ProctorState');
    if (!sheet) {
      return;
    }

    var data = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) {
      return;
    }

    var hasUpdates = false;
    var updatedData = data.map(function(row, index) {
      if (index === 0) return row;
      if (row[0] === pollId) {
        hasUpdates = true;
        return [
          pollId,
          row[1] || '',
          'OK',
          0,
          '',
          '',
          false,
          '',
          '',
          sessionId || ''
        ];
      }
      return row;
    });

    if (hasUpdates) {
      sheet.getRange(2, 1, updatedData.length - 1, 10).setValues(updatedData.slice(1));
      SpreadsheetApp.flush();
    }
  }
};

/**
 * Report student violation (student exits fullscreen)
 */
Veritas.Models.Session.reportStudentViolation = function(pollId, studentEmail, reason) {
  return withErrorHandling(function() {
    if (!studentEmail) {
      return { success: false, error: 'Authentication error' };
    }

    if (!pollId) {
      return { success: false, error: 'Poll ID required' };
    }

    // RACE CONDITION FIX: Wrap entire read-check-write in a single lock to prevent TOCTOU
    // Use unlocked versions (_setStateNoLock, _addNoLock) to avoid nested locking deadlock
    return Veritas.Utils.withLock(function() {
      var statusValues = DataAccess.liveStatus.get();
      var activePollId = statusValues[0];
      var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};

      // Only use session ID if the violation is for the currently active poll
      var currentSessionId = (activePollId === pollId && metadata && metadata.sessionId) ? metadata.sessionId : null;

      var currentState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, currentSessionId);

      if (currentState.status === 'LOCKED') {
        Logger.log('Student already locked, not incrementing version', {
          studentEmail: studentEmail,
          pollId: pollId,
          currentLockVersion: currentState.lockVersion,
          newReason: reason
        });

        currentState.lockReason = reason || currentState.lockReason;
        currentState.sessionId = currentSessionId || currentState.sessionId;
        Veritas.Models.Session.ProctorAccess._setStateNoLock(currentState);

        return {
          success: true,
          status: 'LOCKED',
          lockVersion: currentState.lockVersion
        };
      }

      if (currentState.status === 'AWAITING_FULLSCREEN') {
        var newState = {
          pollId: pollId,
          studentEmail: studentEmail,
          status: 'LOCKED',
          lockVersion: currentState.lockVersion + 1,
          lockReason: reason || 'exit-fullscreen-while-awaiting',
          lockedAt: new Date().toISOString(),
          unlockApproved: false,
          unlockApprovedBy: null,
          unlockApprovedAt: null,
          sessionId: currentSessionId,
          rowIndex: currentState.rowIndex
        };

        Veritas.Models.Session.ProctorAccess._setStateNoLock(newState);

        var responseId = 'V-' + Utilities.getUuid();
        DataAccess.responses._addNoLock([
          responseId,
          new Date().getTime(),
          pollId,
          -1,
          studentEmail,
          Veritas.Config.PROCTOR_VIOLATION_CODES.LOCKED,
          false
        ]);

        Logger.log('Student violated while awaiting fullscreen - version bumped', {
          studentEmail: studentEmail,
          pollId: pollId,
          oldVersion: currentState.lockVersion,
          newVersion: newState.lockVersion,
          reason: newState.lockReason
        });

        return {
          success: true,
          status: 'LOCKED',
          lockVersion: newState.lockVersion
        };
      }

      var newState = {
        pollId: pollId,
        studentEmail: studentEmail,
        status: 'LOCKED',
        lockVersion: currentState.lockVersion + 1,
        lockReason: reason || 'exit-fullscreen',
        lockedAt: new Date().toISOString(),
        unlockApproved: false,
        unlockApprovedBy: null,
        unlockApprovedAt: null,
        sessionId: currentSessionId,
        rowIndex: currentState.rowIndex
      };

      Veritas.Models.Session.ProctorAccess._setStateNoLock(newState);

      var responseId = 'V-' + Utilities.getUuid();
      DataAccess.responses._addNoLock([
        responseId,
        new Date().getTime(),
        pollId,
        -1,
        studentEmail,
        Veritas.Config.PROCTOR_VIOLATION_CODES.LOCKED,
        false
      ]);

      Veritas.Models.Session.ProctorTelemetry.log('violation', studentEmail, pollId, {
        lockVersion: newState.lockVersion,
        reason: newState.lockReason,
        status: 'LOCKED'
      });

      return {
        success: true,
        status: 'LOCKED',
        lockVersion: newState.lockVersion
      };
    });
  })();
};

/**
 * Get student proctor state for polling
 */
Veritas.Models.Session.getStudentProctorState = function(token) {
  return withErrorHandling(function() {
    var studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return { success: false, error: 'Authentication error' };
    }

    var statusValues = DataAccess.liveStatus.get();
    var pollId = statusValues[0];
    var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    var state = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, currentSessionId);

    return {
      success: true,
      status: state.status,
      lockVersion: state.lockVersion,
      lockReason: state.lockReason,
      lockedAt: state.lockedAt,
      unlockApproved: state.unlockApproved,
      unlockApprovedBy: state.unlockApprovedBy,
      unlockApprovedAt: state.unlockApprovedAt
    };
  })();
};

/**
 * Teacher approves unlock (atomic with version check)
 */
Veritas.Models.Session.teacherApproveUnlock = function(studentEmail, pollId, expectedLockVersion) {
  return withErrorHandling(function() {
    var teacherEmail = Veritas.Dev.getCurrentUser();

    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    if (!studentEmail || !pollId || typeof expectedLockVersion !== 'number') {
      throw new Error('Invalid parameters');
    }

    // RACE CONDITION FIX: Wrap entire read-check-write in a single lock to prevent TOCTOU
    // This prevents the "infinite loop unlock" bug where a student violates again between
    // the version check and the setState, causing the teacher to approve a stale lockVersion.
    // Use _setStateNoLock to avoid nested locking deadlock.
    return Veritas.Utils.withLock(function() {
      var statusValues = DataAccess.liveStatus.get();
      var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
      var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

      var currentState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, currentSessionId);

      if (currentState.status !== 'LOCKED') {
        Logger.log('Unlock failed: student not locked', { studentEmail: studentEmail, pollId: pollId, status: currentState.status });
        return { ok: false, reason: 'not_locked', status: currentState.status };
      }

      if (currentState.lockVersion !== expectedLockVersion) {
        Logger.log('Unlock failed: version mismatch', {
          studentEmail: studentEmail,
          pollId: pollId,
          expected: expectedLockVersion,
          current: currentState.lockVersion
        });
        return { ok: false, reason: 'version_mismatch', lockVersion: currentState.lockVersion };
      }

      currentState.status = 'AWAITING_FULLSCREEN';
      currentState.unlockApproved = true;
      currentState.unlockApprovedBy = teacherEmail;
      currentState.unlockApprovedAt = new Date().toISOString();
      currentState.sessionId = currentSessionId || currentState.sessionId;
      Veritas.Models.Session.ProctorAccess._setStateNoLock(currentState);

      Veritas.Models.Session.ProctorTelemetry.log('approve_unlock', studentEmail, pollId, {
        lockVersion: expectedLockVersion,
        approvedBy: teacherEmail,
        status: 'AWAITING_FULLSCREEN'
      });

      return { ok: true, status: 'AWAITING_FULLSCREEN', lockVersion: expectedLockVersion };
    });
  })();
};

/**
 * Teacher blocks student
 */
Veritas.Models.Session.teacherBlockStudent = function(studentEmail, pollId, reason) {
  return withErrorHandling(function() {
    var teacherEmail = Veritas.Dev.getCurrentUser();

    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    if (!studentEmail || !pollId) {
      throw new Error('Invalid parameters');
    }

    // RACE CONDITION FIX: Wrap entire read-check-write in a single lock to prevent TOCTOU
    // Use unlocked versions to avoid nested locking deadlock
    return Veritas.Utils.withLock(function() {
      var statusValues = DataAccess.liveStatus.get();
      var activePollId = statusValues[0];
      var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
      var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

      if (!activePollId || activePollId !== pollId) {
        throw new Error('Poll is not currently live');
      }

      var currentState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, currentSessionId);

      var newState = {
        pollId: pollId,
        studentEmail: studentEmail,
        status: 'BLOCKED',
        lockVersion: (currentState.lockVersion || 0) + 1,
        lockReason: 'teacher-block::' + teacherEmail + (reason ? '::' + reason : ''),
        lockedAt: new Date().toISOString(),
        unlockApproved: false,
        unlockApprovedBy: null,
        unlockApprovedAt: null,
        sessionId: currentSessionId,
        rowIndex: currentState.rowIndex
      };

      Veritas.Models.Session.ProctorAccess._setStateNoLock(newState);

      var responseId = 'TB-' + Utilities.getUuid();
      DataAccess.responses._addNoLock([
        responseId,
        new Date().getTime(),
        pollId,
        -1,
        studentEmail,
        Veritas.Config.PROCTOR_VIOLATION_CODES.TEACHER_BLOCK,
        false
      ]);

      Veritas.Models.Session.ProctorTelemetry.log('teacher_block', studentEmail, pollId, {
        lockVersion: newState.lockVersion,
        status: 'BLOCKED',
        blockedBy: teacherEmail
      });

      return {
        ok: true,
        status: 'BLOCKED',
        lockVersion: newState.lockVersion,
        blockedAt: newState.lockedAt,
        blockedBy: teacherEmail
      };
    });
  })();
};

/**
 * Teacher unblocks student
 */
Veritas.Models.Session.teacherUnblockStudent = function(studentEmail, pollId) {
  return withErrorHandling(function() {
    var teacherEmail = Veritas.Dev.getCurrentUser();

    if (teacherEmail !== Veritas.Config.TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    if (!studentEmail || !pollId) {
      throw new Error('Invalid parameters');
    }

    // RACE CONDITION FIX: Wrap entire read-check-write in a single lock to prevent TOCTOU
    // Use _setStateNoLock to avoid nested locking deadlock
    return Veritas.Utils.withLock(function() {
      var statusValues = DataAccess.liveStatus.get();
      var activePollId = statusValues[0];
      var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
      var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

      if (!activePollId || activePollId !== pollId) {
        throw new Error('Poll is not currently live');
      }

      var currentState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, currentSessionId);

      if (currentState.status !== 'BLOCKED') {
        return { ok: false, reason: 'not_blocked', status: currentState.status };
      }

      var newState = {
        pollId: pollId,
        studentEmail: studentEmail,
        status: 'OK',
        lockVersion: (currentState.lockVersion || 0) + 1,
        lockReason: '',
        lockedAt: '',
        unlockApproved: false,
        unlockApprovedBy: null,
        unlockApprovedAt: null,
        sessionId: currentSessionId,
        rowIndex: currentState.rowIndex
      };

      Veritas.Models.Session.ProctorAccess._setStateNoLock(newState);

      Veritas.Models.Session.ProctorTelemetry.log('teacher_unblock', studentEmail, pollId, {
        lockVersion: newState.lockVersion,
        status: 'OK',
        unblockedBy: teacherEmail
      });

      return { ok: true, status: 'OK', lockVersion: newState.lockVersion };
    });
  })();
};

/**
 * Student confirms fullscreen (completes unlock)
 */
Veritas.Models.Session.studentConfirmFullscreen = function(expectedLockVersion, token) {
  return withErrorHandling(function() {
    var studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return { success: false, error: 'Authentication error' };
    }

    // RACE CONDITION FIX: Wrap entire read-check-write in a single lock to prevent TOCTOU
    // Use _setStateNoLock to avoid nested locking deadlock
    return Veritas.Utils.withLock(function() {
      var statusValues = DataAccess.liveStatus.get();
      var pollId = statusValues[0];
      var metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
      var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

      if (!pollId) {
        return { success: false, error: 'No active poll' };
      }

      var currentState = Veritas.Models.Session.ProctorAccess.getState(pollId, studentEmail, currentSessionId);

      if (currentState.status !== 'AWAITING_FULLSCREEN') {
        Logger.log('Confirm fullscreen failed: wrong status', {
          studentEmail: studentEmail,
          pollId: pollId,
          status: currentState.status
        });
        return { success: false, error: 'not_awaiting_fullscreen', status: currentState.status };
      }

      if (currentState.lockVersion !== expectedLockVersion) {
        Logger.log('Confirm fullscreen failed: version mismatch', {
          studentEmail: studentEmail,
          pollId: pollId,
          expected: expectedLockVersion,
          current: currentState.lockVersion
        });
        return { success: false, error: 'version_mismatch', lockVersion: currentState.lockVersion };
      }

      currentState.status = 'OK';
      currentState.sessionId = currentSessionId || currentState.sessionId;
      Veritas.Models.Session.ProctorAccess._setStateNoLock(currentState);

      Veritas.Models.Session.ProctorTelemetry.log('confirm_fullscreen', studentEmail, pollId, {
        lockVersion: expectedLockVersion,
        status: 'OK'
      });

      return { success: true, status: 'OK' };
    });
  })();
};

// =============================================================================
// SESSION HELPERS
// =============================================================================

/**
 * Compute secure timing state with adjustments and pauses
 */
Veritas.Models.Session.computeSecureTimingState = function(studentState, poll, metadata) {
  var baseLimitMinutes = (metadata && metadata.timeLimitMinutes) || poll.timeLimitMinutes || 0;
  var adjustmentMinutes = studentState && studentState.timeAdjustmentMinutes
    ? Number(studentState.timeAdjustmentMinutes)
    : 0;
  var pauseDurationMs = studentState && studentState.pauseDurationMs
    ? Number(studentState.pauseDurationMs)
    : 0;
  var startTimeMs = studentState && studentState.startTime
    ? new Date(studentState.startTime).getTime()
    : Date.now();
  var allowedMs = Math.max(0, baseLimitMinutes) * 60000 + (adjustmentMinutes * 60000);
  var elapsedMs = Math.max(0, Date.now() - startTimeMs - Math.max(0, pauseDurationMs));
  var remainingMs = allowedMs - elapsedMs;

  return {
    allowedMs: allowedMs,
    elapsedMs: elapsedMs,
    remainingMs: remainingMs,
    timeLimitMinutes: baseLimitMinutes,
    adjustmentMinutes: adjustmentMinutes
  };
};

/**
 * Build secure assessment lobby state
 */
Veritas.Models.Session.buildSecureAssessmentLobbyState = function(poll, sessionId) {
  var availability = Veritas.Models.Poll.buildSecureAvailabilityDescriptor(poll);
  var rules = Array.isArray(poll.secureSettings && poll.secureSettings.proctoringRules)
    ? poll.secureSettings.proctoringRules.filter(function(rule) { return typeof rule === 'string' && rule.trim() !== ''; })
    : Veritas.Config.DEFAULT_SECURE_PROCTORING_RULES;

  return {
    status: 'LOBBY',
    sessionType: Veritas.Config.SESSION_TYPES.SECURE,
    pollId: poll.pollId,
    sessionId: sessionId,
    pollName: poll.pollName,
    className: poll.className,
    timeLimitMinutes: poll.timeLimitMinutes || null,
    questionCount: poll.questions.length,
    requiresAccessCode: !!(poll.accessCode && poll.accessCode.toString().trim()),
    availability: availability,
    proctoringRules: rules,
    lobbyMessage: 'Secure Assessment: ' + (poll.pollName || ''),
    windowStatus: availability.windowStatus,
    blockingReason: availability.blockingMessage
  };
};

/**
 * Derive secure connection metadata from heartbeat info
 */
Veritas.Models.Session.deriveSecureConnectionMeta = function(heartbeatInfo) {
  var deltaMs = heartbeatInfo && typeof heartbeatInfo.deltaMs === 'number'
    ? heartbeatInfo.deltaMs
    : 0;
  var status = 'GREEN';
  if (deltaMs > 30000) {
    status = 'RED';
  } else if (deltaMs > 10000) {
    status = 'YELLOW';
  }

  var lastHeartbeatAt = (heartbeatInfo && (heartbeatInfo.previousSeen || heartbeatInfo.lastSeen)) || null;
  return {
    status: status,
    heartbeatLagMs: deltaMs,
    lastHeartbeatAt: lastHeartbeatAt
  };
};

/**
 * Apply connection metadata to payload
 */
Veritas.Models.Session.applyConnectionMetaToPayload = function(payload, connectionMeta) {
  if (!payload || !connectionMeta) {
    return payload;
  }
  var result = {};
  for (var key in payload) {
    if (payload.hasOwnProperty(key)) {
      result[key] = payload[key];
    }
  }
  result.connectionHealth = connectionMeta.status;
  result.heartbeatLagMs = connectionMeta.heartbeatLagMs;
  result.lastHeartbeatAt = connectionMeta.lastHeartbeatAt;
  return result;
};

/**
 * Lookup student display name from roster
 */
Veritas.Models.Session.lookupStudentDisplayName = function(className, studentEmail) {
  if (!className || !studentEmail) {
    return '';
  }
  var roster = DataAccess.roster.getByClass(className) || [];
  var normalizedEmail = (studentEmail && studentEmail.toString ? studentEmail.toString() : String(studentEmail)).trim().toLowerCase();
  var match = roster.find(function(entry) { return (entry.email || '').toLowerCase() === normalizedEmail; });
  if (!match) {
    var localPart = '';
    if (typeof normalizedEmail === 'string' && normalizedEmail.indexOf('@') >= 0) {
      localPart = normalizedEmail.split('@')[0];
    }
    return (localPart || normalizedEmail || '').trim();
  }
  var parts = Veritas.Utils.extractStudentNameParts(match.name || '');
  return parts.displayName || parts.trimmed || match.name || '';
};

/**
 * Build initial answer order map (randomize answer choices)
 */
Veritas.Models.Session.buildInitialAnswerOrderMap = function(poll) {
  var answerOrders = {};
  if (poll && Array.isArray(poll.questions)) {
    poll.questions.forEach(function(q, idx) {
      var optionCount = Array.isArray(q.options) ? q.options.length : 0;
      if (optionCount > 0) {
        answerOrders[idx] = Veritas.Models.Session.shuffleArray(q.options.map(function(_, i) { return i; }));
      }
    });
  }
  return answerOrders;
};

/**
 * Fisher-Yates shuffle algorithm
 */
Veritas.Models.Session.shuffleArray = function(array) {
  var shuffled = array.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
};

/**
 * Log assessment event for audit trail
 */
Veritas.Models.Session.logAssessmentEvent = function(pollId, sessionId, studentEmail, eventType, payload) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    var sheet = ss.getSheetByName('AssessmentEvents');
    if (!sheet) return;

    var row = [
      'AE-' + Utilities.getUuid(),
      new Date().toISOString(),
      pollId || '',
      sessionId || '',
      studentEmail || '',
      eventType || '',
      payload ? JSON.stringify(payload) : ''
    ];

    sheet.appendRow(row);
  } catch (err) {
    Logger.error('Failed to log assessment event', err);
  }
};

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================

function startPoll(pollId) {
  return Veritas.Models.Session.startPoll(pollId);
}

function nextQuestion() {
  return Veritas.Models.Session.nextQuestion();
}

function previousQuestion() {
  return Veritas.Models.Session.previousQuestion();
}

function stopPoll() {
  return Veritas.Models.Session.stopPoll();
}

function resumePoll() {
  return Veritas.Models.Session.resumePoll();
}

function closePoll() {
  return Veritas.Models.Session.closePoll();
}

function pausePollForTimerExpiry() {
  return Veritas.Models.Session.pausePollForTimerExpiry();
}

function revealResultsToStudents() {
  return Veritas.Models.Session.revealResultsToStudents();
}

function hideResultsFromStudents() {
  return Veritas.Models.Session.hideResultsFromStudents();
}

function endQuestionAndRevealResults() {
  return Veritas.Models.Session.endQuestionAndRevealResults();
}

function resetLiveQuestion(pollId, questionIndex, clearResponses) {
  return Veritas.Models.Session.resetLiveQuestion(pollId, questionIndex, clearResponses);
}

function startIndividualTimedSession(pollId) {
  return Veritas.Models.Session.startIndividualTimedSession(pollId);
}

function endIndividualTimedSession(pollId) {
  return Veritas.Models.Session.endIndividualTimedSession(pollId);
}

function beginIndividualTimedAttempt(pollId, sessionId, token, options) {
  return Veritas.Models.Session.beginIndividualTimedAttempt(pollId, sessionId, token, options);
}

function getIndividualTimedSessionState(token) {
  return Veritas.Models.Session.getIndividualTimedSessionState(token);
}

function getIndividualTimedQuestion(pollId, sessionId, studentEmail, existingState) {
  return Veritas.Models.Session.getIndividualTimedQuestion(pollId, sessionId, studentEmail, existingState);
}

function initializeIndividualTimedStudent(pollId, sessionId, studentEmail) {
  return Veritas.Models.Session.initializeIndividualTimedStudent(pollId, sessionId, studentEmail);
}

function submitAnswerIndividualTimed(token, answerDetails) {
  return Veritas.Models.Session.submitAnswerIndividualTimed(token, answerDetails);
}

function submitIndividualTimedAnswer(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel) {
  return Veritas.Models.Session.submitIndividualTimedAnswer(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel);
}

function getIndividualTimedSessionTeacherView(pollId, sessionId) {
  return Veritas.Models.Session.getIndividualTimedSessionTeacherView(pollId, sessionId);
}

function adjustSecureAssessmentTime(pollId, sessionId, studentEmail, deltaMinutes) {
  return Veritas.Models.Session.adjustSecureAssessmentTime(pollId, sessionId, studentEmail, deltaMinutes);
}

function adjustSecureAssessmentTimeBulk(pollId, sessionId, studentEmails, deltaMinutes) {
  return Veritas.Models.Session.adjustSecureAssessmentTimeBulk(pollId, sessionId, studentEmails, deltaMinutes);
}

function adjustSecureAssessmentTimeForAll(pollId, sessionId, deltaMinutes) {
  return Veritas.Models.Session.adjustSecureAssessmentTimeForAll(pollId, sessionId, deltaMinutes);
}

function applySecureAssessmentTimeAdjustment_(pollId, sessionId, studentEmail, numericDelta, actorEmail, throwIfMissing) {
  return Veritas.Models.Session.applySecureAssessmentTimeAdjustment(pollId, sessionId, studentEmail, numericDelta, actorEmail, throwIfMissing);
}

function pauseSecureAssessmentStudent(pollId, sessionId, studentEmail) {
  return Veritas.Models.Session.pauseSecureAssessmentStudent(pollId, sessionId, studentEmail);
}

function resumeSecureAssessmentStudent(pollId, sessionId, studentEmail) {
  return Veritas.Models.Session.resumeSecureAssessmentStudent(pollId, sessionId, studentEmail);
}

function forceSubmitSecureAssessmentStudent(pollId, sessionId, studentEmail) {
  return Veritas.Models.Session.forceSubmitSecureAssessmentStudent(pollId, sessionId, studentEmail);
}

function resetStudentResponse(studentEmail, pollId, questionIndex) {
  return Veritas.Models.Session.resetStudentResponse(studentEmail, pollId, questionIndex);
}

// Proctoring functions
var ProctorAccess = Veritas.Models.Session.ProctorAccess;
var ProctorTelemetry = Veritas.Models.Session.ProctorTelemetry;

function hydrateProctorBlockFields_(state) {
  return Veritas.Models.Session.hydrateProctorBlockFields(state);
}

function reportStudentViolation(pollId, studentEmail, reason) {
  return Veritas.Models.Session.reportStudentViolation(pollId, studentEmail, reason);
}

function getStudentProctorState(token) {
  return Veritas.Models.Session.getStudentProctorState(token);
}

function teacherApproveUnlock(studentEmail, pollId, expectedLockVersion) {
  return Veritas.Models.Session.teacherApproveUnlock(studentEmail, pollId, expectedLockVersion);
}

function teacherBlockStudent(studentEmail, pollId, reason) {
  return Veritas.Models.Session.teacherBlockStudent(studentEmail, pollId, reason);
}

function teacherUnblockStudent(studentEmail, pollId) {
  return Veritas.Models.Session.teacherUnblockStudent(studentEmail, pollId);
}

function studentConfirmFullscreen(expectedLockVersion, token) {
  return Veritas.Models.Session.studentConfirmFullscreen(expectedLockVersion, token);
}

// Session helpers

/**
 * Check if an email belongs to an additional teacher (not the primary teacher)
 * @param {string} email - Email to check
 * @returns {boolean} True if the email is a teacher email (primary or additional)
 */
function isAdditionalTeacher_(email) {
  return Veritas.Routing.isTeacherEmail(email);
}

function computeSecureTimingState_(studentState, poll, metadata) {
  return Veritas.Models.Session.computeSecureTimingState(studentState, poll, metadata);
}

function buildSecureAssessmentLobbyState_(poll, sessionId) {
  return Veritas.Models.Session.buildSecureAssessmentLobbyState(poll, sessionId);
}

function deriveSecureConnectionMeta_(heartbeatInfo) {
  return Veritas.Models.Session.deriveSecureConnectionMeta(heartbeatInfo);
}

function applyConnectionMetaToPayload_(payload, connectionMeta) {
  return Veritas.Models.Session.applyConnectionMetaToPayload(payload, connectionMeta);
}

function lookupStudentDisplayName_(className, studentEmail) {
  return Veritas.Models.Session.lookupStudentDisplayName(className, studentEmail);
}

function buildInitialAnswerOrderMap_(poll) {
  return Veritas.Models.Session.buildInitialAnswerOrderMap(poll);
}

function shuffleArray_(array) {
  return Veritas.Models.Session.shuffleArray(array);
}

function logAssessmentEvent_(pollId, sessionId, studentEmail, eventType, payload) {
  return Veritas.Models.Session.logAssessmentEvent(pollId, sessionId, studentEmail, eventType, payload);
}

// Legacy deprecated functions
function logStudentViolation() {
  return reportStudentViolation('legacy-violation');
}

function unlockStudent(studentEmail, pollId) {
  Logger.log('Deprecated unlockStudent called', { studentEmail: studentEmail, pollId: pollId });
  return { success: true, message: 'This function is deprecated.' };
}
