// =============================================================================
// VERITAS LIVE POLL - ROUTING MODULE
// =============================================================================
// Purpose: Web app routing, authentication, and template serving
// Dependencies: Config, TokenManager, Models
// Phase: 2D - API/Routing Layer
// =============================================================================

Veritas.Routing = {};

// =============================================================================
// MAIN ROUTING
// =============================================================================

/**
 * Main entry point for web app requests
 * Routes to teacher or student view based on authentication
 * @param {Object} e - Event object from Apps Script
 * @returns {HtmlOutput} Rendered HTML page
 */
Veritas.Routing.doGet = function(e) {
  try {
    // Check if this is an image proxy request (must be first for performance)
    var fn = (e && e.parameter && e.parameter.fn) || '';
    if (fn === 'image') {
      return Veritas.Routing.serveImage(e);
    }

    // Resolve user identity (token or Google auth)
    var identity = Veritas.Routing.resolveIdentity(e);

    // Route to appropriate view
    if (identity.isTeacher) {
      return Veritas.Routing.serveTeacherView();
    } else if (identity.studentEmail) {
      return Veritas.Routing.serveStudentView(identity.studentEmail, identity.token);
    } else {
      // No valid authentication
      return HtmlService.createHtmlOutput(
        '<h1>Authentication Required</h1>' +
        '<p>Please use your personalized poll link or sign in with Google.</p>'
      ).setTitle("Veritas Live Poll - Error");
    }

  } catch (error) {
    Logger.error('doGet error', error);
    return HtmlService.createHtmlOutput(
      '<h1>Error loading application</h1><p>' + error.message + '</p>'
    ).setTitle("Veritas Live Poll - Error");
  }
};

// =============================================================================
// IDENTITY RESOLUTION
// =============================================================================

/**
 * Resolve user identity from request
 * @param {Object} e - Event object
 * @returns {Object} Identity {isTeacher, studentEmail, token}
 */
Veritas.Routing.resolveIdentity = function(e) {
  // Check for token parameter first (anonymous access)
  var token = (e && e.parameter && e.parameter.token) ? e.parameter.token : null;

  if (token) {
    // Token-based access (student with personalized link)
    var tokenData = TokenManager.validateToken(token);

    if (!tokenData) {
      // Invalid or expired token
      throw new Error('Invalid or expired token');
    }

    Logger.log('Student accessed via token', {
      token: token,
      studentEmail: tokenData.email,
      className: tokenData.className
    });

    return {
      isTeacher: false,
      studentEmail: tokenData.email,
      token: token
    };
  }

  // Try Google authentication (teacher or fallback)
  try {
    var userEmail = (Session.getActiveUser().getEmail() || '').trim();
    var isTeacher = Veritas.Routing.isTeacherEmail(userEmail);

    Logger.log('Resolved active user identity', {
      userEmail: userEmail || '(empty)',
      routedAsTeacher: isTeacher
    });

    if (!isTeacher) {
      // Check if we should redirect for teacher account
      var teacherRedirect = Veritas.Routing.maybeRedirectForTeacherAccount(e, userEmail || '');
      if (teacherRedirect) {
        return { redirect: teacherRedirect };
      }

      // Route as student if they have an email
      if (userEmail) {
        return {
          isTeacher: false,
          studentEmail: userEmail,
          token: null
        };
      }
    }

    return {
      isTeacher: isTeacher,
      studentEmail: null,
      token: null
    };

  } catch (authError) {
    // No token and no Google auth
    throw new Error('Authentication required');
  }
};

// =============================================================================
// SECURITY CHECKS
// =============================================================================

// Global cache for teacher email set
var teacherEmailSetCache = null;

/**
 * Get set of authorized teacher emails
 * @returns {Set} Set of teacher emails
 */
