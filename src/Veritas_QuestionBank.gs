// =============================================================================
// VERITAS LIVE POLL - QUESTION BANK SERVICE
// =============================================================================
// Purpose: Manage Question Bank (CRUD)
// Dependencies: Data_Access, Config, Utils
// =============================================================================

var Veritas = Veritas || {};
Veritas.QuestionBankService = Veritas.QuestionBankService || {};

/**
 * Generate a new unique Question ID
 * Format: Q + Timestamp (Base36) + Random (Base36) -> e.g. "Q123ABCXYZ"
 */
Veritas.QuestionBankService.generateQuestionId = function() {
  var timestamp = new Date().getTime().toString(36).toUpperCase();
  var random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'Q' + timestamp + random;
};

/**
 * Get all questions from the bank, optionally filtered
 * @param {Object} filters - { classId, unitTag, topicTag, activeOnly }
 * @returns {Array} Array of question objects
 */
Veritas.QuestionBankService.getQuestions = function(filters) {
  var ss = Veritas.Data.getSpreadsheet();
  var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.QUESTION_BANK);
  if (!sheet) return [];

  var values = Veritas.Data.getDataRangeValues(sheet);
  if (!values || values.length === 0) return [];

  var headers = Veritas.Config.SHEET_HEADERS.QUESTION_BANK;
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  var questions = values.map(function(row) {
    return {
      questionId: row[colMap['QuestionId']],
      classId: row[colMap['ClassId']],
      unitTag: row[colMap['UnitTag']],
      topicTag: row[colMap['TopicTag']],
      difficulty: row[colMap['Difficulty']],
      questionType: row[colMap['QuestionType']],
      stemHtml: row[colMap['StemHtml']],
      stemImageFileId: row[colMap['StemImageFileId']],
      choiceA_Text: row[colMap['ChoiceA_Text']],
      choiceA_ImageFileId: row[colMap['ChoiceA_ImageFileId']],
      choiceB_Text: row[colMap['ChoiceB_Text']],
      choiceB_ImageFileId: row[colMap['ChoiceB_ImageFileId']],
      choiceC_Text: row[colMap['ChoiceC_Text']],
      choiceC_ImageFileId: row[colMap['ChoiceC_ImageFileId']],
      choiceD_Text: row[colMap['ChoiceD_Text']],
      choiceD_ImageFileId: row[colMap['ChoiceD_ImageFileId']],
      correctOption: row[colMap['CorrectOption']],
      correctShortAnswer: row[colMap['CorrectShortAnswer']],
      points: Number(row[colMap['Points']]) || 0,
      active: row[colMap['Active']] === true || row[colMap['Active']] === 'TRUE',
      tagsCsv: row[colMap['TagsCsv']],
      lastUpdated: row[colMap['LastUpdated']]
    };
  });

  // Apply filters
  if (filters) {
    if (filters.activeOnly) {
      questions = questions.filter(function(q) { return q.active; });
    }
    if (filters.classId) {
      questions = questions.filter(function(q) { return !q.classId || q.classId === filters.classId; });
    }
    if (filters.unitTag) {
      questions = questions.filter(function(q) { return q.unitTag === filters.unitTag; });
    }
    if (filters.topicTag) {
      questions = questions.filter(function(q) { return q.topicTag === filters.topicTag; });
    }
  }

  return questions;
};

/**
 * Add or Update a question
 * @param {Object} questionData - Question object (if questionId exists, update; else create)
 * @returns {Object} Saved question object
 */
Veritas.QuestionBankService.saveQuestion = function(questionData) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.QUESTION_BANK);
    Veritas.Data.ensureHeaders(sheet, Veritas.Config.SHEET_HEADERS.QUESTION_BANK);

    var headers = Veritas.Config.SHEET_HEADERS.QUESTION_BANK;
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var isNew = !questionData.questionId;
    var questionId = isNew ? Veritas.QuestionBankService.generateQuestionId() : questionData.questionId;
    var timestamp = new Date().toISOString();

    var rowData = new Array(headers.length);
    rowData[colMap['QuestionId']] = questionId;
    rowData[colMap['ClassId']] = questionData.classId || '';
    rowData[colMap['UnitTag']] = questionData.unitTag || '';
    rowData[colMap['TopicTag']] = questionData.topicTag || '';
    rowData[colMap['Difficulty']] = questionData.difficulty || 'Medium';
    rowData[colMap['QuestionType']] = questionData.questionType || 'MC';
    rowData[colMap['StemHtml']] = questionData.stemHtml || '';
    rowData[colMap['StemImageFileId']] = questionData.stemImageFileId || '';
    rowData[colMap['ChoiceA_Text']] = questionData.choiceA_Text || '';
    rowData[colMap['ChoiceA_ImageFileId']] = questionData.choiceA_ImageFileId || '';
    rowData[colMap['ChoiceB_Text']] = questionData.choiceB_Text || '';
    rowData[colMap['ChoiceB_ImageFileId']] = questionData.choiceB_ImageFileId || '';
    rowData[colMap['ChoiceC_Text']] = questionData.choiceC_Text || '';
    rowData[colMap['ChoiceC_ImageFileId']] = questionData.choiceC_ImageFileId || '';
    rowData[colMap['ChoiceD_Text']] = questionData.choiceD_Text || '';
    rowData[colMap['ChoiceD_ImageFileId']] = questionData.choiceD_ImageFileId || '';
    rowData[colMap['CorrectOption']] = questionData.correctOption || '';
    rowData[colMap['CorrectShortAnswer']] = questionData.correctShortAnswer || '';
    rowData[colMap['Points']] = typeof questionData.points === 'number' ? questionData.points : 1;
    rowData[colMap['Active']] = questionData.active !== false; // Default true
    rowData[colMap['TagsCsv']] = questionData.tagsCsv || '';
    rowData[colMap['LastUpdated']] = timestamp;

    if (isNew) {
      sheet.appendRow(rowData);
    } else {
      // Find row to update
      var data = sheet.getDataRange().getValues();
      var rowIndex = -1;
      // Start from 1 to skip header
      for (var i = 1; i < data.length; i++) {
        if (data[i][colMap['QuestionId']] === questionId) {
          rowIndex = i + 1; // 1-based index
          break;
        }
      }

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        // ID provided but not found? Append it.
        sheet.appendRow(rowData);
      }
    }

    return questionData;
  });
};

/**
 * Delete a question (soft delete or hard delete based on preference, implementing hard for now)
 * @param {string} questionId
 */
Veritas.QuestionBankService.deleteQuestion = function(questionId) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.QUESTION_BANK);
    if (!sheet) return;

    var data = sheet.getDataRange().getValues();
    var colIndex = Veritas.Config.SHEET_HEADERS.QUESTION_BANK.indexOf('QuestionId');

    for (var i = 1; i < data.length; i++) {
      if (data[i][colIndex] === questionId) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Question not found' };
  });
};
