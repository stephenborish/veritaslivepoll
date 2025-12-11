// =============================================================================
// VERITAS LIVE POLL - EXAM SERVICE
// =============================================================================
// Purpose: Manage Exams (CRUD) and Question Resolution
// Dependencies: Data_Access, Config, Utils, QuestionBankService
// =============================================================================

var Veritas = Veritas || {};
Veritas.ExamService = Veritas.ExamService || {};

/**
 * Create a new Exam
 * @param {Object} examData - Exam configuration object
 * @returns {Object} Created exam object
 */
Veritas.ExamService.createExam = function(examData) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.EXAMS);
    Veritas.Data.ensureHeaders(sheet, Veritas.Config.SHEET_HEADERS.EXAMS);

    var examId = examData.examId || (examData.classId + '_' + new Date().getTime());
    var headers = Veritas.Config.SHEET_HEADERS.EXAMS;
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });

    var rowData = new Array(headers.length);
    rowData[colMap['ExamId']] = examId;
    rowData[colMap['ExamName']] = examData.examName;
    rowData[colMap['ClassId']] = examData.classId;
    rowData[colMap['SourceType']] = examData.sourceType; // 'Poll' or 'QuestionBank'
    rowData[colMap['SourcePollId']] = examData.sourcePollId || '';
    rowData[colMap['QuestionIdsCsv']] = examData.questionIdsCsv || '';
    rowData[colMap['StartTime']] = examData.startTime || '';
    rowData[colMap['EndTime']] = examData.endTime || '';
    rowData[colMap['IsOpen']] = examData.isOpen === true;
    rowData[colMap['DurationMinutes']] = Number(examData.durationMinutes) || 0;
    rowData[colMap['RandomizeOrder']] = examData.randomizeOrder === true;
    rowData[colMap['ShowScoreToStudent']] = examData.showScoreToStudent === true;
    rowData[colMap['AllowMultipleAttempts']] = examData.allowMultipleAttempts === true;
    rowData[colMap['ProctorMode']] = examData.proctorMode || 'soft';
    rowData[colMap['CreatedBy']] = examData.createdBy || '';
    rowData[colMap['Notes']] = examData.notes || '';

    sheet.appendRow(rowData);

    examData.examId = examId;
    return examData;
  });
};

/**
 * Get Exam Config by ID
 * @param {string} examId
 * @returns {Object|null}
 */
Veritas.ExamService.getExamConfig = function(examId) {
  var ss = Veritas.Data.getSpreadsheet();
  var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAMS);
  if (!sheet) return null;

  var values = Veritas.Data.getDataRangeValues(sheet);
  var headers = Veritas.Config.SHEET_HEADERS.EXAMS;
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[colMap['ExamId']] === examId) {
      return {
        examId: row[colMap['ExamId']],
        examName: row[colMap['ExamName']],
        classId: row[colMap['ClassId']],
        sourceType: row[colMap['SourceType']],
        sourcePollId: row[colMap['SourcePollId']],
        questionIdsCsv: row[colMap['QuestionIdsCsv']],
        startTime: row[colMap['StartTime']],
        endTime: row[colMap['EndTime']],
        isOpen: row[colMap['IsOpen']] === true || row[colMap['IsOpen']] === 'TRUE',
        durationMinutes: Number(row[colMap['DurationMinutes']]) || 0,
        randomizeOrder: row[colMap['RandomizeOrder']] === true || row[colMap['RandomizeOrder']] === 'TRUE',
        showScoreToStudent: row[colMap['ShowScoreToStudent']] === true || row[colMap['ShowScoreToStudent']] === 'TRUE',
        allowMultipleAttempts: row[colMap['AllowMultipleAttempts']] === true || row[colMap['AllowMultipleAttempts']] === 'TRUE',
        proctorMode: row[colMap['ProctorMode']],
        createdBy: row[colMap['CreatedBy']],
        notes: row[colMap['Notes']]
      };
    }
  }
  return null;
};

/**
 * Get all exams for a teacher (optionally filtered by class)
 * @param {string} classId - Optional filter
 */
