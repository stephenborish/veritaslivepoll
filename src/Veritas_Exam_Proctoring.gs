// =============================================================================
// VERITAS LIVE POLL - EXAM PROCTORING SERVICE
// =============================================================================
// Purpose: Manage Exam Proctoring State (Sheets + Firebase Coordination)
// Dependencies: Data_Access, Config, Utils, ExamService
// =============================================================================

var Veritas = Veritas || {};
Veritas.ExamProctoringService = Veritas.ExamProctoringService || {};

/**
 * Report an exam violation (Client -> Server)
 * Updates the persistent ExamStatus sheet.
 * Note: Client also updates Firebase directly for speed.
 * @param {string} examId
 * @param {string} studentId - Email or unique ID
 * @param {string} displayName
 * @param {string} reason
 */
Veritas.ExamProctoringService.reportExamViolation = function(examId, studentId, displayName, reason) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.EXAM_STATUS);
    Veritas.Data.ensureHeaders(sheet, Veritas.Config.SHEET_HEADERS.EXAM_STATUS);

    var data = sheet.getDataRange().getValues();
    var headers = Veritas.Config.SHEET_HEADERS.EXAM_STATUS;
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var rowIndex = -1;
    var rowData = null;

    // Find existing status row
    for (var i = 1; i < data.length; i++) {
      if (data[i][colMap['ExamId']] === examId && data[i][colMap['StudentId']] === studentId) {
        rowIndex = i + 1;
        rowData = data[i];
        break;
      }
    }

    var examConfig = Veritas.ExamService.getExamConfig(examId);
    var isHardLock = examConfig && examConfig.proctorMode === 'hard';
    var timestamp = new Date().toISOString();

    if (rowIndex > 0) {
      // Update existing
      var currentViolationCount = Number(rowData[colMap['ViolationCount']]) || 0;
      sheet.getRange(rowIndex, colMap['Locked'] + 1).setValue(true);
      sheet.getRange(rowIndex, colMap['LastEvent'] + 1).setValue('violation: ' + reason);
      sheet.getRange(rowIndex, colMap['LastEventTime'] + 1).setValue(timestamp);
      sheet.getRange(rowIndex, colMap['ViolationCount'] + 1).setValue(currentViolationCount + 1);
    } else {
      // Create new (should normally exist from start, but just in case)
      var newRow = new Array(headers.length);
      newRow[colMap['ExamId']] = examId;
      newRow[colMap['StudentId']] = studentId;
      newRow[colMap['DisplayName']] = displayName;
      newRow[colMap['Locked']] = true;
      newRow[colMap['LastEvent']] = 'violation: ' + reason;
      newRow[colMap['LastEventTime']] = timestamp;
      newRow[colMap['ViolationCount']] = 1;
      newRow[colMap['TotalScore']] = 0;
      newRow[colMap['AttemptNumber']] = 1;

      sheet.appendRow(newRow);
    }

    Veritas.Logging.info('Exam Violation Reported', { examId: examId, studentId: studentId, reason: reason });
    return { success: true, locked: true, mode: isHardLock ? 'hard' : 'soft' };
  });
};

/**
 * Report Exam Resume (Student Self-Unlock for Soft Mode)
 * @param {string} examId
 * @param {string} studentId
 */
Veritas.ExamProctoringService.reportExamResume = function(examId, studentId) {
  return Veritas.Utils.withLock(function() {
    var examConfig = Veritas.ExamService.getExamConfig(examId);
    if (!examConfig) return { success: false, error: 'Exam not found' };

    // Strict Hard Mode Check
    if (examConfig.proctorMode === 'hard') {
      return { success: false, error: 'Hard Lock active. Teacher unlock required.' };
    }

    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAM_STATUS);
    if (!sheet) return { success: false, error: 'Sheet not found' };

    var data = sheet.getDataRange().getValues();
    var headers = Veritas.Config.SHEET_HEADERS.EXAM_STATUS;
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var timestamp = new Date().toISOString();

    for (var i = 1; i < data.length; i++) {
      if (data[i][colMap['ExamId']] === examId && data[i][colMap['StudentId']] === studentId) {
        var rowIndex = i + 1;
        // Clear Locked Flag
        sheet.getRange(rowIndex, colMap['Locked'] + 1).setValue(false);
        sheet.getRange(rowIndex, colMap['LastEvent'] + 1).setValue('resume');
        sheet.getRange(rowIndex, colMap['LastEventTime'] + 1).setValue(timestamp);
        return { success: true };
      }
    }
    return { success: false, error: 'Student status not found' };
  });
};

