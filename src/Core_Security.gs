// =============================================================================
// VERITAS LIVE POLL - SECURITY MODULE
// =============================================================================
// Purpose: Authentication, authorization, and role enforcement
// Dependencies: Config, Logging
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
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
    return Veritas.Dev.getCurrentUser() || '';
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

  // Delegate to TokenManager in Utils module
  try {
    var tokenData = Veritas.Utils.TokenManager.validateToken(token);
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

/**
 * Generates an OAuth2 access token using the Service Account JSON
 * stored in the FIREBASE_DATABASE_SECRET script property.
 */
Veritas.Security.getFirebaseAccessToken = function() {
  // 1. Get the Service Account JSON
  var jsonString = PropertiesService.getScriptProperties().getProperty('FIREBASE_DATABASE_SECRET');
  if (!jsonString) {
    // If property is missing entirely, we can't do anything.
    // However, existing logic might handle missing secret elsewhere.
    // For now, return null to let fallback logic try or fail.
    return null;
  }

  // 2. Parse JSON (Handle case where user might have pasted a string secret by mistake)
  var serviceAccount;
  try {
    serviceAccount = JSON.parse(jsonString);
  } catch (e) {
    // If it's not JSON, assume it's a Legacy Secret and return null (handled in Utils)
    return null;
  }

  // 3. Create the JWT Claim Set
  var now = Math.floor(Date.now() / 1000);
  var claimSet = {
    "iss": serviceAccount.client_email,
    "scope": "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database",
    "aud": "https://oauth2.googleapis.com/token",
    "exp": now + 3600,
    "iat": now
  };

  // 4. Encode Header & Claim Set
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({"alg":"RS256","typ":"JWT"}));
  var claim = Utilities.base64EncodeWebSafe(JSON.stringify(claimSet));
  var toSign = header + "." + claim;

  // 5. Sign with Private Key
  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, serviceAccount.private_key);
  var signature = Utilities.base64EncodeWebSafe(signatureBytes);
  var jwt = toSign + "." + signature;

  // 6. Exchange JWT for Access Token
  var options = {
    method: 'post',
    payload: {
      assertion: jwt,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer'
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', options);
  var result = JSON.parse(response.getContentText());

  if (result.error) {
    throw new Error('Firebase Auth Failed: ' + result.error_description);
  }

  return result.access_token;
};
