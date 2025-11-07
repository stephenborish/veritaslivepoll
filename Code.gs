// =============================================================================
// VERITAS LIVE POLL - SERVER-SIDE CODE (2025 MODERNIZED)
// =============================================================================

// --- CONFIGURATION ---
const TEACHER_EMAIL = "sborish@malvernprep.org";
const TOKEN_EXPIRY_DAYS = 30; // Tokens valid for 30 days

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
  /**
   * Generate a unique token for a student
   */
  generateToken: function(studentEmail, className) {
    const token = Utilities.getUuid();
    const props = PropertiesService.getScriptProperties();
    const tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    const tokenMap = JSON.parse(tokenMapStr);
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + TOKEN_EXPIRY_DAYS);
    
    tokenMap[token] = {
      email: studentEmail,
      className: className,
      created: new Date().getTime(),
      expires: expiryDate.getTime()
    };
    
    props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
    Logger.log('Token generated', { email: studentEmail, token: token });
    
    return token;
  },
  
  /**
   * Validate and retrieve student info from token
   */
  validateToken: function(token) {
    if (!token) return null;
    
    const props = PropertiesService.getScriptProperties();
    const tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    const tokenMap = JSON.parse(tokenMapStr);
    
    const tokenData = tokenMap[token];
    if (!tokenData) return null;
    
    // Check if token has expired
    if (new Date().getTime() > tokenData.expires) {
      Logger.log('Token expired', { token: token });
      delete tokenMap[token];
      props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
      return null;
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
    // First try token-based authentication
    const token = this.getSessionToken();
    if (token) {
      const email = this.getStudentEmail(token);
      if (email) return email;
    }
    
    // Fall back to Google authentication for backward compatibility
    try {
      const email = Session.getActiveUser().getEmail();
      if (email && email !== '') return email;
    } catch (e) {
      Logger.log('No active user session');
    }
    
    return null;
  }
};

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
        .some(r => r[5] === 'VIOLATION_LOCKED');
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

      // Persist metadata for downstream consumers (students/teacher views)
      this.setMetadata_(metadata);

      // Atomically update cache - put() overwrites existing entry without race condition
      const cache = CacheService.getScriptCache();
      cache.put('LIVE_POLL_STATUS', JSON.stringify(statusData), CacheManager.CACHE_TIMES.INSTANT);

      const reason = (metadata && metadata.reason) ? metadata.reason : `STATUS_${status}`;
      StateVersionManager.bump({
        pollId: pollId || '',
        questionIndex: typeof questionIndex === 'number' ? questionIndex : -1,
        status: status,
        reason: reason,
        metadata: metadata,
        timerRemainingSeconds: (metadata && typeof metadata.timerRemainingSeconds === 'number')
          ? metadata.timerRemainingSeconds
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
        status: 'CLOSED',
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
        status: 'CLOSED',
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
        const userEmail = Session.getActiveUser().getEmail();
        isTeacher = (userEmail === TEACHER_EMAIL);
        
        if (!isTeacher) {
          studentEmail = userEmail;
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

// =============================================================================
// ONE-TIME SETUP
// =============================================================================

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert("This script must be bound to a Google Sheet.");
    return;
  }
  
  const sheetNames = ["Classes", "Rosters", "Polls", "LiveStatus", "Responses"];
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
  pollsSheet.getRange("A1:G1").setValues([["PollID", "PollName", "ClassName", "QuestionIndex", "QuestionDataJSON", "CreatedAt", "UpdatedAt"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
  
  const liveSheet = ss.getSheetByName("LiveStatus");
  liveSheet.getRange("A1:C1").setValues([["ActivePollID", "ActiveQuestionIndex", "PollStatus"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
  liveSheet.getRange("A2:C2").setValues([["", -1, "CLOSED"]]);
  
  const responsesSheet = ss.getSheetByName("Responses");
  responsesSheet.getRange("A1:G1").setValues([["ResponseID", "Timestamp", "PollID", "QuestionIndex", "StudentEmail", "Answer", "IsCorrect"]])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");
  
  // Freeze header rows
  [classesSheet, rostersSheet, pollsSheet, liveSheet, responsesSheet].forEach(sheet => {
    sheet.setFrozenRows(1);
  });
  
  SpreadsheetApp.getUi().alert("Sheet setup complete! All tabs configured with headers.");
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
      timerSeconds: question.timerSeconds || null
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

    // Remove existing entries for the class
    const values = getDataRangeValues_(rosterSheet);
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i][0] === className) {
        rosterSheet.deleteRow(i + 2);
      }
    }

    if (cleanedEntries.length > 0) {
      const rows = cleanedEntries.map(entry => [className, entry.name, entry.email]);
      rosterSheet.getRange(rosterSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
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
    const classesSheet = ss.getSheetByName('Classes');
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      const values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 2).getValues();
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === oldName) {
          classesSheet.getRange(i + 2, 1, 1, 1).setValue(normalizedNewName);
        }
      }
    }

    const rosterSheet = ss.getSheetByName('Rosters');
    const rosterValues = getDataRangeValues_(rosterSheet);
    for (let i = 0; i < rosterValues.length; i++) {
      if (rosterValues[i][0] === oldName) {
        rosterSheet.getRange(i + 2, 1).setValue(normalizedNewName);
      }
    }

    const pollSheet = ss.getSheetByName('Polls');
    const pollValues = getDataRangeValues_(pollSheet);
    for (let i = 0; i < pollValues.length; i++) {
      if (pollValues[i][2] === oldName) {
        pollSheet.getRange(i + 2, 3).setValue(normalizedNewName);
      }
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
    const { pollName, className, questions } = pollData;
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

    Logger.log('Poll created via new editor', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return DataAccess.polls.getAll();
  })();
}

function startPoll(pollId) {
  return withErrorHandling(() => {
    if (!pollId) throw new Error('Poll ID is required');

    const poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error('Poll not found');

    DataAccess.liveStatus.set(pollId, 0, "OPEN", {
      reason: 'RUNNING',
      startedAt: new Date().toISOString(),
      timer: null
    });

    Logger.log('Poll started', { pollId: pollId, pollName: poll.pollName });

    return getLivePollData(pollId, 0);
  })();
}

function updatePoll(pollId, pollName, className, questions) {
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

    writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt);

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

    writePollRows_(pollId, poll.pollName, poll.className, newQuestions, createdAt, updatedAt);

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

    // Create new poll with copied questions
    const newPollId = "P-" + Utilities.getUuid();
    const timestamp = new Date().toISOString();

    writePollRows_(newPollId, pollName, className, copiedQuestions, timestamp, timestamp);

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

    DataAccess.liveStatus.set(pollId, newIndex, "OPEN", {
      reason: 'RUNNING',
      advancedAt: new Date().toISOString(),
      timer: null
    });

    Logger.log('Next question', { pollId: pollId, questionIndex: newIndex });

    return getLivePollData(pollId, newIndex);
  })();
}

