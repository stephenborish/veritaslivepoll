// =============================================================================
// VERITAS LIVE POLL - SERVER-SIDE CODE (2025 MODERNIZED)
// =============================================================================

// --- CONFIGURATION ---
const TEACHER_EMAIL = "sborish@malvernprep.org";
const ADDITIONAL_TEACHER_PROP_KEY = 'TEACHER_EMAILS';
const TOKEN_EXPIRY_DAYS = 30; // Tokens valid for 30 days
const STUDENT_TOKEN_MAP_KEY = 'STUDENT_TOKENS';
const STUDENT_TOKEN_INDEX_KEY = 'STUDENT_TOKEN_INDEX';
const CLASS_LINKS_CACHE_PREFIX = 'CLASS_LINKS_';
const PROCTOR_VIOLATION_CODES = {
  LOCKED: 'VIOLATION_LOCKED',
  TEACHER_BLOCK: 'VIOLATION_TEACHER_BLOCK'
};
const PROCTOR_VIOLATION_VALUES = Object.values(PROCTOR_VIOLATION_CODES);
const PROCTOR_STATUS_VALUES = ['OK', 'LOCKED', 'AWAITING_FULLSCREEN', 'BLOCKED'];


// --- ENHANCED LOGGING (2025 Standard) ---
const Logger = {
  log: (message, data = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      message: message,
      data: data,
      user: Session.getActiveUser().getEmail()
    }));
  },
  error: (message, error) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      message: message,
      error: error.toString(),
      stack: error.stack || '',
      user: Session.getActiveUser().getEmail()
    }));
  }
};

// --- ERROR HANDLING WRAPPER ---
function withErrorHandling(fn) {
  return function(...args) {
    try {
      return fn.apply(this, args);
    } catch (e) {
      Logger.error(`Error in ${fn.name}`, e);
      throw new Error(`${fn.name} failed: ${e.message}`);
    }
  };
}

// --- ADVANCED CACHE MANAGER (2025 Pattern) ---
const CacheManager = {
  CACHE_TIMES: {
    INSTANT: 1,      // 1 second for real-time live data
    SHORT: 5,        // 5 seconds for live data
    MEDIUM: 60,      // 1 minute for semi-static
    LONG: 600,       // 10 minutes for static
    VERY_LONG: 21600 // 6 hours for rarely changing
  },
  
  get: function(key, fetchFunction, duration = this.CACHE_TIMES.MEDIUM) {
    const cache = CacheService.getScriptCache();
    let cached = cache.get(key);
    
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        Logger.error('Cache parse error', e);
      }
    }
    
    const fresh = fetchFunction();
    try {
      cache.put(key, JSON.stringify(fresh), duration);
    } catch (e) {
      Logger.error('Cache put error', e);
    }
    return fresh;
  },
  
  invalidate: function(keys) {
    const cache = CacheService.getScriptCache();
    if (Array.isArray(keys)) {
      cache.removeAll(keys);
    } else {
      cache.remove(keys);
    }
  }
};

// --- RATE LIMITER (2025 Security) ---
const RateLimiter = {
  check: function(key, maxAttempts = 10, windowSeconds = 60) {
    const cache = CacheService.getUserCache();
    const attempts = parseInt(cache.get(key) || '0');
    
    if (attempts >= maxAttempts) {
      throw new Error('Rate limit exceeded. Please wait before trying again.');
    }
    
    cache.put(key, (attempts + 1).toString(), windowSeconds);
    return true;
  }
};

// --- TOKEN MANAGER (2025 Anonymous Authentication) ---
const TokenManager = {
  _loadStructures: function() {
    const props = PropertiesService.getScriptProperties();
    return {
      props: props,
      tokenMap: JSON.parse(props.getProperty(STUDENT_TOKEN_MAP_KEY) || '{}'),
      indexMap: JSON.parse(props.getProperty(STUDENT_TOKEN_INDEX_KEY) || '{}')
    };
  },

  _saveStructures: function(struct) {
    struct.props.setProperty(STUDENT_TOKEN_MAP_KEY, JSON.stringify(struct.tokenMap));
    struct.props.setProperty(STUDENT_TOKEN_INDEX_KEY, JSON.stringify(struct.indexMap));
  },

  _studentKey: function(email, className) {
    return `${(email || '').toLowerCase()}::${className || ''}`;
  },

  _removeToken: function(struct, token) {
    if (!token) return;
    const entry = struct.tokenMap[token];
    if (entry && entry.studentKey && struct.indexMap[entry.studentKey] === token) {
      delete struct.indexMap[entry.studentKey];
    } else {
      Object.keys(struct.indexMap).forEach(function(key) {
        if (struct.indexMap[key] === token) {
          delete struct.indexMap[key];
        }
      });
    }
    delete struct.tokenMap[token];
  },

  _purgeExpired: function(struct) {
    const now = Date.now();
    let mutated = false;
    Object.keys(struct.tokenMap).forEach(token => {
      const entry = struct.tokenMap[token];
      if (!entry || now > entry.expires) {
        this._removeToken(struct, token);
        mutated = true;
      }
    });
    return mutated;
  },

  /**
   * Generate a unique token for a student
   */
  generateToken: function(studentEmail, className) {
    const struct = this._loadStructures();
    this._purgeExpired(struct);

    const studentKey = this._studentKey(studentEmail, className);
    const existingToken = struct.indexMap[studentKey];
    if (existingToken) {
      this._removeToken(struct, existingToken);
    }

    const token = Utilities.getUuid();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + TOKEN_EXPIRY_DAYS);

    struct.indexMap[studentKey] = token;
    struct.tokenMap[token] = {
      email: studentEmail,
      className: className,
      created: Date.now(),
      expires: expiryDate.getTime(),
      studentKey: studentKey
    };

    this._saveStructures(struct);
    Logger.log('Token generated', { email: studentEmail, token: token });

    return token;
  },

  /**
   * Validate and retrieve student info from token
   */
  validateToken: function(token) {
    if (!token) return null;

    const struct = this._loadStructures();
    let mutated = this._purgeExpired(struct);

    let tokenData = struct.tokenMap[token] || null;
    if (tokenData && !tokenData.studentKey) {
      tokenData.studentKey = this._studentKey(tokenData.email, tokenData.className);
      struct.tokenMap[token] = tokenData;
      if (!struct.indexMap[tokenData.studentKey]) {
        struct.indexMap[tokenData.studentKey] = token;
      }
      mutated = true;
    }

    if (mutated) {
      this._saveStructures(struct);
    }

    return tokenData;
  },

  /**
   * Get student email from token
   */
  getStudentEmail: function(token) {
    const tokenData = this.validateToken(token);
    return tokenData ? tokenData.email : null;
  },

  /**
   * Store token in user properties (for current session)
   */
  setSessionToken: function(token) {
    const userProps = PropertiesService.getUserProperties();
    userProps.setProperty('CURRENT_TOKEN', token);
  },

  /**
   * Get token from current session
   */
  getSessionToken: function() {
    const userProps = PropertiesService.getUserProperties();
    return userProps.getProperty('CURRENT_TOKEN');
  },

  /**
   * Clear session token
   */
  clearSessionToken: function() {
    const userProps = PropertiesService.getUserProperties();
    userProps.deleteProperty('CURRENT_TOKEN');
  },

  /**
   * Get student email from current session (either token or Google auth)
   */
  getCurrentStudentEmail: function() {
    const token = this.getSessionToken();
    if (token) {
      const email = this.getStudentEmail(token);
      if (email) return email;
    }

    try {
      const email = Session.getActiveUser().getEmail();
      if (email && email !== '') return email;
    } catch (e) {
      Logger.log('No active user session');
    }

    return null;
  },

  /**
   * Snapshot tokens for quick lookup by student
   */
  getActiveSnapshot: function() {
    const struct = this._loadStructures();
    let mutated = this._purgeExpired(struct);
    Object.keys(struct.tokenMap).forEach(token => {
      const entry = struct.tokenMap[token];
      if (!entry) return;
      if (!entry.studentKey) {
        entry.studentKey = this._studentKey(entry.email, entry.className);
        struct.tokenMap[token] = entry;
        mutated = true;
      }
      if (entry.studentKey && struct.indexMap[entry.studentKey] !== token) {
        struct.indexMap[entry.studentKey] = token;
        mutated = true;
      }
    });
    if (mutated) {
      this._saveStructures(struct);
    }
    return {
      tokenMap: struct.tokenMap,
      indexMap: struct.indexMap
    };
  },

  getTokenFromSnapshot: function(snapshot, email, className) {
    if (!snapshot) return null;
    const key = this._studentKey(email, className);
    const token = snapshot.indexMap[key];
    if (!token) return null;
    const data = snapshot.tokenMap[token];
    if (!data) return null;
    return { token: token, data: data };
  },

  recordShortUrl: function(token, shortUrl) {
    if (!token || !shortUrl) return;
    const struct = this._loadStructures();
    if (struct.tokenMap[token]) {
      struct.tokenMap[token].shortUrl = shortUrl;
      this._saveStructures(struct);
    }
  }
};

// --- TEACHER EMAIL HELPERS ---
let teacherEmailSetCache = null;

function getTeacherEmailSet_() {
  if (teacherEmailSetCache) {
    return teacherEmailSetCache;
  }

  const normalized = new Set();
  normalized.add(TEACHER_EMAIL.toLowerCase());

  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const extrasRaw = scriptProps.getProperty(ADDITIONAL_TEACHER_PROP_KEY) || '';
    if (extrasRaw) {
      extrasRaw
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(email => email)
        .forEach(email => normalized.add(email));
    }
  } catch (e) {
    Logger.error('Failed to load additional teacher emails', e);
  }

  teacherEmailSetCache = normalized;
  return teacherEmailSetCache;
}

function isTeacherEmail_(email) {
  if (!email) return false;
  return getTeacherEmailSet_().has(email.trim().toLowerCase());
}

function getCanonicalTeacherEmail_() {
  const teacherSet = getTeacherEmailSet_();
  for (const email of teacherSet) {
    return email;
  }
  return TEACHER_EMAIL.toLowerCase();
}

function escapeHtml_(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, function(chr) {
    switch (chr) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return chr;
    }
  });
}

function buildQueryString_(params) {
  return Object.keys(params)
    .filter(function(key) {
      const value = params[key];
      return value !== undefined && value !== null && value !== '';
    })
    .map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    })
    .join('&');
}

function buildTeacherAccountChooserUrl_(e, loginHintEmail) {
  if (!loginHintEmail) {
    return null;
  }

  const baseUrl = ScriptApp.getService().getUrl();
  const params = Object.assign({}, (e && e.parameter) || {});
  params.teacherAuthAttempted = '1';
  const queryString = buildQueryString_(params);
  const continueUrl = baseUrl + (queryString ? '?' + queryString : '');

  return 'https://accounts.google.com/AccountChooser?continue=' +
    encodeURIComponent(continueUrl) +
    '&Email=' + encodeURIComponent(loginHintEmail) +
    '&prompt=select_account';
}

function maybeRedirectForTeacherAccount_(e, currentUserEmail) {
  const params = (e && e.parameter) || {};
  if (params.fn === 'image') {
    return null;
  }

  const loginHintEmail = getCanonicalTeacherEmail_();
  if (!loginHintEmail) {
    return null;
  }

  const accountChooserUrl = buildTeacherAccountChooserUrl_(e, loginHintEmail);
  const sanitizedAccountChooserUrl = accountChooserUrl ? escapeHtml_(accountChooserUrl) : '';
  const safeUserEmail = currentUserEmail ? escapeHtml_(currentUserEmail) : 'your current Google account';

  const teacherCta = sanitizedAccountChooserUrl
    ? '<p style="margin-bottom:24px;">If you are the Veritas teacher, please <a style="color:#0b5fff;font-weight:600;text-decoration:none;" rel="noopener" target="_blank" href="' + sanitizedAccountChooserUrl + '">switch to your authorized teacher account</a>.</p>'
    : '';

  return HtmlService.createHtmlOutput(
    '<div style="font-family:Roboto,Arial,sans-serif;padding:48px;text-align:center;background:#f4f6fb;min-height:100vh;box-sizing:border-box;">' +
      '<h1 style="color:#12355b;margin-bottom:16px;">Teacher access required</h1>' +
      '<p style="color:#40526b;font-size:16px;margin-bottom:16px;">The account <strong>' + safeUserEmail + '</strong> is not authorized for the teacher dashboard.</p>' +
      teacherCta +
      '<p style="color:#40526b;font-size:16px;margin-bottom:24px;">Students should open the personalized poll link that was emailed to them. Those links include a secure token that grants access to the student experience.</p>' +
      '<p style="color:#70819b;font-size:14px;">If you believe you should have teacher access, contact the Veritas administrator to have your email added to the authorized list.</p>' +
    '</div>'
  ).setTitle('Veritas Live Poll - Access Restricted');
}

// --- URL SHORTENER UTILITY ---
const URLShortener = {
  /**
   * Shorten a URL using TinyURL API
   * Falls back to original URL if shortening fails
   */
  shorten: function(longUrl) {
    try {
      const apiUrl = 'https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl);
      const response = UrlFetchApp.fetch(apiUrl, {
        muteHttpExceptions: true,
        followRedirects: true
      });

      if (response.getResponseCode() === 200) {
        const shortUrl = response.getContentText().trim();
        if (shortUrl && shortUrl.startsWith('http')) {
          Logger.log('URL shortened successfully', { original: longUrl, shortened: shortUrl });
          return shortUrl;
        }
      }

      Logger.log('URL shortening failed, using original URL', { url: longUrl });
      return longUrl;
    } catch (e) {
      Logger.error('Error shortening URL, using original', e);
      return longUrl;
    }
  }
};

// --- DATA ACCESS LAYER (Database-Style Queries) ---
const DataAccess = {
  responses: {
    getByPoll: function(pollId) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("Responses");
      const values = getDataRangeValues_(sheet);
      return values.filter(r => r[2] === pollId);
    },
    
    getByPollAndQuestion: function(pollId, questionIndex) {
      return this.getByPoll(pollId).filter(r => r[3] === questionIndex);
    },
    
    getStudentStatus: function(pollId, studentEmail) {
      return this.getByPoll(pollId).filter(r => r[4] === studentEmail);
    },
    
    isLocked: function(pollId, studentEmail) {
      return this.getStudentStatus(pollId, studentEmail)
        .some(r => PROCTOR_VIOLATION_VALUES.indexOf(r[5]) !== -1);
    },
    
    hasAnswered: function(pollId, questionIndex, studentEmail) {
      return this.getByPollAndQuestion(pollId, questionIndex)
        .some(r => r[4] === studentEmail);
    },
    
    add: function(responseData) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("Responses");
      sheet.appendRow(responseData);
    }
  },
  
  polls: {
    getById: function(pollId) {
      return getPolls_().find(p => p.pollId === pollId);
    },
    
    getByClass: function(className) {
      return getPolls_().filter(p => p.className === className);
    },
    
    getAll: function() {
      return getPolls_();
    }
  },
  
  roster: {
    getByClass: function(className) {
      return getRoster_(className);
    },
    
    isEnrolled: function(className, email) {
      return this.getByClass(className).some(s => s.email === email);
    }
  },
  
  liveStatus: {
    METADATA_KEY: 'LIVE_POLL_METADATA',

    get: function() {
      const statusValues = CacheManager.get('LIVE_POLL_STATUS', () => {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const liveSheet = ss.getSheetByName("LiveStatus");
        return liveSheet.getRange("A2:C2").getValues()[0];
      }, CacheManager.CACHE_TIMES.INSTANT);

      const metadata = this.getMetadata_();
      if (Array.isArray(statusValues)) {
        statusValues.metadata = metadata;
      } else if (statusValues && statusValues.statusData && Array.isArray(statusValues.statusData)) {
        statusValues.statusData.metadata = metadata;
        return statusValues.statusData;
      }
      return statusValues;
    },

    set: function(pollId, questionIndex, status, metadata = {}) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const liveSheet = ss.getSheetByName("LiveStatus");
      const statusData = [pollId, questionIndex, status];
      liveSheet.getRange("A2:C2").setValues([statusData]);

      const sessionPhase = (metadata && metadata.sessionPhase)
        ? metadata.sessionPhase
        : (status === 'OPEN'
            ? 'LIVE'
            : status === 'PAUSED'
              ? 'PAUSED'
              : (questionIndex < 0 ? 'PRE_LIVE' : 'ENDED'));

      const enrichedMetadata = { ...metadata, sessionPhase };
      if (typeof enrichedMetadata.isCollecting !== 'boolean') {
        enrichedMetadata.isCollecting = (status === 'OPEN');
      }
      if (!enrichedMetadata.resultsVisibility) {
        enrichedMetadata.resultsVisibility = 'HIDDEN';
      }
      if (sessionPhase !== 'ENDED' && enrichedMetadata.endedAt === undefined) {
        // Ensure endedAt is cleared when resuming or before completion
        enrichedMetadata.endedAt = null;
      }

      // Persist metadata for downstream consumers (students/teacher views)
      this.setMetadata_(enrichedMetadata);

      // Atomically update cache - put() overwrites existing entry without race condition
      const cache = CacheService.getScriptCache();
      cache.put('LIVE_POLL_STATUS', JSON.stringify(statusData), CacheManager.CACHE_TIMES.INSTANT);

      const reason = (enrichedMetadata && enrichedMetadata.reason) ? enrichedMetadata.reason : `STATUS_${status}`;
      StateVersionManager.bump({
        pollId: pollId || '',
        questionIndex: typeof questionIndex === 'number' ? questionIndex : -1,
        status: sessionPhase,
        reason: reason,
        metadata: enrichedMetadata,
        timerRemainingSeconds: (enrichedMetadata && typeof enrichedMetadata.timerRemainingSeconds === 'number')
          ? enrichedMetadata.timerRemainingSeconds
          : null
      });
    },

    getMetadata: function() {
      return this.getMetadata_();
    },

    setMetadata_: function(metadata) {
      const props = PropertiesService.getScriptProperties();
      if (metadata && Object.keys(metadata).length > 0) {
        props.setProperty(this.METADATA_KEY, JSON.stringify(metadata));
      } else {
        props.deleteProperty(this.METADATA_KEY);
      }
    },

    getMetadata_: function() {
      const props = PropertiesService.getScriptProperties();
      const metadataStr = props.getProperty(this.METADATA_KEY);
      if (!metadataStr) return {};
      try {
        return JSON.parse(metadataStr);
      } catch (err) {
        Logger.error('Failed to parse live poll metadata', err);
        return {};
      }
    }
  },

  individualSessionState: {
    getByStudent: function(pollId, sessionId, studentEmail) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("IndividualSessionState");
      if (!sheet) return null;

      const values = getDataRangeValues_(sheet);
      const row = values.find(r => r[0] === pollId && r[1] === sessionId && r[2] === studentEmail);

      if (!row) return null;

      return {
        pollId: row[0],
        sessionId: row[1],
        studentEmail: row[2],
        startTime: row[3],
        endTime: row[4],
        currentQuestionIndex: typeof row[5] === 'number' ? row[5] : parseInt(row[5], 10) || 0,
        questionOrder: JSON.parse(row[6] || '[]'),
        isLocked: row[7] === true || row[7] === 'TRUE' || row[7] === 'true'
      };
    },

    getBySession: function(pollId, sessionId) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("IndividualSessionState");
      if (!sheet) return [];

      const values = getDataRangeValues_(sheet);
      return values
        .filter(r => r[0] === pollId && r[1] === sessionId)
        .map(row => ({
          pollId: row[0],
          sessionId: row[1],
          studentEmail: row[2],
          startTime: row[3],
          endTime: row[4],
          currentQuestionIndex: typeof row[5] === 'number' ? row[5] : parseInt(row[5], 10) || 0,
          questionOrder: JSON.parse(row[6] || '[]'),
          isLocked: row[7] === true || row[7] === 'TRUE' || row[7] === 'true'
        }));
    },

    initStudent: function(pollId, sessionId, studentEmail, questionOrder) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("IndividualSessionState");
      if (!sheet) {
        throw new Error('IndividualSessionState sheet not found. Run setupSheet() first.');
      }

      // Check if student already has state for this session
      const existing = this.getByStudent(pollId, sessionId, studentEmail);
      if (existing) {
        return existing;
      }

      const startTime = new Date().toISOString();
      const rowData = [
        pollId,
        sessionId,
        studentEmail,
        startTime,
        null, // endTime
        0, // currentQuestionIndex
        JSON.stringify(questionOrder),
        false // isLocked
      ];

      sheet.appendRow(rowData);
      Logger.log('Individual session state initialized', { pollId, sessionId, studentEmail });

      return {
        pollId: pollId,
        sessionId: sessionId,
        studentEmail: studentEmail,
        startTime: startTime,
        endTime: null,
        currentQuestionIndex: 0,
        questionOrder: questionOrder,
        isLocked: false
      };
    },

    updateProgress: function(pollId, sessionId, studentEmail, currentQuestionIndex) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("IndividualSessionState");
      if (!sheet) {
        throw new Error('IndividualSessionState sheet not found.');
      }

      const values = getDataRangeValues_(sheet);
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === pollId && values[i][1] === sessionId && values[i][2] === studentEmail) {
          const rowIndex = i + 2; // +2 for header row and 1-indexing
          sheet.getRange(rowIndex, 6).setValue(currentQuestionIndex);
          Logger.log('Progress updated', { pollId, sessionId, studentEmail, currentQuestionIndex });
          return true;
        }
      }

      return false;
    },

    lockStudent: function(pollId, sessionId, studentEmail) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("IndividualSessionState");
      if (!sheet) {
        throw new Error('IndividualSessionState sheet not found.');
      }

      const values = getDataRangeValues_(sheet);
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === pollId && values[i][1] === sessionId && values[i][2] === studentEmail) {
          const rowIndex = i + 2;
          const endTime = new Date().toISOString();
          sheet.getRange(rowIndex, 5).setValue(endTime); // Set endTime
          sheet.getRange(rowIndex, 8).setValue(true); // Set isLocked
          Logger.log('Student locked', { pollId, sessionId, studentEmail, endTime });
          return true;
        }
      }

      return false;
    },

    clearSession: function(pollId, sessionId) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName("IndividualSessionState");
      if (!sheet) return;

      const values = getDataRangeValues_(sheet);
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i][0] === pollId && values[i][1] === sessionId) {
          const rowIndex = i + 2;
          sheet.deleteRow(rowIndex);
        }
      }

      Logger.log('Individual session state cleared', { pollId, sessionId });
    }
  }
};

