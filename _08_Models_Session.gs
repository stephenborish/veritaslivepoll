// =============================================================================
// VERITAS LIVE POLL - MODELS: SESSION MODULE (STUB)
// =============================================================================
// Purpose: Live session control, secure assessments, proctoring, timing
// Dependencies: Config, Logging, DataAccess, Utils, Models.Poll
// =============================================================================
// NOTE: This is a stub implementation showing the architecture pattern.
// Full extraction from Code.gs to be completed in Phase 2C continuation.
// Currently, functions delegate to Code.gs implementations for backward compatibility.
// =============================================================================

Veritas.Models = Veritas.Models || {};
Veritas.Models.Session = {};

// =============================================================================
// LIVE POLL SESSION CONTROL
// =============================================================================
// Functions: startPoll, nextQuestion, previousQuestion, stopPoll, resumePoll,
// closePoll, resetLiveQuestion, revealResultsToStudents, hideResultsFromStudents
//
// TODO Phase 2C-continuation: Extract these functions from Code.gs (lines 2239-3603)
// =============================================================================

// =============================================================================
// SECURE ASSESSMENT SESSION CONTROL
// =============================================================================
// Functions: startIndividualTimedSession, endIndividualTimedSession,
// beginIndividualTimedAttempt, getIndividualTimedSessionState,
// getIndividualTimedQuestion, submitIndividualTimedAnswer
//
// TODO Phase 2C-continuation: Extract these functions from Code.gs (lines 2269-6792)
// =============================================================================

// =============================================================================
// TIMING & ADJUSTMENTS
// =============================================================================
// Functions: adjustSecureAssessmentTime, adjustSecureAssessmentTimeBulk,
// adjustSecureAssessmentTimeForAll, pauseSecureAssessmentStudent,
// resumeSecureAssessmentStudent
//
// TODO Phase 2C-continuation: Extract these functions from Code.gs (lines 2826-3603)
// =============================================================================

// =============================================================================
// PROCTORING (ATOMIC STATE MACHINE)
// =============================================================================
// Functions: ProctorAccess.getState, ProctorAccess.getStatesBatch,
// ProctorAccess.setState, reportStudentViolation, teacherApproveUnlock,
// studentConfirmFullscreen, teacherBlockStudent, teacherUnblockStudent
//
// CRITICAL: Preserve atomic operation patterns (lockVersion tracking)
// TODO Phase 2C-continuation: Extract ProctorAccess and functions from Code.gs (lines 1012-4194)
// =============================================================================

// =============================================================================
// SESSION HELPERS
// =============================================================================

/**
 * Compute secure timing state with adjustments and pauses
 * @param {Object} studentState - Student state from IndividualTimedSessions sheet
 * @param {Object} poll - Poll object
 * @param {Object} metadata - Session metadata
 * @returns {Object} Timing state {allowedMs, elapsedMs, remainingMs, timeLimitMinutes, adjustmentMinutes}
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
 * @param {Object} poll - Poll object
 * @param {string} sessionId - Session ID
 * @returns {Object} Lobby state
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
 * @param {Object} heartbeatInfo - Heartbeat information
 * @returns {Object} Connection metadata {status, heartbeatLagMs, lastHeartbeatAt}
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
 * @param {Object} payload - Base payload
 * @param {Object} connectionMeta - Connection metadata
 * @returns {Object} Enriched payload
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
 * @param {string} className - Class name
 * @param {string} studentEmail - Student email
 * @returns {string} Display name
 */
Veritas.Models.Session.lookupStudentDisplayName = function(className, studentEmail) {
  if (!className || !studentEmail) {
    return '';
  }
  var roster = DataAccess.roster.getByClass(className) || [];
  var normalizedEmail = studentEmail.toString().trim().toLowerCase();
  var match = roster.find(function(entry) { return (entry.email || '').toLowerCase() === normalizedEmail; });
  if (!match) {
    return (studentEmail.split('@')[0] || '').trim();
  }
  var parts = Veritas.Utils.extractStudentNameParts(match.name || '');
  return parts.displayName || parts.trimmed || match.name || '';
};

// =============================================================================
// LEGACY COMPATIBILITY - Helpers
// =============================================================================

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

// =============================================================================
// NOTE: Full session control functions (startPoll, etc.) remain in Code.gs
// for now. They will be extracted in Phase 2C continuation.
// This stub demonstrates the architecture pattern and provides helper functions.
// =============================================================================