function stopPoll() {
  return withErrorHandling(() => {
    const currentStatus = DataAccess.liveStatus.get();
    const pollId = currentStatus[0];
    const questionIndex = currentStatus[1];

    // Instead of closing completely, set to PAUSED state
    DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
      reason: 'MANUAL_PAUSE',
      pausedAt: new Date().toISOString()
    });

    Logger.log('Poll paused', { pollId: pollId, questionIndex: questionIndex });

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
    DataAccess.liveStatus.set(pollId, questionIndex, "OPEN", {
      reason: 'RUNNING',
      resumedAt: new Date().toISOString()
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

    DataAccess.liveStatus.set("", -1, "CLOSED", {});

    Logger.log('Poll closed completely', { pollId: pollId });

    return { status: "CLOSED" };
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

    DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED", {
      reason: 'TIMER_EXPIRED',
      pausedAt: new Date().toISOString()
    });

    Logger.log('Poll paused due to timer expiry', { pollId, questionIndex });

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
        const values = getDataRangeValues_(responsesSheet);
        for (let i = values.length - 1; i >= 0; i--) {
          if (values[i][2] === pollId && values[i][3] === questionIndex) {
            responsesSheet.deleteRow(i + 2);
          }
        }
      }
    }

    DataAccess.liveStatus.set(pollId, questionIndex, "OPEN", {
      reason: 'RUNNING',
      resetAt: new Date().toISOString(),
      clearedResponses: !!clearResponses
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

      if (questionIndex === -1 && answer === 'VIOLATION_LOCKED') {
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
    const metadata = (liveStatus && liveStatus.metadata) ? liveStatus.metadata : {};

    const roster = DataAccess.roster.getByClass(poll.className);
    const pollResponses = DataAccess.responses.getByPoll(pollId);
    
    const submittedAnswers = new Map();
    pollResponses
      .filter(r => r[3] === questionIndex)
      .forEach(r => {
        const email = r[4];
        submittedAnswers.set(email, {
          timestamp: r[1],
          answer: r[5],
          isCorrect: r[6]
        });
      });
    
    const lockedStudents = new Set();
    pollResponses
      .filter(r => r[3] === -1 && r[5] === 'VIOLATION_LOCKED')
      .forEach(r => lockedStudents.add(r[4]));
    
    const studentStatusList = roster.map(student => {
      const email = student.email;

      // Check proctor state (status-based check, not just old "locked" responses)
      const proctorState = ProctorAccess.getState(pollId, email);

      // Get submission if exists
      const submission = submittedAnswers.has(email) ? submittedAnswers.get(email) : null;

      // If student is locked or awaiting fullscreen, show that status but preserve their answer if they submitted
      if (proctorState.status === 'LOCKED' || proctorState.status === 'AWAITING_FULLSCREEN') {
        return {
          name: student.name,
          email: email,
          status: proctorState.status === 'AWAITING_FULLSCREEN' ? 'AWAITING_FULLSCREEN' : 'LOCKED',
          lockVersion: proctorState.lockVersion,
          lockReason: proctorState.lockReason,
          lockedAt: proctorState.lockedAt,
          answer: submission ? submission.answer : '---',
          isCorrect: submission ? submission.isCorrect : null,
          timestamp: submission ? submission.timestamp : 0
        };
      }

      if (submission) {
        return {
          name: student.name,
          email: email,
          status: 'Submitted',
          answer: submission.answer,
          isCorrect: submission.isCorrect,
          timestamp: submission.timestamp
        };
      }

      return {
        name: student.name,
        email: email,
        status: 'Waiting...',
        answer: '---',
        isCorrect: null,
        timestamp: 9999999999999
      };
    });
    
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
      status: pollStatus || "OPEN",
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
      metadata: metadata
    };
  })();
}