// --- LIVE STATE VERSIONING & HEARTBEAT TRACKING ---
const StateVersionManager = {
  VERSION_KEY: 'LIVE_STATE_VERSION_RECORD',
  HEARTBEAT_PREFIX: 'HEARTBEAT_',
  STALE_RECOVERY_THRESHOLD_MS: 6000,
  OUTAGE_RECOVERY_THRESHOLD_MS: 15000,

  bump: function(statePayload) {
    const props = PropertiesService.getScriptProperties();
    const previous = this._readRecord_(props);
    const version = (previous.version || 0) + 1;
    const nowIso = new Date().toISOString();

    const record = {
      version: version,
      updatedAt: nowIso,
      pollId: typeof statePayload.pollId === 'string' ? statePayload.pollId : (previous.pollId || ''),
      questionIndex: typeof statePayload.questionIndex === 'number' ? statePayload.questionIndex : (previous.questionIndex || -1),
      status: statePayload.status || statePayload.reason || previous.status || 'UNKNOWN',
      reason: statePayload.reason || 'update',
      timerRemainingSeconds: statePayload.timerRemainingSeconds !== undefined ? statePayload.timerRemainingSeconds : null,
      metadata: statePayload.metadata || {}
    };

    const recordStr = JSON.stringify(record);
    props.setProperty(this.VERSION_KEY, recordStr);

    // Mirror to cache for fast reads in high-frequency polling scenarios
    try {
      CacheService.getScriptCache().put(this.VERSION_KEY, recordStr, CacheManager.CACHE_TIMES.INSTANT);
    } catch (cacheError) {
      Logger.error('State version cache put failed', cacheError);
    }

    return record;
  },

  get: function() {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(this.VERSION_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        Logger.error('State version cache parse failed', err);
      }
    }

    const props = PropertiesService.getScriptProperties();
    return this._readRecord_(props);
  },

  _readRecord_: function(props) {
    const stored = props.getProperty(this.VERSION_KEY);
    if (!stored) {
      return {
        version: 0,
        updatedAt: null,
        pollId: '',
        questionIndex: -1,
        status: 'PRE_LIVE',
        reason: 'boot'
      };
    }

    try {
      return JSON.parse(stored);
    } catch (err) {
      Logger.error('State version parse error', err);
      return {
        version: 0,
        updatedAt: null,
        pollId: '',
        questionIndex: -1,
        status: 'PRE_LIVE',
        reason: 'boot'
      };
    }
  },

  _heartbeatKey_: function(studentEmail) {
    if (!studentEmail) return null;
    return this.HEARTBEAT_PREFIX + studentEmail.replace(/[^A-Za-z0-9]/g, '_').toLowerCase();
  },

  noteHeartbeat: function(studentEmail) {
    const key = this._heartbeatKey_(studentEmail);
    if (!key) {
      return { health: 'UNKNOWN', deltaMs: 0 };
    }

    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    let record = { lastSeen: null, previousSeen: null };

    if (cached) {
      try {
        record = JSON.parse(cached);
      } catch (err) {
        Logger.error('Heartbeat cache parse failed', err);
      }
    }

    record.previousSeen = record.lastSeen || null;
    const now = new Date();
    record.lastSeen = now.toISOString();

    try {
      cache.put(key, JSON.stringify(record), CacheManager.CACHE_TIMES.LONG);
    } catch (err) {
      Logger.error('Heartbeat cache put failed', err);
    }

    let deltaMs = 0;
    if (record.previousSeen) {
      deltaMs = now.getTime() - new Date(record.previousSeen).getTime();
    }

    let health = 'HEALTHY';
    if (deltaMs > this.OUTAGE_RECOVERY_THRESHOLD_MS) {
      health = 'RECOVERED_AFTER_OUTAGE';
    } else if (deltaMs > this.STALE_RECOVERY_THRESHOLD_MS) {
      health = 'RECOVERING';
    }

    return {
      lastSeen: record.lastSeen,
      previousSeen: record.previousSeen,
      deltaMs: deltaMs,
      health: health
    };
  }
};

// =============================================================================
// CORE APP & ROUTING
// =============================================================================

const ALLOWED_FOLDER_ID = '1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi';

function doGet(e) {
  try {
    // Check if this is an image proxy request (must be first for performance)
    const fn = (e && e.parameter && e.parameter.fn) || '';
    if (fn === 'image') {
      return serveImage_(e);
    }

    // Check for token parameter first (anonymous access)
    const token = (e && e.parameter && e.parameter.token) ? e.parameter.token : null;
    let isTeacher = false;
    let studentEmail = null;
    
    if (token) {
      // Token-based access (student with personalized link)
      const tokenData = TokenManager.validateToken(token);
      
      if (!tokenData) {
        // Invalid or expired token
        return HtmlService.createHtmlOutput(
          '<h1>Invalid or Expired Link</h1>' +
          '<p>This poll link is no longer valid. Please contact your teacher for a new link.</p>'
        ).setTitle("Veritas Live Poll - Error");
      }
      
      // Token will be passed explicitly with each RPC call
      studentEmail = tokenData.email;
      
      Logger.log('Student accessed via token', { 
        token: token, 
        studentEmail: studentEmail,
        className: tokenData.className 
      });
      
      isTeacher = false;
    } else {
      // Try Google authentication (teacher or fallback)
      try {
        const userEmail = (Session.getActiveUser().getEmail() || '').trim();
        isTeacher = isTeacherEmail_(userEmail);

        Logger.log('Resolved active user identity', {
          userEmail: userEmail || '(empty)',
          routedAsTeacher: isTeacher
        });

        if (!isTeacher) {
          const teacherRedirect = maybeRedirectForTeacherAccount_(e, userEmail || '');
          if (teacherRedirect) {
            return teacherRedirect;
          }

          if (userEmail) {
            studentEmail = userEmail;
          }
        }
      } catch (authError) {
        // No token and no Google auth - show error
        return HtmlService.createHtmlOutput(
          '<h1>Authentication Required</h1>' +
          '<p>Please use your personalized poll link or sign in with Google.</p>'
        ).setTitle("Veritas Live Poll - Error");
      }
    }

    let template;
    if (isTeacher) {
      template = HtmlService.createTemplateFromFile('TeacherView');
    } else {
      template = HtmlService.createTemplateFromFile('StudentView');
      // Pass student info to template if needed
      template.studentEmail = studentEmail;
      template.sessionToken = token || '';
    }
    
    return template.evaluate()
      .setTitle("Veritas Live Poll")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
      
  } catch (e) {
    Logger.error('doGet error', e);
    return HtmlService.createHtmlOutput(
      '<h1>Error loading application</h1><p>' + e.message + '</p>'
    ).setTitle("Veritas Live Poll - Error");
  }
}

/**
 * Serve image via proxy endpoint
 * This streams image bytes directly from Drive, avoiding ACL and rendering issues
 * with direct Drive links
 */