Veritas.Routing.getTeacherEmailSet = function() {
  if (teacherEmailSetCache) {
    return teacherEmailSetCache;
  }

  var normalized = new Set();
  normalized.add(Veritas.Config.TEACHER_EMAIL.toLowerCase());

  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var extrasRaw = scriptProps.getProperty(Veritas.Config.ADDITIONAL_TEACHER_PROP_KEY) || '';
    if (extrasRaw) {
      extrasRaw
        .split(',')
        .map(function(email) { return email.trim().toLowerCase(); })
        .filter(function(email) { return email; })
        .forEach(function(email) { normalized.add(email); });
    }
  } catch (e) {
    Logger.error('Failed to load additional teacher emails', e);
  }

  teacherEmailSetCache = normalized;
  return teacherEmailSetCache;
};

/**
 * Check if email is a teacher
 * @param {string} email - Email to check
 * @returns {boolean} True if teacher
 */
Veritas.Routing.isTeacherEmail = function(email) {
  if (!email) return false;
  var normalizedEmail = email.toString().trim().toLowerCase();
  var teacherSet = Veritas.Routing.getTeacherEmailSet();
  return teacherSet.has(normalizedEmail);
};

/**
 * Get canonical teacher email (primary teacher email)
 * @returns {string} Canonical teacher email
 */
Veritas.Routing.getCanonicalTeacherEmail = function() {
  var teacherSet = Veritas.Routing.getTeacherEmailSet();
  var iterator = teacherSet.values();
  var first = iterator.next();
  if (!first.done) {
    return first.value;
  }
  return Veritas.Config.TEACHER_EMAIL.toLowerCase();
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Escape HTML special characters
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
Veritas.Routing.escapeHtml = function(value) {
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
};

/**
 * Build query string from params object
 * @param {Object} params - Parameters object
 * @returns {string} Query string
 */
Veritas.Routing.buildQueryString = function(params) {
  return Object.keys(params)
    .filter(function(key) {
      var value = params[key];
      return value !== undefined && value !== null && value !== '';
    })
    .map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    })
    .join('&');
};

// =============================================================================
// TEACHER ACCOUNT REDIRECT
// =============================================================================

/**
 * Build teacher account chooser URL
 * @param {Object} e - Event object
 * @param {string} loginHintEmail - Email to suggest
 * @returns {string} Account chooser URL
 */
Veritas.Routing.buildTeacherAccountChooserUrl = function(e, loginHintEmail) {
  if (!loginHintEmail) {
    return null;
  }

  var baseUrl = ScriptApp.getService().getUrl();
  var params = Object.assign({}, (e && e.parameter) || {});
  params.teacherAuthAttempted = '1';
  var queryString = Veritas.Routing.buildQueryString(params);
  var continueUrl = baseUrl + (queryString ? '?' + queryString : '');

  return 'https://accounts.google.com/AccountChooser?continue=' +
    encodeURIComponent(continueUrl) +
    '&Email=' + encodeURIComponent(loginHintEmail) +
    '&prompt=select_account';
};

/**
 * Maybe redirect for teacher account
 * @param {Object} e - Event object
 * @param {string} currentUserEmail - Current user email
 * @returns {HtmlOutput|null} Redirect output or null
 */
Veritas.Routing.maybeRedirectForTeacherAccount = function(e, currentUserEmail) {
  var params = (e && e.parameter) || {};
  if (params.fn === 'image') {
    return null;
  }

  var loginHintEmail = Veritas.Routing.getCanonicalTeacherEmail();
  if (!loginHintEmail) {
    return null;
  }

  var accountChooserUrl = Veritas.Routing.buildTeacherAccountChooserUrl(e, loginHintEmail);
  var sanitizedAccountChooserUrl = accountChooserUrl ? Veritas.Routing.escapeHtml(accountChooserUrl) : '';
  var safeUserEmail = currentUserEmail ? Veritas.Routing.escapeHtml(currentUserEmail) : 'your current Google account';

  var teacherCta = sanitizedAccountChooserUrl
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
};

// =============================================================================
// TEMPLATE SERVING
// =============================================================================

/**
 * Serve teacher view
 * @returns {HtmlOutput} Teacher interface
 */
