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