/**
 * Report Exam Start (Initialize Status)
 */
Veritas.ExamProctoringService.reportExamStart = function(examId, studentId, displayName) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.EXAM_STATUS);
    Veritas.Data.ensureHeaders(sheet, Veritas.Config.SHEET_HEADERS.EXAM_STATUS);

    var data = sheet.getDataRange().getValues();
    var headers = Veritas.Config.SHEET_HEADERS.EXAM_STATUS;
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var timestamp = new Date().toISOString();

    for (var i = 1; i < data.length; i++) {
      if (data[i][colMap['ExamId']] === examId && data[i][colMap['StudentId']] === studentId) {
        // Already started? Just update last event
        var rowIndex = i + 1;
        sheet.getRange(rowIndex, colMap['LastEvent'] + 1).setValue('start');
        sheet.getRange(rowIndex, colMap['LastEventTime'] + 1).setValue(timestamp);
        // Ensure DisplayName is up to date
        sheet.getRange(rowIndex, colMap['DisplayName'] + 1).setValue(displayName);
        return { success: true };
      }
    }

    // New entry
    var newRow = new Array(headers.length);
    newRow[colMap['ExamId']] = examId;
    newRow[colMap['StudentId']] = studentId;
    newRow[colMap['DisplayName']] = displayName;
    newRow[colMap['Locked']] = false;
    newRow[colMap['LastEvent']] = 'start';
    newRow[colMap['LastEventTime']] = timestamp;
    newRow[colMap['ViolationCount']] = 0;
    newRow[colMap['TotalScore']] = 0;
    newRow[colMap['AttemptNumber']] = 1;

    sheet.appendRow(newRow);
    return { success: true };
  });
};

/**
 * Unlock Student (Teacher Action)
 * Updates Sheet. Client updates Firebase.
 */
Veritas.ExamProctoringService.unlockExamStudent = function(examId, studentId) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAM_STATUS);
    if (!sheet) return { success: false, error: 'Sheet not found' };

    var data = sheet.getDataRange().getValues();
    var headers = Veritas.Config.SHEET_HEADERS.EXAM_STATUS;
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var timestamp = new Date().toISOString();

    for (var i = 1; i < data.length; i++) {
      if (data[i][colMap['ExamId']] === examId && data[i][colMap['StudentId']] === studentId) {
        var rowIndex = i + 1;
        sheet.getRange(rowIndex, colMap['Locked'] + 1).setValue(false);
        sheet.getRange(rowIndex, colMap['LastEvent'] + 1).setValue('unlock');
        sheet.getRange(rowIndex, colMap['LastEventTime'] + 1).setValue(timestamp);
        return { success: true };
      }
    }
    return { success: false, error: 'Student status not found' };
  });
};

/**
 * Check Lock State (Server-side check for Hard Lock logic)
 */
Veritas.ExamProctoringService.isStudentLocked = function(examId, studentId) {
  var ss = Veritas.Data.getSpreadsheet();
  var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAM_STATUS);
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  var headers = Veritas.Config.SHEET_HEADERS.EXAM_STATUS;
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  for (var i = 1; i < data.length; i++) {
    if (data[i][colMap['ExamId']] === examId && data[i][colMap['StudentId']] === studentId) {
      return data[i][colMap['Locked']] === true || data[i][colMap['Locked']] === 'TRUE';
    }
  }
  return false;
};