function serveImage_(e) {
  try {
    const id = (e.parameter && e.parameter.id) || '';

    if (!id) {
      return ContentService.createTextOutput('Missing id parameter')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Fetch file from Drive
    let file;
    try {
      file = DriveApp.getFileById(id);
    } catch (err) {
      Logger.error('File not found', { fileId: id, error: err });
      return ContentService.createTextOutput('File not found')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Validate that file is in the allowed folder
    const parents = file.getParents();
    let isAllowed = false;

    while (parents.hasNext()) {
      const parent = parents.next();
      if (parent.getId() === ALLOWED_FOLDER_ID) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      Logger.error('Forbidden file access attempt', { fileId: id });
      return ContentService.createTextOutput('Forbidden - file not in allowed folder')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Stream the image bytes with proper content type
    const blob = file.getBlob();
    const mimeType = blob.getContentType(); // e.g., image/png, image/jpeg

    Logger.log('Serving image', { fileId: id, mimeType: mimeType, size: blob.getBytes().length });

    // Return image with caching headers (5 minutes)
    return ContentService.createOutput(blob)
      .setMimeType(mimeType)
      .setHeader('Cache-Control', 'public, max-age=300');

  } catch (e) {
    Logger.error('serveImage_ error', e);
    return ContentService.createTextOutput('Error serving image: ' + e.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getPollEditorHtml(className) {
  const template = HtmlService.createTemplateFromFile('PollEditor.html');
  template.className = className || '';
  return template.evaluate().getContent();
}

function safeUiAlert(message, title) {
  try {
    const ui = SpreadsheetApp.getUi();
    if (!ui || typeof ui.alert !== 'function') {
      Logger.log('Spreadsheet UI unavailable for alert', { message, title: title || null });
      return false;
    }

    if (title) {
      ui.alert(title, message, ui.ButtonSet.OK);
    } else {
      ui.alert(message);
    }
    return true;
  } catch (err) {
    Logger.log('Spreadsheet UI alert failed', { message, title: title || null, error: err.toString() });
    return false;
  }
}

// =============================================================================
// ONE-TIME SETUP
// =============================================================================

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    if (!safeUiAlert('This script must be bound to a Google Sheet.', 'Veritas Live Poll')) {
      Logger.log('Setup aborted: active spreadsheet not available');
    }
    return;
  }
  
  const sheetNames = ["Classes", "Rosters", "Polls", "LiveStatus", "Responses", "IndividualSessionState"];
  sheetNames.forEach(name => {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });

  // Set up headers
  const classesSheet = ss.getSheetByName("Classes");
  classesSheet.getRange("A1:B1").setValues([["ClassName", "Description"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");

  const rostersSheet = ss.getSheetByName("Rosters");
  rostersSheet.getRange("A1:C1").setValues([["ClassName", "StudentName", "StudentEmail"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");

  const pollsSheet = ss.getSheetByName("Polls");
  pollsSheet.getRange("A1:I1").setValues([["PollID", "PollName", "ClassName", "QuestionIndex", "QuestionDataJSON", "CreatedAt", "UpdatedAt", "SessionType", "TimeLimitMinutes"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
  
  const liveSheet = ss.getSheetByName("LiveStatus");
  liveSheet.getRange("A1:C1").setValues([["ActivePollID", "ActiveQuestionIndex", "PollStatus"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
  DataAccess.liveStatus.set("", -1, "CLOSED", {
    sessionPhase: 'PRE_LIVE',
    startedAt: null,
    endedAt: null,
    reason: 'SETUP'
  });
  
  const responsesSheet = ss.getSheetByName("Responses");
  responsesSheet.getRange("A1:H1").setValues([["ResponseID", "Timestamp", "PollID", "QuestionIndex", "StudentEmail", "Answer", "IsCorrect", "ConfidenceLevel"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");

  const individualSessionStateSheet = ss.getSheetByName("IndividualSessionState");
  individualSessionStateSheet.getRange("A1:H1").setValues([["PollID", "SessionID", "StudentEmail", "StartTime", "EndTime", "CurrentQuestionIndex", "QuestionOrderJSON", "IsLocked"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");

  // Freeze header rows
  [classesSheet, rostersSheet, pollsSheet, liveSheet, responsesSheet, individualSessionStateSheet].forEach(sheet => {
    sheet.setFrozenRows(1);
  });
  
  if (!safeUiAlert('Sheet setup complete! All tabs configured with headers.', 'Veritas Live Poll')) {
    Logger.log('Sheet setup complete! All tabs configured with headers.');
  }
}

// =============================================================================
// GOOGLE DRIVE IMAGE FUNCTIONS
// =============================================================================

/**
 * IMAGE HANDLING ARCHITECTURE
 *
 * This system follows best practices for serving images in Google Apps Script web apps:
 *
 * 1. UPLOAD FLOW (uploadImageToDrive):
 *    - Teacher uploads via HTML file input → base64 data URL
 *    - Backend creates Drive file in dedicated folder (1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi)
 *    - Only fileId is stored in poll data (NOT URLs)
 *    - Validation: max 5MB, allowed types: jpeg/jpg/png/gif/webp
 *
 * 2. STORAGE:
 *    - Poll questions store: { questionImageFileId, options: [{ imageFileId }] }
 *    - No raw Drive URLs stored (avoids 403s and permission issues)
 *
 * 3. IMAGE PROXY (serveImage_):
 *    - All images served via: https://script.google.com/.../exec?fn=image&id=<fileId>&v=<version>
 *    - Validates file is in allowed folder (security)
 *    - Returns blob with correct MIME type
 *    - Cache headers: Cache-Control: public, max-age=300 (5 minutes)
 *
 * 4. CACHE BUSTING (normalizeQuestionObject_):
 *    - Appends &v=<pollUpdatedAt> to all image URLs
 *    - When poll is updated, version changes → browsers fetch fresh images
 *    - Prevents stale cache issues without fighting browser caching
 *
 * 5. CONSISTENT URLS:
 *    - Same URL pattern for teacher preview, live dashboard, and student view
 *    - Eliminates "teacher sees it / student doesn't" mismatches
 *    - All views use normalized question objects with proxy URLs
 *
 * WHY THIS APPROACH:
 * - Drive share URLs (uc?export=view) are unreliable in HtmlService contexts
 * - ContentService.createOutput(blob) is the canonical way to serve binary content
 * - Proxy approach removes Drive's permission/CDN quirks from the equation
 * - Widely recommended by GAS community (Reddit, Stack Overflow, expert bloggers)
 */

/**
 * Get the web app base URL for generating image proxy links
 */
function getWebAppUrl_() {
  // Get the deployed web app URL from Script Properties (set during deployment)
  const props = PropertiesService.getScriptProperties();
  let url = props.getProperty('WEB_APP_URL');

  // If not set, try to construct it (fallback)
  if (!url) {
    const scriptId = ScriptApp.getScriptId();
    url = `https://script.google.com/macros/s/${scriptId}/exec`;
    Logger.log('WEB_APP_URL not set in properties, using constructed URL', { url });
  }

  return url;
}

function getDriveFolder_() {
  const properties = PropertiesService.getScriptProperties();

  // Use hardcoded folder ID - never create, never search by name
  const HARDCODED_FOLDER_ID = '1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi';

  // Always update/set the property to match hardcoded value
  const storedId = properties.getProperty('DRIVE_FOLDER_ID');
  if (storedId !== HARDCODED_FOLDER_ID) {
    properties.setProperty('DRIVE_FOLDER_ID', HARDCODED_FOLDER_ID);
    Logger.log('Updated DRIVE_FOLDER_ID to hardcoded value', { folderId: HARDCODED_FOLDER_ID });
  }

  try {
    const folder = DriveApp.getFolderById(HARDCODED_FOLDER_ID);

    // Ensure public sharing is always set
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return folder;
  } catch (e) {
    Logger.error('Failed to access hardcoded Drive folder', e);
    throw new Error(`Cannot access Drive folder ${HARDCODED_FOLDER_ID}. Please verify folder exists and script has access.`);
  }
}

/**
 * One-time utility function to fix permissions on all existing images in the Drive folder.
 * Run this from Apps Script editor: fixAllImagePermissions()
 * This will make all existing images publicly accessible.
 */
function fixAllImagePermissions() {
  return withErrorHandling(() => {
    const folder = getDriveFolder_();
    const files = folder.getFiles();
    let count = 0;

    while (files.hasNext()) {
      const file = files.next();
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        count++;
        Logger.log('Fixed permissions for: ' + file.getName());
      } catch (e) {
        Logger.error('Failed to fix permissions for: ' + file.getName(), e);
      }
    }

    Logger.log('Fixed permissions for ' + count + ' files');
    return { success: true, filesFixed: count };
  })();
}

function uploadImageToDrive(dataUrl, fileName) {
  return withErrorHandling(() => {
    // Validate inputs
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('Invalid image data: dataUrl is missing or invalid');
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid image data: fileName is missing or invalid');
    }

    // Validate dataUrl format
    if (!dataUrl.includes(',')) {
      throw new Error('Invalid image data format: missing comma separator');
    }

    if (!dataUrl.includes(':') || !dataUrl.includes(';')) {
      throw new Error('Invalid image data format: missing mime type information');
    }

    const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
    const sizeInBytes = base64Data.length * 0.75;
    const maxSize = 5 * 1024 * 1024;

    if (sizeInBytes > maxSize) {
      throw new Error(`File "${fileName}" exceeds 5MB limit`);
    }

    const folder = getDriveFolder_();
    const mimeType = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      throw new Error(`File type "${mimeType}" not supported. Allowed types: ${allowedTypes.join(', ')}`);
    }

    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const file = folder.createFile(blob);
    const fileId = file.getId();

    // CRITICAL: Make the file publicly accessible so thumbnail URLs work
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    Logger.log('Image uploaded successfully', { fileName: fileName, fileId: fileId, size: sizeInBytes });

    // Return fileId instead of URL - URLs will be generated at render time via proxy
    return { success: true, fileId: fileId };
  })();
}

// =============================================================================
// TEACHER PANEL FUNCTIONS
// =============================================================================

function getTeacherDashboardData() {
  return withErrorHandling(() => {
    const classes = getClasses_();
    const polls = DataAccess.polls.getAll()
      .map(poll => ({
        ...poll,
        questionCount: poll.questions.length,
        createdAt: poll.createdAt || '',
        updatedAt: poll.updatedAt || ''
      }));

    polls.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    Logger.log('Dashboard data loaded', { classCount: classes.length, pollCount: polls.length });

    return {
      classes: classes,
      polls: polls
    };
  })();
}

function getPollForEditing(pollId) {
  return withErrorHandling(() => {
    if (!pollId) {
      throw new Error('Poll ID is required');
    }

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    const questions = poll.questions.map(question => ({
      questionText: question.questionText || '',
      questionImageURL: question.questionImageURL || null,
      questionImageFileId: question.questionImageFileId || null,
      options: (question.options || []).map(opt => ({
        text: opt.text || '',
        imageURL: opt.imageURL || null,
        imageFileId: opt.imageFileId || null
      })),
      correctAnswer: question.correctAnswer || null,
      timerSeconds: question.timerSeconds || null,
      metacognitionEnabled: !!question.metacognitionEnabled
    }));

    return {
      pollId: poll.pollId,
      pollName: poll.pollName,
      className: poll.className,
      createdAt: poll.createdAt || '',
      updatedAt: poll.updatedAt || '',
      questions: questions
    };
  })();
}

function getRosterManagerData() {
  return withErrorHandling(() => {
    const classes = getClasses_();
    const rosterData = {};
    classes.forEach(className => {
      rosterData[className] = getRoster_(className);
    });

    return {
      classes: classes,
      rosters: rosterData
    };
  })();
}

function createClassRecord(className, description) {
  return withErrorHandling(() => {
    if (!className || className.trim() === '') {
      throw new Error('Class name is required');
    }

    ensureClassExists_(className.trim(), description || '');
    CacheManager.invalidate('CLASSES_LIST');

    Logger.log('Class created', { className: className });

    return getRosterManagerData();
  })();
}

function saveRoster(className, rosterEntries) {
  return withErrorHandling(() => {
    if (!className || className.trim() === '') {
      throw new Error('Class name is required');
    }

    if (!Array.isArray(rosterEntries)) {
      throw new Error('Roster entries must be an array');
    }

    const cleanedEntries = rosterEntries
      .map(entry => ({
        name: (entry.name || '').toString().trim(),
        email: (entry.email || '').toString().trim()
      }))
      .filter(entry => entry.name !== '' && entry.email !== '');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rosterSheet = ss.getSheetByName('Rosters');
    if (!rosterSheet) {
      throw new Error('Rosters sheet not found');
    }

    // OPTIMIZATION: Filter and rewrite instead of row-by-row deletion
    const values = getDataRangeValues_(rosterSheet);
    const keepRows = values.filter(row => row[0] !== className);
    const newRows = cleanedEntries.map(entry => [className, entry.name, entry.email]);
    const allRows = [...keepRows, ...newRows];

    // Clear and rewrite all data
    if (values.length > 0) {
      rosterSheet.getRange(2, 1, values.length, rosterSheet.getLastColumn()).clearContent();
    }
    if (allRows.length > 0) {
      rosterSheet.getRange(2, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    ensureClassExists_(className);

    CacheManager.invalidate(['CLASSES_LIST']);

    Logger.log('Roster saved', { className: className, studentCount: cleanedEntries.length });

    return getRosterManagerData();
  })();
}

function bulkAddStudentsToRoster(className, studentEntries) {
  return withErrorHandling(() => {
    if (!className || className.trim() === '') {
      throw new Error('Class name is required');
    }

    if (!Array.isArray(studentEntries)) {
      throw new Error('Student entries must be an array');
    }

    const cleanedEntries = studentEntries
      .map(entry => ({
        name: (entry.name || '').toString().trim(),
        email: (entry.email || '').toString().trim()
      }))
      .filter(entry => entry.name !== '' && entry.email !== '');

    if (cleanedEntries.length === 0) {
      throw new Error('No valid student entries to add');
    }

    // Get existing roster to check for duplicates
    const existingRoster = DataAccess.roster.getByClass(className);
    const existingEmails = new Set(existingRoster.map(s => s.email.toLowerCase()));

    // Filter out students that already exist
    const newStudents = cleanedEntries.filter(
      entry => !existingEmails.has(entry.email.toLowerCase())
    );

    if (newStudents.length === 0) {
      return {
        success: true,
        message: 'All students already exist in the roster',
        addedCount: 0,
        skippedCount: cleanedEntries.length,
        data: getRosterManagerData()
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rosterSheet = ss.getSheetByName('Rosters');
    if (!rosterSheet) {
      throw new Error('Rosters sheet not found');
    }

    // Append new students to the roster
    const rows = newStudents.map(entry => [className, entry.name, entry.email]);
    rosterSheet.getRange(rosterSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    ensureClassExists_(className);

    CacheManager.invalidate(['CLASSES_LIST']);

    Logger.log('Students bulk added to roster', {
      className: className,
      addedCount: newStudents.length,
      skippedCount: cleanedEntries.length - newStudents.length
    });

    return {
      success: true,
      message: `Added ${newStudents.length} student(s). Skipped ${cleanedEntries.length - newStudents.length} duplicate(s).`,
      addedCount: newStudents.length,
      skippedCount: cleanedEntries.length - newStudents.length,
      data: getRosterManagerData()
    };
  })();
}

function renameClass(oldName, newName) {
  return withErrorHandling(() => {
    if (!oldName || !newName) {
      throw new Error('Both current and new class names are required');
    }

    const normalizedNewName = newName.trim();
    if (normalizedNewName === '') {
      throw new Error('New class name cannot be empty');
    }

    if (oldName === normalizedNewName) {
      return getRosterManagerData();
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // OPTIMIZATION: Batch updates instead of setValue() in loops
    // Update Classes sheet
    const classesSheet = ss.getSheetByName('Classes');
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      const values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 2).getValues();
      const updatedValues = values.map(row => [row[0] === oldName ? normalizedNewName : row[0], row[1]]);
      classesSheet.getRange(2, 1, updatedValues.length, 2).setValues(updatedValues);
    }

    // Update Rosters sheet
    const rosterSheet = ss.getSheetByName('Rosters');
    const rosterValues = getDataRangeValues_(rosterSheet);
    if (rosterValues.length > 0) {
      const updatedRosterValues = rosterValues.map(row => {
        const updatedRow = [...row];
        if (updatedRow[0] === oldName) {
          updatedRow[0] = normalizedNewName;
        }
        return updatedRow;
      });
      rosterSheet.getRange(2, 1, updatedRosterValues.length, updatedRosterValues[0].length).setValues(updatedRosterValues);
    }

    // Update Polls sheet
    const pollSheet = ss.getSheetByName('Polls');
    const pollValues = getDataRangeValues_(pollSheet);
    if (pollValues.length > 0) {
      const updatedPollValues = pollValues.map(row => {
        const updatedRow = [...row];
        if (updatedRow[2] === oldName) {
          updatedRow[2] = normalizedNewName;
        }
        return updatedRow;
      });
      pollSheet.getRange(2, 1, updatedPollValues.length, updatedPollValues[0].length).setValues(updatedPollValues);
    }

    const props = PropertiesService.getScriptProperties();
    const tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    const tokenMap = JSON.parse(tokenMapStr);
    let tokensUpdated = false;
    Object.keys(tokenMap).forEach(token => {
      const data = tokenMap[token];
      if (data.className === oldName) {
        data.className = normalizedNewName;
        tokensUpdated = true;
      }
    });
    if (tokensUpdated) {
      props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
    }

    CacheManager.invalidate(['CLASSES_LIST', 'ALL_POLLS_DATA']);

    Logger.log('Class renamed', { from: oldName, to: normalizedNewName });

    return getRosterManagerData();
  })();
}

function deleteClassRecord(className) {
  return withErrorHandling(() => {
    if (!className) {
      throw new Error('Class name is required');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const classesSheet = ss.getSheetByName('Classes');
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      const values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 1).getValues();
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i][0] === className) {
          classesSheet.deleteRow(i + 2);
        }
      }
    }

    const rosterSheet = ss.getSheetByName('Rosters');
    const rosterValues = getDataRangeValues_(rosterSheet);
    for (let i = rosterValues.length - 1; i >= 0; i--) {
      if (rosterValues[i][0] === className) {
        rosterSheet.deleteRow(i + 2);
      }
    }

    const props = PropertiesService.getScriptProperties();
    const tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    const tokenMap = JSON.parse(tokenMapStr);
    let mutated = false;
    Object.keys(tokenMap).forEach(token => {
      if (tokenMap[token].className === className) {
        delete tokenMap[token];
        mutated = true;
      }
    });
    if (mutated) {
      props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
    }

    CacheManager.invalidate(['CLASSES_LIST', 'ALL_POLLS_DATA']);

    Logger.log('Class deleted', { className: className });

    return getRosterManagerData();
  })();
}

function createNewPoll(pollName, className, questions) {
  return withErrorHandling(() => {
    if (!pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    const pollId = "P-" + Utilities.getUuid();
    const timestamp = new Date().toISOString();

    writePollRows_(pollId, pollName, className, questions, timestamp, timestamp);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll created', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return DataAccess.polls.getAll();
  })();
}

function saveDraft(pollData) {
  return withErrorHandling(() => {
    const { pollName, className, questions } = pollData;
    if (!pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    const pollId = "D-" + Utilities.getUuid(); // "D" for Draft
    const timestamp = new Date().toISOString();

    writePollRows_(pollId, pollName, className, questions, timestamp, timestamp);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Draft saved', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return { success: true };
  })();
}

function savePollNew(pollData) {
  return withErrorHandling(() => {
    const { pollName, className, questions, sessionType, timeLimitMinutes } = pollData;
    if (!pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    // Validate session type specific requirements
    if (sessionType === 'INDIVIDUAL_TIMED') {
      if (!timeLimitMinutes || timeLimitMinutes <= 0) {
        throw new Error('Time limit is required for individual timed sessions');
      }
    }

    const pollId = "P-" + Utilities.getUuid();
    const timestamp = new Date().toISOString();

    writePollRows_(pollId, pollName, className, questions, timestamp, timestamp, sessionType, timeLimitMinutes);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll created via new editor', { pollId: pollId, pollName: pollName, questionCount: questions.length, sessionType: sessionType || 'LIVE_POLL' });

    return DataAccess.polls.getAll();
  })();
}

function startPoll(pollId) {
  return withErrorHandling(() => {
    if (!pollId) throw new Error('Poll ID is required');

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

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

    ProctorAccess.resetForNewSession(pollId, sessionId);

    Logger.log('Poll started', { pollId: pollId, pollName: poll.pollName });

    return getLivePollData(pollId, 0);
  })();
}

// =============================================================================
// INDIVIDUAL TIMED SESSION FUNCTIONS
// =============================================================================

/**
 * Start an individual timed session
 * Each student gets a randomized question order and their own timer
 */
function startIndividualTimedSession(pollId) {
  return withErrorHandling(() => {
    if (!pollId) throw new Error('Poll ID is required');

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    if (poll.sessionType !== 'INDIVIDUAL_TIMED') {
      throw new Error('This poll is not configured as an individual timed session');
    }

    if (!poll.timeLimitMinutes || poll.timeLimitMinutes <= 0) {
      throw new Error('Time limit must be set for individual timed sessions');
    }

    const nowIso = new Date().toISOString();
    const sessionId = pollId + '::' + Utilities.getUuid();

    // Set live status to indicate individual timed session is running
    DataAccess.liveStatus.set(pollId, -1, "OPEN", {
      reason: 'INDIVIDUAL_TIMED_RUNNING',
      sessionPhase: 'INDIVIDUAL_TIMED',
      startedAt: nowIso,
      endedAt: null,
      timeLimitMinutes: poll.timeLimitMinutes,
      isCollecting: true,
      resultsVisibility: 'HIDDEN',
      sessionId: sessionId
    });

    // Reset proctor state for new session
    ProctorAccess.resetForNewSession(pollId, sessionId);

    Logger.log('Individual timed session started', {
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
}

/**
 * Initialize or get student state for individual timed session
 * Randomizes question order on first access
 */
function initializeIndividualTimedStudent(pollId, sessionId, studentEmail) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    // Check if student already initialized
    let studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);

    if (!studentState) {
      // Generate randomized question order
      const questionIndices = poll.questions.map((q, idx) => idx);
      const shuffledIndices = shuffleArray_(questionIndices);

      studentState = DataAccess.individualSessionState.initStudent(
        pollId,
        sessionId,
        studentEmail,
        shuffledIndices
      );
    }

    // Check if time limit expired
    const metadata = DataAccess.liveStatus.getMetadata();
    const timeLimitMinutes = metadata.timeLimitMinutes || poll.timeLimitMinutes;
    const startTime = new Date(studentState.startTime).getTime();
    const currentTime = Date.now();
    const elapsedMinutes = (currentTime - startTime) / (1000 * 60);

    if (elapsedMinutes >= timeLimitMinutes && !studentState.isLocked) {
      // Auto-lock student if time expired
      DataAccess.individualSessionState.lockStudent(pollId, sessionId, studentEmail);
      studentState.isLocked = true;
      studentState.endTime = new Date().toISOString();
    }

    return studentState;
  })();
}

/**
 * Get current question for student in individual timed session
 */
function getIndividualTimedQuestion(pollId, sessionId, studentEmail) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    const studentState = initializeIndividualTimedStudent(pollId, sessionId, studentEmail);

    if (studentState.isLocked) {
      return {
        locked: true,
        message: 'Time limit expired or session completed',
        currentQuestionIndex: studentState.currentQuestionIndex,
        totalQuestions: poll.questions.length
      };
    }

    // Check if completed all questions
    if (studentState.currentQuestionIndex >= poll.questions.length) {
      // Lock student - they finished
      DataAccess.individualSessionState.lockStudent(pollId, sessionId, studentEmail);
      return {
        completed: true,
        message: 'All questions completed',
        totalQuestions: poll.questions.length
      };
    }

    const actualQuestionIndex = studentState.questionOrder[studentState.currentQuestionIndex];
    const question = poll.questions[actualQuestionIndex];

    // Calculate time remaining
    const timeLimitMinutes = poll.timeLimitMinutes;
    const startTime = new Date(studentState.startTime).getTime();
    const currentTime = Date.now();
    const elapsedMs = currentTime - startTime;
    const remainingMs = (timeLimitMinutes * 60 * 1000) - elapsedMs;

    return {
      sessionId: sessionId,
      question: question,
      actualQuestionIndex: actualQuestionIndex,
      progressIndex: studentState.currentQuestionIndex,
      totalQuestions: poll.questions.length,
      timeRemainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      startTime: studentState.startTime,
      timeLimitMinutes: timeLimitMinutes
    };
  })();
}

/**
 * Submit answer for individual timed session
 * Prevents backward navigation and advances to next question
 */
function submitIndividualTimedAnswer(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    const studentState = DataAccess.individualSessionState.getByStudent(pollId, sessionId, studentEmail);
    if (!studentState) {
      throw new Error('Student not initialized for this session');
    }

    if (studentState.isLocked) {
      throw new Error('Session is locked - time expired or already completed');
    }

    // Verify this is the current question (prevent backwards navigation)
    const expectedQuestionIndex = studentState.questionOrder[studentState.currentQuestionIndex];
    if (actualQuestionIndex !== expectedQuestionIndex) {
      throw new Error('Cannot submit answer for non-current question');
    }

    // Check if already answered this question
    const alreadyAnswered = DataAccess.responses.hasAnswered(pollId, actualQuestionIndex, studentEmail);
    if (alreadyAnswered) {
      throw new Error('Question already answered');
    }

    // Validate answer
    const question = poll.questions[actualQuestionIndex];
    if (!question) throw new Error('Question not found');

    const isCorrect = (answer === question.correctAnswer);

    // Record response
    const responseId = Utilities.getUuid();
    const timestamp = new Date().toISOString();
    DataAccess.responses.add([
      responseId,
      timestamp,
      pollId,
      actualQuestionIndex,
      studentEmail,
      answer,
      isCorrect,
      confidenceLevel || null
    ]);

    // Advance to next question
    const nextProgressIndex = studentState.currentQuestionIndex + 1;
    DataAccess.individualSessionState.updateProgress(pollId, sessionId, studentEmail, nextProgressIndex);

    // Check if completed all questions
    const isComplete = nextProgressIndex >= poll.questions.length;
    if (isComplete) {
      DataAccess.individualSessionState.lockStudent(pollId, sessionId, studentEmail);
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
  })();
}

/**
 * Check and lock students who exceeded time limit
 * Called periodically or on-demand
 */
function checkAndLockTimedOutStudents(pollId, sessionId) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    const metadata = DataAccess.liveStatus.getMetadata();
    const timeLimitMinutes = metadata.timeLimitMinutes || poll.timeLimitMinutes;

    const studentStates = DataAccess.individualSessionState.getBySession(pollId, sessionId);
    let lockedCount = 0;

    studentStates.forEach(state => {
      if (state.isLocked) return; // Already locked

      const startTime = new Date(state.startTime).getTime();
      const currentTime = Date.now();
      const elapsedMinutes = (currentTime - startTime) / (1000 * 60);

      if (elapsedMinutes >= timeLimitMinutes) {
        DataAccess.individualSessionState.lockStudent(pollId, sessionId, state.studentEmail);
        lockedCount++;
      }
    });

    Logger.log('Timed out students locked', { pollId, sessionId, lockedCount });

    return {
      success: true,
      lockedCount: lockedCount
    };
  })();
}

/**
 * End individual timed session
 * Locks all students and closes session
 */
function endIndividualTimedSession(pollId) {
  return withErrorHandling(() => {
    const metadata = DataAccess.liveStatus.getMetadata();
    const sessionId = metadata.sessionId;

    if (!sessionId) {
      throw new Error('No active session found');
    }

    // Lock all students
    const studentStates = DataAccess.individualSessionState.getBySession(pollId, sessionId);
    studentStates.forEach(state => {
      if (!state.isLocked) {
        DataAccess.individualSessionState.lockStudent(pollId, sessionId, state.studentEmail);
      }
    });

    // Update live status to ended
    DataAccess.liveStatus.set(pollId, -1, "CLOSED", {
      reason: 'ENDED',
      sessionPhase: 'ENDED',
      endedAt: new Date().toISOString(),
      sessionId: sessionId
    });

    Logger.log('Individual timed session ended', { pollId, sessionId });

    return {
      success: true,
      message: 'Session ended',
      sessionId: sessionId
    };
  })();
}

/**
 * Get comprehensive analytics for individual timed session
 * Includes student progress, scores, violations, metacognition, and time data
 */
function getIndividualTimedSessionAnalytics(pollId, sessionId) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    const studentStates = DataAccess.individualSessionState.getBySession(pollId, sessionId);
    const responses = DataAccess.responses.getByPoll(pollId);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const proctorSheet = ss.getSheetByName('ProctorState');

    // Build student analytics
    const studentAnalytics = [];

    studentStates.forEach(state => {
      const studentEmail = state.studentEmail;

      // Get student responses
      const studentResponses = responses.filter(r => r[4] === studentEmail);
      const answeredCount = studentResponses.filter(r => typeof r[3] === 'number' && r[3] >= 0).length;
      const correctCount = studentResponses.filter(r => r[6] === true || r[6] === 'TRUE').length;
      const score = answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0;

      // Get violations
      const violations = responses.filter(r => r[4] === studentEmail && r[3] === -1 && PROCTOR_VIOLATION_VALUES.indexOf(r[5]) !== -1);
      const violationCount = violations.length;

      // Calculate time data
      const startTime = new Date(state.startTime).getTime();
      const endTime = state.endTime ? new Date(state.endTime).getTime() : Date.now();
      const timeSpentMinutes = (endTime - startTime) / (1000 * 60);
      const isTimedOut = state.isLocked && timeSpentMinutes >= poll.timeLimitMinutes;

      // Get metacognition data
      const metacognitionResponses = studentResponses.filter(r => r[7] !== null && r[7] !== undefined);
      let metacognitionScore = null;
      if (metacognitionResponses.length > 0) {
        const totalConfidence = metacognitionResponses.reduce((sum, r) => sum + (parseFloat(r[7]) || 0), 0);
        metacognitionScore = totalConfidence / metacognitionResponses.length;
      }

      // Compute calibration (confident + correct vs confident + incorrect)
      let calibrationStatus = 'N/A';
      if (metacognitionResponses.length > 0) {
        const confidentCorrect = metacognitionResponses.filter(r => parseFloat(r[7]) >= 0.7 && (r[6] === true || r[6] === 'TRUE')).length;
        const confidentIncorrect = metacognitionResponses.filter(r => parseFloat(r[7]) >= 0.7 && (r[6] === false || r[6] === 'FALSE')).length;

        if (confidentCorrect > confidentIncorrect) {
          calibrationStatus = 'Well-Calibrated';
        } else if (confidentIncorrect > confidentCorrect) {
          calibrationStatus = 'Overconfident';
        } else {
          calibrationStatus = 'Mixed';
        }
      }

      studentAnalytics.push({
        studentEmail: studentEmail,
        progress: `${answeredCount}/${poll.questions.length}`,
        progressPercent: (answeredCount / poll.questions.length) * 100,
        score: score.toFixed(1),
        correctCount: correctCount,
        totalAnswered: answeredCount,
        violationCount: violationCount,
        timeSpentMinutes: timeSpentMinutes.toFixed(2),
        isCompleted: state.currentQuestionIndex >= poll.questions.length,
        isLocked: state.isLocked,
        isTimedOut: isTimedOut,
        metacognitionScore: metacognitionScore ? metacognitionScore.toFixed(2) : 'N/A',
        calibrationStatus: calibrationStatus,
        startTime: state.startTime,
        endTime: state.endTime
      });
    });

    // Compute overall statistics
    const totalStudents = studentAnalytics.length;
    const completedStudents = studentAnalytics.filter(s => s.isCompleted).length;
    const timedOutStudents = studentAnalytics.filter(s => s.isTimedOut).length;
    const averageScore = totalStudents > 0
      ? (studentAnalytics.reduce((sum, s) => sum + parseFloat(s.score), 0) / totalStudents).toFixed(1)
      : 0;
    const averageTimeSpent = totalStudents > 0
      ? (studentAnalytics.reduce((sum, s) => sum + parseFloat(s.timeSpentMinutes), 0) / totalStudents).toFixed(2)
      : 0;
    const totalViolations = studentAnalytics.reduce((sum, s) => sum + s.violationCount, 0);

    // Question-level analytics
    const questionAnalytics = [];
    poll.questions.forEach((question, idx) => {
      const questionResponses = responses.filter(r => r[3] === idx);
      const correctResponses = questionResponses.filter(r => r[6] === true || r[6] === 'TRUE');
      const totalResponses = questionResponses.length;
      const difficulty = totalResponses > 0 ? ((correctResponses.length / totalResponses) * 100).toFixed(1) : 'N/A';

      questionAnalytics.push({
        questionIndex: idx,
        questionText: question.text.substring(0, 100) + (question.text.length > 100 ? '...' : ''),
        totalResponses: totalResponses,
        correctResponses: correctResponses.length,
        difficulty: difficulty,
        difficultyLabel: difficulty !== 'N/A' ? (parseFloat(difficulty) >= 75 ? 'Easy' : parseFloat(difficulty) >= 50 ? 'Medium' : 'Hard') : 'N/A'
      });
    });

    Logger.log('Individual timed session analytics computed', {
      pollId: pollId,
      sessionId: sessionId,
      totalStudents: totalStudents
    });

    return {
      sessionInfo: {
        pollId: pollId,
        sessionId: sessionId,
        pollName: poll.pollName,
        className: poll.className,
        timeLimitMinutes: poll.timeLimitMinutes,
        questionCount: poll.questions.length,
        sessionType: 'INDIVIDUAL_TIMED'
      },
      overallStats: {
        totalStudents: totalStudents,
        completedStudents: completedStudents,
        completionRate: totalStudents > 0 ? ((completedStudents / totalStudents) * 100).toFixed(1) : 0,
        timedOutStudents: timedOutStudents,
        averageScore: averageScore,
        averageTimeSpent: averageTimeSpent,
        totalViolations: totalViolations
      },
      studentAnalytics: studentAnalytics.sort((a, b) => parseFloat(b.score) - parseFloat(a.score)),
      questionAnalytics: questionAnalytics
    };
  })();
}

/**
 * Helper function to shuffle array (Fisher-Yates)
 */
function shuffleArray_(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function updatePoll(pollId, pollName, className, questions, sessionType, timeLimitMinutes) {
  return withErrorHandling(() => {
    if (!pollId || !pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: poll ID, name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    removePollRows_(pollId);

    const existingPoll = DataAccess.polls.getById(pollId);
    const createdAt = existingPoll && existingPoll.createdAt ? existingPoll.createdAt : new Date().toISOString();
    const updatedAt = new Date().toISOString();

    // Preserve existing session type and time limit if not provided
    const finalSessionType = sessionType !== undefined ? sessionType : (existingPoll ? existingPoll.sessionType : 'LIVE_POLL');
    const finalTimeLimitMinutes = timeLimitMinutes !== undefined ? timeLimitMinutes : (existingPoll ? existingPoll.timeLimitMinutes : null);

    writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt, finalSessionType, finalTimeLimitMinutes);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll updated', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return DataAccess.polls.getAll();
  })();
}

function deletePoll(pollId) {
  return withErrorHandling(() => {
    if (!pollId) {
      throw new Error('Poll ID is required');
    }

    removePollRows_(pollId);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = ss.getSheetByName('Responses');
    if (responsesSheet) {
      const values = getDataRangeValues_(responsesSheet);
      for (let i = values.length - 1; i >= 0; i--) {
        const rowIndex = i + 2;
        if (values[i][2] === pollId) {
          responsesSheet.deleteRow(rowIndex);
        }
      }
    }

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll deleted', { pollId: pollId });

    return DataAccess.polls.getAll();
  })();
}

function duplicateQuestion(pollId, questionIndex) {
  return withErrorHandling(() => {
    if (!pollId) {
      throw new Error('Poll ID is required');
    }

    if (questionIndex === undefined || questionIndex === null) {
      throw new Error('Question index is required');
    }

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (questionIndex < 0 || questionIndex >= poll.questions.length) {
      throw new Error('Invalid question index');
    }

    // Deep copy the question to duplicate
    const questionToDuplicate = poll.questions[questionIndex];
    const duplicatedQuestion = JSON.parse(JSON.stringify(questionToDuplicate));

    // Insert the duplicated question right after the original
    const newQuestions = [...poll.questions];
    newQuestions.splice(questionIndex + 1, 0, duplicatedQuestion);

    if (newQuestions.length > 50) {
      throw new Error('Maximum 50 questions per poll. Cannot duplicate.');
    }

    // Update the poll with the new questions array
    removePollRows_(pollId);

    const existingPoll = DataAccess.polls.getById(pollId);
    const createdAt = existingPoll && existingPoll.createdAt ? existingPoll.createdAt : new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const sessionType = existingPoll ? existingPoll.sessionType : 'LIVE_POLL';
    const timeLimitMinutes = existingPoll ? existingPoll.timeLimitMinutes : null;

    writePollRows_(pollId, poll.pollName, poll.className, newQuestions, createdAt, updatedAt, sessionType, timeLimitMinutes);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Question duplicated', {
      pollId: pollId,
      originalIndex: questionIndex,
      newIndex: questionIndex + 1,
      totalQuestions: newQuestions.length
    });

    return {
      success: true,
      message: 'Question duplicated successfully',
      polls: DataAccess.polls.getAll()
    };
  })();
}

function copyPoll(sourcePollId, newPollName, targetClassName) {
  return withErrorHandling(() => {
    if (!sourcePollId) {
      throw new Error('Source poll ID is required');
    }

    const sourcePoll = DataAccess.polls.getById(sourcePollId);
    if (!sourcePoll) {
      throw new Error('Source poll not found');
    }

    // Use provided name or append " (Copy)" to original name
    const pollName = newPollName && newPollName.trim() !== ''
      ? newPollName.trim()
      : `${sourcePoll.pollName} (Copy)`;

    // Use provided class or same class as source
    const className = targetClassName && targetClassName.trim() !== ''
      ? targetClassName.trim()
      : sourcePoll.className;

    // Deep copy all questions (images will be shared via fileIds)
    const copiedQuestions = sourcePoll.questions.map(q => JSON.parse(JSON.stringify(q)));

    // Copy session type and time limit from source poll
    const sessionType = sourcePoll.sessionType || 'LIVE_POLL';
    const timeLimitMinutes = sourcePoll.timeLimitMinutes || null;

    // Create new poll with copied questions
    const newPollId = "P-" + Utilities.getUuid();
    const timestamp = new Date().toISOString();

    writePollRows_(newPollId, pollName, className, copiedQuestions, timestamp, timestamp, sessionType, timeLimitMinutes);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll copied', {
      sourcePollId: sourcePollId,
      newPollId: newPollId,
      newPollName: pollName,
      className: className,
      questionCount: copiedQuestions.length
    });

    return {
      success: true,
      message: `Poll copied successfully as "${pollName}"`,
      newPollId: newPollId,
      polls: DataAccess.polls.getAll()
    };
  })();
}

function nextQuestion() {
  return withErrorHandling(() => {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];

    if (!pollId) return stopPoll();

    let newIndex = currentStatus[1] + 1;
    const poll = DataAccess.polls.getById(pollId);

    if (!poll || newIndex >= poll.questions.length) {
      Logger.log('Poll completed', { pollId: pollId });
      return stopPoll();
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
  })();
}

function previousQuestion() {
  return withErrorHandling(() => {
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
  })();
}

function stopPoll() {
  return withErrorHandling(() => {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    // Instead of closing completely, set to PAUSED state
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

    // Return current data so view stays visible
    return getLivePollData(pollId, questionIndex);
  })();
}

// --- NEW FUNCTION: Resume Poll ---
// Add this new function to allow resuming after timer expires

function resumePoll() {
  return withErrorHandling(() => {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    if (!pollId || questionIndex < 0) {
      throw new Error('No poll to resume');
    }

    // Set back to OPEN
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
  })();
}

// --- NEW FUNCTION: Close Poll Completely ---
// Add this new function for when you really want to end the poll

function closePoll() {
  return withErrorHandling(() => {
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
  })();
}

function pausePollForTimerExpiry() {
  return withErrorHandling(() => {
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

    Logger.log('Responses closed due to timer expiry', { pollId, questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
}

function revealResultsToStudents() {
  return withErrorHandling(() => {
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

    Logger.log('Results revealed to students', { pollId, questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
}

function hideResultsFromStudents() {
  return withErrorHandling(() => {
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

    Logger.log('Results hidden from students', { pollId, questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
}

function endQuestionAndRevealResults() {
  return withErrorHandling(() => {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    if (!pollId || questionIndex < 0) {
      throw new Error('No active question to end.');
    }

    const previousMetadata = (currentStatus && currentStatus.metadata) ? currentStatus.metadata : {};
    const nowIso = new Date().toISOString();

    // Close responses and immediately reveal results
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

    Logger.log('Question ended and results revealed', { pollId, questionIndex });

    return getLivePollData(pollId, questionIndex);
  })();
}

function resetLiveQuestion(pollId, questionIndex, clearResponses) {
  return withErrorHandling(() => {
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
      if (responsesSheet) {
        // OPTIMIZATION: Filter and rewrite instead of row-by-row deletion
        // For 50 responses: 50 deleteRow() calls → 1 setValues() call
        const values = getDataRangeValues_(responsesSheet);
        const keepRows = values.filter(row => !(row[2] === pollId && row[3] === questionIndex));

        if (keepRows.length < values.length) {
          // Clear all data rows (keep header)
          if (values.length > 0) {
            responsesSheet.getRange(2, 1, values.length, responsesSheet.getLastColumn()).clearContent();
          }
          // Rewrite filtered data
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
      pollId,
      questionIndex,
      cleared: !!clearResponses
    });

    return getLivePollData(pollId, questionIndex);
  })();
}


function getArchivedPolls() {
  return withErrorHandling(() => {
    const polls = DataAccess.polls.getAll();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = ss.getSheetByName('Responses');
    const responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];

    const responsesByPoll = new Map();

    responseValues.forEach(row => {
      const pollId = row[2];
      const questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10);
      if (isNaN(questionIndex)) {
        return;
      }
      const studentEmail = (row[4] || '').toString().trim();
      const answer = row[5];
      const isCorrectRaw = row[6];
      const timestamp = row[1];

      if (!responsesByPoll.has(pollId)) {
        responsesByPoll.set(pollId, {
          responses: new Map(),
          violations: new Map(),
          latestTimestamp: 0
        });
      }

      const pollEntry = responsesByPoll.get(pollId);
      if (timestamp && typeof timestamp === 'number') {
        pollEntry.latestTimestamp = Math.max(pollEntry.latestTimestamp, timestamp);
      }

      if (questionIndex === -1 && PROCTOR_VIOLATION_VALUES.indexOf(answer) !== -1) {
        pollEntry.violations.set(studentEmail, true);
        return;
      }

      if (!pollEntry.responses.has(questionIndex)) {
        pollEntry.responses.set(questionIndex, []);
      }

      const isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);

      pollEntry.responses.get(questionIndex).push({
        email: studentEmail,
        answer: answer,
        isCorrect: isCorrect,
        timestamp: timestamp
      });
    });

    const archivedPolls = polls.map(poll => {
      const pollResponses = responsesByPoll.get(poll.pollId) || { responses: new Map(), violations: new Map(), latestTimestamp: 0 };
      const roster = DataAccess.roster.getByClass(poll.className);
      const rosterMap = new Map(roster.map(student => [student.email, student.name]));
      const violationsSet = new Set(Array.from(pollResponses.violations.keys()));

      const questions = poll.questions.map((question, index) => {
        const submissions = pollResponses.responses.get(index) || [];
        const responsesDetailed = submissions.map(submission => ({
          email: submission.email,
          name: rosterMap.get(submission.email) || submission.email,
          answer: submission.answer,
          isCorrect: submission.isCorrect,
          violation: violationsSet.has(submission.email),
          timestamp: submission.timestamp || null
        }));

        const respondedEmails = new Set(responsesDetailed.map(response => response.email));
        const nonResponders = roster
          .filter(student => !respondedEmails.has(student.email))
          .map(student => ({
            email: student.email,
            name: student.name,
            violation: violationsSet.has(student.email)
          }));

        const correctCount = responsesDetailed.filter(response => response.isCorrect).length;
        const incorrectCount = responsesDetailed.filter(response => !response.isCorrect).length;
        const violationCount = responsesDetailed.filter(response => response.violation).length + nonResponders.filter(student => student.violation).length;

        return {
          index: index,
          questionText: question.questionText,
          questionImageURL: question.questionImageURL || null,
          correctAnswer: question.correctAnswer || null,
          timerSeconds: question.timerSeconds || null,
          responses: responsesDetailed,
          nonResponders: nonResponders,
          summary: {
            totalStudents: roster.length,
            responded: responsesDetailed.length,
            correct: correctCount,
            incorrect: incorrectCount,
            noResponse: nonResponders.length,
            violations: violationCount
          }
        };
      });

      const latestTimestamp = pollResponses.latestTimestamp || 0;
      const lastRunAt = latestTimestamp ? new Date(latestTimestamp).toISOString() : poll.updatedAt || poll.createdAt || '';

      return {
        pollId: poll.pollId,
        pollName: poll.pollName,
        className: poll.className,
        createdAt: poll.createdAt || '',
        updatedAt: poll.updatedAt || '',
        lastRunAt: lastRunAt,
        questions: questions,
        questionCount: poll.questions.length,
        totalResponses: questions.reduce((sum, q) => sum + q.responses.length, 0),
        totalStudents: roster.length,
        violations: Array.from(violationsSet)
      };
    });

    archivedPolls.sort((a, b) => {
      const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return bTime - aTime;
    });

    Logger.log('Archived poll data generated', { count: archivedPolls.length });

    return archivedPolls;
  })();
}

// =============================================================================
// ANALYTICS HUB - COMPREHENSIVE TEACHER ANALYTICS (2025)
// =============================================================================

/**
 * Get comprehensive analytics data for the Analytics Hub
 * Computes aggregates across sessions, items, and students
 */
function getAnalyticsData(filters = {}) {
  return withErrorHandling(() => {
    const cacheKey = 'ANALYTICS_DATA_' + JSON.stringify(filters);

    return CacheManager.get(cacheKey, () => {
      const polls = DataAccess.polls.getAll();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const responsesSheet = ss.getSheetByName('Responses');
      const responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];

      // Filter polls by class and date range if specified
      let filteredPolls = polls;
      if (filters.className && filters.className !== 'all') {
        filteredPolls = filteredPolls.filter(p => p.className === filters.className);
      }
      if (filters.dateFrom || filters.dateTo) {
        filteredPolls = filteredPolls.filter(p => {
          const pollDate = new Date(p.updatedAt || p.createdAt);
          if (filters.dateFrom && pollDate < new Date(filters.dateFrom)) return false;
          if (filters.dateTo && pollDate > new Date(filters.dateTo)) return false;
          return true;
        });
      }

      // Build response maps
      const responsesByPoll = buildResponseMaps_(responseValues);

      // Compute aggregates
      const sessionAggregates = computeSessionAggregates_(filteredPolls, responsesByPoll);
      const itemAggregates = computeItemAggregates_(filteredPolls, responsesByPoll);
      const studentAggregates = computeStudentAggregates_(filteredPolls, responsesByPoll);
      const topicAggregates = computeTopicAggregates_(filteredPolls, responsesByPoll);

      // Compute KPIs
      const kpis = computeKPIs_(sessionAggregates, studentAggregates);

      Logger.log('Analytics data computed', {
        sessions: sessionAggregates.length,
        items: itemAggregates.length,
        students: Object.keys(studentAggregates).length
      });

      return {
        kpis: kpis,
        sessions: sessionAggregates,
        items: itemAggregates,
        students: studentAggregates,
        topics: topicAggregates,
        filters: filters
      };
    }, CacheManager.CACHE_TIMES.MEDIUM);
  })();
}

/**
 * Build response maps from raw response data
 */
function buildResponseMaps_(responseValues) {
  const responsesByPoll = new Map();

  responseValues.forEach(row => {
    const pollId = row[2];
    const questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10);
    if (isNaN(questionIndex)) return;

    const studentEmail = (row[4] || '').toString().trim();
    const answer = row[5];
    const isCorrectRaw = row[6];
    const timestamp = row[1];

    if (!responsesByPoll.has(pollId)) {
      responsesByPoll.set(pollId, {
        responses: new Map(),
        violations: new Map(),
        timestamps: new Map()
      });
    }

    const pollEntry = responsesByPoll.get(pollId);

    // Track violations
    if (questionIndex === -1 && PROCTOR_VIOLATION_VALUES.indexOf(answer) !== -1) {
      pollEntry.violations.set(studentEmail, true);
      return;
    }

    // Track responses
    if (!pollEntry.responses.has(questionIndex)) {
      pollEntry.responses.set(questionIndex, []);
    }

    const isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);

    // Track timestamps for time analysis
    if (!pollEntry.timestamps.has(questionIndex)) {
      pollEntry.timestamps.set(questionIndex, []);
    }
    if (timestamp) {
      pollEntry.timestamps.get(questionIndex).push({
        email: studentEmail,
        timestamp: timestamp
      });
    }

    pollEntry.responses.get(questionIndex).push({
      email: studentEmail,
      answer: answer,
      isCorrect: isCorrect,
      timestamp: timestamp
    });
  });

  return responsesByPoll;
}

/**
 * Compute session-level aggregates
 */
function computeSessionAggregates_(polls, responsesByPoll) {
  return polls.map(poll => {
    const pollData = responsesByPoll.get(poll.pollId) || { responses: new Map(), violations: new Map() };
    const roster = DataAccess.roster.getByClass(poll.className);
    const totalStudents = roster.length;

    // Calculate overall statistics
    let totalCorrect = 0;
    let totalAnswered = 0;
    let participatingStudents = new Set();
    let totalTime = 0;
    let timeCount = 0;

    poll.questions.forEach((question, qIdx) => {
      const responses = pollData.responses.get(qIdx) || [];
      responses.forEach(r => {
        participatingStudents.add(r.email);
        totalAnswered++;
        if (r.isCorrect) totalCorrect++;
      });

      // Calculate median time (simplified - using average for now)
      const timestamps = pollData.timestamps?.get(qIdx) || [];
      if (timestamps.length >= 2) {
        const sorted = timestamps.sort((a, b) => a.timestamp - b.timestamp);
        const firstTimestamp = sorted[0].timestamp;
        timestamps.forEach(t => {
          const timeDiff = (t.timestamp - firstTimestamp) / 1000; // seconds
          if (timeDiff > 0 && timeDiff < 600) { // Ignore outliers > 10 minutes
            totalTime += timeDiff;
            timeCount++;
          }
        });
      }
    });

    const masteryPct = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
    const participationPct = totalStudents > 0 ? (participatingStudents.size / totalStudents) * 100 : 0;
    const medianTimeSec = timeCount > 0 ? totalTime / timeCount : 0;
    const violationCount = pollData.violations.size;
    const integrityRate = totalStudents > 0 ? (violationCount / totalStudents) * 10 : 0; // per 10 students

    return {
      sessionId: poll.pollId,
      sessionName: poll.pollName,
      className: poll.className,
      date: poll.updatedAt || poll.createdAt,
      questionCount: poll.questions.length,
      participants: participatingStudents.size,
      totalStudents: totalStudents,
      masteryPct: Math.round(masteryPct * 10) / 10,
      participationPct: Math.round(participationPct * 10) / 10,
      medianTimeSec: Math.round(medianTimeSec),
      integrityRate: Math.round(integrityRate * 10) / 10
    };
  });
}

/**
 * Calculate point-biserial correlation for item discrimination
 */
function calculatePointBiserial_(itemScores, totalScores) {
  if (itemScores.length < 5) return 0; // Need minimum sample size

  const n = itemScores.length;
  let sumCorrect = 0;
  let countCorrect = 0;
  let sumIncorrect = 0;
  let countIncorrect = 0;

  itemScores.forEach((correct, idx) => {
    if (correct) {
      sumCorrect += totalScores[idx];
      countCorrect++;
    } else {
      sumIncorrect += totalScores[idx];
      countIncorrect++;
    }
  });

  if (countCorrect === 0 || countIncorrect === 0) return 0;

  const meanCorrect = sumCorrect / countCorrect;
  const meanIncorrect = sumIncorrect / countIncorrect;

  // Calculate overall standard deviation
  const overallMean = totalScores.reduce((a, b) => a + b, 0) / n;
  const variance = totalScores.reduce((sum, score) => sum + Math.pow(score - overallMean, 2), 0) / n;
  const sd = Math.sqrt(variance);

  if (sd === 0) return 0;

  // Point-biserial formula
  const p = countCorrect / n;
  const q = countIncorrect / n;
  const rbis = ((meanCorrect - meanIncorrect) / sd) * Math.sqrt(p * q);

  return Math.round(rbis * 100) / 100;
}

/**
 * Compute item-level aggregates with discrimination analysis
 */
function computeItemAggregates_(polls, responsesByPoll) {
  const items = [];

  polls.forEach(poll => {
    const pollData = responsesByPoll.get(poll.pollId) || { responses: new Map(), timestamps: new Map() };
    const roster = DataAccess.roster.getByClass(poll.className);

    // Calculate total scores for each student for discrimination analysis
    const studentTotalScores = new Map();
    roster.forEach(student => studentTotalScores.set(student.email, 0));

    poll.questions.forEach((question, qIdx) => {
      const responses = pollData.responses.get(qIdx) || [];
      responses.forEach(r => {
        if (r.isCorrect) {
          studentTotalScores.set(r.email, (studentTotalScores.get(r.email) || 0) + 1);
        }
      });
    });

    poll.questions.forEach((question, qIdx) => {
      const responses = pollData.responses.get(qIdx) || [];
      const totalStudents = roster.length;

      // Choice distribution
      const choiceCounts = { A: 0, B: 0, C: 0, D: 0 };
      const itemScores = [];
      const totalScoresForItem = [];

      responses.forEach(r => {
        if (choiceCounts.hasOwnProperty(r.answer)) {
          choiceCounts[r.answer]++;
        }
        itemScores.push(r.isCorrect);
        totalScoresForItem.push(studentTotalScores.get(r.email) || 0);
      });

      const correctCount = responses.filter(r => r.isCorrect).length;
      const correctPct = responses.length > 0 ? (correctCount / responses.length) * 100 : 0;
      const nonresponsePct = totalStudents > 0 ? ((totalStudents - responses.length) / totalStudents) * 100 : 0;

      // Calculate discrimination (point-biserial)
      const rbis = calculatePointBiserial_(itemScores, totalScoresForItem);

      // Find most chosen distractor
      const correctAnswer = question.correctAnswer || 'A';
      let mostChosenDistractor = null;
      let maxDistractorCount = 0;
      Object.keys(choiceCounts).forEach(choice => {
        if (choice !== correctAnswer && choiceCounts[choice] > maxDistractorCount) {
          maxDistractorCount = choiceCounts[choice];
          mostChosenDistractor = choice;
        }
      });

      // Calculate median time
      const timestamps = pollData.timestamps?.get(qIdx) || [];
      let medianTimeSec = 0;
      if (timestamps.length >= 2) {
        const sorted = timestamps.sort((a, b) => a.timestamp - b.timestamp);
        const firstTimestamp = sorted[0].timestamp;
        const times = timestamps.map(t => (t.timestamp - firstTimestamp) / 1000).filter(t => t > 0 && t < 600);
        if (times.length > 0) {
          times.sort((a, b) => a - b);
          medianTimeSec = times[Math.floor(times.length / 2)];
        }
      }

      // Auto-flag items
      const flags = [];
      if (rbis < 0.15) flags.push('low-disc');
      if (correctPct > 90) flags.push('too-easy');
      if (correctPct < 30) flags.push('too-hard');
      if (medianTimeSec > 120) flags.push('slow');
      if (nonresponsePct > 20) flags.push('high-nonresponse');

      // Get topic/standard from question data (defaults if not present)
      const topic = question.topicTag || question.topic || 'Untagged';
      const standard = question.standardTag || question.standard || '';

      items.push({
        questionId: poll.pollId + '_Q' + qIdx,
        sessionId: poll.pollId,
        sessionName: poll.pollName,
        qNum: qIdx + 1,
        topic: topic,
        standard: standard,
        correctPct: Math.round(correctPct * 10) / 10,
        rbis: rbis,
        mostChosenDistractor: mostChosenDistractor,
        medianTimeSec: Math.round(medianTimeSec),
        nonresponsePct: Math.round(nonresponsePct * 10) / 10,
        flags: flags,
        choiceCounts: choiceCounts,
        total: responses.length,
        correctIndex: correctAnswer.charCodeAt(0) - 65, // A=0, B=1, C=2, D=3
        stemText: question.questionText || '',
        stemImageURL: question.questionImageURL || null,
        correctAnswer: correctAnswer,
        misconceptionTag: question.misconceptionTag || null
      });
    });
  });

  return items;
}

/**
 * Compute student-level aggregates
 */
function computeStudentAggregates_(polls, responsesByPoll) {
  const studentData = {};
  const allClasses = new Set();

  // Track which polls are relevant to each student (based on their class)
  const studentRelevantPolls = new Map(); // email -> count of relevant polls

  polls.forEach(poll => {
    allClasses.add(poll.className);
    const roster = DataAccess.roster.getByClass(poll.className);
    roster.forEach(student => {
      if (!studentData[student.email]) {
        studentData[student.email] = {
          studentId: student.email,
          name: student.name,
          email: student.email,
          sessions: [],
          totalCorrect: 0,
          totalAnswered: 0,
          participationCount: 0,
          totalTime: 0,
          timeCount: 0,
          integrityCount: 0,
          topicPerformance: {}
        };
      }

      // Count this poll as relevant to this student
      studentRelevantPolls.set(student.email, (studentRelevantPolls.get(student.email) || 0) + 1);
    });
  });

  polls.forEach(poll => {
    const pollData = responsesByPoll.get(poll.pollId) || { responses: new Map(), violations: new Map(), timestamps: new Map() };
    const roster = DataAccess.roster.getByClass(poll.className);

    roster.forEach(student => {
      if (!studentData[student.email]) return;

      let sessionCorrect = 0;
      let sessionTotal = 0;
      let participated = false;

      poll.questions.forEach((question, qIdx) => {
        const responses = pollData.responses.get(qIdx) || [];
        const studentResponse = responses.find(r => r.email === student.email);

        if (studentResponse) {
          participated = true;
          sessionTotal++;
          if (studentResponse.isCorrect) sessionCorrect++;

          // Track topic performance
          const topic = question.topicTag || question.topic || 'Untagged';
          if (!studentData[student.email].topicPerformance[topic]) {
            studentData[student.email].topicPerformance[topic] = { correct: 0, total: 0 };
          }
          studentData[student.email].topicPerformance[topic].total++;
          if (studentResponse.isCorrect) {
            studentData[student.email].topicPerformance[topic].correct++;
          }
        }
      });

      if (participated) {
        studentData[student.email].participationCount++;
        studentData[student.email].totalCorrect += sessionCorrect;
        studentData[student.email].totalAnswered += sessionTotal;

        const sessionPct = sessionTotal > 0 ? (sessionCorrect / sessionTotal) * 100 : 0;
        studentData[student.email].sessions.push({
          sessionId: poll.pollId,
          sessionName: poll.pollName,
          date: poll.updatedAt || poll.createdAt,
          scorePct: Math.round(sessionPct * 10) / 10,
          correct: sessionCorrect,
          total: sessionTotal
        });
      }

      // Track integrity violations
      if (pollData.violations.has(student.email)) {
        studentData[student.email].integrityCount++;
      }
    });
  });

  // Calculate summary stats for each student
  Object.keys(studentData).forEach(email => {
    const student = studentData[email];
    student.successLast10 = student.totalAnswered > 0 ? (student.totalCorrect / student.totalAnswered) * 100 : 0;

    // Fix: Divide by the number of polls relevant to THIS student, not all polls
    const relevantPollCount = studentRelevantPolls.get(email) || 1;
    student.participationPct = relevantPollCount > 0 ? (student.participationCount / relevantPollCount) * 100 : 0;

    student.successLast10 = Math.round(student.successLast10 * 10) / 10;
    student.participationPct = Math.round(student.participationPct * 10) / 10;

    // Sort sessions by date (most recent first)
    student.sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Keep only last 10 sessions
    student.sessions = student.sessions.slice(0, 10);
  });

  return studentData;
}

/**
 * Compute topic-level aggregates
 */
function computeTopicAggregates_(polls, responsesByPoll) {
  const topicData = {};

  polls.forEach(poll => {
    const pollData = responsesByPoll.get(poll.pollId) || { responses: new Map() };

    poll.questions.forEach((question, qIdx) => {
      const topic = question.topicTag || question.topic || 'Untagged';
      const responses = pollData.responses.get(qIdx) || [];

      if (!topicData[topic]) {
        topicData[topic] = {
          topic: topic,
          totalCorrect: 0,
          totalAnswered: 0,
          questionCount: 0,
          sessionCounts: new Map()
        };
      }

      topicData[topic].questionCount++;

      responses.forEach(r => {
        topicData[topic].totalAnswered++;
        if (r.isCorrect) topicData[topic].totalCorrect++;
      });

      // Track per-session performance
      const correctCount = responses.filter(r => r.isCorrect).length;
      const sessionKey = poll.pollId + '_' + poll.updatedAt;
      topicData[topic].sessionCounts.set(sessionKey, {
        sessionId: poll.pollId,
        sessionName: poll.pollName,
        date: poll.updatedAt || poll.createdAt,
        masteryPct: responses.length > 0 ? (correctCount / responses.length) * 100 : 0,
        n: responses.length
      });
    });
  });

  // Convert to array and calculate mastery percentages
  return Object.keys(topicData).map(topic => {
    const data = topicData[topic];
    const masteryPct = data.totalAnswered > 0 ? (data.totalCorrect / data.totalAnswered) * 100 : 0;

    return {
      topic: topic,
      masteryPct: Math.round(masteryPct * 10) / 10,
      questionCount: data.questionCount,
      totalAnswered: data.totalAnswered,
      sessions: Array.from(data.sessionCounts.values())
    };
  });
}

/**
 * Compute KPIs for the overview dashboard
 */
function computeKPIs_(sessionAggregates, studentAggregates) {
  // Sort sessions by date
  const sortedSessions = sessionAggregates.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Last 5 sessions
  const last5 = sortedSessions.slice(0, 5);
  const prior5 = sortedSessions.slice(5, 10);

  // Mastery (Last 5)
  const masteryLast5 = last5.length > 0
    ? last5.reduce((sum, s) => sum + s.masteryPct, 0) / last5.length
    : 0;
  const masteryPrior5 = prior5.length > 0
    ? prior5.reduce((sum, s) => sum + s.masteryPct, 0) / prior5.length
    : masteryLast5;
  const masteryDelta = masteryLast5 - masteryPrior5;

  // Participation: Average participation per session instead of mixing aggregates from different populations
  const participationPct = last5.length > 0
    ? last5.reduce((sum, s) => sum + s.participationPct, 0) / last5.length
    : 0;

  // Calculate total participating students and average roster size for tooltip
  const avgRosterSize = last5.length > 0
    ? last5.reduce((sum, s) => sum + s.totalStudents, 0) / last5.length
    : 0;
  const avgParticipants = last5.length > 0
    ? last5.reduce((sum, s) => sum + s.participants, 0) / last5.length
    : 0;

  // Time discipline (simplified - would need more detailed timestamp data)
  const avgTime = last5.length > 0
    ? last5.reduce((sum, s) => sum + s.medianTimeSec, 0) / last5.length
    : 0;
  const presetTime = 60; // Assume 60s preset for now
  const timeDelta = avgTime - presetTime;

  // Integrity pulse
  const avgIntegrity = last5.length > 0
    ? last5.reduce((sum, s) => sum + s.integrityRate, 0) / last5.length
    : 0;

  return [
    {
      label: 'Mastery (Last 5)',
      value: Math.round(masteryLast5 * 10) / 10 + '%',
      delta: Math.round(masteryDelta * 10) / 10,
      tooltip: `Average score across last 5 sessions. ${masteryDelta >= 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(masteryDelta))} pts vs prior 5.`,
      route: '/analytics/overview'
    },
    {
      label: 'Participation',
      value: Math.round(participationPct) + '%',
      tooltip: `Average participation across last 5 sessions: ${Math.round(avgParticipants)} of ${Math.round(avgRosterSize)} students per session.`,
      route: '/analytics/students'
    },
    {
      label: 'Time Discipline',
      value: (timeDelta >= 0 ? '+' : '') + Math.round(timeDelta) + 's',
      tooltip: `Median time to submit is ${Math.round(timeDelta)}s ${timeDelta >= 0 ? 'over' : 'under'} preset.`,
      route: '/analytics/items'
    },
    {
      label: 'Integrity Pulse',
      value: Math.round(avgIntegrity * 10) / 10,
      tooltip: `${Math.round(avgIntegrity * 10) / 10} lockout/tab-exit events per 10 students. ${avgIntegrity < 0.5 ? 'Excellent focus!' : avgIntegrity < 1.0 ? 'Good focus.' : 'Some integrity concerns.'}`,
      route: '/analytics/overview'
    }
  ];
}

// =============================================================================
// ADVANCED PSYCHOMETRIC ANALYTICS (2025)
// Comprehensive assessment quality metrics for professional pedagogy
// =============================================================================

/**
 * Get comprehensive post-poll analytics report with psychometric metrics
 * This provides standardized assessment quality analysis
 */
function getPostPollAnalytics(pollId) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      return { success: false, error: 'Poll not found' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = ss.getSheetByName('Responses');
    const responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];
    const roster = DataAccess.roster.getByClass(poll.className);

    // Filter responses for this poll
    const pollResponses = responseValues.filter(row => row[2] === pollId);

    // Build response data structure
    const responsesByQuestion = buildResponsesByQuestion_(pollResponses);
    const studentTotalScores = calculateStudentTotalScores_(poll, responsesByQuestion);

    // Compute comprehensive metrics
    const classOverview = computeClassOverview_(poll, responsesByQuestion, studentTotalScores, roster);
    const itemAnalysis = computeItemAnalysis_(poll, responsesByQuestion, studentTotalScores);
    const metacognitionAnalysis = computeMetacognitionAnalysis_(poll, responsesByQuestion);
    const distributionAnalysis = computeDistributionAnalysis_(studentTotalScores, poll.questions.length);

    return {
      success: true,
      pollId: pollId,
      pollName: poll.pollName,
      className: poll.className,
      questionCount: poll.questions.length,
      classOverview: classOverview,
      itemAnalysis: itemAnalysis,
      metacognition: metacognitionAnalysis,
      distribution: distributionAnalysis
    };
  })();
}

/**
 * Build responses organized by question index
 */
function buildResponsesByQuestion_(pollResponses) {
  const byQuestion = new Map();

  pollResponses.forEach(row => {
    const questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10);
    if (isNaN(questionIndex) || questionIndex < 0) return;

    const studentEmail = (row[4] || '').toString().trim();
    const answer = row[5];
    const isCorrectRaw = row[6];
    const confidenceLevel = row[7] || null;
    const timestamp = row[1];

    const isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') ||
                     (isCorrectRaw === 'true') || (isCorrectRaw === 1);

    if (!byQuestion.has(questionIndex)) {
      byQuestion.set(questionIndex, []);
    }

    byQuestion.get(questionIndex).push({
      email: studentEmail,
      answer: answer,
      isCorrect: isCorrect,
      confidence: confidenceLevel,
      timestamp: timestamp
    });
  });

  return byQuestion;
}

/**
 * Calculate total scores for each student (for discrimination analysis)
 */
function calculateStudentTotalScores_(poll, responsesByQuestion) {
  const scores = new Map();

  poll.questions.forEach((question, qIdx) => {
    const responses = responsesByQuestion.get(qIdx) || [];
    responses.forEach(r => {
      if (!scores.has(r.email)) {
        scores.set(r.email, 0);
      }
      if (r.isCorrect) {
        scores.set(r.email, scores.get(r.email) + 1);
      }
    });
  });

  return scores;
}

/**
 * Compute class overview statistics
 */
function computeClassOverview_(poll, responsesByQuestion, studentTotalScores, roster) {
  const scores = Array.from(studentTotalScores.values());

  if (scores.length === 0) {
    return {
      responseCount: 0,
      participantCount: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      scoreDistribution: []
    };
  }

  // Calculate basic statistics
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sortedScores = scores.slice().sort((a, b) => a - b);
  const median = sortedScores[Math.floor(sortedScores.length / 2)];

  // Standard deviation
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Score distribution (histogram data)
  const maxScore = poll.questions.length;
  const distribution = Array(maxScore + 1).fill(0);
  scores.forEach(score => {
    if (score >= 0 && score <= maxScore) {
      distribution[score]++;
    }
  });

  const scoreDistribution = distribution.map((count, score) => ({
    score: score,
    count: count,
    percentage: (count / scores.length) * 100
  }));

  return {
    responseCount: scores.reduce((sum, _) => sum + poll.questions.length, 0),
    participantCount: scores.length,
    rosterSize: roster.length,
    mean: Math.round(mean * 100) / 100,
    median: median,
    stdDev: Math.round(stdDev * 100) / 100,
    min: Math.min(...scores),
    max: Math.max(...scores),
    scoreDistribution: scoreDistribution
  };
}

/**
 * Compute item-level psychometric analysis with distractor analysis
 */
function computeItemAnalysis_(poll, responsesByQuestion, studentTotalScores) {
  const items = [];

  poll.questions.forEach((question, qIdx) => {
    const responses = responsesByQuestion.get(qIdx) || [];

    if (responses.length === 0) {
      items.push({
        questionIndex: qIdx,
        questionText: question.questionText || '',
        difficulty: 0,
        discrimination: 0,
        distractorAnalysis: [],
        flags: ['no-data'],
        responseCount: 0
      });
      return;
    }

    // Item Difficulty (P-Value)
    const correctCount = responses.filter(r => r.isCorrect).length;
    const difficulty = correctCount / responses.length;

    // Item Discrimination (using upper/lower 27% groups)
    const discrimination = calculateDiscriminationIndex_(responses, studentTotalScores);

    // Distractor Analysis
    const distractorAnalysis = computeDistractorAnalysis_(question, responses, studentTotalScores);

    // Auto-flag problematic items
    const flags = [];
    if (discrimination < 0.15) flags.push('low-discrimination');
    if (discrimination < 0) flags.push('negative-discrimination');
    if (difficulty > 0.9) flags.push('too-easy');
    if (difficulty < 0.3) flags.push('too-hard');

    // Check for problematic distractors (high performers choosing them)
    const problematicDistractor = distractorAnalysis.find(d =>
      !d.isCorrect && d.highGroupPct > d.lowGroupPct + 10
    );
    if (problematicDistractor) flags.push('problematic-distractor');

    items.push({
      questionIndex: qIdx,
      questionText: question.questionText || '',
      questionImageURL: question.questionImageURL || null,
      difficulty: Math.round(difficulty * 100) / 100,
      difficultyPct: Math.round(difficulty * 100),
      discrimination: Math.round(discrimination * 100) / 100,
      distractorAnalysis: distractorAnalysis,
      flags: flags,
      responseCount: responses.length,
      correctAnswer: question.correctAnswer
    });
  });

  return items;
}

/**
 * Calculate discrimination index using upper/lower 27% groups
 * This is the simplified discrimination index method
 */
function calculateDiscriminationIndex_(responses, studentTotalScores) {
  if (responses.length < 10) return 0; // Need minimum sample size

  // Get total scores for students who answered this question
  const scoredResponses = responses
    .map(r => ({
      email: r.email,
      isCorrect: r.isCorrect,
      totalScore: studentTotalScores.get(r.email) || 0
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  // Calculate 27% group sizes
  const groupSize = Math.max(1, Math.floor(scoredResponses.length * 0.27));
  const highGroup = scoredResponses.slice(0, groupSize);
  const lowGroup = scoredResponses.slice(-groupSize);

  // Calculate percentage correct in each group
  const highCorrect = highGroup.filter(r => r.isCorrect).length / highGroup.length;
  const lowCorrect = lowGroup.filter(r => r.isCorrect).length / lowGroup.length;

  return highCorrect - lowCorrect;
}

/**
 * Compute distractor analysis - showing how each option performed
 */
function computeDistractorAnalysis_(question, responses, studentTotalScores) {
  const analysis = [];
  const options = question.options || [];
  const correctAnswer = question.correctAnswer;

  // Get scored responses
  const scoredResponses = responses.map(r => ({
    answer: r.answer,
    totalScore: studentTotalScores.get(r.email) || 0
  }));

  // Sort by total score
  scoredResponses.sort((a, b) => b.totalScore - a.totalScore);

  // Calculate 27% group sizes
  const groupSize = Math.max(1, Math.floor(scoredResponses.length * 0.27));
  const highGroup = scoredResponses.slice(0, groupSize);
  const lowGroup = scoredResponses.slice(-groupSize);

  // Analyze each option
  options.forEach((option, idx) => {
    const optionText = typeof option === 'string' ? option : option.text;
    const isCorrect = optionText === correctAnswer;

    // Count selections
    const totalSelections = responses.filter(r => r.answer === optionText).length;
    const highGroupSelections = highGroup.filter(r => r.answer === optionText).length;
    const lowGroupSelections = lowGroup.filter(r => r.answer === optionText).length;

    const totalPct = (totalSelections / responses.length) * 100;
    const highGroupPct = (highGroupSelections / highGroup.length) * 100;
    const lowGroupPct = (lowGroupSelections / lowGroup.length) * 100;

    // Distractor discrimination (should be negative for distractors)
    const discrimination = highGroupPct - lowGroupPct;

    analysis.push({
      option: optionText,
      optionLetter: String.fromCharCode(65 + idx), // A, B, C, D
      isCorrect: isCorrect,
      totalSelections: totalSelections,
      totalPct: Math.round(totalPct * 10) / 10,
      highGroupPct: Math.round(highGroupPct * 10) / 10,
      lowGroupPct: Math.round(lowGroupPct * 10) / 10,
      discrimination: Math.round(discrimination * 10) / 10,
      quality: isCorrect
        ? (discrimination > 0.3 ? 'excellent' : discrimination > 0.15 ? 'good' : 'poor')
        : (discrimination < -0.15 ? 'good' : discrimination > 0.15 ? 'problematic' : 'weak')
    });
  });

  return analysis;
}

/**
 * Compute metacognition analysis (confidence vs correctness matrix)
 */
function computeMetacognitionAnalysis_(poll, responsesByQuestion) {
  const matrix = {
    confidentCorrect: 0,      // Conscious Competence (Mastery)
    confidentIncorrect: 0,    // Confidently Wrong (RED ALERT)
    uncertainCorrect: 0,      // Imposter Syndrome (Lucky guess)
    uncertainIncorrect: 0     // Conscious Incompetence (Good - they know they don't know)
  };

  let totalWithConfidence = 0;
  const byQuestion = [];

  poll.questions.forEach((question, qIdx) => {
    if (!question.metacognitionEnabled) {
      byQuestion.push(null);
      return;
    }

    const responses = responsesByQuestion.get(qIdx) || [];
    const questionMatrix = {
      confidentCorrect: 0,
      confidentIncorrect: 0,
      uncertainCorrect: 0,
      uncertainIncorrect: 0,
      total: 0
    };

    responses.forEach(r => {
      if (!r.confidence) return;

      totalWithConfidence++;
      questionMatrix.total++;

      const isConfident = (r.confidence === 'very-sure' || r.confidence === 'certain');
      const isCorrect = r.isCorrect;

      if (isConfident && isCorrect) {
        matrix.confidentCorrect++;
        questionMatrix.confidentCorrect++;
      } else if (isConfident && !isCorrect) {
        matrix.confidentIncorrect++;
        questionMatrix.confidentIncorrect++;
      } else if (!isConfident && isCorrect) {
        matrix.uncertainCorrect++;
        questionMatrix.uncertainCorrect++;
      } else {
        matrix.uncertainIncorrect++;
        questionMatrix.uncertainIncorrect++;
      }
    });

    byQuestion.push({
      questionIndex: qIdx,
      questionText: question.questionText || '',
      matrix: questionMatrix,
      confidentlyIncorrectPct: questionMatrix.total > 0
        ? Math.round((questionMatrix.confidentIncorrect / questionMatrix.total) * 100)
        : 0
    });
  });

  const totalPct = totalWithConfidence > 0 ? {
    confidentCorrect: Math.round((matrix.confidentCorrect / totalWithConfidence) * 100),
    confidentIncorrect: Math.round((matrix.confidentIncorrect / totalWithConfidence) * 100),
    uncertainCorrect: Math.round((matrix.uncertainCorrect / totalWithConfidence) * 100),
    uncertainIncorrect: Math.round((matrix.uncertainIncorrect / totalWithConfidence) * 100)
  } : null;

  return {
    enabled: poll.questions.some(q => q.metacognitionEnabled),
    overall: totalPct,
    overallCounts: matrix,
    byQuestion: byQuestion.filter(q => q !== null),
    totalResponses: totalWithConfidence
  };
}

/**
 * Compute distribution analysis with Z-scores
 */
function computeDistributionAnalysis_(studentTotalScores, maxScore) {
  const scores = Array.from(studentTotalScores.entries());

  if (scores.length === 0) {
    return {
      histogram: [],
      zScores: []
    };
  }

  const values = scores.map(([_, score]) => score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate Z-scores for each student
  const zScores = scores.map(([email, score]) => ({
    email: email,
    score: score,
    zScore: stdDev > 0 ? Math.round(((score - mean) / stdDev) * 100) / 100 : 0
  }));

  // Create histogram
  const distribution = Array(maxScore + 1).fill(0);
  values.forEach(score => {
    if (score >= 0 && score <= maxScore) {
      distribution[score]++;
    }
  });

  const histogram = distribution.map((count, score) => ({
    score: score,
    count: count,
    percentage: (count / values.length) * 100
  }));

  return {
    histogram: histogram,
    zScores: zScores
  };
}

/**
 * ENHANCED STUDENT-LEVEL ANALYTICS (2025)
 * Comprehensive tracking of student performance, behavior, and trends
 */

/**
 * Get comprehensive student insights for a class
 * Identifies struggling students, consistent performers, rule violators, and non-responders
 */
function getStudentInsights(className, options = {}) {
  return withErrorHandling(() => {
    const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    const dateTo = options.dateTo ? new Date(options.dateTo) : null;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = ss.getSheetByName('Responses');
    const proctorSheet = ss.getSheetByName('ProctorState');
    const responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];
    const proctorValues = proctorSheet ? getDataRangeValues_(proctorSheet) : [];

    const roster = DataAccess.roster.getByClass(className);
    const polls = DataAccess.polls.getByClass(className);

    // Filter polls by date if specified
    const filteredPolls = polls.filter(poll => {
      const pollDate = poll.createdAt ? new Date(poll.createdAt) : null;
      if (dateFrom && pollDate && pollDate < dateFrom) return false;
      if (dateTo && pollDate && pollDate > dateTo) return false;
      return true;
    });

    const pollIds = new Set(filteredPolls.map(p => p.pollId));

    // Build student profiles
    const studentProfiles = new Map();

    roster.forEach(student => {
      studentProfiles.set(student.email, {
        email: student.email,
        name: student.name,
        totalQuestions: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        accuracy: 0,
        participationRate: 0,
        violations: [],
        pollsParticipated: new Set(),
        averageZScore: 0,
        trend: 'stable', // 'improving', 'declining', 'stable'
        flags: [] // 'struggling', 'non-responder', 'rule-violator', 'high-performer', 'consistent'
      });
    });

    // Analyze responses
    responseValues.forEach(row => {
      const pollId = row[2];
      if (!pollIds.has(pollId)) return;

      const timestamp = row[1];
      if (dateFrom && timestamp && new Date(timestamp) < dateFrom) return;
      if (dateTo && timestamp && new Date(timestamp) > dateTo) return;

      const studentEmail = (row[4] || '').toString().trim();
      const answer = row[5];
      const isCorrectRaw = row[6];
      const isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);

      if (studentProfiles.has(studentEmail)) {
        const profile = studentProfiles.get(studentEmail);
        profile.questionsAnswered++;
        if (isCorrect) {
          profile.correctAnswers++;
        } else {
          profile.incorrectAnswers++;
        }
        profile.pollsParticipated.add(pollId);
      }
    });

    // Calculate total questions for each student
    filteredPolls.forEach(poll => {
      roster.forEach(student => {
        if (studentProfiles.has(student.email)) {
          const profile = studentProfiles.get(student.email);
          profile.totalQuestions += poll.questionCount || poll.questions.length;
        }
      });
    });

    // Analyze violations
    proctorValues.forEach(row => {
      if (row[0] && row[0] !== 'PollID') { // Skip header
        const pollId = row[0];
        if (!pollIds.has(pollId)) return;

        const studentEmail = (row[1] || '').toString().trim();
        const status = row[2];
        const lockReason = row[4] || '';
        const lockedAt = row[5] || '';

        if (status === 'LOCKED' && studentProfiles.has(studentEmail)) {
          const profile = studentProfiles.get(studentEmail);
          profile.violations.push({
            pollId: pollId,
            reason: lockReason,
            timestamp: lockedAt
          });
        }
      }
    });

    // Calculate metrics and assign flags
    const studentInsights = [];
    studentProfiles.forEach((profile, email) => {
      // Calculate accuracy
      const totalAnswered = profile.correctAnswers + profile.incorrectAnswers;
      profile.accuracy = totalAnswered > 0 ? (profile.correctAnswers / totalAnswered) * 100 : 0;

      // Calculate participation rate
      profile.participationRate = profile.totalQuestions > 0
        ? (profile.questionsAnswered / profile.totalQuestions) * 100
        : 0;

      // Assign flags
      if (profile.accuracy < 50 && totalAnswered >= 5) {
        profile.flags.push('struggling');
      }
      if (profile.accuracy >= 85 && totalAnswered >= 5) {
        profile.flags.push('high-performer');
      }
      if (profile.participationRate < 50 && profile.totalQuestions >= 5) {
        profile.flags.push('non-responder');
      }
      if (profile.violations.length >= 2) {
        profile.flags.push('rule-violator');
      }
      if (profile.accuracy >= 75 && profile.participationRate >= 90) {
        profile.flags.push('consistent');
      }

      // Convert Set to array for JSON serialization
      profile.pollsParticipated = Array.from(profile.pollsParticipated);

      studentInsights.push(profile);
    });

    // Sort by flags (struggling and rule violators first)
    studentInsights.sort((a, b) => {
      const aPriority = a.flags.includes('struggling') || a.flags.includes('rule-violator') ? 0 : 1;
      const bPriority = b.flags.includes('struggling') || b.flags.includes('rule-violator') ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.accuracy - a.accuracy;
    });

    // Calculate class-wide statistics
    const classStats = {
      totalStudents: studentInsights.length,
      strugglingCount: studentInsights.filter(s => s.flags.includes('struggling')).length,
      nonResponderCount: studentInsights.filter(s => s.flags.includes('non-responder')).length,
      ruleViolatorCount: studentInsights.filter(s => s.flags.includes('rule-violator')).length,
      highPerformerCount: studentInsights.filter(s => s.flags.includes('high-performer')).length,
      averageAccuracy: studentInsights.reduce((sum, s) => sum + s.accuracy, 0) / studentInsights.length || 0,
      averageParticipation: studentInsights.reduce((sum, s) => sum + s.participationRate, 0) / studentInsights.length || 0
    };

    return {
      success: true,
      className: className,
      dateRange: { from: dateFrom, to: dateTo },
      classStats: classStats,
      students: studentInsights,
      pollsAnalyzed: filteredPolls.length
    };
  })();
}

/**
 * Get detailed historical analytics for a specific student
 * Includes performance trends, violation history, and per-poll breakdown
 */
function getStudentHistoricalAnalytics(studentEmail, className, options = {}) {
  return withErrorHandling(() => {
    const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    const dateTo = options.dateTo ? new Date(options.dateTo) : null;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responsesSheet = ss.getSheetByName('Responses');
    const proctorSheet = ss.getSheetByName('ProctorState');
    const responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];
    const proctorValues = proctorSheet ? getDataRangeValues_(proctorSheet) : [];

    const polls = DataAccess.polls.getByClass(className);

    // Filter polls by date
    const filteredPolls = polls.filter(poll => {
      const pollDate = poll.createdAt ? new Date(poll.createdAt) : null;
      if (dateFrom && pollDate && pollDate < dateFrom) return false;
      if (dateTo && pollDate && pollDate > dateTo) return false;
      return true;
    }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Build per-poll performance
    const pollPerformance = [];
    const overallStats = {
      totalPolls: filteredPolls.length,
      pollsParticipated: 0,
      totalQuestions: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      accuracy: 0,
      violations: [],
      confidenceData: {
        confidentCorrect: 0,
        confidentIncorrect: 0,
        uncertainCorrect: 0,
        uncertainIncorrect: 0
      }
    };

    filteredPolls.forEach(poll => {
      const pollResponses = responseValues.filter(row =>
        row[2] === poll.pollId &&
        (row[4] || '').toString().trim() === studentEmail
      );

      const correctCount = pollResponses.filter(r => {
        const isCorrectRaw = r[6];
        return (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);
      }).length;

      const totalQuestions = poll.questionCount || poll.questions.length;
      const answered = pollResponses.length;
      const accuracy = answered > 0 ? (correctCount / answered) * 100 : 0;

      // Check for violations in this poll
      const pollViolations = proctorValues.filter(row =>
        row[0] === poll.pollId &&
        (row[1] || '').toString().trim() === studentEmail &&
        row[2] === 'LOCKED'
      );

      // Analyze confidence data
      const confidenceData = {
        confidentCorrect: 0,
        confidentIncorrect: 0,
        uncertainCorrect: 0,
        uncertainIncorrect: 0
      };

      pollResponses.forEach(r => {
        const confidence = r[7];
        const isCorrectRaw = r[6];
        const isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);
        const isConfident = (confidence === 'very-sure' || confidence === 'certain');

        if (confidence) {
          if (isConfident && isCorrect) {
            confidenceData.confidentCorrect++;
            overallStats.confidenceData.confidentCorrect++;
          } else if (isConfident && !isCorrect) {
            confidenceData.confidentIncorrect++;
            overallStats.confidenceData.confidentIncorrect++;
          } else if (!isConfident && isCorrect) {
            confidenceData.uncertainCorrect++;
            overallStats.confidenceData.uncertainCorrect++;
          } else {
            confidenceData.uncertainIncorrect++;
            overallStats.confidenceData.uncertainIncorrect++;
          }
        }
      });

      pollPerformance.push({
        pollId: poll.pollId,
        pollName: poll.pollName,
        date: poll.createdAt,
        totalQuestions: totalQuestions,
        questionsAnswered: answered,
        correctAnswers: correctCount,
        accuracy: Math.round(accuracy * 10) / 10,
        participated: answered > 0,
        violations: pollViolations.length,
        confidenceData: confidenceData
      });

      // Update overall stats
      overallStats.totalQuestions += totalQuestions;
      overallStats.questionsAnswered += answered;
      overallStats.correctAnswers += correctCount;
      if (answered > 0) overallStats.pollsParticipated++;
      pollViolations.forEach(v => {
        overallStats.violations.push({
          pollId: poll.pollId,
          pollName: poll.pollName,
          reason: v[4] || '',
          timestamp: v[5] || ''
        });
      });
    });

    overallStats.accuracy = overallStats.questionsAnswered > 0
      ? Math.round((overallStats.correctAnswers / overallStats.questionsAnswered) * 100 * 10) / 10
      : 0;

    // Calculate trend (last 5 polls vs previous 5 polls)
    let trend = 'stable';
    if (pollPerformance.length >= 10) {
      const recent5 = pollPerformance.slice(-5);
      const previous5 = pollPerformance.slice(-10, -5);
      const recentAvg = recent5.reduce((sum, p) => sum + p.accuracy, 0) / 5;
      const previousAvg = previous5.reduce((sum, p) => sum + p.accuracy, 0) / 5;

      if (recentAvg > previousAvg + 10) trend = 'improving';
      else if (recentAvg < previousAvg - 10) trend = 'declining';
    }

    return {
      success: true,
      studentEmail: studentEmail,
      className: className,
      dateRange: { from: dateFrom, to: dateTo },
      overallStats: overallStats,
      pollPerformance: pollPerformance,
      trend: trend
    };
  })();
}

/**
 * Get enhanced post-poll analytics with contextual interpretations
 * Builds on existing getPostPollAnalytics with better guidance
 */
function getEnhancedPostPollAnalytics(pollId) {
  return withErrorHandling(() => {
    // Get base analytics
    const baseAnalytics = getPostPollAnalytics(pollId);
    if (!baseAnalytics.success) return baseAnalytics;

    // Add contextual interpretations
    const enhanced = { ...baseAnalytics };

    // Interpret class performance
    const classOverview = enhanced.classOverview;
    classOverview.interpretation = {
      participation: interpretParticipation(classOverview.participantCount, classOverview.rosterSize),
      meanScore: interpretMeanScore(classOverview.mean, enhanced.questionCount),
      stdDev: interpretStdDev(classOverview.stdDev, enhanced.questionCount),
      distribution: interpretDistribution(classOverview.scoreDistribution)
    };

    // Interpret each item
    enhanced.itemAnalysis.forEach(item => {
      item.interpretation = {
        difficulty: interpretDifficulty(item.difficulty),
        discrimination: interpretDiscrimination(item.discrimination),
        overall: interpretItemQuality(item.difficulty, item.discrimination),
        actionable: getItemActionableInsights(item)
      };
    });

    // Add priority flags for teacher action
    enhanced.teacherActionItems = generateTeacherActionItems(enhanced);

    return enhanced;
  })();
}

/**
 * Helper functions for contextual interpretation
 */

function interpretParticipation(participated, total) {
  if (total === 0) return { level: 'unknown', message: 'No roster data available', color: 'gray' };
  const rate = (participated / total) * 100;
  if (rate >= 90) return { level: 'excellent', message: `${Math.round(rate)}% participation - Excellent engagement`, color: 'green' };
  if (rate >= 75) return { level: 'good', message: `${Math.round(rate)}% participation - Good engagement`, color: 'green' };
  if (rate >= 50) return { level: 'moderate', message: `${Math.round(rate)}% participation - Consider checking in with absent students`, color: 'yellow' };
  return { level: 'low', message: `${Math.round(rate)}% participation - LOW - Check for technical issues or student barriers`, color: 'red' };
}

function interpretMeanScore(mean, maxScore) {
  if (maxScore === 0) return { level: 'unknown', message: 'No questions', color: 'gray' };
  const pct = (mean / maxScore) * 100;
  if (pct >= 85) return { level: 'high', message: `${Math.round(pct)}% average - Strong class mastery`, color: 'green' };
  if (pct >= 70) return { level: 'good', message: `${Math.round(pct)}% average - Good understanding, some review needed`, color: 'green' };
  if (pct >= 50) return { level: 'moderate', message: `${Math.round(pct)}% average - MODERATE - Significant concepts need reteaching`, color: 'yellow' };
  return { level: 'low', message: `${Math.round(pct)}% average - LOW - Major instructional intervention needed`, color: 'red' };
}

function interpretStdDev(stdDev, maxScore) {
  if (maxScore === 0) return { level: 'unknown', message: '', color: 'gray' };
  const pct = (stdDev / maxScore) * 100;
  if (pct >= 30) return { level: 'high', message: 'High spread - Students have very different mastery levels', color: 'blue' };
  if (pct >= 15) return { level: 'moderate', message: 'Moderate spread - Some differentiation in performance', color: 'blue' };
  return { level: 'low', message: 'Low spread - Class performed similarly (good if scores are high, concerning if low)', color: 'blue' };
}

function interpretDistribution(scoreDistribution) {
  if (!scoreDistribution || scoreDistribution.length === 0) {
    return { pattern: 'unknown', message: '' };
  }

  const maxScore = scoreDistribution.length - 1;
  const midpoint = maxScore / 2;

  // Find peak
  let peakScore = 0;
  let peakCount = 0;
  scoreDistribution.forEach(item => {
    if (item.count > peakCount) {
      peakCount = item.count;
      peakScore = item.score;
    }
  });

  if (peakScore >= maxScore * 0.8) {
    return { pattern: 'high-peak', message: 'Most students scored very well - poll may have been too easy or material well-taught' };
  } else if (peakScore <= maxScore * 0.3) {
    return { pattern: 'low-peak', message: 'Most students struggled - consider reteaching or reviewing question clarity' };
  } else {
    return { pattern: 'normal', message: 'Scores spread across range - good discriminating assessment' };
  }
}

function interpretDifficulty(pValue) {
  if (pValue >= 0.9) return { level: 'very-easy', message: 'Very Easy (>90% correct) - May not differentiate student understanding', color: 'blue' };
  if (pValue >= 0.75) return { level: 'easy', message: 'Easy (75-90% correct) - Good confidence builder', color: 'green' };
  if (pValue >= 0.5) return { level: 'moderate', message: 'Moderate (50-75% correct) - Ideal difficulty range', color: 'green' };
  if (pValue >= 0.3) return { level: 'hard', message: 'Hard (30-50% correct) - Challenging but fair', color: 'yellow' };
  return { level: 'very-hard', message: 'Very Hard (<30% correct) - Most students missed this - Review question or reteach concept', color: 'red' };
}

function interpretDiscrimination(discrimination) {
  if (discrimination >= 0.4) return { level: 'excellent', message: 'Excellent (>0.4) - Powerfully separates high/low performers', color: 'green' };
  if (discrimination >= 0.3) return { level: 'good', message: 'Good (0.3-0.4) - Effectively distinguishes understanding', color: 'green' };
  if (discrimination >= 0.15) return { level: 'fair', message: 'Fair (0.15-0.3) - Some discrimination but could be improved', color: 'yellow' };
  if (discrimination >= 0) return { level: 'poor', message: 'Poor (0-0.15) - Barely distinguishes students - Review question quality', color: 'orange' };
  return { level: 'negative', message: 'NEGATIVE (<0) - FLAWED - High performers got it wrong! Check answer key or question wording', color: 'red' };
}

function interpretItemQuality(difficulty, discrimination) {
  // Ideal zone: 0.3 < difficulty < 0.8, discrimination > 0.3
  if (difficulty >= 0.3 && difficulty <= 0.8 && discrimination >= 0.3) {
    return { quality: 'excellent', message: '⭐ Excellent Question - Keep for future assessments' };
  } else if (difficulty >= 0.3 && difficulty <= 0.8 && discrimination >= 0.15) {
    return { quality: 'good', message: '✓ Good Question - Minor tweaks could improve' };
  } else if (discrimination < 0) {
    return { quality: 'flawed', message: '⚠ Flawed Question - Immediate review needed' };
  } else if (difficulty < 0.3 || difficulty > 0.9) {
    return { quality: 'needs-adjustment', message: '⚡ Adjust Difficulty - Question too easy or too hard' };
  } else {
    return { quality: 'fair', message: '◐ Fair Question - Consider revision' };
  }
}

function getItemActionableInsights(item) {
  const insights = [];

  if (item.flags.includes('negative-discrimination')) {
    insights.push('URGENT: Check answer key - high performers chose wrong answer');
  }
  if (item.flags.includes('problematic-distractor')) {
    insights.push('Review distractors - one is confusing high performers');
  }
  if (item.flags.includes('too-hard') && item.discrimination < 0.15) {
    insights.push('Question is both hard AND non-discriminating - likely needs major revision');
  }
  if (item.flags.includes('too-easy')) {
    insights.push('Consider making this question more challenging or use as warm-up');
  }
  if (item.difficulty >= 0.3 && item.difficulty <= 0.8 && item.discrimination >= 0.3) {
    insights.push('Excellent question - save for future use');
  }

  return insights;
}

function generateTeacherActionItems(analytics) {
  const actionItems = [];

  // Check participation
  if (analytics.classOverview.participantCount < analytics.classOverview.rosterSize * 0.75) {
    actionItems.push({
      priority: 'high',
      category: 'participation',
      message: `Only ${analytics.classOverview.participantCount}/${analytics.classOverview.rosterSize} students participated - Follow up with absent students`,
      count: analytics.classOverview.rosterSize - analytics.classOverview.participantCount
    });
  }

  // Check for flawed questions
  const flawedItems = analytics.itemAnalysis.filter(item => item.flags.includes('negative-discrimination'));
  if (flawedItems.length > 0) {
    actionItems.push({
      priority: 'urgent',
      category: 'question-quality',
      message: `${flawedItems.length} question(s) have negative discrimination - REVIEW ANSWER KEYS IMMEDIATELY`,
      items: flawedItems.map(item => ({ index: item.questionIndex, text: item.questionText }))
    });
  }

  // Check for concepts needing reteaching
  const veryHardItems = analytics.itemAnalysis.filter(item => item.difficulty < 0.3 && item.responseCount >= 5);
  if (veryHardItems.length >= analytics.questionCount * 0.3) {
    actionItems.push({
      priority: 'high',
      category: 'instruction',
      message: `${veryHardItems.length}/${analytics.questionCount} questions were very hard (<30% correct) - Consider reteaching these concepts`,
      items: veryHardItems.map(item => ({ index: item.questionIndex, text: item.questionText, pct: item.difficultyPct }))
    });
  }

  // Check metacognition red flags
  if (analytics.metacognition && analytics.metacognition.enabled) {
    const confidentIncorrectPct = analytics.metacognition.overall ? analytics.metacognition.overall.confidentIncorrect : 0;
    if (confidentIncorrectPct >= 20) {
      actionItems.push({
        priority: 'high',
        category: 'metacognition',
        message: `${confidentIncorrectPct}% of responses were confidently incorrect - Students have misconceptions they're unaware of`,
        data: analytics.metacognition.overall
      });
    }
  }

  return actionItems;
}

/**
 * Get dashboard summary data (recent sessions and activity)
 */
function getDashboardSummary() {
  return withErrorHandling(() => {
    const cacheKey = 'DASHBOARD_SUMMARY';

    return CacheManager.get(cacheKey, () => {
      try {
        const analyticsData = getAnalyticsData({});
        const sessions = analyticsData.sessions || [];

        // Get recent 5 sessions
        const recentSessions = sessions
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5)
          .map(session => ({
            sessionId: session.sessionId || '',
            sessionName: session.sessionName || 'Untitled',
            className: session.className || '',
            date: session.date || new Date().toISOString(),
            masteryPct: session.masteryPct || 0,
            participationPct: session.participationPct || 0,
            flags: (session.integrityRate > 1.5 && session.totalStudents) ? Math.round(session.integrityRate * session.totalStudents / 10) : 0
          }));

        // Calculate daily activity for the last 7 days
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const responsesSheet = ss.getSheetByName('Responses');
        const responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        const dailyActivity = {};
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
          const dateKey = date.toISOString().split('T')[0];
          const dayName = i === 0 ? 'Today' : dayNames[date.getDay()];
          dailyActivity[dateKey] = {
            date: dateKey,
            dayName: dayName,
            count: 0
          };
        }

        // Count responses by day
        responseValues.forEach(row => {
          const timestamp = row[1]; // Timestamp column
          if (timestamp && timestamp >= sevenDaysAgo) {
            const dateKey = new Date(timestamp).toISOString().split('T')[0];
            if (dailyActivity[dateKey]) {
              dailyActivity[dateKey].count++;
            }
          }
        });

        const activityArray = Object.values(dailyActivity);
        const totalThisWeek = activityArray.reduce((sum, day) => sum + day.count, 0);

        // Calculate previous week for comparison
        const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
        let totalLastWeek = 0;
        responseValues.forEach(row => {
          const timestamp = row[1];
          if (timestamp && timestamp >= fourteenDaysAgo && timestamp < sevenDaysAgo) {
            totalLastWeek++;
          }
        });

        const weekOverWeekChange = totalLastWeek > 0
          ? Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100)
          : 0;

        Logger.log('Dashboard summary computed', {
          recentSessions: recentSessions.length,
          totalActivityThisWeek: totalThisWeek
        });

        return {
          recentSessions: recentSessions,
          dailyActivity: activityArray,
          weekOverWeekChange: weekOverWeekChange,
          totalActivityThisWeek: totalThisWeek
        };
      } catch (error) {
        Logger.error('Error in getDashboardSummary', error);
        // Return empty but valid structure
        return {
          recentSessions: [],
          dailyActivity: [],
          weekOverWeekChange: 0,
          totalActivityThisWeek: 0
        };
      }
    }, CacheManager.CACHE_TIMES.SHORT);
  })();
}

/**
 * Save misconception tag for an item
 */
function saveMisconceptionTag(pollId, questionIndex, tag) {
  return withErrorHandling(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pollSheet = ss.getSheetByName("Polls");
    const values = getDataRangeValues_(pollSheet);

    // Find the row for this poll and question
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === pollId && values[i][3] === questionIndex) {
        const questionData = JSON.parse(values[i][4] || "{}");
        questionData.misconceptionTag = tag;

        // Update the cell
        pollSheet.getRange(i + 2, 5).setValue(JSON.stringify(questionData)); // +2 because of header and 0-index

        // Invalidate caches
        CacheManager.invalidate(['ALL_POLLS_DATA', 'ANALYTICS_DATA_' + JSON.stringify({})]);

        Logger.log('Misconception tag saved', { pollId, questionIndex, tag });
        return { success: true };
      }
    }

    throw new Error('Question not found');
  })();
}


function getLivePollData(pollId, questionIndex) {
  return withErrorHandling(() => {
    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error("Poll not found");

    let question = poll.questions[questionIndex];
    if (!question) throw new Error("Question not found");

    // DEBUG: Log before normalization
    Logger.log('=== BEFORE NORMALIZATION ===');
    Logger.log(`questionImageFileId: ${question.questionImageFileId}`);
    Logger.log(`options count: ${question.options ? question.options.length : 0}`);
    if (question.options && question.options.length > 0) {
      question.options.forEach((opt, idx) => {
        Logger.log(`  Option ${idx}: imageFileId=${opt.imageFileId}`);
      });
    }

    question = normalizeQuestionObject_(question, poll.updatedAt);

    // DEBUG: Log after normalization
    Logger.log('=== AFTER NORMALIZATION ===');
    Logger.log(`questionImageURL: ${question.questionImageURL}`);
    Logger.log(`options count: ${question.options ? question.options.length : 0}`);
    if (question.options && question.options.length > 0) {
      question.options.forEach((opt, idx) => {
        Logger.log(`  Option ${idx}: imageURL=${opt.imageURL}`);
      });
    }

    poll.questions[questionIndex] = question;

    const liveStatus = DataAccess.liveStatus.get();
    const pollStatus = Array.isArray(liveStatus) ? (liveStatus[2] || 'OPEN') : 'OPEN';
    const statusQuestionIndex = Array.isArray(liveStatus) ? liveStatus[1] : -1;
    const metadata = (liveStatus && liveStatus.metadata) ? liveStatus.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;
    const endedAt = metadata && Object.prototype.hasOwnProperty.call(metadata, 'endedAt') ? metadata.endedAt : null;
    const ended = (metadata && metadata.sessionPhase === 'ENDED') || (!!endedAt && endedAt !== null && endedAt !== '');
    let derivedStatus = metadata && metadata.sessionPhase ? metadata.sessionPhase : null;

    if (!derivedStatus) {
      if (ended) {
        derivedStatus = 'ENDED';
      } else if (pollStatus === 'PAUSED') {
        derivedStatus = 'PAUSED';
      } else if (pollStatus === 'OPEN') {
        derivedStatus = statusQuestionIndex >= 0 ? 'LIVE' : 'PRE_LIVE';
      } else if (pollStatus === 'CLOSED') {
        derivedStatus = statusQuestionIndex >= 0 ? 'ENDED' : 'PRE_LIVE';
      } else {
        derivedStatus = 'PRE_LIVE';
      }
    }

    if (derivedStatus === 'LIVE' && statusQuestionIndex < 0 && !ended) {
      derivedStatus = 'PRE_LIVE';
    }

    if (ended) {
      derivedStatus = 'ENDED';
    }

    const roster = DataAccess.roster.getByClass(poll.className);
    const pollResponses = DataAccess.responses.getByPoll(pollId);
    
    const submittedAnswers = new Map();
    pollResponses
      .filter(r => r[3] === questionIndex)
      .forEach(r => {
        const email = r[4];
        const rawCorrect = r[6];
        const isCorrect = (rawCorrect === true) || (rawCorrect === 'TRUE') || (rawCorrect === 'true') || (rawCorrect === 1);
        submittedAnswers.set(email, {
          timestamp: r[1],
          answer: r[5],
          isCorrect: isCorrect,
          confidence: r[7] || null
        });
      });
    
    const lockedStudents = new Set();
    pollResponses
      .filter(r => r[3] === -1 && PROCTOR_VIOLATION_VALUES.indexOf(r[5]) !== -1)
      .forEach(r => lockedStudents.add(r[4]));

    // OPTIMIZATION: Batch load all proctor states in a single operation
    // instead of calling getState() N times (100 students = 1 call instead of 100)
    const studentEmails = roster.map(s => s.email);
    const proctorStates = ProctorAccess.getStatesBatch(pollId, studentEmails, currentSessionId);

    const studentStatusList = roster.map(student => {
      const email = student.email;

      // Get proctor state from batch-loaded map
      const proctorState = proctorStates.get(email);

      // Get submission if exists
      const submission = submittedAnswers.has(email) ? submittedAnswers.get(email) : null;

      const nameParts = extractStudentNameParts_(student.name);
      const fullName = nameParts.trimmed || student.name || '';
      const displayName = nameParts.displayName || fullName;
      const shortName = formatStudentName_(student.name);

      const baseStudent = {
        name: fullName || displayName,
        displayName: displayName,
        shortName: shortName,
        firstName: nameParts.firstName || displayName,
        lastName: nameParts.lastName || '',
        email: email,
        lockVersion: proctorState.lockVersion,
        lockReason: proctorState.lockReason,
        lockedAt: proctorState.lockedAt,
        blockedBy: proctorState.blockedBy || '',
        blockedAt: proctorState.blockedAt || '',
        blockedNote: proctorState.blockedNote || '',
        answer: submission ? submission.answer : '---',
        isCorrect: submission ? submission.isCorrect : null,
        timestamp: submission ? submission.timestamp : 0,
        sessionViolations: proctorState.sessionViolations || 0,
        sessionExits: proctorState.sessionExits || 0,
        confidence: submission ? (submission.confidence || null) : null
      };

      const statusPayload = (state, overrides = {}) => ({
        ...baseStudent,
        status: state,
        ...overrides
      });

      if (proctorState.status === 'BLOCKED') {
        return statusPayload('BLOCKED', {
          statusNote: proctorState.blockedNote || 'teacher-block'
        });
      }

      if (proctorState.status === 'LOCKED' || proctorState.status === 'AWAITING_FULLSCREEN') {
        return statusPayload(proctorState.status === 'AWAITING_FULLSCREEN' ? 'AWAITING_FULLSCREEN' : 'LOCKED');
      }

      if (submission) {
        return statusPayload('Submitted', {
          statusNote: submission.isCorrect === true ? 'correct' : (submission.isCorrect === false ? 'incorrect' : 'submitted')
        });
      }

      return statusPayload('Waiting...', {
        statusNote: 'waiting',
        timestamp: 9999999999999
      });
    });

    const metacognitionSummary = (() => {
      Logger.log('=== COMPUTING METACOGNITION SUMMARY ===');
      Logger.log('question.metacognitionEnabled: ' + question.metacognitionEnabled);

      const summary = {
        enabled: !!question.metacognitionEnabled,
        totalResponses: 0,
        responseRate: 0,
        matrixCounts: {
          confidentCorrect: 0,
          confidentIncorrect: 0,
          uncertainCorrect: 0,
          uncertainIncorrect: 0
        },
        matrixPercentages: null,
        levels: {},
        flaggedStudents: []
      };

      Logger.log('summary.enabled: ' + summary.enabled);

      if (!summary.enabled) {
        Logger.log('Metacognition not enabled - returning empty summary');
        return summary;
      }

      Logger.log('Metacognition enabled - computing statistics');

      const levelKeys = ['guessing', 'somewhat-sure', 'very-sure', 'certain'];
      const levelStats = levelKeys.reduce((acc, key) => {
        acc[key] = { total: 0, correct: 0, incorrect: 0 };
        return acc;
      }, {});

      let totalConfidenceResponses = 0;

      submittedAnswers.forEach(submission => {
        const confidence = submission.confidence;
        if (!confidence) {
          return;
        }

        if (!Object.prototype.hasOwnProperty.call(levelStats, confidence)) {
          levelStats[confidence] = { total: 0, correct: 0, incorrect: 0 };
        }

        levelStats[confidence].total++;
        if (submission.isCorrect) {
          levelStats[confidence].correct++;
        } else {
          levelStats[confidence].incorrect++;
        }

        totalConfidenceResponses++;

        const isConfident = (confidence === 'very-sure' || confidence === 'certain');

        if (isConfident && submission.isCorrect) {
          summary.matrixCounts.confidentCorrect++;
        } else if (isConfident && !submission.isCorrect) {
          summary.matrixCounts.confidentIncorrect++;
        } else if (!isConfident && submission.isCorrect) {
          summary.matrixCounts.uncertainCorrect++;
        } else {
          summary.matrixCounts.uncertainIncorrect++;
        }
      });

      summary.totalResponses = totalConfidenceResponses;
      summary.responseRate = roster.length > 0
        ? Math.round((totalConfidenceResponses / roster.length) * 100)
        : 0;

      if (totalConfidenceResponses > 0) {
        summary.matrixPercentages = {
          confidentCorrect: Math.round((summary.matrixCounts.confidentCorrect / totalConfidenceResponses) * 100),
          confidentIncorrect: Math.round((summary.matrixCounts.confidentIncorrect / totalConfidenceResponses) * 100),
          uncertainCorrect: Math.round((summary.matrixCounts.uncertainCorrect / totalConfidenceResponses) * 100),
          uncertainIncorrect: Math.round((summary.matrixCounts.uncertainIncorrect / totalConfidenceResponses) * 100)
        };
      }

      summary.levels = Object.keys(levelStats).reduce((acc, level) => {
        const stats = levelStats[level];
        const total = stats.total;
        acc[level] = {
          total: total,
          correct: stats.correct,
          incorrect: stats.incorrect,
          totalPct: totalConfidenceResponses > 0 ? Math.round((total / totalConfidenceResponses) * 100) : 0,
          correctPct: total > 0 ? Math.round((stats.correct / total) * 100) : 0,
          incorrectPct: total > 0 ? Math.round((stats.incorrect / total) * 100) : 0
        };
        return acc;
      }, {});

      summary.flaggedStudents = studentStatusList
        .filter(student => {
          if (!student || !student.confidence) return false;
          const isConfident = (student.confidence === 'very-sure' || student.confidence === 'certain');
          return isConfident && student.isCorrect === false;
        })
        .map(student => ({
          name: student.displayName || student.name || '',
          email: student.email,
          answer: student.answer || '',
          confidence: student.confidence
        }));

      return summary;
    })();

    const answerCounts = {};
    question.options.forEach(opt => {
      if (opt.text) answerCounts[opt.text] = 0;
    });
    
    for (const submission of submittedAnswers.values()) {
      if (answerCounts.hasOwnProperty(submission.answer)) {
        answerCounts[submission.answer]++;
      }
    }
    
    return {
      status: derivedStatus,
      pollId: pollId,
      pollName: poll.pollName,
      questionText: question.questionText || '',
      questionImageURL: question.questionImageURL || null,
      options: question.options || [],
      questionIndex: questionIndex,
      totalQuestions: poll.questions.length,
      correctAnswer: question.correctAnswer || null,
      results: answerCounts,
      studentStatusList: studentStatusList,
      totalStudents: roster.length,
      totalResponses: submittedAnswers.size,
      timerSeconds: question.timerSeconds || null,
      metadata: metadata,
      authoritativeStatus: derivedStatus,
      metacognition: metacognitionSummary
    };
  })();
}


/**
 * Extracts normalized name parts for sorting and display
 * @param {string} fullName
 * @returns {{raw: string, trimmed: string, firstName: string, lastName: string, displayName: string}}
 */
function extractStudentNameParts_(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return { raw: '', trimmed: '', firstName: '', lastName: '', displayName: '' };
  }

  const trimmed = fullName.trim();
  if (!trimmed) {
    return { raw: fullName, trimmed: '', firstName: '', lastName: '', displayName: '' };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstName = parts.length > 0 ? parts[0] : '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || trimmed;

  return { raw: fullName, trimmed: trimmed, firstName: firstName, lastName: lastName, displayName: displayName };
}

/**
 * Formats student name as "FirstName L." (first name + last initial)
 * @param {string} fullName - The student's full name
 * @returns {string} Formatted name
 */
function formatStudentName_(fullName) {
  const parts = extractStudentNameParts_(fullName);
  if (!parts.trimmed) return '';
  if (!parts.lastName) return parts.displayName || parts.trimmed;
  const lastInitial = parts.lastName.charAt(0).toUpperCase();
  return parts.firstName + ' ' + lastInitial + '.';
}

function buildSubmittedAnswersMap_(pollId, questionIndex) {
  const responses = DataAccess.responses.getByPollAndQuestion(pollId, questionIndex) || [];
  const submissions = new Map();

  responses.forEach(row => {
    const email = (row[4] || '').toString().trim();
    if (!email) {
      return;
    }
    const answer = row[5];
    const rawCorrect = row[6];
    const isCorrect = (rawCorrect === true) || (rawCorrect === 'TRUE') || (rawCorrect === 'true') || (rawCorrect === 1);
    const timestamp = typeof row[1] === 'number' ? row[1] : null;

    submissions.set(email, {
      answer: answer,
      isCorrect: isCorrect,
      timestamp: timestamp
    });
  });

  return submissions;
}

function computeAnswerCounts_(question, submissionsMap) {
  const counts = {};
  const options = (question && Array.isArray(question.options)) ? question.options : [];
  options.forEach(opt => {
    if (opt && Object.prototype.hasOwnProperty.call(opt, 'text') && opt.text) {
      counts[opt.text] = 0;
    }
  });

  submissionsMap.forEach(submission => {
    const key = submission.answer;
    if (key && Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key]++;
    }
  });

  return counts;
}

function computeAnswerPercentages_(answerCounts) {
  const percentages = {};
  const values = Object.values(answerCounts || {});
  const total = values.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);

  Object.keys(answerCounts || {}).forEach(key => {
    const count = typeof answerCounts[key] === 'number' ? answerCounts[key] : 0;
    percentages[key] = total > 0 ? Math.round((count / total) * 100) : 0;
  });

  return { percentages, totalResponses: total };
}

// =============================================================================
// STUDENT APP FUNCTIONS
// =============================================================================

function getStudentPollStatus(token, context) {
  return withErrorHandling(() => {
    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;
    const questionIndex = statusValues[1];
    const pollStatus = statusValues[2];
    const sessionPhaseFromMetadata = metadata && metadata.sessionPhase ? metadata.sessionPhase : null;
    const endedAtMetadata = metadata && Object.prototype.hasOwnProperty.call(metadata, 'endedAt') ? metadata.endedAt : null;
    const sessionEnded = sessionPhaseFromMetadata === 'ENDED' || (!!endedAtMetadata && endedAtMetadata !== null && endedAtMetadata !== '');

    const pickMessage = (choices, fallback) => {
      if (Array.isArray(choices) && choices.length > 0) {
        const idx = Math.floor(Math.random() * choices.length);
        return choices[idx];
      }
      return fallback || '';
    };

    const studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();
    const heartbeatInfo = StateVersionManager.noteHeartbeat(studentEmail);
    const stateSnapshot = StateVersionManager.get();
    const now = new Date();
    const nowIso = now.toISOString();
    const lastStateVersion = (context && typeof context.lastStateVersion === 'number') ? context.lastStateVersion : null;
    const versionGap = (typeof lastStateVersion === 'number') ? (stateSnapshot.version - lastStateVersion) : 0;
    const sinceLastSuccess = (context && typeof context.lastSuccessAt === 'number') ? (now.getTime() - context.lastSuccessAt) : null;
    const clientFailures = (context && typeof context.failureCount === 'number') ? context.failureCount : 0;
    const needsResync = versionGap > 3;

    let connectionHealth = heartbeatInfo.health || 'HEALTHY';
    if (needsResync && connectionHealth === 'HEALTHY') {
      connectionHealth = 'RECOVERING';
    }
    if (sinceLastSuccess && sinceLastSuccess > StateVersionManager.OUTAGE_RECOVERY_THRESHOLD_MS && connectionHealth === 'HEALTHY') {
      connectionHealth = 'RECOVERING';
    }

    const baseInterval = 2500;
    let advisedPollIntervalMs = baseInterval + Math.min(1000, clientFailures * 350);
    if (connectionHealth === 'RECOVERING') {
      advisedPollIntervalMs = Math.max(advisedPollIntervalMs, 2800);
    } else if (connectionHealth === 'RECOVERED_AFTER_OUTAGE') {
      advisedPollIntervalMs = Math.max(advisedPollIntervalMs, 2600);
    }
    advisedPollIntervalMs = Math.min(5000, Math.max(2000, advisedPollIntervalMs));

    const fallbackPhase = () => {
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

    const envelope = (payload) => {
      const response = {
        ...payload,
        stateVersion: stateSnapshot.version,
        stateUpdatedAt: stateSnapshot.updatedAt,
        authoritativeStatus: stateSnapshot.status,
        authoritativeReason: stateSnapshot.reason,
        serverTime: nowIso,
        staleAfterMs: 12000,
        teacherStateFingerprint: `${stateSnapshot.version}:${stateSnapshot.updatedAt || ''}`,
        connectionHealth: connectionHealth,
        connectionLagMs: heartbeatInfo.deltaMs || 0,
        lastHeartbeatAt: heartbeatInfo.previousSeen || null,
        advisedPollIntervalMs: advisedPollIntervalMs
      };

      if (needsResync) {
        response.resyncSuggested = true;
        response.resyncHint = 'STATE_VERSION_GAP';
      }

      if (!response.pollId && stateSnapshot.pollId) {
        response.pollId = stateSnapshot.pollId;
      } else if (!response.pollId && pollId) {
        response.pollId = pollId;
      }

      if (response.questionIndex === undefined && typeof stateSnapshot.questionIndex === 'number') {
        response.questionIndex = stateSnapshot.questionIndex;
      }

      if (!response.status) {
        response.status = fallbackPhase();
      } else if (response.status === 'OPEN') {
        response.status = 'LIVE';
      } else if (response.status === 'WAITING') {
        response.status = fallbackPhase();
      } else if (response.status === 'CLOSED') {
        response.status = sessionEnded ? 'ENDED' : 'PRE_LIVE';
      }

      return response;
    };

    const baseWaiting = (status, message, hasSubmitted = false) => envelope({ status, message, hasSubmitted, pollId: pollId });

    if (sessionEnded) {
      return envelope({
        status: 'ENDED',
        hasSubmitted: false,
        message: pickMessage([
          "That’s a wrap! You just finished the poll — nicely done.",
          "Poll complete. You’ve officially survived science."
        ], "That’s a wrap! You just finished the poll — nicely done."),
        pollId: pollId || ''
      });
    }

    if (!pollId || questionIndex < 0) {
      return baseWaiting('PRE_LIVE', pickMessage([
        "Hang tight — your teacher’s loading the next challenge.",
        "Get your brain in gear. The poll’s about to begin!"
      ], "Hang tight — your teacher’s loading the next challenge."), false);
    }

    // Don't show PAUSED state if we're in results phase
    if ((pollStatus === "PAUSED" || sessionPhaseFromMetadata === 'PAUSED') &&
        sessionPhaseFromMetadata !== 'RESULTS_HOLD' &&
        sessionPhaseFromMetadata !== 'RESULTS_REVEALED') {
      const reason = metadata.reason || '';
      let message;
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

    const poll = DataAccess.polls.getById(pollId);

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

    // Check authoritative proctor state (not old Responses sheet)
    const proctorState = ProctorAccess.getState(pollId, studentEmail, metadata && metadata.sessionId ? metadata.sessionId : null);
    const hasSubmitted = DataAccess.responses.hasAnswered(pollId, questionIndex, studentEmail);

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
              "Oops — you left fullscreen. Your poll’s been paused until your teacher lets you back in.",
              "You escaped fullscreen… sneaky! Hang tight until your teacher brings you back."
            ], "Oops — you left fullscreen. Your poll’s been paused until your teacher lets you back in.")
          : pickMessage([
              "You’re cleared for re-entry. Go fullscreen to get back in the game.",
              "All systems go. Click below to resume fullscreen and rejoin the action."
            ], "You’re cleared for re-entry. Go fullscreen to get back in the game."),
        hasSubmitted: hasSubmitted,
        pollId: pollId
      });
    }

    const question = poll.questions[questionIndex];
    const normalizedQuestion = normalizeQuestionObject_(question, poll.updatedAt);

    // DEBUG: Log metacognition status
    Logger.log('=== GET STUDENT POLL STATUS ===');
    Logger.log('Question metacognitionEnabled (before normalization): ' + question.metacognitionEnabled);
    Logger.log('Normalized question metacognitionEnabled: ' + normalizedQuestion.metacognitionEnabled);

    const isCollecting = (metadata && typeof metadata.isCollecting === 'boolean')
      ? metadata.isCollecting
      : (pollStatus === 'OPEN');
    const resultsVisibility = (metadata && metadata.resultsVisibility) ? metadata.resultsVisibility : 'HIDDEN';

    if (isCollecting) {
      if (hasSubmitted) {
        return baseWaiting('LIVE', pickMessage([
          "Answer received — nice work.",
          "Got it! Your response is locked in."
        ], "Answer received — nice work."), true);
      }

      Logger.log('Sending to student - metacognitionEnabled: ' + normalizedQuestion.metacognitionEnabled);

      return envelope({
        status: 'LIVE',
        pollId: pollId,
        questionIndex: questionIndex,
        totalQuestions: poll.questions.length,
        hasSubmitted: false,
        metadata: metadata,
        ...normalizedQuestion
      });
    }

    const submissionsMap = buildSubmittedAnswersMap_(pollId, questionIndex);
    const basePayload = {
      status: resultsVisibility === 'REVEALED' ? 'RESULTS_REVEALED' : 'RESULTS_HOLD',
      pollId: pollId,
      questionIndex: questionIndex,
      totalQuestions: poll.questions.length,
      hasSubmitted: hasSubmitted,
      metadata: metadata,
      resultsVisibility: resultsVisibility,
      isCollecting: false,
      ...normalizedQuestion
    };

    if (resultsVisibility === 'REVEALED') {
      const answerCounts = computeAnswerCounts_(normalizedQuestion, submissionsMap);
      const { percentages, totalResponses } = computeAnswerPercentages_(answerCounts);
      const studentSubmission = submissionsMap.get(studentEmail) || null;

      basePayload.correctAnswer = question.correctAnswer || null;
      basePayload.results = answerCounts;
      basePayload.resultPercentages = percentages;
      basePayload.totalResponses = totalResponses;
      basePayload.studentAnswer = studentSubmission ? (studentSubmission.answer || null) : null;
      basePayload.studentIsCorrect = studentSubmission ? !!studentSubmission.isCorrect : null;
    } else {
      basePayload.totalResponses = submissionsMap.size;
      basePayload.correctAnswer = null;
    }

    return envelope(basePayload);
  })();
}


function submitStudentAnswer(pollId, questionIndex, answerText, token, confidenceLevel = null) {
  return withErrorHandling(() => {
    const studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return {
        success: false,
        error: 'Authentication error. Please use your personalized poll link.'
      };
    }

    try {
      RateLimiter.check(`submit_${studentEmail}`, 5, 60);
    } catch (e) {
      Logger.log('Rate limit hit: ' + studentEmail);
      return { success: false, error: e.message };
    }

    if (typeof answerText !== 'string' || answerText.length > 500) {
      return { success: false, error: 'Invalid answer format' };
    }

    const statusValues = DataAccess.liveStatus.get();
    const activePollId = statusValues[0];
    const activeQIndex = statusValues[1];
    const activeStatus = statusValues[2];

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

    const poll = DataAccess.polls.getById(pollId);
    const question = poll.questions[questionIndex];

    const isCorrect = (question.correctAnswer === answerText);
    const timestamp = new Date().getTime();
    const responseId = "R-" + Utilities.getUuid();

    // Validate confidence level if provided
    const validConfidenceLevels = ['guessing', 'somewhat-sure', 'very-sure', 'certain'];
    const finalConfidence = (confidenceLevel && validConfidenceLevels.includes(confidenceLevel))
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

    Logger.log('Answer submitted', { studentEmail, pollId, questionIndex, isCorrect, confidenceLevel: finalConfidence });

    return { success: true };
  })();
}

