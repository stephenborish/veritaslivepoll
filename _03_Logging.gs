// =============================================================================
// VERITAS LIVE POLL - LOGGING MODULE
// =============================================================================
// Purpose: Centralized logging and error handling
// Dependencies: None
// =============================================================================

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
      user: Session.getActiveUser().getEmail() || 'anonymous'
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
      user: Session.getActiveUser().getEmail() || 'anonymous'
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
      user: Session.getActiveUser().getEmail() || 'anonymous'
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
      Veritas.Logging.error('Error in ' + fn.name, e);
      throw new Error(fn.name + ' failed: ' + e.message);
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
