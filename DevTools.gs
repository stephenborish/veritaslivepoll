// =============================================================================
// VERITAS LIVE POLL - DEVELOPMENT TOOLS
// =============================================================================
// Purpose: Smoke tests, development utilities, and debugging helpers
// Dependencies: All modules
// =============================================================================

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
    errors: []
  };

  // Tests will be added during the refactor validation phase
  Veritas.Logging.info('Running smoke tests', results);

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

// Additional test functions to be added in future phases:
// - test_LivePollWorkflow
// - test_SecureAssessmentWorkflow
// - test_ProctorStateMachine
// etc.
