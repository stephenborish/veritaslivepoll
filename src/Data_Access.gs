// =============================================================================
// VERITAS LIVE POLL - DATA ACCESS MODULE
// =============================================================================
// Purpose: Abstract all Google Sheets, Drive, and Properties Service interactions
// Dependencies: Config, Logging, Utils
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.Data = Veritas.Data || {};

// =============================================================================
// SPREADSHEET HELPERS
// =============================================================================

/**
 * Get the main spreadsheet
 * @returns {Spreadsheet} The main spreadsheet
 */
Veritas.Data.getSpreadsheet = function() {
  return SpreadsheetApp.getActiveSpreadsheet();
};

/**
 * Ensure a sheet exists, create if missing
 * @param {Spreadsheet} ss - Spreadsheet object
 * @param {string} name - Sheet name
 * @returns {Sheet} The sheet
 */
Veritas.Data.ensureSheet = function(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
};

/**
 * Ensure headers exist in a sheet
 * @param {Sheet} sheet - Sheet object
 * @param {string[]} desiredHeaders - Array of header names
 */
Veritas.Data.ensureHeaders = function(sheet, desiredHeaders) {
  var lastCol = sheet.getLastColumn();
  var existingHeaders = [];

  if (lastCol > 0) {
    existingHeaders = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(value) { return (value || '').toString().trim(); });
  }

  var filteredExisting = existingHeaders.filter(function(value) { return value.length > 0; });

  if (filteredExisting.length === 0) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
  } else {
    var missingHeaders = desiredHeaders.filter(function(header) {
      return filteredExisting.indexOf(header) === -1;
    });

    if (missingHeaders.length > 0) {
      var startCol = filteredExisting.length + 1;
      sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
      for (var i = 0; i < missingHeaders.length; i++) {
        filteredExisting.push(missingHeaders[i]);
      }
    }
  }

  var headerWidth = Math.max(sheet.getLastColumn(), desiredHeaders.length);
  if (headerWidth > 0) {
    sheet
      .getRange(1, 1, 1, headerWidth)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('#ffffff');
  }
  sheet.setFrozenRows(1);
};

/**
 * Get all data values from a sheet (excluding header row)
 * @param {Sheet} sheet - Sheet object
 * @returns {Array[]} Array of row arrays
 */
Veritas.Data.getDataRangeValues = function(sheet) {
  // CRITICAL NULL CHECK: getSheetByName can return null if sheet doesn't exist
  if (!sheet) {
    Veritas.Logging.warn('getDataRangeValues called with null/undefined sheet');
    return [];
  }

  if (sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
};

// =============================================================================
// CLASSES ENTITY
// =============================================================================

Veritas.Data.Classes = {
  /**
   * Get all class names
   * @returns {string[]} Array of class names (sorted)
   */
  getAll: function() {
    return Veritas.Utils.CacheManager.get('CLASSES_LIST', function() {
      var ss = Veritas.Data.getSpreadsheet();
      var classesSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.CLASSES);

      if (classesSheet && classesSheet.getLastRow() >= 2) {
        var values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 1).getValues();
        return values
          .map(function(row) { return row[0]; })
          .filter(function(name) { return name && name.toString().trim() !== ''; })
          .map(function(name) { return name.toString().trim(); })
          .filter(function(value, index, arr) { return arr.indexOf(value) === index; })
          .sort();
      }

      // Fallback: Get unique classes from Rosters
      var rosterSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.ROSTERS);
      var values = Veritas.Data.getDataRangeValues(rosterSheet);
      var classNamesSet = {};

      for (var i = 0; i < values.length; i++) {
        var name = values[i][0];
        if (name && name.toString().trim() !== '') {
          classNamesSet[name.toString().trim()] = true;
        }
      }

      var classNames = Object.keys(classNamesSet);
      classNames.sort();
      return classNames;
    }, Veritas.Utils.CacheManager.CACHE_TIMES.LONG);
  },

  /**
   * Ensure a class exists in the Classes sheet
   * @param {string} className - Class name
   * @param {string} description - Class description (optional)
   */
  ensureExists: function(className, description) {
    if (!className || className.trim() === '') {
      throw new Error('Class name cannot be empty');
    }

    var ss = Veritas.Data.getSpreadsheet();
    var classesSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.CLASSES);
    Veritas.Data.ensureHeaders(classesSheet, ['ClassName', 'Description']);

    var values = Veritas.Data.getDataRangeValues(classesSheet);
    var exists = false;

    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === className) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      classesSheet.appendRow([className, description || '']);
      Veritas.Utils.CacheManager.invalidate('CLASSES_LIST');
      Veritas.Logging.info('Class created', { className: className });
    }
  },

  /**
   * Rename a class
   * @param {string} oldName - Old class name
   * @param {string} newName - New class name
   */
  rename: function(oldName, newName) {
    if (!oldName || !newName || oldName.trim() === '' || newName.trim() === '') {
      throw new Error('Class names cannot be empty');
    }

    var ss = Veritas.Data.getSpreadsheet();

    // Update Classes sheet
    var classesSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.CLASSES);
    if (classesSheet) {
      var values = Veritas.Data.getDataRangeValues(classesSheet);
      for (var i = 0; i < values.length; i++) {
        if (values[i][0] === oldName) {
          classesSheet.getRange(i + 2, 1).setValue(newName);
          break;
        }
      }
    }

    // Update Rosters sheet
    var rosterSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.ROSTERS);
    if (rosterSheet) {
      var rosterValues = Veritas.Data.getDataRangeValues(rosterSheet);
      for (var i = 0; i < rosterValues.length; i++) {
        if (rosterValues[i][0] === oldName) {
          rosterSheet.getRange(i + 2, 1).setValue(newName);
        }
      }
    }

    // Update Polls sheet
    var pollsSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.POLLS);
    if (pollsSheet) {
      var pollValues = Veritas.Data.getDataRangeValues(pollsSheet);
      for (var i = 0; i < pollValues.length; i++) {
        if (pollValues[i][2] === oldName) {
          pollsSheet.getRange(i + 2, 3).setValue(newName);
        }
      }
    }

    // Invalidate caches
    Veritas.Utils.CacheManager.invalidate(['CLASSES_LIST', 'ALL_POLLS_DATA', Veritas.Config.CLASS_LINKS_CACHE_PREFIX + oldName]);

    Veritas.Logging.info('Class renamed', { oldName: oldName, newName: newName });
  },

  /**
   * Delete a class
   * @param {string} className - Class name to delete
   */
  delete: function(className) {
    if (!className || className.trim() === '') {
      throw new Error('Class name cannot be empty');
    }

    var ss = Veritas.Data.getSpreadsheet();

    // Delete from Classes sheet
    var classesSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.CLASSES);
    if (classesSheet) {
      var values = Veritas.Data.getDataRangeValues(classesSheet);
      for (var i = values.length - 1; i >= 0; i--) {
        if (values[i][0] === className) {
          classesSheet.deleteRow(i + 2);
          break;
        }
      }
    }

    // Delete from Rosters sheet
    var rosterSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.ROSTERS);
    if (rosterSheet) {
      var rosterValues = Veritas.Data.getDataRangeValues(rosterSheet);
      for (var i = rosterValues.length - 1; i >= 0; i--) {
        if (rosterValues[i][0] === className) {
          rosterSheet.deleteRow(i + 2);
        }
      }
    }

    // Invalidate caches
    Veritas.Utils.CacheManager.invalidate(['CLASSES_LIST', Veritas.Config.CLASS_LINKS_CACHE_PREFIX + className]);

    Veritas.Logging.info('Class deleted', { className: className });
  }
};