// =============================================================================
// PROCTORING & LOCK MANAGEMENT (WITH ATOMIC APPROVAL)
// =============================================================================

/**
 * Proctoring telemetry - toggleable logging for audit trail
 */
const ProctorTelemetry = {
  enabled: true, // Toggle via script properties if needed

  log: function(event, studentEmail, pollId, extra = {}) {
    if (!this.enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      event: event,
      studentEmail: studentEmail,
      pollId: pollId,
      ...extra
    };

    Logger.log('PROCTOR_EVENT: ' + JSON.stringify(entry));

    // Optional: Write to sheet for detailed analysis (disabled by default for performance)
    const enableSheetLogging = PropertiesService.getScriptProperties().getProperty('PROCTOR_SHEET_LOGGING');
    if (enableSheetLogging === 'true') {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName('ProctorLog');
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
          extra.lockVersion || '',
          extra.status || '',
          JSON.stringify(extra)
        ]);
      } catch (e) {
        // Don't fail on logging error
        Logger.error('Telemetry sheet write failed', e);
      }
    }
  }
};

function hydrateProctorBlockFields_(state) {
  if (!state) return state;
  const reason = state.lockReason || '';
  let blockedBy = '';
  let blockedNote = '';
  if (reason && reason.indexOf('teacher-block::') === 0) {
    const remainder = reason.substring('teacher-block::'.length) || '';
    const parts = remainder.split('::');
    blockedBy = parts[0] || '';
    if (parts.length > 1) {
      blockedNote = parts.slice(1).join('::');
    }
  }

  return {
    ...state,
    blockedBy: blockedBy,
    blockedAt: state.status === 'BLOCKED' ? (state.lockedAt || '') : '',
    blockedNote: blockedNote
  };
}

