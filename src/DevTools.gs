// =============================================================================
// VERITAS LIVE POLL - DEVELOPMENT TOOLS
// =============================================================================
// Purpose: Smoke tests, development utilities, and debugging helpers
// Dependencies: All modules
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.DevTools = Veritas.DevTools || {};

/**
 * Run all smoke tests
 * @returns {Object} Test results
 */
Veritas.DevTools.runAllTests = function() {
  var results = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    errors: [],
    details: []
  };

  var tests = [
    { name: 'Configuration', fn: Veritas.DevTools.test_Configuration },
    { name: 'Security', fn: Veritas.DevTools.test_Security },
    { name: 'DataAccess', fn: Veritas.DevTools.test_DataAccess },
    { name: 'DataAccessCompatibility', fn: Veritas.DevTools.test_DataAccessCompatibility },
    { name: 'ModelsPoll', fn: Veritas.DevTools.test_ModelsPoll },
    { name: 'ModelsSession', fn: Veritas.DevTools.test_ModelsSession },
    { name: 'ModelsAnalytics', fn: Veritas.DevTools.test_ModelsAnalytics },
    { name: 'UtilsEnhancements', fn: Veritas.DevTools.test_UtilsEnhancements },
    { name: 'TeacherApiWorkflow', fn: Veritas.DevTools.test_TeacherApiWorkflow },
    { name: 'StudentApiWorkflow', fn: Veritas.DevTools.test_StudentApiWorkflow }
  ];

  for (var i = 0; i < tests.length; i++) {
    var test = tests[i];
    results.totalTests++;
    try {
      var testResult = test.fn();
      if (testResult && testResult.success) {
        results.passed++;
        results.details.push({
          test: test.name,
          status: 'PASSED',
          result: testResult
        });
      } else {
        results.failed++;
        results.errors.push(test.name + ': ' + (testResult.error || 'Unknown error'));
        results.details.push({
          test: test.name,
          status: 'FAILED',
          error: testResult.error || 'Unknown error'
        });
      }
    } catch (err) {
      results.failed++;
      results.errors.push(test.name + ': ' + err.message);
      results.details.push({
        test: test.name,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  Veritas.Logging.info('Smoke tests completed', results);
  return results;
};

/**
 * Smoke test: Verify basic configuration
 */
Veritas.DevTools.test_Configuration = function() {
  try {
    if (!Veritas.Config.TEACHER_EMAIL) {
      throw new Error('TEACHER_EMAIL not configured');
    }
    if (!Veritas.Config.SESSION_TYPES) {
      throw new Error('SESSION_TYPES not configured');
    }
    Veritas.Logging.info('Configuration test passed');
    return { success: true };
  } catch (err) {
    Veritas.Logging.error('Configuration test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Smoke test: Verify security module
 */
Veritas.DevTools.test_Security = function() {
  try {
    var isTeacher = Veritas.Security.isTeacher(Veritas.Config.TEACHER_EMAIL);
    if (!isTeacher) {
      throw new Error('Teacher email not recognized');
    }
    Veritas.Logging.info('Security test passed');
    return { success: true };
  } catch (err) {
    Veritas.Logging.error('Security test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Smoke test: Verify DataAccess module
 */
Veritas.DevTools.test_DataAccess = function() {
  try {
    // Test Classes entity
    var classes = Veritas.Data.Classes.getAll();
    if (!Array.isArray(classes)) {
      throw new Error('Classes.getAll() did not return an array');
    }

    // Test Polls entity
    var polls = Veritas.Data.Polls.getAll();
    if (!Array.isArray(polls)) {
      throw new Error('Polls.getAll() did not return an array');
    }

    // Test Properties entity
    var testKey = 'DEVTOOLS_TEST_' + Date.now();
    Veritas.Data.Properties.set(testKey, 'test_value');
    var retrieved = Veritas.Data.Properties.get(testKey);
    if (retrieved !== 'test_value') {
      throw new Error('Properties get/set failed');
    }
    Veritas.Data.Properties.delete(testKey);

    // Test JSON properties
    var testObj = { foo: 'bar', num: 42 };
    Veritas.Data.Properties.setJson(testKey, testObj);
    var retrievedObj = Veritas.Data.Properties.getJson(testKey);
    if (!retrievedObj || retrievedObj.foo !== 'bar' || retrievedObj.num !== 42) {
      throw new Error('JSON Properties get/set failed');
    }
    Veritas.Data.Properties.delete(testKey);

    Veritas.Logging.info('DataAccess test passed');
    return { success: true, classCount: classes.length, pollCount: polls.length };
  } catch (err) {
    Veritas.Logging.error('DataAccess test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Smoke test: Verify Models.Poll module
 */
Veritas.DevTools.test_ModelsPoll = function() {
  try {
    // Verify namespace exists
    if (!Veritas.Models || !Veritas.Models.Poll) {
      throw new Error('Models.Poll namespace not found');
    }

    // Verify key functions exist
    if (typeof Veritas.Models.Poll.normalizeQuestionObject !== 'function') {
      throw new Error('Models.Poll.normalizeQuestionObject function not found');
    }
    if (typeof Veritas.Models.Poll.normalizeSecureMetadata !== 'function') {
      throw new Error('Models.Poll.normalizeSecureMetadata function not found');
    }
    if (typeof Veritas.Models.Poll.buildSecureAvailabilityDescriptor !== 'function') {
      throw new Error('Models.Poll.buildSecureAvailabilityDescriptor function not found');
    }

    // Test normalizeSessionTypeValue
    var sessionType = Veritas.Models.Poll.normalizeSessionTypeValue('LIVE');
    if (sessionType !== Veritas.Config.SESSION_TYPES.LIVE) {
      throw new Error('normalizeSessionTypeValue failed');
    }

    Veritas.Logging.info('Models.Poll test passed');
    return { success: true, module: 'Models.Poll' };
  } catch (err) {
    Veritas.Logging.error('Models.Poll test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Smoke test: Verify Models.Session module
 */
Veritas.DevTools.test_ModelsSession = function() {
  try {
    // Verify namespace exists
    if (!Veritas.Models || !Veritas.Models.Session) {
      throw new Error('Models.Session namespace not found');
    }

    // Verify key functions exist
    if (typeof Veritas.Models.Session.computeSecureTimingState !== 'function') {
      throw new Error('Models.Session.computeSecureTimingState function not found');
    }
    if (typeof Veritas.Models.Session.buildSecureAssessmentLobbyState !== 'function') {
      throw new Error('Models.Session.buildSecureAssessmentLobbyState function not found');
    }
    if (typeof Veritas.Models.Session.lookupStudentDisplayName !== 'function') {
      throw new Error('Models.Session.lookupStudentDisplayName function not found');
    }

    // Test computeSecureTimingState
    var studentState = {
      startTime: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
      timeAdjustmentMinutes: 0,
      pauseDurationMs: 0
    };
    var poll = { timeLimitMinutes: 60 };
    var timing = Veritas.Models.Session.computeSecureTimingState(studentState, poll, {});
    if (typeof timing.remainingMs !== 'number') {
      throw new Error('computeSecureTimingState did not return timing state');
    }

    Veritas.Logging.info('Models.Session test passed');
    return { success: true, module: 'Models.Session' };
  } catch (err) {
    Veritas.Logging.error('Models.Session test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Smoke test: Verify Models.Analytics module
 */
Veritas.DevTools.test_ModelsAnalytics = function() {
  try {
    // Verify namespace exists
    if (!Veritas.Models || !Veritas.Models.Analytics) {
      throw new Error('Models.Analytics namespace not found');
    }

    // Note: This is a stub module, so just verify it exists
    Veritas.Logging.info('Models.Analytics test passed (stub module)');
    return { success: true, module: 'Models.Analytics', note: 'Stub module - full implementation pending' };
  } catch (err) {
    Veritas.Logging.error('Models.Analytics test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Smoke test: Verify Utils enhancements (URLShortener, StateVersionManager)
 */
Veritas.DevTools.test_UtilsEnhancements = function() {
  try {
    // Verify URLShortener exists
    if (!Veritas.Utils.URLShortener || typeof Veritas.Utils.URLShortener.shorten !== 'function') {
      throw new Error('Utils.URLShortener not found');
    }

    // Verify StateVersionManager exists
    if (!Veritas.Utils.StateVersionManager) {
      throw new Error('Utils.StateVersionManager not found');
    }
    if (typeof Veritas.Utils.StateVersionManager.bump !== 'function') {
      throw new Error('StateVersionManager.bump function not found');
    }
    if (typeof Veritas.Utils.StateVersionManager.get !== 'function') {
      throw new Error('StateVersionManager.get function not found');
    }
    if (typeof Veritas.Utils.StateVersionManager.noteHeartbeat !== 'function') {
      throw new Error('StateVersionManager.noteHeartbeat function not found');
    }

    // Test StateVersionManager
    var state = Veritas.Utils.StateVersionManager.get();
    if (typeof state.version !== 'number') {
      throw new Error('StateVersionManager.get did not return valid state');
    }

    Veritas.Logging.info('Utils enhancements test passed');
    return { success: true, currentStateVersion: state.version };
  } catch (err) {
    Veritas.Logging.error('Utils enhancements test failed', err);
    return { success: false, error: err.message };
  }
};

/**
 * Helper: Build an in-memory mock environment so API workflows can be tested
 */
function buildWorkflowMockEnvironment_() {
  var globalObj = this;

  var original = {
    Logger: globalObj.Logger,
    DataAccess: globalObj.DataAccess,
    TokenManager: globalObj.TokenManager,
    StateVersionManager: globalObj.StateVersionManager,
    VeritasModels: Veritas.Models,
    VeritasRouting: Veritas.Routing,
    Session: globalObj.Session,
    Utilities: globalObj.Utilities,
    RateLimiter: globalObj.RateLimiter,
    withErrorHandling: typeof globalObj.withErrorHandling === 'function' ? globalObj.withErrorHandling : null
  };

  var mockLogSink = [];
  var mockLogger = {
    log: function() {},
    info: function() {},
    error: function() {},
    debug: function() {},
    warn: function() {},
    getSink: function() { return mockLogSink; }
  };

  var mockPoll = {
    pollId: 'POLL-1',
    pollName: 'Mock Poll',
    className: 'Biology',
    sessionType: 'LIVE',
    questions: [
      { prompt: 'Q1', correctAnswer: 'A', answers: ['A', 'B'] },
      { prompt: 'Q2', correctAnswer: 'B', answers: ['A', 'B'] }
    ]
  };

  var liveStatusState = ['POLL-1', -1, 'CLOSED'];
  liveStatusState.metadata = { sessionId: '', sessionPhase: 'PRE_LIVE', endedAt: '' };

  var responsesStore = [];

  var mockDataAccess = {
    polls: {
      getById: function(id) { return mockPoll.pollId === id ? mockPoll : null; },
      getAll: function() { return [mockPoll]; }
    },
    liveStatus: {
      get: function() { return liveStatusState; },
      set: function(values, metadata) {
        liveStatusState[0] = values[0];
        liveStatusState[1] = values[1];
        liveStatusState[2] = values[2];
        liveStatusState.metadata = metadata || liveStatusState.metadata;
        return liveStatusState;
      },
      getMetadata: function() { return liveStatusState.metadata || {}; }
    },
    responses: {
      hasAnswered: function(pollId, questionIndex, studentEmail) {
        return responsesStore.some(function(r) {
          return r[2] === pollId && r[3] === questionIndex && r[4] === studentEmail;
        });
      },
      add: function(row) {
        responsesStore.push(row);
      },
      getByPoll: function(pollId) {
        return responsesStore.filter(function(r) { return r[2] === pollId; });
      },
      isLocked: function() { return false; }
    },
    roster: {
      isEnrolled: function(className, studentEmail) {
        return className === mockPoll.className && studentEmail === 'student@example.com';
      },
      getByClass: function() { return [{ name: 'Student Example', email: 'student@example.com' }]; }
    },
    individualSessionState: {
      getByStudent: function() { return null; },
      initStudent: function(pollId, studentEmail) {
        return { pollId: pollId, studentEmail: studentEmail };
      },
      updateProgress: function() { return true; },
      lockStudent: function() { return true; },
      getAllForSession: function() { return []; }
    }
  };

  var mockStateVersionManager = {
    version: 1,
    noteHeartbeat: function() {
      return { deltaMs: 0, previousSeen: null, health: 'HEALTHY' };
    },
    get: function() {
      return { version: mockStateVersionManager.version, updatedAt: new Date().toISOString(), status: liveStatusState[2], reason: '' };
    },
    OUTAGE_RECOVERY_THRESHOLD_MS: 30000
  };

  var sessionState = {
    pollId: mockPoll.pollId,
    questionIndex: -1,
    status: 'CLOSED',
    phase: 'PRE_LIVE',
    showResults: false,
    sessionId: 'SESSION-1'
  };

  function syncSessionToLiveStatus_() {
    liveStatusState[0] = sessionState.pollId;
    liveStatusState[1] = sessionState.questionIndex;
    liveStatusState[2] = sessionState.status;
    liveStatusState.metadata = liveStatusState.metadata || {};
    liveStatusState.metadata.sessionId = sessionState.sessionId;
    liveStatusState.metadata.sessionPhase = sessionState.phase;
    liveStatusState.metadata.endedAt = sessionState.phase === 'ENDED' ? new Date().toISOString() : '';
  }

  var mockModelsSession = {
    startPoll: function(pollId) {
      sessionState.pollId = pollId;
      sessionState.questionIndex = 0;
      sessionState.status = 'OPEN';
      sessionState.phase = 'LIVE';
      syncSessionToLiveStatus_();
      return { pollId: pollId, questionIndex: 0, status: 'OPEN' };
    },
    nextQuestion: function() {
      sessionState.questionIndex = Math.min(sessionState.questionIndex + 1, mockPoll.questions.length - 1);
      syncSessionToLiveStatus_();
      return { pollId: sessionState.pollId, questionIndex: sessionState.questionIndex, status: sessionState.status };
    },
    previousQuestion: function() {
      sessionState.questionIndex = Math.max(sessionState.questionIndex - 1, 0);
      syncSessionToLiveStatus_();
      return { pollId: sessionState.pollId, questionIndex: sessionState.questionIndex, status: sessionState.status };
    },
    stopPoll: function() {
      sessionState.status = 'PAUSED';
      sessionState.phase = 'PAUSED';
      syncSessionToLiveStatus_();
      return { pollId: sessionState.pollId, status: 'PAUSED' };
    },
    resumePoll: function() {
      sessionState.status = 'OPEN';
      sessionState.phase = 'LIVE';
      syncSessionToLiveStatus_();
      return { pollId: sessionState.pollId, status: 'OPEN' };
    },
    closePoll: function() {
      sessionState.status = 'CLOSED';
      sessionState.phase = 'ENDED';
      syncSessionToLiveStatus_();
      return { pollId: sessionState.pollId, status: 'CLOSED' };
    },
    revealResultsToStudents: function() {
      sessionState.showResults = true;
      sessionState.phase = 'RESULTS_HOLD';
      syncSessionToLiveStatus_();
      return { status: 'RESULTS_HOLD' };
    },
    hideResultsFromStudents: function() {
      sessionState.showResults = false;
      syncSessionToLiveStatus_();
      return { status: sessionState.status };
    },
    resetLiveQuestion: function() {
      responsesStore = [];
      return { pollId: sessionState.pollId, questionIndex: sessionState.questionIndex, reset: true };
    },
    startIndividualTimedSession: function(pollId) {
      sessionState.phase = 'LOBBY';
      syncSessionToLiveStatus_();
      return { pollId: pollId, sessionPhase: 'LOBBY' };
    },
    endIndividualTimedSession: function(pollId) {
      sessionState.phase = 'ENDED';
      syncSessionToLiveStatus_();
      return { pollId: pollId, sessionPhase: 'ENDED' };
    },
    getIndividualTimedSessionState: function() {
      return { pollId: sessionState.pollId, sessionPhase: sessionState.phase };
    },
    getIndividualTimedSessionTeacherView: function(pollId) {
      return { pollId: pollId, students: [] };
    },
    adjustSecureAssessmentTime: function() { return { success: true }; },
    adjustSecureAssessmentTimeBulk: function() { return { success: true }; },
    adjustSecureAssessmentTimeForAll: function() { return { success: true }; },
    pauseSecureAssessmentStudent: function() { return { success: true }; },
    resumeSecureAssessmentStudent: function() { return { success: true }; },
    forceSubmitSecureAssessmentStudent: function() { return { success: true }; },
    teacherApproveUnlock: function() { return { success: true }; },
    teacherBlockStudent: function() { return { success: true }; },
    teacherUnblockStudent: function() { return { success: true }; },
    getStudentProctorState: function() {
      return { status: 'READY', version: mockStateVersionManager.version };
    },
    submitIndividualTimedAnswer: function(pollId, sessionId, questionIndex, answerText, token, confidenceLevel) {
      return Veritas.StudentApi.submitIndividualTimedAnswer(pollId, sessionId, questionIndex, answerText, token, confidenceLevel);
    }
  };

  var mockTokenManager = {
    validateToken: function(token) {
      if (token === 'valid-token') {
        return { email: 'student@example.com', className: mockPoll.className, token: token };
      }
      return null;
    },
    getStudentEmail: function(token) {
      return token === 'valid-token' ? 'student@example.com' : null;
    },
    getCurrentStudentEmail: function() { return 'student@example.com'; }
  };

  var mockRouting = {
    isTeacherEmail: function(email) { return email === 'teacher@example.com'; }
  };

  var mockSession = {
    getActiveUser: function() {
      return { getEmail: function() { return 'teacher@example.com'; } };
    }
  };

  var mockUtilities = {
    getUuid: function() { return 'uuid-1'; }
  };

  var mockRateLimiter = {
    check: function() { return true; }
  };

  function install() {
    globalObj.Logger = mockLogger;
    globalObj.DataAccess = mockDataAccess;
    globalObj.TokenManager = mockTokenManager;
    globalObj.StateVersionManager = mockStateVersionManager;
    Veritas.Models = mockModelsSession ? { Session: mockModelsSession, Poll: Veritas.Models && Veritas.Models.Poll, Analytics: Veritas.Models && Veritas.Models.Analytics } : Veritas.Models;
    Veritas.Routing = mockRouting;
    globalObj.Session = mockSession;
    globalObj.Utilities = mockUtilities;
    globalObj.RateLimiter = mockRateLimiter;
    if (!original.withErrorHandling) {
      globalObj.withErrorHandling = function(fn) { return fn(); };
    }
    syncSessionToLiveStatus_();
  }

  function restore() {
    globalObj.Logger = original.Logger;
    globalObj.DataAccess = original.DataAccess;
    globalObj.TokenManager = original.TokenManager;
    globalObj.StateVersionManager = original.StateVersionManager;
    Veritas.Models = original.VeritasModels;
    Veritas.Routing = original.VeritasRouting;
    globalObj.Session = original.Session;
    globalObj.Utilities = original.Utilities;
    globalObj.RateLimiter = original.RateLimiter;
    if (!original.withErrorHandling) {
      delete globalObj.withErrorHandling;
    }
  }

  return {
    install: install,
    restore: restore,
    state: sessionState,
    poll: mockPoll,
    responsesStore: function() { return responsesStore; },
    versionManager: mockStateVersionManager
  };
}

/**
 * Workflow test: validate teacher API operations and routing wrappers
 */
Veritas.DevTools.test_TeacherApiWorkflow = function() {
  var mock = buildWorkflowMockEnvironment_();
  mock.install();

  try {
    var startState = Veritas.TeacherApi.startPoll('POLL-1');
    if (startState.status !== 'OPEN' || startState.questionIndex !== 0) {
      throw new Error('startPoll failed to open poll');
    }

    var next = Veritas.TeacherApi.nextQuestion();
    if (next.questionIndex !== 1) {
      throw new Error('nextQuestion did not advance');
    }

    var previous = Veritas.TeacherApi.previousQuestion();
    if (previous.questionIndex !== 0) {
      throw new Error('previousQuestion did not rewind');
    }

    var paused = Veritas.TeacherApi.stopPoll();
    if (paused.status !== 'PAUSED') {
      throw new Error('stopPoll did not pause session');
    }

    var resumed = Veritas.TeacherApi.resumePoll();
    if (resumed.status !== 'OPEN') {
      throw new Error('resumePoll did not reopen session');
    }

    var reveal = Veritas.TeacherApi.revealResultsToStudents();
    if (reveal.status !== 'RESULTS_HOLD') {
      throw new Error('revealResultsToStudents did not move to results state');
    }

    var hidden = Veritas.TeacherApi.hideResultsFromStudents();
    if (hidden.status !== 'OPEN' && hidden.status !== 'CLOSED' && hidden.status !== 'PAUSED') {
      throw new Error('hideResultsFromStudents returned unexpected status');
    }

    var reset = Veritas.TeacherApi.resetLiveQuestion();
    if (!reset.reset) {
      throw new Error('resetLiveQuestion did not report reset');
    }

    var lobbyState = Veritas.TeacherApi.startIndividualTimedSession('POLL-1');
    if (lobbyState.sessionPhase !== 'LOBBY') {
      throw new Error('startIndividualTimedSession failed');
    }

    var endedSecure = Veritas.TeacherApi.endIndividualTimedSession('POLL-1');
    if (endedSecure.sessionPhase !== 'ENDED') {
      throw new Error('endIndividualTimedSession failed');
    }

    var closed = Veritas.TeacherApi.closePoll();
    if (closed.status !== 'CLOSED') {
      throw new Error('closePoll did not close session');
    }

    return {
      success: true,
      details: {
        pollId: mock.state.pollId,
        finalStatus: closed.status,
        questionIndex: mock.state.questionIndex
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    mock.restore();
  }
};

/**
 * Workflow test: validate student API operations end-to-end with mocks
 */
Veritas.DevTools.test_StudentApiWorkflow = function() {
  var mock = buildWorkflowMockEnvironment_();
  mock.install();

  try {
    Veritas.TeacherApi.startPoll('POLL-1');

    var prelive = Veritas.StudentApi.getStudentPollStatus('valid-token', { lastStateVersion: 0, lastSuccessAt: Date.now(), failureCount: 0 });
    if (prelive.status !== 'LIVE') {
      throw new Error('getStudentPollStatus did not return live state for active poll');
    }

    var submission = Veritas.StudentApi.submitLivePollAnswer('POLL-1', 0, 'A', 'valid-token', 'very-sure');
    if (!submission.success) {
      throw new Error('submitLivePollAnswer rejected valid submission');
    }

    var duplicate = Veritas.StudentApi.submitLivePollAnswer('POLL-1', 0, 'A', 'valid-token');
    if (duplicate.success) {
      throw new Error('submitLivePollAnswer allowed duplicate submission');
    }

    Veritas.TeacherApi.closePoll();
    var ended = Veritas.StudentApi.getStudentPollStatus('valid-token', { lastStateVersion: 1 });
    if (ended.status !== 'ENDED') {
      throw new Error('getStudentPollStatus did not indicate session end');
    }

    return {
      success: true,
      submissions: mock.responsesStore().length,
      finalStatus: ended.status
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    mock.restore();
  }
};

/**
 * Smoke test: Verify DataAccess compatibility layer
 */
Veritas.DevTools.test_DataAccessCompatibility = function() {
  try {
    // Test DataAccess.polls
    if (!DataAccess.polls) {
      throw new Error('DataAccess.polls not found');
    }
    var allPolls = DataAccess.polls.getAll();
    if (!Array.isArray(allPolls)) {
      throw new Error('DataAccess.polls.getAll() did not return an array');
    }

    // Test getById if there are polls
    if (allPolls.length > 0) {
      var firstPoll = allPolls[0];
      var pollById = DataAccess.polls.getById(firstPoll.pollId);
      if (!pollById || pollById.pollId !== firstPoll.pollId) {
        throw new Error('DataAccess.polls.getById() failed');
      }

      // Test getByClass
      var pollsByClass = DataAccess.polls.getByClass(firstPoll.className);
      if (!Array.isArray(pollsByClass)) {
        throw new Error('DataAccess.polls.getByClass() did not return an array');
      }
    }

    // Test DataAccess.roster
    if (!DataAccess.roster) {
      throw new Error('DataAccess.roster not found');
    }
    if (typeof DataAccess.roster.getByClass !== 'function') {
      throw new Error('DataAccess.roster.getByClass not found');
    }
    if (typeof DataAccess.roster.isEnrolled !== 'function') {
      throw new Error('DataAccess.roster.isEnrolled not found');
    }

    // Test DataAccess.liveStatus
    if (!DataAccess.liveStatus) {
      throw new Error('DataAccess.liveStatus not found');
    }
    if (typeof DataAccess.liveStatus.get !== 'function') {
      throw new Error('DataAccess.liveStatus.get not found');
    }
    if (typeof DataAccess.liveStatus.set !== 'function') {
      throw new Error('DataAccess.liveStatus.set not found');
    }
    if (typeof DataAccess.liveStatus.getMetadata !== 'function') {
      throw new Error('DataAccess.liveStatus.getMetadata not found');
    }

    // Test liveStatus.get()
    var liveStatus = DataAccess.liveStatus.get();
    if (!Array.isArray(liveStatus) && typeof liveStatus !== 'object') {
      throw new Error('DataAccess.liveStatus.get() did not return expected format');
    }

    // Test DataAccess.responses
    if (!DataAccess.responses) {
      throw new Error('DataAccess.responses not found');
    }
    if (typeof DataAccess.responses.getByPoll !== 'function') {
      throw new Error('DataAccess.responses.getByPoll not found');
    }
    if (typeof DataAccess.responses.hasAnswered !== 'function') {
      throw new Error('DataAccess.responses.hasAnswered not found');
    }
    if (typeof DataAccess.responses.isLocked !== 'function') {
      throw new Error('DataAccess.responses.isLocked not found');
    }

    // Test DataAccess.individualSessionState
    if (!DataAccess.individualSessionState) {
      throw new Error('DataAccess.individualSessionState not found');
    }
    if (typeof DataAccess.individualSessionState.getByStudent !== 'function') {
      throw new Error('DataAccess.individualSessionState.getByStudent not found');
    }
    if (typeof DataAccess.individualSessionState.initStudent !== 'function') {
      throw new Error('DataAccess.individualSessionState.initStudent not found');
    }
    if (typeof DataAccess.individualSessionState.updateProgress !== 'function') {
      throw new Error('DataAccess.individualSessionState.updateProgress not found');
    }
    if (typeof DataAccess.individualSessionState.lockStudent !== 'function') {
      throw new Error('DataAccess.individualSessionState.lockStudent not found');
    }
    if (typeof DataAccess.individualSessionState.getAllForSession !== 'function') {
      throw new Error('DataAccess.individualSessionState.getAllForSession not found');
    }

    // Test parseIndividualSessionRow_ helper function exists
    if (typeof parseIndividualSessionRow_ !== 'function') {
      throw new Error('parseIndividualSessionRow_ helper function not found');
    }

    Veritas.Logging.info('DataAccess compatibility test passed');
    return {
      success: true,
      pollCount: allPolls.length,
      tests: [
        'polls.getAll',
        'polls.getById',
        'polls.getByClass',
        'roster.getByClass',
        'roster.isEnrolled',
        'liveStatus.get',
        'liveStatus.set',
        'liveStatus.getMetadata',
        'responses.*',
        'individualSessionState.*',
        'parseIndividualSessionRow_'
      ]
    };
  } catch (err) {
    Veritas.Logging.error('DataAccess compatibility test failed', err);
    return { success: false, error: err.message };
  }
};

// Additional test functions to be added in future phases:
// - test_LivePollWorkflow
// - test_SecureAssessmentWorkflow
// - test_ProctorStateMachine
// etc.

// =============================================================================
// CONVENIENT ENTRY POINTS FOR APPS SCRIPT EDITOR
// =============================================================================

/**
 * Test DataAccess compatibility - can be run from Apps Script editor
 */
function testDataAccessCompatibility() {
  var result = Veritas.DevTools.test_DataAccessCompatibility();
  Logger.log('=== DataAccess Compatibility Test ===');
  Logger.log('Success: ' + result.success);
  if (result.success) {
    Logger.log('Poll Count: ' + result.pollCount);
    Logger.log('Tests Passed:');
    for (var i = 0; i < result.tests.length; i++) {
      Logger.log('  ✓ ' + result.tests[i]);
    }
  } else {
    Logger.log('Error: ' + result.error);
  }
  return result;
}

/**
 * Run all tests - can be run from Apps Script editor
 */
function runAllDevTests() {
  var results = Veritas.DevTools.runAllTests();
  Logger.log('=== Smoke Test Results ===');
  Logger.log('Total: ' + results.totalTests);
  Logger.log('Passed: ' + results.passed);
  Logger.log('Failed: ' + results.failed);

  if (results.failed > 0) {
    Logger.log('\nErrors:');
    for (var i = 0; i < results.errors.length; i++) {
      Logger.log('  ✗ ' + results.errors[i]);
    }
  }

  Logger.log('\nDetailed Results:');
  for (var i = 0; i < results.details.length; i++) {
    var detail = results.details[i];
    var symbol = detail.status === 'PASSED' ? '✓' : '✗';
    Logger.log('  ' + symbol + ' ' + detail.test + ': ' + detail.status);
    if (detail.error) {
      Logger.log('    Error: ' + detail.error);
    }
  }

  return results;
}

// =============================================================================
// SECURITY HELPERS - Firebase Configuration Management
// =============================================================================

/**
 * SECURITY HELPER: Set Firebase configuration in Script Properties (recommended for production)
 * This stores sensitive Firebase credentials securely instead of hardcoding them in source code
 *
 * @param {Object} config - Firebase configuration object with keys:
 *   - apiKey: Firebase API key
 *   - authDomain: Firebase auth domain
 *   - databaseURL: Firebase Realtime Database URL
 *   - projectId: Firebase project ID
 *   - storageBucket: Firebase storage bucket
 *   - messagingSenderId: Firebase messaging sender ID
 *   - appId: Firebase app ID
 * @returns {Object} Success status and message
 *
 * @example
 * // Call this once to set up Firebase config securely:
 * Veritas.DevTools.setFirebaseConfig({
 *   apiKey: "your-api-key-here",
 *   authDomain: "your-project.firebaseapp.com",
 *   databaseURL: "https://your-project.firebaseio.com",
 *   projectId: "your-project",
 *   storageBucket: "your-project.appspot.com",
 *   messagingSenderId: "123456789",
 *   appId: "1:123456789:web:abcdef"
 * });
 */
Veritas.DevTools.setFirebaseConfig = function(config) {
  if (!config || typeof config !== 'object') {
    return { success: false, error: 'Config must be an object' };
  }

  // Validate required fields
  var requiredFields = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];
  for (var i = 0; i < requiredFields.length; i++) {
    var field = requiredFields[i];
    if (!config[field]) {
      return { success: false, error: 'Missing required field: ' + field };
    }
  }

  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('FIREBASE_CONFIG', JSON.stringify(config));

    // Clear cached config to force reload
    if (Veritas.Config._firebaseConfigCache) {
      delete Veritas.Config._firebaseConfigCache;
    }

    return {
      success: true,
      message: 'Firebase config stored securely in Script Properties',
      note: 'Hardcoded fallback config still exists for backwards compatibility but will not be used'
    };
  } catch (e) {
    return { success: false, error: 'Failed to store config: ' + e.message };
  }
};

/**
 * SECURITY HELPER: Remove Firebase configuration from Script Properties
 * This will cause the system to fall back to the default config
 *
 * @returns {Object} Success status and message
 */
Veritas.DevTools.clearFirebaseConfig = function() {
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('FIREBASE_CONFIG');

    // Clear cached config
    if (Veritas.Config._firebaseConfigCache) {
      delete Veritas.Config._firebaseConfigCache;
    }

    return {
      success: true,
      message: 'Firebase config removed from Script Properties (will use fallback config)'
    };
  } catch (e) {
    return { success: false, error: 'Failed to clear config: ' + e.message };
  }
};

/**
 * SECURITY HELPER: Check which Firebase config is currently in use
 *
 * @returns {Object} Information about current Firebase configuration source
 */
Veritas.DevTools.checkFirebaseConfig = function() {
  var props = PropertiesService.getScriptProperties();
  var configJson = props.getProperty('FIREBASE_CONFIG');

  if (configJson) {
    try {
      var config = JSON.parse(configJson);
      return {
        source: 'Script Properties (SECURE)',
        projectId: config.projectId || 'unknown',
        hasApiKey: !!config.apiKey,
        apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'none'
      };
    } catch (e) {
      return {
        source: 'Script Properties (ERROR - invalid JSON)',
        error: e.message
      };
    }
  } else {
    return {
      source: 'Hardcoded fallback (INSECURE - should migrate)',
      recommendation: 'Call Veritas.DevTools.setFirebaseConfig() to store credentials securely'
    };
  }
};