// =============================================================================
// ROSTERS ENTITY
// =============================================================================

Veritas.Data.Rosters = {
  /**
   * Get roster for a class
   * @param {string} className - Class name
   * @returns {Array<{name: string, email: string}>} Array of student objects
   */
  getByClass: function(className) {
    var ss = Veritas.Data.getSpreadsheet();
    var rosterSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.ROSTERS);
    var values = Veritas.Data.getDataRangeValues(rosterSheet);

    return values
      .filter(function(row) { return row[0] === className; })
      .map(function(row) {
        return {
          name: (row[1] || '').toString().trim(),
          email: (row[2] || '').toString().trim()
        };
      })
      .filter(function(entry) { return entry.name !== '' && entry.email !== ''; })
      .sort(function(a, b) { return a.name.localeCompare(b.name); });
  },

  /**
   * Save roster for a class (replaces existing)
   * @param {string} className - Class name
   * @param {Array<{name: string, email: string}>} rosterEntries - Student entries
   */
  save: function(className, rosterEntries) {
    if (!className || className.trim() === '') {
      throw new Error('Class name cannot be empty');
    }

    var ss = Veritas.Data.getSpreadsheet();
    var rosterSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.ROSTERS);
    Veritas.Data.ensureHeaders(rosterSheet, ['ClassName', 'StudentName', 'StudentEmail']);

    // Remove existing entries for this class
    var values = Veritas.Data.getDataRangeValues(rosterSheet);
    for (var i = values.length - 1; i >= 0; i--) {
      if (values[i][0] === className) {
        rosterSheet.deleteRow(i + 2);
      }
    }

    // Add new entries
    for (var i = 0; i < rosterEntries.length; i++) {
      var entry = rosterEntries[i];
      if (entry.name && entry.email) {
        rosterSheet.appendRow([className, entry.name, entry.email]);
      }
    }

    // Invalidate cache
    Veritas.Utils.CacheManager.invalidate(Veritas.Config.CLASS_LINKS_CACHE_PREFIX + className);

    Veritas.Logging.info('Roster saved', { className: className, count: rosterEntries.length });
  },

  /**
   * Bulk add students to roster (appends to existing)
   * @param {string} className - Class name
   * @param {Array<{name: string, email: string}>} studentEntries - Student entries
   */
  bulkAdd: function(className, studentEntries) {
    if (!className || className.trim() === '') {
      throw new Error('Class name cannot be empty');
    }

    var ss = Veritas.Data.getSpreadsheet();
    var rosterSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.ROSTERS);
    Veritas.Data.ensureHeaders(rosterSheet, ['ClassName', 'StudentName', 'StudentEmail']);

    // Get existing emails to avoid duplicates
    var existing = Veritas.Data.Rosters.getByClass(className);
    var existingEmails = {};
    for (var i = 0; i < existing.length; i++) {
      existingEmails[existing[i].email.toLowerCase()] = true;
    }

    var added = 0;
    for (var i = 0; i < studentEntries.length; i++) {
      var entry = studentEntries[i];
      if (entry.name && entry.email) {
        var emailLower = entry.email.toLowerCase();
        if (!existingEmails[emailLower]) {
          rosterSheet.appendRow([className, entry.name, entry.email]);
          existingEmails[emailLower] = true;
          added++;
        }
      }
    }

    // Invalidate cache
    Veritas.Utils.CacheManager.invalidate(Veritas.Config.CLASS_LINKS_CACHE_PREFIX + className);

    Veritas.Logging.info('Students bulk added to roster', { className: className, added: added });

    return { added: added, skipped: studentEntries.length - added };
  }
};

