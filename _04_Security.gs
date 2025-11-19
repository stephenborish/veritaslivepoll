// =============================================================================
// VERITAS LIVE POLL - SECURITY MODULE
// =============================================================================
// Purpose: Authentication, authorization, and role enforcement
// Dependencies: Config, Logging
// =============================================================================

Veritas.Security = Veritas.Security || {};

/**
 * Get the set of authorized teacher emails
 * @returns {Set<string>} Set of teacher emails (lowercase)
 * @private
 */
Veritas.Security.getTeacherEmailSet_ = function() {
  var emails = new Set();

  // Add primary teacher email
  if (Veritas.Config.TEACHER_EMAIL) {
    emails.add(Veritas.Config.TEACHER_EMAIL.toLowerCase().trim());
  }

  // Add additional teachers from Script Properties
  try {
    var props = PropertiesService.getScriptProperties();
    var additionalTeachers = props.getProperty(Veritas.Config.ADDITIONAL_TEACHER_PROP_KEY) || '';

    if (additionalTeachers) {
      var teacherList = additionalTeachers.split(',');
      for (var i = 0; i < teacherList.length; i++) {
        var email = teacherList[i].trim().toLowerCase();
        if (email) {
          emails.add(email);
        }
      }
    }
  } catch (err) {
    Veritas.Logging.error('Failed to load additional teachers', err);
  }

  return emails;
};

/**
 * Check if an email belongs to an authorized teacher
 * @param {string} email - Email address to check
 * @returns {boolean} True if email is authorized teacher
 */
Veritas.Security.isTeacher = function(email) {
  if (!email) return false;

  var normalizedEmail = email.toString().trim().toLowerCase();
  var teacherEmails = Veritas.Security.getTeacherEmailSet_();

  return teacherEmails.has(normalizedEmail);
};

/**
 * Get the email of the currently authenticated user
 * @returns {string} Current user's email
 */
Veritas.Security.getCurrentUserEmail = function() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    Veritas.Logging.error('Failed to get current user email', err);
    return '';
  }
};

/**
 * Get the canonical teacher email (for logging/audit)
 * @returns {string} Primary teacher email
 */
Veritas.Security.getCanonicalTeacherEmail = function() {
  return Veritas.Config.TEACHER_EMAIL;
};

/**
 * Assert that the current user is an authorized teacher
 * Throws an error if not authorized
 */
Veritas.Security.assertTeacher = function() {
  var email = Veritas.Security.getCurrentUserEmail();

  if (!Veritas.Security.isTeacher(email)) {
    Veritas.Logging.warn('Unauthorized teacher access attempt', { email: email });
    throw new Error('Access denied: Teacher authorization required');
  }
};

/**
 * Get the current student identity from a token
 * @param {string} token - Student authentication token
 * @returns {Object} Student identity {email, className, valid}
 */
Veritas.Security.getCurrentStudent = function(token) {
  if (!token) {
    return { valid: false, email: '', className: '', reason: 'No token provided' };
  }

  // Token validation will be implemented in TokenManager (Utils or separate module)
  // For now, delegate to the existing TokenManager
  try {
    var tokenData = TokenManager.validateToken(token);
    if (!tokenData) {
      return { valid: false, email: '', className: '', reason: 'Invalid or expired token' };
    }

    return {
      valid: true,
      email: tokenData.email,
      className: tokenData.className,
      token: token
    };
  } catch (err) {
    Veritas.Logging.error('Failed to validate student token', err);
    return { valid: false, email: '', className: '', reason: 'Token validation error' };
  }
};

/**
 * Assert that a valid student token is provided
 * @param {string} token - Student authentication token
 * @returns {Object} Validated student identity
 * @throws {Error} If token is invalid
 */
Veritas.Security.assertStudent = function(token) {
  var student = Veritas.Security.getCurrentStudent(token);

  if (!student.valid) {
    Veritas.Logging.warn('Invalid student token', { reason: student.reason });
    throw new Error('Access denied: ' + student.reason);
  }

  return student;
};

// --- LEGACY COMPATIBILITY ---
// Maintain backward compatibility with existing functions

function isTeacherEmail_(email) {
  return Veritas.Security.isTeacher(email);
}

function getCanonicalTeacherEmail_() {
  return Veritas.Security.getCanonicalTeacherEmail();
}

function getTeacherEmailSet_() {
  return Veritas.Security.getTeacherEmailSet_();
}
