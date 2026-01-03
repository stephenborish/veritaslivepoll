// =============================================================================
// VERITAS LIVE POLL - EXAM API EXPOSED
// =============================================================================
// Purpose: Expose Exam-related methods to google.script.run
// Dependencies: Veritas.* Services
// =============================================================================

// Question Bank
function getBankQuestions(filters) {
  Veritas.Security.assertTeacher();
  return Veritas.QuestionBankService.getQuestions(filters);
}

function saveBankQuestion(questionData) {
  Veritas.Security.assertTeacher();
  return Veritas.QuestionBankService.saveQuestion(questionData);
}

function deleteBankQuestion(questionId) {
  Veritas.Security.assertTeacher();
  return Veritas.QuestionBankService.deleteQuestion(questionId);
}

// Exam Management
function createExam(examData) {
  Veritas.Security.assertTeacher();
  return Veritas.ExamService.createExam(examData);
}

function getExams(classId) {
  Veritas.Security.assertTeacher();
  return Veritas.ExamService.getExams(classId);
}

function setExamStatus(examId, isOpen) {
  Veritas.Security.assertTeacher();
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

function reportExamResume(examId, studentId) {
  return Veritas.ExamProctoringService.reportExamResume(examId, studentId);
}

function submitExamAnswers(examId, studentId, answers) {
  return Veritas.ExamResponseService.submitExamAnswers(examId, studentId, answers);
}

// Teacher Monitor
function unlockExamStudent(examId, studentEmail) {
  Veritas.Security.assertTeacher();
  return Veritas.ExamProctoringService.unlockExamStudent(examId, studentEmail);
}

function reportManualExamLock(examId, studentEmail, reason) {
   Veritas.Security.assertTeacher();
   // Wrapper to reuse violation reporting
   // Look up display name? Or just pass 'Teacher Lock'
   return Veritas.ExamProctoringService.reportExamViolation(examId, studentEmail, 'Student', reason);
}

// Manual Claim
function claimExamSeat(examId, identifier) {
  return Veritas.Utils.withLock(function() {
    if (!Veritas.Config.ALLOW_MANUAL_EXAM_CLAIM) {
       return { success: false, error: 'Manual claim is disabled.' };
    }

    // 1. Get Exam Config
    var examConfig = Veritas.ExamService.getExamConfig(examId);
    if (!examConfig) return { success: false, error: 'Exam not found.' };

    if (!examConfig.isOpen) return { success: false, error: 'Exam is closed.' };

    // 2. Check Roster
    var roster = Veritas.Data.Rosters.getByClass(examConfig.classId);
    var student = roster.find(function(s) {
       return s.email.toLowerCase() === identifier.toLowerCase() ||
              s.name.toLowerCase() === identifier.toLowerCase(); // Simple check
    });

    if (!student) {
       return { success: false, error: 'Student not found in roster for this exam.' };
    }

    // 3. Generate Token
    // We assume TokenManager is available globally or via Veritas.Utils
    // Main.gs implies TokenManager is global.
    var token = TokenManager.generateToken(student.email, examConfig.classId);

    // 4. Return Redirect URL
    var url = ScriptApp.getService().getUrl() +
              '?mode=examStudent&examId=' + encodeURIComponent(examId) +
              '&token=' + encodeURIComponent(token);

    return { success: true, redirectUrl: url };
  });
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