// =============================================================================
// POLLS ENTITY
// =============================================================================

Veritas.Data.Polls = {
  /**
   * Get all polls
   * @returns {Array<Object>} Array of poll objects with questions
   */
  getAll: function() {
    return Veritas.Utils.CacheManager.get('ALL_POLLS_DATA', function() {
      var ss = Veritas.Data.getSpreadsheet();
      var pollSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.POLLS);
      var values = Veritas.Data.getDataRangeValues(pollSheet);

      var pollsMap = {};

      // Sort by pollId, then questionIndex
      values.sort(function(a, b) {
        if (a[0] < b[0]) return -1;
        if (a[0] > b[0]) return 1;
        return a[3] - b[3];
      });

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var pollId = row[0];
        var pollName = row[1];
        var className = row[2];
        var questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10) || 0;
        var createdAt = row[5] || '';
        var updatedAt = row[6] || createdAt || '';
        var sessionType = normalizeSessionTypeValue_(row[7] || Veritas.Config.SESSION_TYPES.LIVE);
        var timeLimitRaw = row[8];
        var timeLimitMinutes = typeof timeLimitRaw === 'number'
          ? timeLimitRaw
          : (timeLimitRaw ? Number(timeLimitRaw) : null);
        var accessCode = row[9] || '';
        var availableFrom = row[10] || '';
        var dueBy = row[11] || '';
        var missionControlState = row[12] || '';
        var secureSettings = {};

        if (row[13]) {
          try {
            secureSettings = JSON.parse(row[13]);
          } catch (err) {
            Veritas.Logging.error('Failed to parse SecureSettingsJSON', err);
            secureSettings = {};
          }
        }

        var questionData = normalizeQuestionObject_(JSON.parse(row[4] || "{}"), updatedAt);
        questionData.index = questionIndex;

        if (!pollsMap[pollId]) {
          pollsMap[pollId] = {
            pollId: pollId,
            pollName: pollName,
            className: className,
            createdAt: createdAt,
            updatedAt: updatedAt,
            sessionType: sessionType,
            timeLimitMinutes: timeLimitMinutes,
            accessCode: accessCode,
            availableFrom: availableFrom,
            dueBy: dueBy,
            missionControlState: missionControlState,
            secureSettings: secureSettings,
            questions: []
          };
        }

        var pollEntry = pollsMap[pollId];
        pollEntry.questions.push(questionData);
        pollEntry.questionCount = pollEntry.questions.length;
      }

      var pollsArray = [];
      for (var pollId in pollsMap) {
        if (pollsMap.hasOwnProperty(pollId)) {
          pollsArray.push(pollsMap[pollId]);
        }
      }

      return pollsArray;
    }, Veritas.Utils.CacheManager.CACHE_TIMES.LONG);
  },

  /**
   * Get poll by ID
   * @param {string} pollId - Poll ID
   * @returns {Object|null} Poll object or null
   */
  getById: function(pollId) {
    var polls = Veritas.Data.Polls.getAll();
    for (var i = 0; i < polls.length; i++) {
      if (polls[i].pollId === pollId) {
        return polls[i];
      }
    }
    return null;
  },

  /**
   * Write poll rows to Polls sheet
   * @param {string} pollId - Poll ID
   * @param {string} pollName - Poll name
   * @param {string} className - Class name
   * @param {Array} questions - Questions array
   * @param {string} createdAt - Created timestamp
   * @param {string} updatedAt - Updated timestamp
   * @param {Object} metadata - Poll metadata (sessionType, timeLimitMinutes, etc.)
   */
  write: function(pollId, pollName, className, questions, createdAt, updatedAt, metadata) {
    var ss = Veritas.Data.getSpreadsheet();
    var pollSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.POLLS);

    if (!pollSheet) {
      throw new Error('Polls sheet not found. Run setupSheet() first.');
    }

    var normalizedMetadata = normalizeSecureMetadata_(metadata);
    var finalSessionType = normalizedMetadata.sessionType;
    var finalTimeLimitMinutes = normalizedMetadata.timeLimitMinutes;
    var accessCode = normalizedMetadata.accessCode || '';
    var availableFrom = normalizedMetadata.availableFrom || '';
    var dueBy = normalizedMetadata.dueBy || '';
    var missionControlState = normalizedMetadata.missionControlState || '';
    var secureSettingsJson = JSON.stringify(normalizedMetadata.secureSettings || {});

    Veritas.Logging.info('Saving poll data', {
      pollId: pollId,
      sessionType: finalSessionType,
      timeLimitMinutes: finalTimeLimitMinutes,
      questionCount: questions.length
    });

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var questionJson = JSON.stringify(q);

      pollSheet.appendRow([
        pollId,
        pollName,
        className,
        i,
        questionJson,
        createdAt,
        updatedAt,
        finalSessionType,
        finalTimeLimitMinutes,
        accessCode,
        availableFrom,
        dueBy,
        missionControlState,
        secureSettingsJson
      ]);
    }

    Veritas.Utils.CacheManager.invalidate('ALL_POLLS_DATA');
  },

  /**
   * Remove all rows for a poll
   * @param {string} pollId - Poll ID
   */
  remove: function(pollId) {
    var ss = Veritas.Data.getSpreadsheet();
    var pollSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.POLLS);

    if (!pollSheet) {
      return;
    }

    var values = Veritas.Data.getDataRangeValues(pollSheet);

    for (var i = values.length - 1; i >= 0; i--) {
      if (values[i][0] === pollId) {
        pollSheet.deleteRow(i + 2);
      }
    }

    Veritas.Utils.CacheManager.invalidate('ALL_POLLS_DATA');
    Veritas.Logging.info('Poll removed', { pollId: pollId });
  }
};