/**
 * Proctoring data access layer
 * Stores per-student lock state with versioning for atomic teacher approvals
 */
const ProctorAccess = {
  /**
   * Get proctoring state for a student
   */
  getState: function(pollId, studentEmail, currentSessionId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('ProctorState');

    // Create sheet if doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('ProctorState');
      sheet.getRange('A1:J1').setValues([[
        'PollID', 'StudentEmail', 'Status', 'LockVersion', 'LockReason',
        'LockedAt', 'UnlockApproved', 'UnlockApprovedBy', 'UnlockApprovedAt', 'SessionId'
      ]]).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    const data = sheet.getDataRange().getValues();

    // Find existing record
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === pollId && data[i][1] === studentEmail) {
        // Migrate old data: if column 2 is boolean (old "locked" field), convert to status
        let status = 'OK';
        if (typeof data[i][2] === 'string' && PROCTOR_STATUS_VALUES.includes(data[i][2])) {
          status = data[i][2];
        } else if (data[i][2] === true || data[i][2] === 'TRUE') {
          status = 'LOCKED'; // Migration: locked=true → LOCKED
        }

        const stateSessionId = data[i][9] || null;
        const baseState = {
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

        // Check if this is a new session and we should reset the state
        // Reset if: currentSessionId exists AND (stateSessionId is missing OR different)
        if (currentSessionId) {
          const needsReset = !stateSessionId || stateSessionId === '' || stateSessionId !== currentSessionId;
          if (needsReset) {
            return hydrateProctorBlockFields_({
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

        return hydrateProctorBlockFields_(baseState);
      }
    }

    // Return default state if not found
    return hydrateProctorBlockFields_({
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
   * OPTIMIZATION: Batch get proctoring states for multiple students
   * Returns a Map of studentEmail -> state object
   * This is ~100x faster than calling getState() in a loop
   */
  getStatesBatch: function(pollId, studentEmails, currentSessionId) {
    const stateMap = new Map();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('ProctorState');

    // Create sheet if doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('ProctorState');
      sheet.getRange('A1:J1').setValues([[
        'PollID', 'StudentEmail', 'Status', 'LockVersion', 'LockReason',
        'LockedAt', 'UnlockApproved', 'UnlockApprovedBy', 'UnlockApprovedAt', 'SessionId'
      ]]).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Single sheet read for ALL students
    const data = sheet.getDataRange().getValues();

    // Build map of existing states for this poll
    const existingStates = new Map();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === pollId) {
        const email = data[i][1];

        // Migrate old data: if column 2 is boolean (old "locked" field), convert to status
        let status = 'OK';
        if (typeof data[i][2] === 'string' && PROCTOR_STATUS_VALUES.includes(data[i][2])) {
          status = data[i][2];
        } else if (data[i][2] === true || data[i][2] === 'TRUE') {
          status = 'LOCKED'; // Migration: locked=true → LOCKED
        }

        const stateSessionId = data[i][9] || null;
        const baseState = {
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

        // Check if this is a new session and we should reset the state
        if (currentSessionId) {
          const needsReset = !stateSessionId || stateSessionId === '' || stateSessionId !== currentSessionId;
          if (needsReset) {
            existingStates.set(email, hydrateProctorBlockFields_({
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
          } else {
            existingStates.set(email, hydrateProctorBlockFields_(baseState));
          }
        } else {
          existingStates.set(email, hydrateProctorBlockFields_(baseState));
        }
      }
    }

    // For each requested student, return their state or default
    studentEmails.forEach(email => {
      if (existingStates.has(email)) {
        stateMap.set(email, existingStates.get(email));
      } else {
        // Return default state if not found
        stateMap.set(email, hydrateProctorBlockFields_({
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
   * Set proctoring state for a student
   */
  setState: function(state) {
    // INVARIANT CHECKS (enforce state machine rules)
    const validStatuses = PROCTOR_STATUS_VALUES;
    if (!validStatuses.includes(state.status)) {
      throw new Error(`Invalid proctor status: ${state.status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (typeof state.lockVersion !== 'number' || state.lockVersion < 0) {
      throw new Error(`Invalid lockVersion: ${state.lockVersion}. Must be non-negative number.`);
    }

    // AWAITING_FULLSCREEN requires unlockApproved=true
    if (state.status === 'AWAITING_FULLSCREEN' && !state.unlockApproved) {
      throw new Error('State AWAITING_FULLSCREEN requires unlockApproved=true (teacher must approve first)');
    }

    // LOCKED requires unlockApproved=false
    if (state.status === 'LOCKED' && state.unlockApproved) {
      throw new Error('State LOCKED requires unlockApproved=false (approval must be cleared on new violation)');
    }

    if (state.status === 'BLOCKED') {
      state.unlockApproved = false;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('ProctorState');

    if (!sheet) {
      // Create if doesn't exist
      this.getState(state.pollId, state.studentEmail);
      sheet = ss.getSheetByName('ProctorState');
    }

    const rowData = [
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
      // Update existing row
      sheet.getRange(state.rowIndex, 1, 1, 10).setValues([rowData]);
    } else {
      // Append new row
      sheet.appendRow(rowData);
    }
  },

  resetForNewSession: function(pollId, sessionId) {
    if (!pollId) {
      return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('ProctorState');
    if (!sheet) {
      return;
    }

    const data = sheet.getDataRange().getValues();
    if (!data || data.length <= 1) {
      return;
    }

    // OPTIMIZATION: Update all data in memory, then write once
    // Instead of N setValues() calls, do 1 batch write
    let hasUpdates = false;
    const updatedData = data.map((row, index) => {
      if (index === 0) return row; // Skip header
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
      // Write all data at once (excluding header)
      sheet.getRange(2, 1, updatedData.length - 1, 10).setValues(updatedData.slice(1));
      SpreadsheetApp.flush();
    }
  }
};

/**
 * Report student violation (new authoritative version)
 */
function reportStudentViolation(reason, token) {
  return withErrorHandling(() => {
    const studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return { success: false, error: 'Authentication error' };
    }

    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    // Get current proctor state
    const currentState = ProctorAccess.getState(pollId, studentEmail, currentSessionId);

    // If already in LOCKED state (but not AWAITING), don't increment version - just update reason
    if (currentState.status === 'LOCKED') {
      Logger.log('Student already locked, not incrementing version', {
        studentEmail,
        pollId,
        currentLockVersion: currentState.lockVersion,
        newReason: reason
      });

      // Update reason but keep everything else
      currentState.lockReason = reason || currentState.lockReason;
      currentState.sessionId = currentSessionId || currentState.sessionId;
      ProctorAccess.setState(currentState);

      return {
        success: true,
        status: 'LOCKED',
        lockVersion: currentState.lockVersion
      };
    }

    // If AWAITING_FULLSCREEN, this is a NEW violation → bump version and reset approval
    if (currentState.status === 'AWAITING_FULLSCREEN') {
      const newState = {
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

      ProctorAccess.setState(newState);

      // Log to Responses sheet for audit trail ONLY (not used for lock state determination)
      // ProctorAccess is the authoritative source - getStudentPollStatus reads from there
      const responseId = 'V-' + Utilities.getUuid();
      DataAccess.responses.add([
        responseId,
        new Date().getTime(),
        pollId,
        -1,
        studentEmail,
        PROCTOR_VIOLATION_CODES.LOCKED,
        false
      ]);

      Logger.log('Student violated while awaiting fullscreen - version bumped', {
        studentEmail,
        pollId,
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

    // OK state - new violation, bump version
    const newState = {
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

    ProctorAccess.setState(newState);

    // Log to Responses sheet for audit trail ONLY (not used for lock state determination)
    // ProctorAccess is the authoritative source - getStudentPollStatus reads from there
    const responseId = 'V-' + Utilities.getUuid();
    DataAccess.responses.add([
      responseId,
      new Date().getTime(),
      pollId,
      -1,
      studentEmail,
      PROCTOR_VIOLATION_CODES.LOCKED,
      false
    ]);

    // Telemetry logging
    ProctorTelemetry.log('violation', studentEmail, pollId, {
      lockVersion: newState.lockVersion,
      reason: newState.lockReason,
      status: 'LOCKED'
    });

    return {
      success: true,
      status: 'LOCKED',
      lockVersion: newState.lockVersion
    };
  })();
}

/**
 * Get student proctor state (for polling)
 */
function getStudentProctorState(token) {
  return withErrorHandling(() => {
    const studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return { success: false, error: 'Authentication error' };
    }

    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    const state = ProctorAccess.getState(pollId, studentEmail, currentSessionId);

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
}

/**
 * Teacher approves unlock (atomic with version check)
 */
function teacherApproveUnlock(studentEmail, pollId, expectedLockVersion) {
  return withErrorHandling(() => {
    const teacherEmail = Session.getActiveUser().getEmail();

    if (teacherEmail !== TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    if (!studentEmail || !pollId || typeof expectedLockVersion !== 'number') {
      throw new Error('Invalid parameters');
    }

    const statusValues = DataAccess.liveStatus.get();
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    // Get current state
    const currentState = ProctorAccess.getState(pollId, studentEmail, currentSessionId);

    // Atomic check: only approve if lockVersion matches and status is LOCKED
    if (currentState.status !== 'LOCKED') {
      Logger.log('Unlock failed: student not locked', { studentEmail, pollId, status: currentState.status });
      return { ok: false, reason: 'not_locked', status: currentState.status };
    }

    if (currentState.lockVersion !== expectedLockVersion) {
      Logger.log('Unlock failed: version mismatch', {
        studentEmail,
        pollId,
        expected: expectedLockVersion,
        current: currentState.lockVersion
      });
      return { ok: false, reason: 'version_mismatch', lockVersion: currentState.lockVersion };
    }

    // Transition to AWAITING_FULLSCREEN (not full unlock yet)
    currentState.status = 'AWAITING_FULLSCREEN';
    currentState.unlockApproved = true;
    currentState.unlockApprovedBy = teacherEmail;
    currentState.unlockApprovedAt = new Date().toISOString();

    currentState.sessionId = currentSessionId || currentState.sessionId;
    ProctorAccess.setState(currentState);

    // Telemetry logging
    ProctorTelemetry.log('approve_unlock', studentEmail, pollId, {
      lockVersion: expectedLockVersion,
      approvedBy: teacherEmail,
      status: 'AWAITING_FULLSCREEN'
    });

    return { ok: true, status: 'AWAITING_FULLSCREEN', lockVersion: expectedLockVersion };
  })();
}

function teacherBlockStudent(studentEmail, pollId, reason) {
  return withErrorHandling(() => {
    const teacherEmail = Session.getActiveUser().getEmail();

    if (teacherEmail !== TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    if (!studentEmail || !pollId) {
      throw new Error('Invalid parameters');
    }

    const statusValues = DataAccess.liveStatus.get();
    const activePollId = statusValues[0];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    if (!activePollId || activePollId !== pollId) {
      throw new Error('Poll is not currently live');
    }

    const currentState = ProctorAccess.getState(pollId, studentEmail, currentSessionId);

    const newState = {
      pollId: pollId,
      studentEmail: studentEmail,
      status: 'BLOCKED',
      lockVersion: (currentState.lockVersion || 0) + 1,
      lockReason: `teacher-block::${teacherEmail}${reason ? '::' + reason : ''}`,
      lockedAt: new Date().toISOString(),
      unlockApproved: false,
      unlockApprovedBy: null,
      unlockApprovedAt: null,
      sessionId: currentSessionId,
      rowIndex: currentState.rowIndex
    };

    ProctorAccess.setState(newState);

    const responseId = 'TB-' + Utilities.getUuid();
    DataAccess.responses.add([
      responseId,
      new Date().getTime(),
      pollId,
      -1,
      studentEmail,
      PROCTOR_VIOLATION_CODES.TEACHER_BLOCK,
      false
    ]);

    ProctorTelemetry.log('teacher_block', studentEmail, pollId, {
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
  })();
}

function teacherUnblockStudent(studentEmail, pollId) {
  return withErrorHandling(() => {
    const teacherEmail = Session.getActiveUser().getEmail();

    if (teacherEmail !== TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    if (!studentEmail || !pollId) {
      throw new Error('Invalid parameters');
    }

    const statusValues = DataAccess.liveStatus.get();
    const activePollId = statusValues[0];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    if (!activePollId || activePollId !== pollId) {
      throw new Error('Poll is not currently live');
    }

    const currentState = ProctorAccess.getState(pollId, studentEmail, currentSessionId);

    if (currentState.status !== 'BLOCKED') {
      return { ok: false, reason: 'not_blocked', status: currentState.status };
    }

    const newState = {
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

    ProctorAccess.setState(newState);

    ProctorTelemetry.log('teacher_unblock', studentEmail, pollId, {
      lockVersion: newState.lockVersion,
      status: 'OK',
      unblockedBy: teacherEmail
    });

    return { ok: true, status: 'OK', lockVersion: newState.lockVersion };
  })();
}

/**
 * Student confirms fullscreen (completes unlock)
 */
function studentConfirmFullscreen(expectedLockVersion, token) {
  return withErrorHandling(() => {
    const studentEmail = token ? TokenManager.getStudentEmail(token) : TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return { success: false, error: 'Authentication error' };
    }

    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};
    const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    // Get current state
    const currentState = ProctorAccess.getState(pollId, studentEmail, currentSessionId);

    // Can only confirm if in AWAITING_FULLSCREEN state and lockVersion matches
    if (currentState.status !== 'AWAITING_FULLSCREEN') {
      Logger.log('Confirm fullscreen failed: wrong status', {
        studentEmail,
        pollId,
        status: currentState.status
      });
      return { success: false, error: 'not_awaiting_fullscreen', status: currentState.status };
    }

    if (currentState.lockVersion !== expectedLockVersion) {
      Logger.log('Confirm fullscreen failed: version mismatch', {
        studentEmail,
        pollId,
        expected: expectedLockVersion,
        current: currentState.lockVersion
      });
      return { success: false, error: 'version_mismatch', lockVersion: currentState.lockVersion };
    }

    // Transition to OK
    currentState.status = 'OK';
    currentState.sessionId = currentSessionId || currentState.sessionId;
    ProctorAccess.setState(currentState);

    // Telemetry logging
    ProctorTelemetry.log('confirm_fullscreen', studentEmail, pollId, {
      lockVersion: expectedLockVersion,
      status: 'OK'
    });

    return { success: true, status: 'OK' };
  })();
}

/**
 * Legacy endpoint - redirect to new implementation
 */
function logStudentViolation() {
  return reportStudentViolation('legacy-violation');
}

function unlockStudent(studentEmail, pollId) {
  // This function is now deprecated in favor of teacherApproveUnlock.
  // It can be removed or left as a no-op.
  Logger.log('Deprecated unlockStudent called', { studentEmail, pollId });
  return { success: true, message: 'This function is deprecated.' };
}

function resetStudentResponse(studentEmail, pollId, questionIndex) {
  return withErrorHandling(() => {
    if (!studentEmail || !pollId || typeof questionIndex === 'undefined') {
      throw new Error('Student email, poll ID, and question index are required');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Responses");

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

    rowsToDelete.forEach(rowIndex => {
      sheet.deleteRow(rowIndex);
    });

    Logger.log('Student response reset', {
      studentEmail,
      pollId,
      questionIndex: normalizedQuestionIndex,
      rowsDeleted: rowsToDelete.length
    });

    return { success: true, rowsDeleted: rowsToDelete.length };
  })();
}
/**
 * Generate HTML email for VERITAS poll link
 * @param {string} pollUrl - The shortened poll URL to include in email
 * @return {string} HTML email body
 */
function generatePollEmailHtml(pollUrl) {
  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>VERITAS Live Poll Session</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    .ReadMsgBody { width: 100%; }
    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 20px !important; }
      .mobile-text { font-size: 15px !important; }
      .mobile-button { padding: 16px 28px !important; font-size: 15px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f8fa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <center style="width: 100%; background-color: #f7f8fa;">
    <div style="max-width: 600px; margin: 0 auto;">
      <!-- Preheader Text (Hidden but shows in preview) -->
      <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
        Your personalized VERITAS Live Poll session is ready. Click to begin participating.
      </div>

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
        <tr>
          <td style="padding: 40px 10px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);">

              <!-- Header with Gold Border -->
              <tr>
                <td style="padding: 0; background: linear-gradient(to right, #c5a05a, #d4b16e); height: 4px; border-radius: 12px 12px 0 0;"></td>
              </tr>

              <!-- Logo/Brand Section -->
              <tr>
                <td style="padding: 32px 40px 24px; text-align: center; background: linear-gradient(135deg, rgba(18, 56, 93, 0.03), rgba(197, 160, 90, 0.05)); border-bottom: 1px solid rgba(18, 56, 93, 0.08);" class="mobile-padding">
                  <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #12385d; letter-spacing: -0.02em; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                    VERITAS
                  </h1>
                  <p style="margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #c5a05a; letter-spacing: 0.1em; text-transform: uppercase; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                    Live Poll Session
                  </p>
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 40px 36px;" class="mobile-padding">
                  <p style="margin: 0 0 24px; font-size: 17px; line-height: 1.6; color: #111111; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;" class="mobile-text">
                    Hello,
                  </p>
                  <p style="margin: 0 0 24px; font-size: 17px; line-height: 1.6; color: #111111; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;" class="mobile-text">
                    Your personalized <strong style="color: #12385d; font-weight: 600;">VERITAS</strong> session link is ready. Click the button below to begin participating in today's live poll.
                  </p>

                  <!-- Call-to-Action Button -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                    <tr>
                      <td align="center">
                        <!--[if mso]>
                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${pollUrl}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="19%" strokecolor="#0f2f4d" fillcolor="#12385d">
                          <w:anchorlock/>
                          <center style="color:#ffffff;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;">Begin Your Session</center>
                        </v:roundrect>
                        <![endif]-->
                        <!--[if !mso]><!-->
                        <a href="${pollUrl}" target="_blank" rel="noopener" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #12385d; text-decoration: none; border-radius: 10px; border: 2px solid #0f2f4d; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(18, 56, 93, 0.25); font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; transition: all 0.2s ease;" class="mobile-button">
                          Begin Your Session
                        </a>
                        <!--<![endif]-->
                      </td>
                    </tr>
                  </table>

                  <!-- Important Notice Box -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0 0; background-color: rgba(18, 56, 93, 0.04); border-left: 3px solid #c5a05a; border-radius: 6px;">
                    <tr>
                      <td style="padding: 20px 24px;">
                        <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #12385d; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                          ⚠️ Important Instructions
                        </p>
                        <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #4b5563; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                          <li style="margin-bottom: 8px;">Once you begin, stay in fullscreen mode</li>
                          <li style="margin-bottom: 8px;">Do not navigate to other browser tabs or applications</li>
                          <li style="margin-bottom: 0;">Do not refresh or close the browser window</li>
                        </ul>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Fallback Link Section -->
              <tr>
                <td style="padding: 0 40px 36px;" class="mobile-padding">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid rgba(18, 56, 93, 0.1);">
                    <tr>
                      <td style="padding: 20px 24px;">
                        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #6b7280; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                          Button not working?
                        </p>
                        <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #6b7280; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                          Copy and paste this link into your browser:
                        </p>
                        <p style="margin: 8px 0 0; font-size: 12px; word-break: break-all; font-family: 'Courier New', Courier, monospace;">
                          <a href="${pollUrl}" target="_blank" rel="noopener" style="color: #12385d; text-decoration: underline;">${pollUrl}</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 32px 40px; background-color: rgba(18, 56, 93, 0.02); border-top: 1px solid rgba(18, 56, 93, 0.08); border-radius: 0 0 12px 12px; text-align: center;" class="mobile-padding">
                  <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: #6b7280; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                    🔒 <strong style="color: #12385d; font-weight: 600;">This link is unique to you</strong>
                  </p>
                  <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #6b7280; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                    Do not share this link. It connects directly to your personal VERITAS session.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Email Footer -->
        <tr>
          <td style="padding: 0 10px 40px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-container" style="max-width: 600px; margin: 0 auto;">
              <tr>
                <td style="padding: 20px 0; text-align: center;">
                  <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #9ca3af; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
                    Powered by <strong style="color: #12385d;">VERITAS</strong> Live Poll System
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </center>
</body>
</html>
  `;
}

/**
 * Sends unique personalized poll links to all students in a class.
 * Each student receives their own token-based URL.
 */
function sendPollLinkToClass(className) {
  return withErrorHandling(() => {
    // Only the teacher can run this
    if (Session.getActiveUser().getEmail() !== TEACHER_EMAIL) {
      throw new Error('Unauthorized action.');
    }
    
    const roster = DataAccess.roster.getByClass(className);
    if (!roster || roster.length === 0) {
      throw new Error(`No students found in roster for ${className}.`);
    }
    
    const baseUrl = ScriptApp.getService().getUrl();
    const links = [];
    
    // Generate unique token for each student
    roster.forEach(student => {
      const token = TokenManager.generateToken(student.email, className);
      const personalizedUrl = `${baseUrl}?token=${token}`;
      // Shorten the URL for better user experience
      const shortUrl = URLShortener.shorten(personalizedUrl);
      TokenManager.recordShortUrl(token, shortUrl);
      links.push({
        email: student.email,
        name: student.name,
        url: shortUrl,
        fullUrl: personalizedUrl,
        token: token
      });
    });

    // Get current date formatted like "November 6, 2025"
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");

    // Send individual emails with personalized links
    links.forEach(link => {
      const subject = `Your VERITAS Live Poll Link – ${today}`;
      const htmlBody = generatePollEmailHtml(link.url);

      MailApp.sendEmail({
        to: link.email,
        subject: subject,
        htmlBody: htmlBody
      });
    });
    
    CacheManager.invalidate(CLASS_LINKS_CACHE_PREFIX + encodeURIComponent(className));

    Logger.log('Personalized poll links sent', {
      className: className,
      studentCount: links.length
    });
    
    return { 
      success: true, 
      count: links.length,
      links: links // Return links for teacher reference
    };
  })();
}

/**
 * Get all active student links for a class (for teacher reference)
 */
function getStudentLinksForClass(className) {
  return withErrorHandling(() => {
    if (Session.getActiveUser().getEmail() !== TEACHER_EMAIL) {
      throw new Error('Unauthorized action.');
    }

    const cacheKey = CLASS_LINKS_CACHE_PREFIX + encodeURIComponent(className);

    return CacheManager.get(cacheKey, () => {
      const roster = DataAccess.roster.getByClass(className) || [];
      const baseUrl = ScriptApp.getService().getUrl();
      const snapshot = TokenManager.getActiveSnapshot();

      const links = roster.map(student => {
        const tokenInfo = TokenManager.getTokenFromSnapshot(snapshot, student.email, className);
        if (tokenInfo) {
          const fullUrl = `${baseUrl}?token=${tokenInfo.token}`;
          return {
            name: student.name,
            email: student.email,
            url: tokenInfo.data.shortUrl || fullUrl,
            fullUrl: fullUrl,
            hasActiveLink: true
          };
        }

        return {
          name: student.name,
          email: student.email,
          url: 'No active link',
          fullUrl: '',
          hasActiveLink: false
        };
      });

      return { success: true, links: links };
    }, CacheManager.CACHE_TIMES.SHORT);
  })();
}

// =============================================================================
// INTERNAL HELPER FUNCTIONS
// =============================================================================

function getPolls_() {
  return CacheManager.get('ALL_POLLS_DATA', () => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const pollSheet = ss.getSheetByName("Polls");
    const values = getDataRangeValues_(pollSheet);

    const pollsMap = new Map();

    values.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return a[3] - b[3];
    });

    values.forEach(row => {
      const pollId = row[0];
      const pollName = row[1];
      const className = row[2];
      const questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10) || 0;
      const createdAt = row[5] || '';
      const updatedAt = row[6] || createdAt || '';
      const sessionType = row[7] || 'LIVE_POLL';  // Default to LIVE_POLL for backward compatibility
      const timeLimitMinutes = row[8] || null;
      const questionData = normalizeQuestionObject_(JSON.parse(row[4] || "{}"), updatedAt);
      questionData.index = questionIndex;

      if (!pollsMap.has(pollId)) {
        pollsMap.set(pollId, {
          pollId: pollId,
          pollName: pollName,
          className: className,
          createdAt: createdAt,
          updatedAt: updatedAt,
          sessionType: sessionType,
          timeLimitMinutes: timeLimitMinutes,
          questions: []
        });
      }

      const pollEntry = pollsMap.get(pollId);
      pollEntry.questions.push(questionData);
      pollEntry.questionCount = pollEntry.questions.length;
    });

    return Array.from(pollsMap.values());
  }, CacheManager.CACHE_TIMES.LONG);
}

function writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt, sessionType, timeLimitMinutes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pollSheet = ss.getSheetByName('Polls');
  if (!pollSheet) {
    throw new Error('Polls sheet not found. Run setupSheet() first.');
  }

  // Default to LIVE_POLL for backward compatibility
  const finalSessionType = sessionType || 'LIVE_POLL';
  const finalTimeLimitMinutes = (finalSessionType === 'INDIVIDUAL_TIMED' && timeLimitMinutes) ? timeLimitMinutes : null;

  // DEBUG: Log what we're about to save
  Logger.log('=== SAVING POLL DATA ===');
  Logger.log('Poll ID: ' + pollId);
  Logger.log('Session Type: ' + finalSessionType);
  Logger.log('Time Limit (minutes): ' + finalTimeLimitMinutes);
  questions.forEach((q, idx) => {
    Logger.log(`Question ${idx}: questionImageFileId=${q.questionImageFileId}, metacognitionEnabled=${q.metacognitionEnabled}, options count=${q.options ? q.options.length : 0}`);
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, optIdx) => {
        Logger.log(`  Option ${optIdx}: text="${opt.text}", imageFileId=${opt.imageFileId}`);
      });
    }
  });

  const payload = questions.map((q, index) => [
    pollId,
    pollName,
    className,
    index,
    JSON.stringify(q),
    createdAt,
    updatedAt,
    finalSessionType,
    finalTimeLimitMinutes
  ]);

  if (payload.length === 0) {
    return;
  }

  const startRow = pollSheet.getLastRow() + 1;
  pollSheet.getRange(startRow, 1, payload.length, payload[0].length).setValues(payload);
}

function removePollRows_(pollId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pollSheet = ss.getSheetByName('Polls');
  if (!pollSheet) {
    return;
  }

  // OPTIMIZATION: Filter and rewrite instead of row-by-row deletion
  const values = getDataRangeValues_(pollSheet);
  const keepRows = values.filter(row => row[0] !== pollId);

  if (keepRows.length < values.length) {
    // Clear all data rows (keep header)
    if (values.length > 0) {
      pollSheet.getRange(2, 1, values.length, pollSheet.getLastColumn()).clearContent();
    }
    // Rewrite filtered data
    if (keepRows.length > 0) {
      pollSheet.getRange(2, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
    }
  }
}

function ensureClassExists_(className, description) {
  if (!className) {
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const classesSheet = ss.getSheetByName('Classes');
  if (!classesSheet) {
    return;
  }

  const trimmedName = className.toString().trim();
  if (trimmedName === '') {
    return;
  }

  const lastRow = classesSheet.getLastRow();
  if (lastRow >= 2) {
    const existingNames = classesSheet.getRange(2, 1, lastRow - 1, 1).getValues()
      .map(row => row[0])
      .filter(name => name);
    if (existingNames.includes(trimmedName)) {
      return;
    }
  }

  classesSheet.appendRow([trimmedName, description || '']);
}

function getClasses_() {
  return CacheManager.get('CLASSES_LIST', () => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const classesSheet = ss.getSheetByName("Classes");
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      const values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 1).getValues();
      return values
        .map(row => row[0])
        .filter(name => name && name.toString().trim() !== '')
        .map(name => name.toString().trim())
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .sort();
    }

    const rosterSheet = ss.getSheetByName("Rosters");
    const values = getDataRangeValues_(rosterSheet);
    const classNames = new Set(
      values
        .map(row => row[0])
        .filter(name => name && name.toString().trim() !== '')
    );
    return Array.from(classNames).sort();
  }, CacheManager.CACHE_TIMES.LONG);
}

function getRoster_(className) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rosterSheet = ss.getSheetByName("Rosters");
  const values = getDataRangeValues_(rosterSheet);

  return values
    .filter(row => row[0] === className)
    .map(row => ({ name: (row[1] || '').toString().trim(), email: (row[2] || '').toString().trim() }))
    .filter(entry => entry.name !== '' && entry.email !== '')
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getDataRangeValues_(sheet) {
  if (sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function normalizeQuestionObject_(questionData, pollUpdatedAt = null) {
  const normalized = {};
  const webAppUrl = getWebAppUrl_();

  // Generate version string for cache busting
  // Use poll's updatedAt timestamp, or current time as fallback
  const versionParam = pollUpdatedAt
    ? `&v=${encodeURIComponent(new Date(pollUpdatedAt).getTime())}`
    : `&v=${Date.now()}`;

  // Normalize question text
  normalized.questionText = questionData.questionText || questionData.text || '';

  // NEW APPROACH: Use fileId to generate proxy URL with version for cache busting
  // Check for questionImageFileId first (new canonical field)
  // Fall back to questionImageURL for legacy polls
  let questionImageUrl = null;

  if (questionData.questionImageFileId && typeof questionData.questionImageFileId === 'string') {
    // NEW: Use Google Drive thumbnail API for direct image display
    questionImageUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(questionData.questionImageFileId)}&sz=w1000`;
  } else {
    // LEGACY: Use old URL field (Drive URL)
    let legacyUrl = questionData.questionImageURL || questionData.questionImage || null;
    if (legacyUrl && typeof legacyUrl === 'string') {
      // Ensure it's a URL (starts with http/https), not base64
      if (legacyUrl.startsWith('http://') || legacyUrl.startsWith('https://')) {
        questionImageUrl = legacyUrl;
      } else if (legacyUrl.startsWith('data:')) {
        // Legacy base64 - ignore it
        Logger.log('Ignoring legacy base64 questionImage');
        questionImageUrl = null;
      }
    }
  }

  normalized.questionImageURL = questionImageUrl;
  normalized.questionImage = questionImageUrl;  // For backward compatibility
  normalized.questionImageFileId = questionData.questionImageFileId || null; // Preserve fileId

  // Normalize options
  const optionsArray = Array.isArray(questionData.options) ? questionData.options : [];
  normalized.options = optionsArray.map(opt => {
    if (typeof opt === 'string') {
      return { text: opt, imageURL: null, image: null, imageFileId: null };
    }

    // NEW APPROACH: Use fileId to generate proxy URL with version for cache busting
    let optionImageUrl = null;

    if (opt.imageFileId && typeof opt.imageFileId === 'string') {
      // NEW: Use Google Drive thumbnail API for direct image display
      optionImageUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(opt.imageFileId)}&sz=w1000`;
    } else {
      // LEGACY: Use old URL field
      let legacyUrl = opt.imageURL || opt.image || null;
      if (legacyUrl && typeof legacyUrl === 'string') {
        // Ensure it's a URL, not base64
        if (legacyUrl.startsWith('http://') || legacyUrl.startsWith('https://')) {
          optionImageUrl = legacyUrl;
        } else if (legacyUrl.startsWith('data:')) {
          // Legacy base64 - ignore it
          Logger.log('Ignoring legacy base64 option image');
          optionImageUrl = null;
        }
      }
    }

    return {
      text: opt.text || '',
      imageURL: optionImageUrl,
      image: optionImageUrl,  // For backward compatibility
      imageFileId: opt.imageFileId || null  // Preserve fileId
    };
  });

  // Normalize other fields
  normalized.correctAnswer = questionData.correctAnswer || null;

  if (questionData.explanation) {
    normalized.explanation = questionData.explanation;
  }

  if (questionData.timerSeconds) {
    normalized.timerSeconds = questionData.timerSeconds;
  }

  // Metacognition field (default to false for backward compatibility)
  normalized.metacognitionEnabled = questionData.metacognitionEnabled === true ||
    questionData.metacognitionEnabled === 'true' ||
    questionData.metacognitionEnabled === 1;

  return normalized;
}
