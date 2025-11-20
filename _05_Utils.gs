// =============================================================================
// VERITAS LIVE POLL - UTILITIES MODULE
// =============================================================================
// Purpose: Shared utility functions (URL building, date parsing, formatting, etc.)
// Dependencies: Config, Logging
// =============================================================================

Veritas.Utils = Veritas.Utils || {};

// --- HTML ESCAPING ---

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} value - Text to escape
 * @returns {string} HTML-safe text
 */
Veritas.Utils.escapeHtml = function(value) {
  if (value === null || value === undefined) return '';
  var text = String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// --- URL BUILDING ---

/**
 * Build query string from parameters object
 * @param {Object} params - Key-value pairs for query parameters
 * @returns {string} URL-encoded query string
 */
Veritas.Utils.buildQueryString = function(params) {
  if (!params || typeof params !== 'object') return '';

  var pairs = [];
  for (var key in params) {
    if (params.hasOwnProperty(key) && params[key] !== null && params[key] !== undefined) {
      pairs.push(
        encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
      );
    }
  }

  return pairs.length > 0 ? '?' + pairs.join('&') : '';
};

/**
 * Build teacher account chooser URL with login hint
 * @param {Object} e - doGet event object
 * @param {string} loginHintEmail - Email to suggest for login
 * @returns {string} Account chooser URL
 */
Veritas.Utils.buildTeacherAccountChooserUrl = function(e, loginHintEmail) {
  var baseUrl = ScriptApp.getService().getUrl();
  var params = {};

  // Preserve existing query parameters
  if (e && e.parameter) {
    for (var key in e.parameter) {
      if (e.parameter.hasOwnProperty(key)) {
        params[key] = e.parameter[key];
      }
    }
  }

  // Add login hint
  if (loginHintEmail) {
    params.authuser = loginHintEmail;
  }

  return baseUrl + Veritas.Utils.buildQueryString(params);
};

// --- DATE PARSING & FORMATTING ---

/**
 * Parse a date input (string or Date object) into a Date
 * @param {string|Date} value - Date value to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
Veritas.Utils.parseDateInput = function(value) {
  if (!value) return null;

  try {
    var date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (err) {
    Veritas.Logging.error('Failed to parse date input', err);
  }

  var parsed = Date.parse(value);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
};

/**
 * Format a date for secure assessment labels
 * @param {Date} dateObj - Date to format
 * @returns {string} Formatted date string (e.g., "Jan 15, 2025 3:30 PM")
 */
Veritas.Utils.formatSecureDateLabel = function(dateObj) {
  if (!dateObj) return '';

  var timezone = Veritas.Config.getTimeZone();
  return Utilities.formatDate(dateObj, timezone, 'MMM d, yyyy h:mm a');
};

// --- STRING PARSING ---

/**
 * Extract student name parts for display
 * @param {string} fullName - Full student name
 * @returns {Object} { displayName, firstName, lastName, trimmed }
 */
Veritas.Utils.extractStudentNameParts = function(fullName) {
  if (!fullName) {
    return { displayName: '', firstName: '', lastName: '', trimmed: '' };
  }

  var trimmed = String(fullName).trim();
  var parts = trimmed.split(/\s+/);

  if (parts.length === 0) {
    return { displayName: '', firstName: '', lastName: '', trimmed: trimmed };
  }

  var firstName = parts[0] || '';
  var lastName = parts.length > 1 ? parts[parts.length - 1] : '';

  // Display name: "First L." for privacy, or just "First" if no last name
  var displayName = firstName;
  if (lastName) {
    displayName = firstName + ' ' + lastName.charAt(0) + '.';
  }

  return {
    displayName: displayName,
    firstName: firstName,
    lastName: lastName,
    trimmed: trimmed
  };
};

/**
 * Format student name for display
 * @param {string} fullName - Full student name
 * @returns {string} Formatted display name
 */
Veritas.Utils.formatStudentName = function(fullName) {
  return Veritas.Utils.extractStudentNameParts(fullName).displayName;
};

// --- BOOLEAN COERCION ---

/**
 * Coerce a value to boolean
 * @param {*} value - Value to coerce
 * @param {boolean} defaultValue - Default if value is null/undefined
 * @returns {boolean} Boolean value
 */
Veritas.Utils.coerceBoolean = function(value, defaultValue) {
  if (value === null || value === undefined) {
    return Boolean(defaultValue);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    var lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (lower === 'false' || lower === 'no' || lower === '0' || lower === '') return false;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return Boolean(value);
};

/**
 * Normalize a boolean value from a sheet (handles various truthy representations)
 * @param {*} value - Value from sheet
 * @param {boolean} defaultValue - Default if value is falsy
 * @returns {boolean} Normalized boolean
 */
Veritas.Utils.normalizeSheetBoolean = function(value, defaultValue) {
  defaultValue = defaultValue !== undefined ? defaultValue : false;

  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  return Veritas.Utils.coerceBoolean(value, defaultValue);
};

// --- ARRAY SHUFFLING ---

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle (modified in place)
 * @returns {Array} Shuffled array
 */
Veritas.Utils.shuffleArray = function(array) {
  if (!Array.isArray(array)) return array;

  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  return array;
};

// --- UUID GENERATION ---

/**
 * Generate a UUID (wrapper for Utilities.getUuid)
 * @returns {string} UUID string
 */
Veritas.Utils.generateUuid = function() {
  return Utilities.getUuid();
};

// --- LEGACY COMPATIBILITY ---
// Maintain backward compatibility with existing functions

function escapeHtml_(value) {
  return Veritas.Utils.escapeHtml(value);
}

function buildQueryString_(params) {
  return Veritas.Utils.buildQueryString(params);
}

function buildTeacherAccountChooserUrl_(e, loginHintEmail) {
  return Veritas.Utils.buildTeacherAccountChooserUrl(e, loginHintEmail);
}

function parseDateInput_(value) {
  return Veritas.Utils.parseDateInput(value);
}

function formatSecureDateLabel_(dateObj) {
  return Veritas.Utils.formatSecureDateLabel(dateObj);
}

function extractStudentNameParts_(fullName) {
  return Veritas.Utils.extractStudentNameParts(fullName);
}

function formatStudentName_(fullName) {
  return Veritas.Utils.formatStudentName(fullName);
}

function coerceBoolean_(value, defaultValue) {
  return Veritas.Utils.coerceBoolean(value, defaultValue);
}

function normalizeSheetBoolean_(value, defaultValue) {
  return Veritas.Utils.normalizeSheetBoolean(value, defaultValue);
}

function shuffleArray_(array) {
  return Veritas.Utils.shuffleArray(array);
}

// =============================================================================
// CACHE MANAGER
// =============================================================================

/**
 * Advanced cache manager for Script Cache Service
 */
Veritas.Utils.CacheManager = {
  CACHE_TIMES: {
    INSTANT: 1,      // 1 second for real-time live data
    SHORT: 5,        // 5 seconds for live data
    MEDIUM: 60,      // 1 minute for semi-static
    LONG: 600,       // 10 minutes for static
    VERY_LONG: 21600 // 6 hours for rarely changing
  },

  /**
   * Get value from cache or fetch fresh if missing/expired
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Function to call if cache miss
   * @param {number} duration - Cache duration in seconds
   * @returns {*} Cached or fresh value
   */
  get: function(key, fetchFunction, duration) {
    duration = duration || this.CACHE_TIMES.MEDIUM;
    var cache = CacheService.getScriptCache();
    var cached = cache.get(key);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        Veritas.Logging.error('Cache parse error', e);
      }
    }

    var fresh = fetchFunction();
    try {
      cache.put(key, JSON.stringify(fresh), duration);
    } catch (e) {
      Veritas.Logging.error('Cache put error', e);
    }
    return fresh;
  },

  /**
   * Invalidate one or more cache keys
   * @param {string|string[]} keys - Key or array of keys to invalidate
   */
  invalidate: function(keys) {
    var cache = CacheService.getScriptCache();
    if (Array.isArray(keys)) {
      cache.removeAll(keys);
    } else {
      cache.remove(keys);
    }
  }
};