// =============================================================================
// PROPERTIES ENTITY
// =============================================================================

Veritas.Data.Properties = {
  /**
   * Get a script property value
   * @param {string} key - Property key
   * @param {*} defaultValue - Default value if not found
   * @returns {string|null} Property value or default
   */
  get: function(key, defaultValue) {
    var props = PropertiesService.getScriptProperties();
    var value = props.getProperty(key);
    return value !== null ? value : (defaultValue !== undefined ? defaultValue : null);
  },

  /**
   * Set a script property value
   * @param {string} key - Property key
   * @param {string} value - Property value
   */
  set: function(key, value) {
    var props = PropertiesService.getScriptProperties();
    props.setProperty(key, value.toString());
  },

  /**
   * Get a JSON property value
   * @param {string} key - Property key
   * @param {*} defaultValue - Default value if not found
   * @returns {Object|null} Parsed JSON or default
   */
  getJson: function(key, defaultValue) {
    var value = this.get(key);
    if (!value) {
      return defaultValue !== undefined ? defaultValue : null;
    }

    try {
      return JSON.parse(value);
    } catch (err) {
      Veritas.Logging.error('Failed to parse JSON property', err);
      return defaultValue !== undefined ? defaultValue : null;
    }
  },

  /**
   * Set a JSON property value
   * @param {string} key - Property key
   * @param {Object} value - Value to stringify and save
   */
  setJson: function(key, value) {
    try {
      var jsonString = JSON.stringify(value);
      this.set(key, jsonString);
    } catch (err) {
      Veritas.Logging.error('Failed to stringify JSON property', err);
      throw err;
    }
  },

  /**
   * Delete a script property
   * @param {string} key - Property key
   */
  delete: function(key) {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty(key);
  }
};

// =============================================================================
// DRIVE ENTITY
// =============================================================================

Veritas.Data.Drive = {
  /**
   * Get the Drive folder for image storage
   * @returns {Folder} Drive folder
   */
  getFolder: function() {
    try {
      return DriveApp.getFolderById(Veritas.Config.ALLOWED_FOLDER_ID);
    } catch (err) {
      Veritas.Logging.error('Drive folder not found', err);
      throw new Error('Image storage folder not configured. Please set ALLOWED_FOLDER_ID.');
    }
  },

  /**
   * Upload image to Drive
   * @param {string} dataUrl - Base64 data URL
   * @param {string} fileName - File name
   * @returns {Object} File metadata {id, url, name}
   */
  uploadImage: function(dataUrl, fileName) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      throw new Error('Invalid image data URL');
    }

    // Parse data URL
    var base64Data = dataUrl.split(',')[1];
    var mimeType = dataUrl.split(';')[0].split(':')[1];

    // Decode base64
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      fileName
    );

    // Upload to folder
    var folder = this.getFolder();
    var file = folder.createFile(blob);

    // Set sharing to anyone with link can view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    Veritas.Logging.info('Image uploaded to Drive', {
      fileId: file.getId(),
      fileName: file.getName(),
      size: file.getSize()
    });

    return {
      id: file.getId(),
      url: file.getUrl(),
      name: file.getName(),
      thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w1000'
    };
  },

  /**
   * Fix permissions for all files in the folder
   * @returns {number} Number of files updated
   */
  fixAllImagePermissions: function() {
    var folder = this.getFolder();
    var files = folder.getFiles();
    var count = 0;

    while (files.hasNext()) {
      var file = files.next();
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        count++;
      } catch (err) {
        Veritas.Logging.error('Failed to fix file permissions', { fileId: file.getId(), error: err });
      }
    }

    Veritas.Logging.info('Fixed image permissions', { count: count });
    return count;
  }
};

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================