Veritas.ExamService.getExams = function(classId) {
  var ss = Veritas.Data.getSpreadsheet();
  var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAMS);
  if (!sheet) return [];

  var values = Veritas.Data.getDataRangeValues(sheet);
  var headers = Veritas.Config.SHEET_HEADERS.EXAMS;
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i; });

  var exams = values.map(function(row) {
    return {
      examId: row[colMap['ExamId']],
      examName: row[colMap['ExamName']],
      classId: row[colMap['ClassId']],
      sourceType: row[colMap['SourceType']],
      sourcePollId: row[colMap['SourcePollId']],
      questionIdsCsv: row[colMap['QuestionIdsCsv']],
      startTime: row[colMap['StartTime']],
      endTime: row[colMap['EndTime']],
      isOpen: row[colMap['IsOpen']] === true || row[colMap['IsOpen']] === 'TRUE',
      durationMinutes: Number(row[colMap['DurationMinutes']]) || 0,
      randomizeOrder: row[colMap['RandomizeOrder']] === true || row[colMap['RandomizeOrder']] === 'TRUE',
      proctorMode: row[colMap['ProctorMode']]
    };
  });

  if (classId) {
    exams = exams.filter(function(e) { return e.classId === classId; });
  }
  return exams;
};

/**
 * Toggle Exam Open/Closed Status
 */
Veritas.ExamService.setExamStatus = function(examId, isOpen) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAMS);
    if (!sheet) return false;

    var data = sheet.getDataRange().getValues();
    var idCol = Veritas.Config.SHEET_HEADERS.EXAMS.indexOf('ExamId');
    var statusCol = Veritas.Config.SHEET_HEADERS.EXAMS.indexOf('IsOpen');

    for (var i = 1; i < data.length; i++) {
      if (data[i][idCol] === examId) {
        sheet.getRange(i + 1, statusCol + 1).setValue(isOpen);
        return true;
      }
    }
    return false;
  });
};

/**
 * Resolve Questions for an Exam
 * @param {string} examId
 * @returns {Array} Array of Question Objects for Client
 */
Veritas.ExamService.getExamQuestions = function(examId) {
  var config = Veritas.ExamService.getExamConfig(examId);
  if (!config) throw new Error('Exam not found: ' + examId);

  var questions = [];

  if (config.sourceType === 'Poll' && config.sourcePollId) {
    // Legacy Poll Source
    var poll = Veritas.Data.Polls.getById(config.sourcePollId);
    if (poll && poll.questions) {
      questions = poll.questions.map(function(q, idx) {
        return {
          id: 'P_' + config.sourcePollId + '_' + idx, // Synthetic ID
          type: q.questionType || 'MC', // Assuming MC mostly
          stemHtml: q.questionText,
          stemImageUrl: q.questionImageUrl, // Need to ensure URL is viewable or ID resolved
          options: (q.answers || []).map(function(a) {
             return { text: a.text, imageUrl: a.imageUrl, id: null };
          }),
          points: q.points || 1,
          questionType: q.questionType || 'MC'
        };
      });
    }
  } else if (config.sourceType === 'QuestionBank' && config.questionIdsCsv) {
    // Question Bank Source
    var ids = config.questionIdsCsv.split(',').map(function(s) { return s.trim(); });
    var allQuestions = Veritas.QuestionBankService.getQuestions(); // Get all for now, optimize later if huge
    var qMap = {};
    allQuestions.forEach(function(q) { qMap[q.questionId] = q; });

    ids.forEach(function(id) {
      var q = qMap[id];
      if (q) {
        questions.push({
          id: q.questionId,
          type: q.questionType,
          stemHtml: q.stemHtml,
          stemImageFileId: q.stemImageFileId, // Client handles fileId -> URL
          options: [
            { text: q.choiceA_Text, imageFileId: q.choiceA_ImageFileId, letter: 'A' },
            { text: q.choiceB_Text, imageFileId: q.choiceB_ImageFileId, letter: 'B' },
            { text: q.choiceC_Text, imageFileId: q.choiceC_ImageFileId, letter: 'C' },
            { text: q.choiceD_Text, imageFileId: q.choiceD_ImageFileId, letter: 'D' }
          ].filter(function(o) { return o.text || o.imageFileId; }),
          points: q.points
        });
      }
    });
  }

  // Randomize if enabled
  if (config.randomizeOrder) {
    // Fisher-Yates shuffle
    for (var i = questions.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = questions[i];
      questions[i] = questions[j];
      questions[j] = temp;
    }
  }

  return questions;
};