// =============================================================================
// STUDENT APP FUNCTIONS
// =============================================================================

function getStudentPollStatus(token, context) {
  return withErrorHandling(() => {
    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    const questionIndex = statusValues[1];
    const pollStatus = statusValues[2];
    const metadata = (statusValues && statusValues.metadata) ? statusValues.metadata : {};

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

      return response;
    };

    const baseWaiting = (message, hasSubmitted = false) => envelope({ status: "WAITING", message, hasSubmitted, pollId: pollId });

    // If paused or closed, students see waiting message
    if (pollStatus === "CLOSED" || !pollId) {
      return envelope({
        status: "CLOSED",
        hasSubmitted: false,
        message: pickMessage([
          "That’s a wrap! You just finished the poll — nicely done.",
          "Poll complete. You’ve officially survived science."
        ], "That’s a wrap! You just finished the poll — nicely done."),
        pollId: pollId || ''
      });
    }

    if (pollStatus === "PAUSED") {
      const reason = metadata.reason || '';
      let message;
      if (reason === 'TIMER_EXPIRED') {
        message = pickMessage([
          "Time’s up! Hope you picked wisely.",
          "That’s the bell — time to see how you did."
        ], "Time’s up! Hope you picked wisely.");
      } else {
        message = pickMessage([
          "Intermission! Your teacher’s cooking up the next one.",
          "Breathe. Blink. Hydrate. A new question is on the way."
        ], "Intermission! Your teacher’s cooking up the next one.");
      }
      return envelope({ status: "PAUSED", message: message, hasSubmitted: false, pollId: pollId });
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
        status: "CLOSED",
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
    const proctorState = ProctorAccess.getState(pollId, studentEmail);
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
        hasSubmitted: false,
        pollId: pollId
      });
    }

    if (questionIndex < 0) {
      return baseWaiting(pickMessage([
        "Hang tight — your teacher’s loading the next challenge.",
        "Get your brain in gear. The poll’s about to begin!"
      ], "Hang tight — your teacher’s loading the next challenge."), false);
    }

    const hasSubmitted = DataAccess.responses.hasAnswered(pollId, questionIndex, studentEmail);

    if (hasSubmitted) {
      return baseWaiting(pickMessage([
        "Answer received — nice work.",
        "Got it! Your response is locked in."
      ], "Answer received — nice work."), true);
    }

    const question = poll.questions[questionIndex];
    const normalizedQuestion = normalizeQuestionObject_(question, poll.updatedAt);

    return envelope({
      status: "OPEN",
      pollId: pollId,
      questionIndex: questionIndex,
      totalQuestions: poll.questions.length,
      hasSubmitted: false,
      metadata: metadata,
      ...normalizedQuestion
    });
  })();
}