/**
 * Legacy function - Get all polls
 */
function getPolls_() {
  return Veritas.Data.Polls.getAll();
}

/**
 * Legacy function - Get all classes
 */
function getClasses_() {
  return Veritas.Data.Classes.getAll();
}

/**
 * Legacy function - Get roster by class
 */
function getRoster_(className) {
  return Veritas.Data.Rosters.getByClass(className);
}

/**
 * Legacy function - Ensure sheet exists
 */
function ensureSheet_(ss, name) {
  return Veritas.Data.ensureSheet(ss, name);
}

/**
 * Legacy function - Ensure headers
 */
function ensureHeaders_(sheet, desiredHeaders) {
  return Veritas.Data.ensureHeaders(sheet, desiredHeaders);
}

/**
 * Legacy function - Get data range values
 */
function getDataRangeValues_(sheet) {
  return Veritas.Data.getDataRangeValues(sheet);
}

/**
 * Legacy function - Write poll rows
 */
function writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt, metadata) {
  return Veritas.Data.Polls.write(pollId, pollName, className, questions, createdAt, updatedAt, metadata);
}

/**
 * Legacy function - Remove poll rows
 */
function removePollRows_(pollId) {
  return Veritas.Data.Polls.remove(pollId);
}

/**
 * Legacy function - Ensure class exists
 */
function ensureClassExists_(className, description) {
  return Veritas.Data.Classes.ensureExists(className, description);
}

/**
 * Legacy function - Get Drive folder
 */
function getDriveFolder_() {
  return Veritas.Data.Drive.getFolder();
}

/**
 * Legacy function - Upload image to Drive
 */
function uploadImageToDrive(dataUrl, fileName) {
  return Veritas.Data.Drive.uploadImage(dataUrl, fileName);
}

/**
 * Legacy function - Fix all image permissions
 */
function fixAllImagePermissions() {
  return Veritas.Data.Drive.fixAllImagePermissions();
}

// =============================================================================
// HELPER FUNCTIONS FOR INDIVIDUAL SESSION STATE
// =============================================================================

/**
 * Parse individual session row from sheet into object
 * @param {Array} row - Row data from sheet
 * @param {number} index - Row index (1-based for sheet, includes header)
 * @returns {Object} Parsed session state object
 */
function parseIndividualSessionRow_(row, index) {
  var parseJson = function(value, fallback) {
    if (!value && value !== 0) return fallback;
    try {
      return JSON.parse(value);
    } catch (err) {
      Veritas.Logging.error('Failed to parse IndividualSessionState JSON column', err);
      return fallback;
    }
  };

  return {
    pollId: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.POLL_ID - 1] || '',
    sessionId: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.SESSION_ID - 1] || '',
    studentEmail: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.STUDENT_EMAIL - 1] || '',
    studentDisplayName: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.STUDENT_DISPLAY_NAME - 1] || '',
    startTime: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.START_TIME - 1] || null,
    endTime: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.END_TIME - 1] || null,
    questionOrder: parseJson(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.QUESTION_ORDER - 1], []),
    questionOrderSeed: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.QUESTION_ORDER_SEED - 1] || '',
    currentQuestionIndex: Number(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.CURRENT_QUESTION_INDEX - 1]) || 0,
    isLocked: coerceBoolean_(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.IS_LOCKED - 1], false),
    violationCode: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.VIOLATION_CODE - 1] || '',
    answerOrders: parseJson(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ANSWER_ORDERS - 1], {}),
    answerChoiceMap: parseJson(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ANSWER_CHOICE_MAP - 1], {}),
    timeAdjustmentMinutes: Number(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.TIME_ADJUSTMENT_MINUTES - 1]) || 0,
    pauseDurationMs: Number(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.PAUSE_DURATION_MS - 1]) || 0,
    lastHeartbeatMs: Number(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.LAST_HEARTBEAT_MS - 1]) || 0,
    connectionHealth: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.CONNECTION_HEALTH - 1] || 'UNKNOWN',
    proctorStatus: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.PROCTOR_STATUS - 1] || '',
    additionalMetadata: parseJson(row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ADDITIONAL_METADATA_JSON - 1], {}),
    rowIndex: index
  };
}