Veritas.Routing.serveTeacherView = function() {
  var template = HtmlService.createTemplateFromFile('TeacherView');

  return template.evaluate()
    .setTitle("Veritas Live Poll")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
};

/**
 * Serve student view
 * @param {string} studentEmail - Student email
 * @param {string} token - Session token (optional)
 * @returns {HtmlOutput} Student interface
 */
Veritas.Routing.serveStudentView = function(studentEmail, token) {
  var template = HtmlService.createTemplateFromFile('StudentView');
  template.studentEmail = studentEmail;
  template.sessionToken = token || '';

  return template.evaluate()
    .setTitle("Veritas Live Poll")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
};

/**
 * Include HTML file content (for template composition)
 * @param {string} filename - File name to include
 * @returns {string} File content
 */
Veritas.Routing.include = function(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
};

// =============================================================================
// IMAGE PROXY
// =============================================================================

/**
 * Serve image via proxy endpoint
 * This streams image bytes directly from Drive, avoiding ACL and rendering issues
 * @param {Object} e - Event object
 * @returns {ContentService.Content} Image content
 */
Veritas.Routing.serveImage = function(e) {
  try {
    var id = (e.parameter && e.parameter.id) || '';

    if (!id) {
      return ContentService.createTextOutput('Missing id parameter')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Fetch file from Drive
    var file;
    try {
      file = DriveApp.getFileById(id);
    } catch (err) {
      Logger.error('File not found', { fileId: id, error: err });
      return ContentService.createTextOutput('File not found')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Validate that file is in the allowed folder
    var parents = file.getParents();
    var isAllowed = false;

    while (parents.hasNext()) {
      var parent = parents.next();
      if (parent.getId() === Veritas.Config.ALLOWED_FOLDER_ID) {
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
    var blob = file.getBlob();
    var mimeType = blob.getContentType(); // e.g., image/png, image/jpeg

    Logger.log('Serving image', { fileId: id, mimeType: mimeType, size: blob.getBytes().length });

    // Return image with caching headers (5 minutes)
    return ContentService.createOutput(blob)
      .setMimeType(mimeType)
      .setHeader('Cache-Control', 'public, max-age=300');

  } catch (error) {
    Logger.error('serveImage error', error);
    return ContentService.createTextOutput('Error serving image: ' + error.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
};

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================
//
// Note: doGet() and include() are defined in _13_ExposedApi.gs
// to avoid duplicate function definitions.
//

/**
 * Legacy wrapper for isTeacherEmail_
 */
function isTeacherEmail_(email) {
  return Veritas.Routing.isTeacherEmail(email);
}

/**
 * Legacy wrapper for getTeacherEmailSet_
 */
function getTeacherEmailSet_() {
  return Veritas.Routing.getTeacherEmailSet();
}

/**
 * Legacy wrapper for getCanonicalTeacherEmail_
 */
function getCanonicalTeacherEmail_() {
  return Veritas.Routing.getCanonicalTeacherEmail();
}

/**
 * Legacy wrapper for buildTeacherAccountChooserUrl_
 */
function buildTeacherAccountChooserUrl_(e, loginHintEmail) {
  return Veritas.Routing.buildTeacherAccountChooserUrl(e, loginHintEmail);
}

/**
 * Legacy wrapper for maybeRedirectForTeacherAccount_
 */
function maybeRedirectForTeacherAccount_(e, currentUserEmail) {
  return Veritas.Routing.maybeRedirectForTeacherAccount(e, currentUserEmail);
}

/**
 * Legacy wrapper for serveImage_
 */
function serveImage_(e) {
  return Veritas.Routing.serveImage(e);
}

/**
 * Legacy wrapper for escapeHtml_
 */
function escapeHtml_(value) {
  return Veritas.Routing.escapeHtml(value);
}

/**
 * Legacy wrapper for buildQueryString_
 */
function buildQueryString_(params) {
  return Veritas.Routing.buildQueryString(params);
}