function submitStudentAnswer(pollId, questionIndex, answerText, token) {
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
    
    DataAccess.responses.add([
      responseId,
      timestamp,
      pollId,
      questionIndex,
      studentEmail,
      answerText,
      isCorrect
    ]);
    
    Logger.log('Answer submitted', { studentEmail, pollId, questionIndex, isCorrect });
    
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

/**
 * Proctoring data access layer
 * Stores per-student lock state with versioning for atomic teacher approvals
 */
const ProctorAccess = {
  /**
   * Get proctoring state for a student
   */
  getState: function(pollId, studentEmail) {
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
        if (typeof data[i][2] === 'string' && ['OK', 'LOCKED', 'AWAITING_FULLSCREEN'].includes(data[i][2])) {
          status = data[i][2];
        } else if (data[i][2] === true || data[i][2] === 'TRUE') {
          status = 'LOCKED'; // Migration: locked=true → LOCKED
        }

        return {
          pollId: data[i][0],
          studentEmail: data[i][1],
          status: status,
          lockVersion: typeof data[i][3] === 'number' ? data[i][3] : 0,
          lockReason: data[i][4] || '',
          lockedAt: data[i][5] || '',
          unlockApproved: data[i][6] === true || data[i][6] === 'TRUE',
          unlockApprovedBy: data[i][7] || null,
          unlockApprovedAt: data[i][8] || null,
          sessionId: data[i][9] || null,
          rowIndex: i + 1
        };
      }
    }

    // Return default state if not found
    return {
      pollId: pollId,
      studentEmail: studentEmail,
      status: 'OK',
      lockVersion: 0,
      lockReason: '',
      lockedAt: '',
      unlockApproved: false,
      unlockApprovedBy: null,
      unlockApprovedAt: null,
      sessionId: null,
      rowIndex: null
    };
  },

  /**
   * Set proctoring state for a student
   */
  setState: function(state) {
    // INVARIANT CHECKS (enforce state machine rules)
    const validStatuses = ['OK', 'LOCKED', 'AWAITING_FULLSCREEN'];
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

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    // Get current proctor state
    const currentState = ProctorAccess.getState(pollId, studentEmail);

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
        sessionId: currentState.sessionId,
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
        'VIOLATION_LOCKED',
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
      sessionId: currentState.sessionId,
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
      'VIOLATION_LOCKED',
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

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    const state = ProctorAccess.getState(pollId, studentEmail);

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

    // Get current state
    const currentState = ProctorAccess.getState(pollId, studentEmail);

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

    if (!pollId) {
      return { success: false, error: 'No active poll' };
    }

    // Get current state
    const currentState = ProctorAccess.getState(pollId, studentEmail);

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
      links.push({
        email: student.email,
        name: student.name,
        url: shortUrl,
        fullUrl: personalizedUrl,
        token: token
      });
    });

    // Send individual emails with personalized links
    links.forEach(link => {
      const subject = "Your Personalized Link for Veritas Live Poll";

      // HTML email template
      const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="text-align:center; margin:25px 0; font-family: Arial, Helvetica, sans-serif;">
            <p style="margin-bottom: 20px; color: #333333;">Please submit your response using the button below:</p>
            <a
              href="${link.url}"
              target="_blank"
              rel="noopener"
              style="display:inline-block;font-family:Arial, Helvetica, sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;text-align:center;background-color:#007bff;padding:12px 25px;border-radius:5px;border:1px solid #0056b3;mso-padding-alt:0px;mso-border-alt:none"
            >
              Click HERE to Submit Response
            </a>
          </div>

          <p style="font-family:Arial, sans-serif; font-size:13px; color:#555555; text-align:center; margin-top:20px;">
            If the button above doesn't work, copy and paste this link into your browser:
            <br/>
            <a href="${link.url}" target="_blank" style="color:#007bff; text-decoration:underline;">
              ${link.url}
            </a>
          </p>
        </body>
        </html>
      `;

      MailApp.sendEmail({
        to: link.email,
        subject: subject,
        htmlBody: htmlBody
      });
    });
    
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
    
    const roster = DataAccess.roster.getByClass(className);
    const props = PropertiesService.getScriptProperties();
    const tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    const tokenMap = JSON.parse(tokenMapStr);
    const baseUrl = ScriptApp.getService().getUrl();
    
    const links = roster.map(student => {
      // Find existing token for this student in this class
      let existingToken = null;
      for (const [token, data] of Object.entries(tokenMap)) {
        if (data.email === student.email && data.className === className) {
          // Check if not expired
          if (new Date().getTime() < data.expires) {
            existingToken = token;
            break;
          }
        }
      }
      
      return {
        name: student.name,
        email: student.email,
        url: existingToken ? `${baseUrl}?token=${existingToken}` : 'No active link',
        hasActiveLink: !!existingToken
      };
    });
    
    return { success: true, links: links };
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
      const questionData = normalizeQuestionObject_(JSON.parse(row[4] || "{}"), updatedAt);
      questionData.index = questionIndex;

      if (!pollsMap.has(pollId)) {
        pollsMap.set(pollId, {
          pollId: pollId,
          pollName: pollName,
          className: className,
          createdAt: createdAt,
          updatedAt: updatedAt,
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

function writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pollSheet = ss.getSheetByName('Polls');
  if (!pollSheet) {
    throw new Error('Polls sheet not found. Run setupSheet() first.');
  }

  // DEBUG: Log what we're about to save
  Logger.log('=== SAVING POLL DATA ===');
  Logger.log('Poll ID: ' + pollId);
  questions.forEach((q, idx) => {
    Logger.log(`Question ${idx}: questionImageFileId=${q.questionImageFileId}, options count=${q.options ? q.options.length : 0}`);
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
    updatedAt
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

  const values = getDataRangeValues_(pollSheet);
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === pollId) {
      pollSheet.deleteRow(i + 2);
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

  return normalized;
}
