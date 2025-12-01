// =============================================================================
// VERITAS LIVE POLL - CONFIGURATION MODULE
// =============================================================================
// Purpose: All configuration constants and defaults
// Dependencies: None
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.Config = Veritas.Config || {};

// --- TEACHER AUTHENTICATION ---
Veritas.Config.TEACHER_EMAIL = "sborish@malvernprep.org";
Veritas.Config.ADDITIONAL_TEACHER_PROP_KEY = 'TEACHER_EMAILS';

// --- STUDENT TOKEN MANAGEMENT ---
Veritas.Config.TOKEN_EXPIRY_DAYS = 30; // Tokens valid for 30 days
Veritas.Config.STUDENT_TOKEN_MAP_KEY = 'STUDENT_TOKENS';
Veritas.Config.STUDENT_TOKEN_INDEX_KEY = 'STUDENT_TOKEN_INDEX';

// --- CACHING ---
Veritas.Config.CLASS_LINKS_CACHE_PREFIX = 'CLASS_LINKS_';

// --- PROCTORING ---
Veritas.Config.PROCTOR_VIOLATION_CODES = {
  LOCKED: 'VIOLATION_LOCKED',
  TEACHER_BLOCK: 'VIOLATION_TEACHER_BLOCK'
};

Veritas.Config.PROCTOR_VIOLATION_VALUES = Object.values(Veritas.Config.PROCTOR_VIOLATION_CODES);

Veritas.Config.PROCTOR_STATUS_VALUES = ['OK', 'LOCKED', 'AWAITING_FULLSCREEN', 'BLOCKED'];

// --- SESSION TYPES ---
Veritas.Config.SESSION_TYPES = {
  LIVE: 'LIVE_POLL',
  SECURE: 'SECURE_ASSESSMENT',
  LEGACY_SECURE: 'INDIVIDUAL_TIMED'
};

Veritas.Config.SECURE_SESSION_PHASE = 'SECURE_ASSESSMENT';

Veritas.Config.DEFAULT_SECURE_PROCTORING_RULES = [
  'Fullscreen required for the entire assessment',
  'No tab switching or window switching',
  'Session monitored in Mission Control'
];

// --- INDIVIDUAL SESSION SHEET COLUMN INDICES ---
Veritas.Config.INDIVIDUAL_SESSION_COLUMNS = {
  POLL_ID: 1,
  SESSION_ID: 2,
  STUDENT_EMAIL: 3,
  STUDENT_DISPLAY_NAME: 4,
  START_TIME: 5,
  END_TIME: 6,
  QUESTION_ORDER: 7,
  QUESTION_ORDER_SEED: 8,
  CURRENT_QUESTION_INDEX: 9,
  IS_LOCKED: 10,
  VIOLATION_CODE: 11,
  ANSWER_ORDERS: 12,
  ANSWER_CHOICE_MAP: 13,
  TIME_ADJUSTMENT_MINUTES: 14,
  PAUSE_DURATION_MS: 15,
  LAST_HEARTBEAT_MS: 16,
  CONNECTION_HEALTH: 17,
  PROCTOR_STATUS: 18,
  ADDITIONAL_METADATA_JSON: 19
};

Veritas.Config.INDIVIDUAL_SESSION_COLUMN_COUNT =
  Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ADDITIONAL_METADATA_JSON;

// --- DRIVE FOLDER ---
Veritas.Config.ALLOWED_FOLDER_ID = '1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi';

// --- SHEET NAMES ---
Veritas.Config.SHEET_NAMES = {
  CLASSES: 'Classes',
  ROSTERS: 'Rosters',
  POLLS: 'Polls',
  RESPONSES: 'Responses',
  LIVE_STATUS: 'LiveStatus',
  INDIVIDUAL_TIMED_SESSIONS: 'IndividualTimedSessions',
  PROCTOR_STATE: 'ProctorState',
  ASSESSMENT_EVENTS: 'AssessmentEvents',
  ASSESSMENT_ANALYTICS: 'AssessmentAnalytics',
  LOGS: 'Logs'
};

// --- SHEET HEADER DEFINITIONS ---
Veritas.Config.SHEET_HEADERS = {
  CLASSES: ['ClassName', 'Description'],
  ROSTERS: ['ClassName', 'StudentName', 'StudentEmail'],
  POLLS: [
    'PollID', 'PollName', 'ClassName', 'QuestionIndex', 'QuestionDataJSON',
    'CreatedAt', 'UpdatedAt', 'SessionType', 'TimeLimitMinutes', 'AccessCode',
    'AvailableFrom', 'DueBy', 'MissionControlState', 'SecureSettingsJSON'
  ],
  LIVE_STATUS: ['ActivePollID', 'ActiveQuestionIndex', 'PollStatus'],
  RESPONSES: [
    'ResponseID', 'Timestamp', 'PollID', 'QuestionIndex', 'StudentEmail',
    'Answer', 'IsCorrect', 'ConfidenceLevel'
  ],
  INDIVIDUAL_TIMED_SESSIONS: [
    'PollID', 'SessionID', 'StudentEmail', 'StudentDisplayName', 'StartTime',
    'EndTime', 'QuestionOrder', 'QuestionOrderSeed', 'CurrentQuestionIndex',
    'IsLocked', 'ViolationCode', 'AnswerOrders', 'AnswerChoiceMap',
    'TimeAdjustmentMinutes', 'PauseDurationMs', 'LastHeartbeatMs',
    'ConnectionHealth', 'ProctorStatus', 'AdditionalMetadataJSON'
  ],
  PROCTOR_STATE: [
    'PollID', 'StudentEmail', 'Status', 'LockVersion', 'LockReason',
    'LockedAt', 'UnlockApproved', 'UnlockApprovedBy', 'UnlockApprovedAt', 'SessionId'
  ],
  ASSESSMENT_EVENTS: [
    'EventID', 'Timestamp', 'PollID', 'SessionID', 'StudentEmail', 'EventType', 'EventPayloadJSON'
  ],
  ASSESSMENT_ANALYTICS: [
    'PollID', 'ComputedAt', 'MetricType', 'MetricName', 'MetricValue', 'DetailsJSON'
  ]
};

// --- SCRIPT PROPERTY KEYS ---
Veritas.Config.PROPERTY_KEYS = {
  SESSION_METADATA: 'SESSION_METADATA',
  STATE_VERSION_HISTORY: 'STATE_VERSION_HISTORY',
  CONNECTION_HEARTBEATS: 'CONNECTION_HEARTBEATS',
  ADDITIONAL_TEACHERS: 'TEACHER_EMAILS',
  STUDENT_TOKENS: 'STUDENT_TOKENS',
  STUDENT_TOKEN_INDEX: 'STUDENT_TOKEN_INDEX'
};

/**
 * Get the script's timezone for date formatting
 * @returns {string} Timezone identifier
 */
Veritas.Config.getTimeZone = function() {
  return Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Etc/GMT';
};
