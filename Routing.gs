// =============================================================================
// VERITAS LIVE POLL - ROUTING MODULE
// =============================================================================
// Purpose: HTTP request routing (doGet, doPost) and HTML template composition
// Dependencies: Security, Config, Logging
// =============================================================================

Veritas.Routing = Veritas.Routing || {};

/**
 * Main HTTP GET handler - entry point for all web app requests
 * Routes to teacher or student view based on authentication
 * @param {Object} e - doGet event object
 * @returns {HtmlOutput} Rendered HTML page
 */
Veritas.Routing.doGet = function(e) {
  try {
    // Check if this is an image proxy request (must be first for performance)
    var fn = (e && e.parameter && e.parameter.fn) || '';
    if (fn === 'image') {
      return Veritas.Routing.serveImage(e);
    }

    // Check for token parameter first (anonymous access)
    var token = (e && e.parameter && e.parameter.token) ? e.parameter.token : null;
    var isTeacher = false;
    var studentEmail = null;

    if (token) {
      // Token-based access (student with personalized link)
      var tokenData = TokenManager.validateToken(token);

      if (!tokenData) {
        // Invalid or expired token
        return HtmlService.createHtmlOutput(
          '<h1>Invalid or Expired Link</h1>' +
          '<p>This poll link is no longer valid. Please contact your teacher for a new link.</p>'
        ).setTitle("Veritas Live Poll - Error");
      }

      // Token will be passed explicitly with each RPC call
      studentEmail = tokenData.email;

      Veritas.Logging.info('Student accessed via token', {
        token: token,
        studentEmail: studentEmail,
        className: tokenData.className
      });

      isTeacher = false;
    } else {
      // Try Google authentication (teacher or fallback)
      try {
        var userEmail = Veritas.Security.getCurrentUserEmail();
        isTeacher = Veritas.Security.isTeacher(userEmail);

        Veritas.Logging.info('Resolved active user identity', {
          userEmail: userEmail || '(empty)',
          routedAsTeacher: isTeacher
        });

        if (!isTeacher) {
          var teacherRedirect = Veritas.Routing.maybeRedirectForTeacherAccount(e, userEmail || '');
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

    var template;
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
    Veritas.Logging.error('doGet error', e);
    return HtmlService.createHtmlOutput(
      '<h1>Error loading application</h1><p>' + e.message + '</p>'
    ).setTitle("Veritas Live Poll - Error");
  }
};

/**
 * Serve image via proxy endpoint
 * This streams image bytes directly from Drive, avoiding ACL and rendering issues
 * @param {Object} e - doGet event object with id parameter
 * @returns {ContentService} Image content with proper MIME type
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
      Veritas.Logging.error('File not found', { fileId: id, error: err });
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
      Veritas.Logging.error('Forbidden file access attempt', { fileId: id });
      return ContentService.createTextOutput('Forbidden - file not in allowed folder')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    // Stream the image bytes with proper content type
    var blob = file.getBlob();
    var mimeType = blob.getContentType(); // e.g., image/png, image/jpeg

    Veritas.Logging.info('Serving image', { fileId: id, mimeType: mimeType, size: blob.getBytes().length });

    // Return image with caching headers (5 minutes)
    return ContentService.createOutput(blob)
      .setMimeType(mimeType)
      .setHeader('Cache-Control', 'public, max-age=300');

  } catch (e) {
    Veritas.Logging.error('serveImage error', e);
    return ContentService.createTextOutput('Error serving image: ' + e.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
};

/**
 * Maybe redirect to teacher account chooser if user is not authorized teacher
 * @param {Object} e - doGet event object
 * @param {string} currentUserEmail - Current user's email
 * @returns {HtmlOutput|null} Redirect page or null
 */
Veritas.Routing.maybeRedirectForTeacherAccount = function(e, currentUserEmail) {
  var params = (e && e.parameter) || {};
  if (params.fn === 'image') {
    return null;
  }

  var loginHintEmail = Veritas.Security.getCanonicalTeacherEmail();
  if (!loginHintEmail) {
    return null;
  }

  var accountChooserUrl = Veritas.Utils.buildTeacherAccountChooserUrl(e, loginHintEmail);
  var sanitizedAccountChooserUrl = accountChooserUrl ? Veritas.Utils.escapeHtml(accountChooserUrl) : '';
  var safeUserEmail = currentUserEmail ? Veritas.Utils.escapeHtml(currentUserEmail) : 'your current Google account';

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

/**
 * Include helper - load HTML partial file
 * @param {string} filename - Name of HTML file to include
 * @returns {string} File content as string
 */
Veritas.Routing.include = function(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
};

// --- EXPOSED FUNCTIONS (maintain compatibility) ---

function doGet(e) {
  return Veritas.Routing.doGet(e);
}

function include(filename) {
  return Veritas.Routing.include(filename);
}

// Legacy compatibility
function serveImage_(e) {
  return Veritas.Routing.serveImage(e);
}

function maybeRedirectForTeacherAccount_(e, currentUserEmail) {
  return Veritas.Routing.maybeRedirectForTeacherAccount(e, currentUserEmail);
}