// =============================================================================
// RATE LIMITER
// =============================================================================

/**
 * Rate limiter for preventing abuse
 */
Veritas.Utils.RateLimiter = {
  /**
   * Check if rate limit allows this action
   * @param {string} key - Rate limit key (e.g., user email or IP)
   * @param {number} maxAttempts - Maximum attempts allowed
   * @param {number} windowSeconds - Time window in seconds
   * @returns {boolean} True if allowed
   * @throws {Error} If rate limit exceeded
   */
  check: function(key, maxAttempts, windowSeconds) {
    maxAttempts = maxAttempts || 10;
    windowSeconds = windowSeconds || 60;

    var cache = CacheService.getUserCache();
    var attempts = parseInt(cache.get(key) || '0');

    if (attempts >= maxAttempts) {
      throw new Error('Rate limit exceeded. Please wait before trying again.');
    }

    cache.put(key, (attempts + 1).toString(), windowSeconds);
    return true;
  }
};

// =============================================================================
// TOKEN MANAGER
// =============================================================================

/**
 * Token manager for anonymous student authentication
 */
Veritas.Utils.TokenManager = {
  /**
   * Load token structures from Script Properties
   * @private
   */
  _loadStructures: function() {
    var props = PropertiesService.getScriptProperties();
    return {
      props: props,
      tokenMap: JSON.parse(props.getProperty(Veritas.Config.STUDENT_TOKEN_MAP_KEY) || '{}'),
      indexMap: JSON.parse(props.getProperty(Veritas.Config.STUDENT_TOKEN_INDEX_KEY) || '{}')
    };
  },

  /**
   * Save token structures to Script Properties
   * @private
   */
  _saveStructures: function(struct) {
    struct.props.setProperty(Veritas.Config.STUDENT_TOKEN_MAP_KEY, JSON.stringify(struct.tokenMap));
    struct.props.setProperty(Veritas.Config.STUDENT_TOKEN_INDEX_KEY, JSON.stringify(struct.indexMap));
  },

  /**
   * Generate student key from email and class name
   * @private
   */
  _studentKey: function(email, className) {
    return ((email || '').toLowerCase()) + '::' + (className || '');
  },

  /**
   * Remove a token from structures
   * @private
   */
  _removeToken: function(struct, token) {
    if (!token) return;
    var entry = struct.tokenMap[token];
    if (entry && entry.studentKey && struct.indexMap[entry.studentKey] === token) {
      delete struct.indexMap[entry.studentKey];
    } else {
      var keys = Object.keys(struct.indexMap);
      for (var i = 0; i < keys.length; i++) {
        if (struct.indexMap[keys[i]] === token) {
          delete struct.indexMap[keys[i]];
        }
      }
    }
    delete struct.tokenMap[token];
  },

  /**
   * Purge expired tokens
   * @private
   */
  _purgeExpired: function(struct) {
    var now = Date.now();
    var mutated = false;
    var self = this;
    var tokens = Object.keys(struct.tokenMap);

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var entry = struct.tokenMap[token];
      if (!entry || now > entry.expires) {
        self._removeToken(struct, token);
        mutated = true;
      }
    }
    return mutated;
  },

  /**
   * Generate a unique token for a student
   * @param {string} studentEmail - Student email
   * @param {string} className - Class name
   * @returns {string} Generated token
   */
  generateToken: function(studentEmail, className) {
    var struct = this._loadStructures();
    this._purgeExpired(struct);

    var studentKey = this._studentKey(studentEmail, className);
    var existingToken = struct.indexMap[studentKey];
    if (existingToken) {
      this._removeToken(struct, existingToken);
    }

    var token = Utilities.getUuid();
    var expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + Veritas.Config.TOKEN_EXPIRY_DAYS);

    struct.indexMap[studentKey] = token;
    struct.tokenMap[token] = {
      email: studentEmail,
      className: className,
      created: Date.now(),
      expires: expiryDate.getTime(),
      studentKey: studentKey
    };

    this._saveStructures(struct);
    Veritas.Logging.info('Token generated', { email: studentEmail, token: token });

    return token;
  },

  /**
   * Validate and retrieve student info from token
   * @param {string} token - Token to validate
   * @returns {Object|null} Token data or null if invalid
   */
  validateToken: function(token) {
    if (!token) return null;

    var struct = this._loadStructures();
    var mutated = this._purgeExpired(struct);

    var tokenData = struct.tokenMap[token] || null;
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
   * @param {string} token - Token
   * @returns {string|null} Student email or null
   */
  getStudentEmail: function(token) {
    var tokenData = this.validateToken(token);
    return tokenData ? tokenData.email : null;
  },

  /**
   * Store token in user properties (for current session)
   * @param {string} token - Token to store
   */
  setSessionToken: function(token) {
    var userProps = PropertiesService.getUserProperties();
    userProps.setProperty('CURRENT_TOKEN', token);
  },

  /**
   * Get token from current session
   * @returns {string|null} Session token or null
   */
  getSessionToken: function() {
    var userProps = PropertiesService.getUserProperties();
    return userProps.getProperty('CURRENT_TOKEN');
  },

  /**
   * Clear session token
   */
  clearSessionToken: function() {
    var userProps = PropertiesService.getUserProperties();
    userProps.deleteProperty('CURRENT_TOKEN');
  },

  /**
   * Get student email from current session (either token or Google auth)
   * @returns {string|null} Student email or null
   */
  getCurrentStudentEmail: function() {
    var token = this.getSessionToken();
    if (token) {
      var email = this.getStudentEmail(token);
      if (email) return email;
    }

    try {
      var email = Session.getActiveUser().getEmail();
      if (email && email !== '') return email;
    } catch (e) {
      Veritas.Logging.info('No active user session');
    }

    return null;
  },

  /**
   * Snapshot tokens for quick lookup by student
   * @returns {Object} Snapshot with tokenMap and indexMap
   */
  getActiveSnapshot: function() {
    var struct = this._loadStructures();
    var mutated = this._purgeExpired(struct);
    var tokens = Object.keys(struct.tokenMap);
    var self = this;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var entry = struct.tokenMap[token];
      if (!entry) continue;

      if (!entry.studentKey) {
        entry.studentKey = self._studentKey(entry.email, entry.className);
        struct.tokenMap[token] = entry;
        mutated = true;
      }
      if (entry.studentKey && struct.indexMap[entry.studentKey] !== token) {
        struct.indexMap[entry.studentKey] = token;
        mutated = true;
      }
    }

    if (mutated) {
      this._saveStructures(struct);
    }
    return {
      tokenMap: struct.tokenMap,
      indexMap: struct.indexMap
    };
  },

  /**
   * Get token from snapshot by email and class name
   * @param {Object} snapshot - Token snapshot
   * @param {string} email - Student email
   * @param {string} className - Class name
   * @returns {Object|null} Token object or null
   */
  getTokenFromSnapshot: function(snapshot, email, className) {
    if (!snapshot) return null;
    var key = this._studentKey(email, className);
    var token = snapshot.indexMap[key];
    if (!token) return null;
    var data = snapshot.tokenMap[token];
    if (!data) return null;
    return { token: token, data: data };
  },

  /**
   * Record short URL for a token
   * @param {string} token - Token
   * @param {string} shortUrl - Short URL
   */
  recordShortUrl: function(token, shortUrl) {
    if (!token || !shortUrl) return;
    var struct = this._loadStructures();
    if (struct.tokenMap[token]) {
      struct.tokenMap[token].shortUrl = shortUrl;
      this._saveStructures(struct);
    }
  }
};