// Also make DataAccess object available for backward compatibility
var DataAccess = {
  roster: {
    getByClass: function(className) {
      return Veritas.Data.Rosters.getByClass(className);
    },

    isEnrolled: function(className, email) {
      return this.getByClass(className).some(function(s) { return s.email === email; });
    }
  },

  polls: {
    getById: function(pollId) {
      return Veritas.Data.Polls.getById(pollId);
    },

    getByClass: function(className) {
      var polls = Veritas.Data.Polls.getAll();
      return polls.filter(function(p) { return p.className === className; });
    },

    getAll: function() {
      return Veritas.Data.Polls.getAll();
    }
  },

  responses: {
    getByPoll: function(pollId) {
      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.RESPONSES);

      // NULL CHECK: Responses sheet might not exist yet
      if (!sheet) {
        Veritas.Logging.warn('Responses sheet not found for getByPoll', { pollId: pollId });
        return [];
      }

      var values = Veritas.Data.getDataRangeValues(sheet);
      return values.filter(function(r) { return r[2] === pollId; });
    },

    getByPollAndQuestion: function(pollId, questionIndex) {
      return this.getByPoll(pollId).filter(function(r) { return r[3] === questionIndex; });
    },

    getStudentStatus: function(pollId, studentEmail) {
      return this.getByPoll(pollId).filter(function(r) { return r[4] === studentEmail; });
    },

    isLocked: function(pollId, studentEmail) {
      return this.getStudentStatus(pollId, studentEmail)
        .some(function(r) { return Veritas.Config.PROCTOR_VIOLATION_VALUES.indexOf(r[5]) !== -1; });
    },

    hasAnswered: function(pollId, questionIndex, studentEmail) {
      return this.getByPollAndQuestion(pollId, questionIndex)
        .some(function(r) { return r[4] === studentEmail; });
    },

    add: function(responseData) {
      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.RESPONSES);

      // NULL CHECK: Ensure responses sheet exists before adding
      if (!sheet) {
        throw new Error('Responses sheet not found. Please run setupSheet() to initialize.');
      }

      sheet.appendRow(responseData);
    }
  },

  liveStatus: {
    METADATA_KEY: 'LIVE_POLL_METADATA',

    get: function() {
      var statusValues = Veritas.Utils.CacheManager.get('LIVE_POLL_STATUS', function() {
        var ss = Veritas.Data.getSpreadsheet();
        var liveSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.LIVE_STATUS);
        return liveSheet.getRange("A2:C2").getValues()[0];
      }, Veritas.Utils.CacheManager.CACHE_TIMES.INSTANT);

      var metadata = this.getMetadata_();
      if (Array.isArray(statusValues)) {
        statusValues.metadata = metadata;
      } else if (statusValues && statusValues.statusData && Array.isArray(statusValues.statusData)) {
        statusValues.statusData.metadata = metadata;
        return statusValues.statusData;
      }
      return statusValues;
    },

    set: function(pollId, questionIndex, status, metadata) {
      metadata = metadata || {};
      var ss = Veritas.Data.getSpreadsheet();
      var liveSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.LIVE_STATUS);
      var statusData = [pollId, questionIndex, status];
      liveSheet.getRange("A2:C2").setValues([statusData]);

      var sessionPhase = (metadata && metadata.sessionPhase)
        ? metadata.sessionPhase
        : (status === 'OPEN'
            ? 'LIVE'
            : status === 'PAUSED'
              ? 'PAUSED'
              : (questionIndex < 0 ? 'PRE_LIVE' : 'ENDED'));

      var enrichedMetadata = {};
      for (var key in metadata) {
        if (metadata.hasOwnProperty(key)) {
          enrichedMetadata[key] = metadata[key];
        }
      }
      enrichedMetadata.sessionPhase = sessionPhase;

      if (typeof enrichedMetadata.isCollecting !== 'boolean') {
        enrichedMetadata.isCollecting = (status === 'OPEN');
      }
      if (!enrichedMetadata.resultsVisibility) {
        enrichedMetadata.resultsVisibility = 'HIDDEN';
      }
      if (sessionPhase !== 'ENDED' && enrichedMetadata.endedAt === undefined) {
        enrichedMetadata.endedAt = null;
      }

      this.setMetadata_(enrichedMetadata);

      var cache = CacheService.getScriptCache();
      cache.put('LIVE_POLL_STATUS', JSON.stringify(statusData), Veritas.Utils.CacheManager.CACHE_TIMES.INSTANT);

      var reason = (enrichedMetadata && enrichedMetadata.reason) ? enrichedMetadata.reason : 'STATUS_' + status;
      Veritas.Utils.StateVersionManager.bump({
        pollId: pollId || '',
        questionIndex: typeof questionIndex === 'number' ? questionIndex : -1,
        status: sessionPhase,
        reason: reason,
        metadata: enrichedMetadata,
        timerRemainingSeconds: (enrichedMetadata && typeof enrichedMetadata.timerRemainingSeconds === 'number')
          ? enrichedMetadata.timerRemainingSeconds
          : null
      });
    },

    getMetadata: function() {
      return this.getMetadata_();
    },

    setMetadata_: function(metadata) {
      var props = PropertiesService.getScriptProperties();
      if (metadata && Object.keys(metadata).length > 0) {
        props.setProperty(this.METADATA_KEY, JSON.stringify(metadata));
      } else {
        props.deleteProperty(this.METADATA_KEY);
      }
    },

    getMetadata_: function() {
      var props = PropertiesService.getScriptProperties();
      var metadataStr = props.getProperty(this.METADATA_KEY);
      if (!metadataStr) return {};
      try {
        return JSON.parse(metadataStr);
      } catch (err) {
        Veritas.Logging.error('Failed to parse live poll metadata', err);
        return {};
      }
    }
  },

  individualSessionState: {
    getByStudent: function(pollId, sessionId, studentEmail) {
      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);

      // NULL CHECK: Sheet may not exist if no secure sessions have been created yet
      if (!sheet) {
        Veritas.Logging.warn('IndividualTimedSessions sheet not found for getByStudent', { pollId: pollId, sessionId: sessionId, studentEmail: studentEmail });
        return null;
      }

      var values = Veritas.Data.getDataRangeValues(sheet);

      for (var i = 0; i < values.length; i++) {
        if (values[i][0] === pollId && values[i][1] === sessionId && values[i][2] === studentEmail) {
          return parseIndividualSessionRow_(values[i], i + 2);
        }
      }
      return null;
    },

    initStudent: function(pollId, sessionId, studentEmail, questionOrder, answerOrders, options) {
      options = options || {};
      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);
      var startTime = new Date().toISOString();
      var row = [];
      for (var i = 0; i < Veritas.Config.INDIVIDUAL_SESSION_COLUMN_COUNT; i++) {
        row.push('');
      }
      var heartbeatMs = Date.now();
      var seed = (options && options.questionOrderSeed)
        ? options.questionOrderSeed
        : questionOrder.join('-');
      var answerChoiceMap = (options && options.answerChoiceMap) || {};

      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.POLL_ID - 1] = pollId;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.SESSION_ID - 1] = sessionId;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.STUDENT_EMAIL - 1] = studentEmail;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.STUDENT_DISPLAY_NAME - 1] = (options && options.displayName) || '';
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.START_TIME - 1] = startTime;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.END_TIME - 1] = null;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.QUESTION_ORDER - 1] = JSON.stringify(questionOrder);
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.QUESTION_ORDER_SEED - 1] = seed;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.CURRENT_QUESTION_INDEX - 1] = 0;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.IS_LOCKED - 1] = false;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.VIOLATION_CODE - 1] = null;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ANSWER_ORDERS - 1] = JSON.stringify(answerOrders);
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ANSWER_CHOICE_MAP - 1] = JSON.stringify(answerChoiceMap);
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.TIME_ADJUSTMENT_MINUTES - 1] = (options && options.timeAdjustmentMinutes) || 0;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.PAUSE_DURATION_MS - 1] = (options && options.pauseDurationMs) || 0;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.LAST_HEARTBEAT_MS - 1] = heartbeatMs;
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.CONNECTION_HEALTH - 1] = 'GREEN';
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.PROCTOR_STATUS - 1] = 'ACTIVE';
      row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ADDITIONAL_METADATA_JSON - 1] = (options && options.additionalMetadata)
        ? JSON.stringify(options.additionalMetadata)
        : '';

      sheet.appendRow(row);

      return {
        pollId: pollId,
        sessionId: sessionId,
        studentEmail: studentEmail,
        studentDisplayName: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.STUDENT_DISPLAY_NAME - 1],
        startTime: startTime,
        endTime: null,
        questionOrder: questionOrder,
        questionOrderSeed: seed,
        currentQuestionIndex: 0,
        isLocked: false,
        answerOrders: answerOrders,
        answerChoiceMap: answerChoiceMap,
        timeAdjustmentMinutes: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.TIME_ADJUSTMENT_MINUTES - 1],
        pauseDurationMs: row[Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.PAUSE_DURATION_MS - 1],
        lastHeartbeatMs: heartbeatMs,
        connectionHealth: 'GREEN',
        rowIndex: sheet.getLastRow()
      };
    },

    updateProgress: function(pollId, sessionId, studentEmail, newIndex) {
      var studentState = this.getByStudent(pollId, sessionId, studentEmail);
      if (studentState) {
        var ss = Veritas.Data.getSpreadsheet();
        var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);
        sheet.getRange(studentState.rowIndex, Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.CURRENT_QUESTION_INDEX).setValue(newIndex);
      }
    },

    lockStudent: function(pollId, sessionId, studentEmail) {
      var studentState = this.getByStudent(pollId, sessionId, studentEmail);
      if (studentState) {
        var ss = Veritas.Data.getSpreadsheet();
        var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);
        sheet.getRange(studentState.rowIndex, Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.IS_LOCKED).setValue(true);
        sheet.getRange(studentState.rowIndex, Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.END_TIME).setValue(new Date().toISOString());
      }
    },

    setAnswerOrders: function(pollId, sessionId, studentEmail, answerOrders) {
      var studentState = this.getByStudent(pollId, sessionId, studentEmail);
      if (studentState) {
        var ss = Veritas.Data.getSpreadsheet();
        var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);
        sheet.getRange(studentState.rowIndex, Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.ANSWER_ORDERS).setValue(JSON.stringify(answerOrders));
      }
    },

    getAllForSession: function(pollId, sessionId) {
      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);

      // NULL CHECK: Sheet may not exist if no secure sessions have been created yet
      if (!sheet) {
        Veritas.Logging.warn('IndividualTimedSessions sheet not found', { pollId: pollId, sessionId: sessionId });
        return [];
      }

      var values = Veritas.Data.getDataRangeValues(sheet);

      var results = [];
      for (var i = 0; i < values.length; i++) {
        if (values[i][0] === pollId && values[i][1] === sessionId) {
          results.push(parseIndividualSessionRow_(values[i], i + 2));
        }
      }
      return results;
    },

    touchHeartbeat: function(pollId, sessionId, studentEmail, connectionMeta, existingState) {
      var state = existingState || this.getByStudent(pollId, sessionId, studentEmail);
      if (!state) return;

      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);

      // NULL CHECK: Defensive check before updating
      if (!sheet) {
        Veritas.Logging.warn('IndividualTimedSessions sheet not found for touchHeartbeat', { pollId: pollId, sessionId: sessionId, studentEmail: studentEmail });
        return;
      }

      var nowMs = Date.now();
      sheet.getRange(state.rowIndex, Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.LAST_HEARTBEAT_MS).setValue(nowMs);
      if (connectionMeta && connectionMeta.status) {
        sheet.getRange(state.rowIndex, Veritas.Config.INDIVIDUAL_SESSION_COLUMNS.CONNECTION_HEALTH).setValue(connectionMeta.status);
      }
    },

    updateFields: function(pollId, sessionId, studentEmail, updates) {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Updates object required');
      }

      var state = this.getByStudent(pollId, sessionId, studentEmail);
      if (!state) {
        throw new Error('Student session not initialized');
      }

      var ss = Veritas.Data.getSpreadsheet();
      var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.INDIVIDUAL_TIMED_SESSIONS);

      // NULL CHECK: Defensive check before updating
      if (!sheet) {
        throw new Error('IndividualTimedSessions sheet not found. Cannot update student fields.');
      }

      var rowIndex = state.rowIndex;
      var columns = Veritas.Config.INDIVIDUAL_SESSION_COLUMNS;

      if (Object.prototype.hasOwnProperty.call(updates, 'timeAdjustmentMinutes')) {
        sheet.getRange(rowIndex, columns.TIME_ADJUSTMENT_MINUTES).setValue(updates.timeAdjustmentMinutes);
        state.timeAdjustmentMinutes = updates.timeAdjustmentMinutes;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'pauseDurationMs')) {
        sheet.getRange(rowIndex, columns.PAUSE_DURATION_MS).setValue(updates.pauseDurationMs);
        state.pauseDurationMs = updates.pauseDurationMs;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'currentQuestionIndex')) {
        sheet.getRange(rowIndex, columns.CURRENT_QUESTION_INDEX).setValue(updates.currentQuestionIndex);
        state.currentQuestionIndex = updates.currentQuestionIndex;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'endTime')) {
        sheet.getRange(rowIndex, columns.END_TIME).setValue(updates.endTime);
        state.endTime = updates.endTime;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'isLocked')) {
        sheet.getRange(rowIndex, columns.IS_LOCKED).setValue(updates.isLocked);
        state.isLocked = updates.isLocked;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'violationCode')) {
        sheet.getRange(rowIndex, columns.VIOLATION_CODE).setValue(updates.violationCode);
        state.violationCode = updates.violationCode;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'proctorStatus')) {
        sheet.getRange(rowIndex, columns.PROCTOR_STATUS).setValue(updates.proctorStatus);
        state.proctorStatus = updates.proctorStatus;
      }

      var metadataUpdated = false;

      if (Object.prototype.hasOwnProperty.call(updates, 'additionalMetadata')) {
        state.additionalMetadata = updates.additionalMetadata;
        metadataUpdated = true;
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'mergeAdditionalMetadata')) {
        var currentMetadata = state.additionalMetadata || {};
        var newMetadata = updates.mergeAdditionalMetadata;
        if (newMetadata && typeof newMetadata === 'object') {
          for (var key in newMetadata) {
            if (Object.prototype.hasOwnProperty.call(newMetadata, key)) {
              currentMetadata[key] = newMetadata[key];
            }
          }
          state.additionalMetadata = currentMetadata;
          metadataUpdated = true;
        }
      }

      if (metadataUpdated) {
        var metadataJson = JSON.stringify(state.additionalMetadata);
        sheet.getRange(rowIndex, columns.ADDITIONAL_METADATA_JSON).setValue(metadataJson);
      }

      return state;
    }
  }
};
