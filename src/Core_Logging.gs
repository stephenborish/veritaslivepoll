// =============================================================================
// VERITAS LIVE POLL - LOGGING MODULE
// =============================================================================
// Purpose: Centralized logging and error handling
// Dependencies: None
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.Logging = Veritas.Logging || {};

/**
 * Log informational message
 * @param {string} message - Log message
 * @param {Object} data - Additional context data
 */
Veritas.Logging.info = function(message, data) {
  data = data || {};
  try {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: message,
      data: data,
      user: Veritas.Dev.getCurrentUser() || 'anonymous'
    }));
  } catch (err) {
    // Fallback if JSON serialization fails
    console.log(message, data);
  }
};

/**
 * Log warning message
 * @param {string} message - Warning message
 * @param {Object} data - Additional context data
 */
Veritas.Logging.warn = function(message, data) {
  data = data || {};
  try {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message: message,
      data: data,
      user: Veritas.Dev.getCurrentUser() || 'anonymous'
    }));
  } catch (err) {
    console.warn(message, data);
  }
};

/**
 * Log error message
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
Veritas.Logging.error = function(message, error) {
  try {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: message,
      error: error ? error.toString() : '',
      stack: error && error.stack ? error.stack : '',
      user: Veritas.Dev.getCurrentUser() || 'anonymous'
    }));
  } catch (err) {
    console.error(message, error);
  }
};

/**
 * Wrapper function to add error handling to any function
 * @param {Function} fn - Function to wrap
 * @returns {Function} Wrapped function with error handling
 */
Veritas.Logging.withErrorHandling = function(fn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    try {
      return fn.apply(this, args);
    } catch (e) {
      Veritas.Logging.error('Error in ' + (fn.name || 'anonymous function'), e);

      // Extract clean error message
      var errorMessage = (e && e.message) ? e.message : String(e || 'Unknown error');

      // Don't wrap errors if:
      // 1. Function name is missing (anonymous function - can't add useful context)
      // 2. Error already contains "failed:" (already wrapped by another handler)
      if (!fn.name || errorMessage.indexOf(' failed:') !== -1) {
        throw e;
      }

      throw new Error(fn.name + ' failed: ' + errorMessage);
    }
  };
};

// --- LEGACY COMPATIBILITY ---
// Maintain backward compatibility with existing Logger object
var Logger = {
  log: function(message, data) {
    Veritas.Logging.info(message, data);
  },
  error: function(message, error) {
    Veritas.Logging.error(message, error);
  }
};

// Maintain backward compatibility with existing withErrorHandling function
function withErrorHandling(fn) {
  return Veritas.Logging.withErrorHandling(fn);
}