// =============================================================================
// LEGACY COMPATIBILITY - Global Objects
// =============================================================================

/**
 * Legacy CacheManager object - delegates to Veritas.Utils.CacheManager
 */
var CacheManager = {
  CACHE_TIMES: Veritas.Utils.CacheManager.CACHE_TIMES,
  get: function(key, fetchFunction, duration) {
    return Veritas.Utils.CacheManager.get(key, fetchFunction, duration);
  },
  invalidate: function(keys) {
    return Veritas.Utils.CacheManager.invalidate(keys);
  }
};

/**
 * Legacy RateLimiter object - delegates to Veritas.Utils.RateLimiter
 */
var RateLimiter = {
  check: function(key, maxAttempts, windowSeconds) {
    return Veritas.Utils.RateLimiter.check(key, maxAttempts, windowSeconds);
  }
};

/**
 * Legacy TokenManager object - delegates to Veritas.Utils.TokenManager
 */
var TokenManager = {
  _loadStructures: function() {
    return Veritas.Utils.TokenManager._loadStructures();
  },
  _saveStructures: function(struct) {
    return Veritas.Utils.TokenManager._saveStructures(struct);
  },
  _studentKey: function(email, className) {
    return Veritas.Utils.TokenManager._studentKey(email, className);
  },
  _removeToken: function(struct, token) {
    return Veritas.Utils.TokenManager._removeToken(struct, token);
  },
  _purgeExpired: function(struct) {
    return Veritas.Utils.TokenManager._purgeExpired(struct);
  },
  generateToken: function(studentEmail, className) {
    return Veritas.Utils.TokenManager.generateToken(studentEmail, className);
  },
  validateToken: function(token) {
    return Veritas.Utils.TokenManager.validateToken(token);
  },
  getStudentEmail: function(token) {
    return Veritas.Utils.TokenManager.getStudentEmail(token);
  },
  setSessionToken: function(token) {
    return Veritas.Utils.TokenManager.setSessionToken(token);
  },
  getSessionToken: function() {
    return Veritas.Utils.TokenManager.getSessionToken();
  },
  clearSessionToken: function() {
    return Veritas.Utils.TokenManager.clearSessionToken();
  },
  getCurrentStudentEmail: function() {
    return Veritas.Utils.TokenManager.getCurrentStudentEmail();
  },
  getActiveSnapshot: function() {
    return Veritas.Utils.TokenManager.getActiveSnapshot();
  },
  getTokenFromSnapshot: function(snapshot, email, className) {
    return Veritas.Utils.TokenManager.getTokenFromSnapshot(snapshot, email, className);
  },
  recordShortUrl: function(token, shortUrl) {
    return Veritas.Utils.TokenManager.recordShortUrl(token, shortUrl);
  }
};
