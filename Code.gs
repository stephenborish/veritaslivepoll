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
    get: function() {
      return CacheManager.get('LIVE_POLL_STATUS', () => {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const liveSheet = ss.getSheetByName("LiveStatus");
        return liveSheet.getRange("A2:C2").getValues()[0];
      }, CacheManager.CACHE_TIMES.SHORT);
    },
    
    set: function(pollId, questionIndex, status) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const liveSheet = ss.getSheetByName("LiveStatus");
      const statusData = [pollId, questionIndex, status];
      liveSheet.getRange("A2:C2").setValues([statusData]);
      CacheManager.get('LIVE_POLL_STATUS', () => statusData, CacheManager.CACHE_TIMES.SHORT);
    }
  }
};

// =============================================================================
// CORE APP & ROUTING
// =============================================================================

function doGet(e) {
  try {
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
      
      // Store token in session for subsequent calls
      TokenManager.setSessionToken(token);
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
    const fileUrl = `https://drive.google.com/uc?id=${file.getId()}`;

    Logger.log('Image uploaded successfully', { fileName: fileName, fileId: file.getId(), size: sizeInBytes });

    return { success: true, url: fileUrl };
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
      options: (question.options || []).map(opt => ({
        text: opt.text || '',
        imageURL: opt.imageURL || null
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
    
    DataAccess.liveStatus.set(pollId, 0, "OPEN");
    
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
    
    DataAccess.liveStatus.set(pollId, newIndex, "OPEN");
    
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
    DataAccess.liveStatus.set(pollId, questionIndex, "PAUSED");
    
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
    DataAccess.liveStatus.set(pollId, questionIndex, "OPEN");
    
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

    DataAccess.liveStatus.set("", -1, "CLOSED");

    Logger.log('Poll closed completely', { pollId: pollId });

    return { status: "CLOSED" };
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
    question = normalizeQuestionObject_(question);
    poll.questions[questionIndex] = question;
    
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
      
      if (lockedStudents.has(email)) {
        return {
          name: student.name,
          email: email,
          status: 'LOCKED',
          answer: '---',
          isCorrect: null,
          timestamp: 0
        };
      }
      
      if (submittedAnswers.has(email)) {
        const submission = submittedAnswers.get(email);
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
      status: "OPEN",
      pollName: poll.pollName,
      questionText: question.questionText || '',
      questionImageURL: question.questionImageURL || null,
      questionIndex: questionIndex,
      totalQuestions: poll.questions.length,
      correctAnswer: question.correctAnswer || null,
      results: answerCounts,
      studentStatusList: studentStatusList,
      totalStudents: roster.length,
      totalResponses: submittedAnswers.size,
      timerSeconds: question.timerSeconds || null
    };
  })();
}

// =============================================================================
// STUDENT APP FUNCTIONS
// =============================================================================

function getStudentPollStatus() {
  return withErrorHandling(() => {
    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    const questionIndex = statusValues[1];
    const pollStatus = statusValues[2];
    
    const baseWaiting = (message, hasSubmitted = false) => ({ status: "WAITING", message, hasSubmitted });

    // If paused or closed, students see waiting message
    if (pollStatus === "CLOSED" || !pollId) {
      return { status: "CLOSED", hasSubmitted: false };
    }

    if (pollStatus === "PAUSED") {
      return baseWaiting("The teacher has paused the poll. Waiting to resume...", false);
    }

    const studentEmail = TokenManager.getCurrentStudentEmail();

    if (!studentEmail) {
      return {
        status: "ERROR",
        message: "Authentication error. Please use your personalized poll link.",
        hasSubmitted: false
      };
    }

    const poll = DataAccess.polls.getById(pollId);

    if (!poll) {
      return { status: "CLOSED", message: "Poll configuration error.", hasSubmitted: false };
    }
    
    if (!DataAccess.roster.isEnrolled(poll.className, studentEmail)) {
      return {
        status: "NOT_ENROLLED",
        message: "You are not enrolled in this class.",
        hasSubmitted: false
      };
    }

    if (DataAccess.responses.isLocked(pollId, studentEmail)) {
      return {
        status: "LOCKED",
        message: "Your session was locked because you navigated away from the poll.",
        hasSubmitted: false
      };
    }

    if (questionIndex < 0) {
      return baseWaiting("Waiting for the teacher to begin the poll...", false);
    }

    const hasSubmitted = DataAccess.responses.hasAnswered(pollId, questionIndex, studentEmail);

    if (hasSubmitted) {
      return baseWaiting("Your answer has been submitted. Waiting for the next question.", true);
    }

    const question = poll.questions[questionIndex];
    const normalizedQuestion = normalizeQuestionObject_(question);

    return {
      status: "OPEN",
      pollId: pollId,
      questionIndex: questionIndex,
      hasSubmitted: false,
      ...normalizedQuestion
    };
  })();
}


function submitStudentAnswer(pollId, questionIndex, answerText) {
  return withErrorHandling(() => {
    const studentEmail = TokenManager.getCurrentStudentEmail();
    
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

function logStudentViolation() {
  return withErrorHandling(() => {
    const studentEmail = TokenManager.getCurrentStudentEmail();
    
    if (!studentEmail) {
      return { success: false, error: "Authentication error." };
    }
    
    const statusValues = DataAccess.liveStatus.get();
    const pollId = statusValues[0];
    
    if (!pollId) {
      return { success: false, error: "No active poll." };
    }
    
    if (DataAccess.responses.isLocked(pollId, studentEmail)) {
      return { success: true, message: "Already locked." };
    }
    
    const responseId = "R-" + Utilities.getUuid();
    DataAccess.responses.add([
      responseId,
      new Date().getTime(),
      pollId,
      -1,
      studentEmail,
      "VIOLATION_LOCKED",
      false
    ]);
    
    Logger.log('Student violation logged', { studentEmail, pollId });
    
    return { success: true };
  })();
}

function unlockStudent(studentEmail, pollId) {
  return withErrorHandling(() => {
    if (!studentEmail || !pollId) {
      throw new Error('Student email and poll ID are required');
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Responses");
    
    if (sheet.getLastRow() < 2) {
      return { success: true, rowsDeleted: 0 };
    }
    
    const range = sheet.getDataRange();
    const values = range.getValues();
    const header = values[0];
    
    const colMap = {
      pollId: header.indexOf('PollID'),
      email: header.indexOf('StudentEmail'),
      answer: header.indexOf('Answer')
    };
    
    const rowsToDelete = [];
    for (let i = values.length - 1; i >= 1; i--) {
      const row = values[i];
      if (row[colMap.pollId] === pollId && 
          row[colMap.email] === studentEmail && 
          row[colMap.answer] === 'VIOLATION_LOCKED') {
        rowsToDelete.push(i + 1);
      }
    }
    
    rowsToDelete.forEach(rowIndex => {
      sheet.deleteRow(rowIndex);
    });
    
    Logger.log('Student unlocked', { 
      studentEmail, 
      pollId, 
      rowsDeleted: rowsToDelete.length 
    });
    
    return { success: true, rowsDeleted: rowsToDelete.length };
  })();
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
      links.push({
        email: student.email,
        name: student.name,
        url: personalizedUrl,
        token: token
      });
    });
    
    // Send individual emails with personalized links
    links.forEach(link => {
      const subject = "Your Personalized Link for Veritas Live Poll";
      const body = `Hi ${link.name},\n\n` +
        `Here is your unique link to access today's live poll:\n\n` +
        `${link.url}\n\n` +
        `Important:\n` +
        `• This link is personalized for you only\n` +
        `• Do not share this link with others\n` +
        `• Click the link and wait for the poll to begin\n` +
        `• Keep this tab open and do not switch tabs during the poll\n\n` +
        `If you have any issues, please contact your teacher.\n\n` +
        `- Veritas Live Poll System`;
      
      MailApp.sendEmail(link.email, subject, body);
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
      const questionData = normalizeQuestionObject_(JSON.parse(row[4] || "{}"));
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

function normalizeQuestionObject_(questionData) {
  const normalized = {};

  // Normalize question text
  normalized.questionText = questionData.questionText || questionData.text || '';

  // CANONICAL FIELD: questionImageURL
  // Map legacy fields (questionImage) to the canonical questionImageURL
  // Only store URLs, never base64
  let imageUrl = questionData.questionImageURL || questionData.questionImage || null;
  if (imageUrl && typeof imageUrl === 'string') {
    // Ensure it's a URL (starts with http/https), not base64
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      normalized.questionImageURL = imageUrl;
    } else if (imageUrl.startsWith('data:')) {
      // Legacy base64 - ignore it (should be re-uploaded)
      Logger.log('Ignoring legacy base64 questionImage');
      normalized.questionImageURL = null;
    } else {
      normalized.questionImageURL = null;
    }
  } else {
    normalized.questionImageURL = null;
  }

  // For backward compatibility, also set questionImage to the same value
  normalized.questionImage = normalized.questionImageURL;

  // Normalize options
  const optionsArray = Array.isArray(questionData.options) ? questionData.options : [];
  normalized.options = optionsArray.map(opt => {
    if (typeof opt === 'string') {
      return { text: opt, imageURL: null, image: null };
    }

    // CANONICAL FIELD: imageURL for options
    // Map legacy fields (image) to the canonical imageURL
    let optImageUrl = opt.imageURL || opt.image || null;
    if (optImageUrl && typeof optImageUrl === 'string') {
      // Ensure it's a URL, not base64
      if (optImageUrl.startsWith('http://') || optImageUrl.startsWith('https://')) {
        // Valid URL
      } else if (optImageUrl.startsWith('data:')) {
        // Legacy base64 - ignore it
        Logger.log('Ignoring legacy base64 option image');
        optImageUrl = null;
      } else {
        optImageUrl = null;
      }
    } else {
      optImageUrl = null;
    }

    return {
      text: opt.text || '',
      imageURL: optImageUrl,
      image: optImageUrl  // For backward compatibility
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
