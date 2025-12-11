// =============================================================================
// VERITAS LIVE POLL - EXAM API EXPOSED
// =============================================================================
// Purpose: Expose Exam-related methods to google.script.run
// Dependencies: Veritas.* Services
// =============================================================================

// Question Bank
function getBankQuestions(filters) {
  return Veritas.QuestionBankService.getQuestions(filters);
}

function saveBankQuestion(questionData) {
  return Veritas.QuestionBankService.saveQuestion(questionData);
}

function deleteBankQuestion(questionId) {
  return Veritas.QuestionBankService.deleteQuestion(questionId);
}

// Exam Management
function createExam(examData) {
  return Veritas.ExamService.createExam(examData);
}

function getExams(classId) {
  return Veritas.ExamService.getExams(classId);
}

function setExamStatus(examId, isOpen) {
  return Veritas.ExamService.setExamStatus(examId, isOpen);
}

// Student Exam
function getExamQuestions(examId) {
  return Veritas.ExamService.getExamQuestions(examId);
}

function reportExamStart(examId, studentId, displayName) {
  return Veritas.ExamProctoringService.reportExamStart(examId, studentId, displayName);
}

function reportExamViolation(examId, studentId, displayName, reason) {
  return Veritas.ExamProctoringService.reportExamViolation(examId, studentId, displayName, reason);
}

function submitExamAnswers(examId, studentId, answers) {
  return Veritas.ExamResponseService.submitExamAnswers(examId, studentId, answers);
}

// Teacher Monitor
function unlockExamStudent(examId, studentEmail) {
  return Veritas.ExamProctoringService.unlockExamStudent(examId, studentEmail);
}

function reportManualExamLock(examId, studentEmail, reason) {
   // Wrapper to reuse violation reporting
   // Look up display name? Or just pass 'Teacher Lock'
   return Veritas.ExamProctoringService.reportExamViolation(examId, studentEmail, 'Student', reason);
}

// Navigation Helper
function getScriptUrl(qs) {
  var url = ScriptApp.getService().getUrl();
  if (qs) {
    if (qs.indexOf('?') === 0) url += qs;
    else url += '?' + qs; // Simple append
    // Better: Query string handling
    if (qs.indexOf('&') === -1 && qs.indexOf('=') === -1) {
       // treat as mode
       url += '?mode=' + qs;
    } else {
       // treat as full query string
       if (url.indexOf('?') !== -1) url += '&' + qs;
       else url += '?' + qs;
    }
  }
  return url;
}
