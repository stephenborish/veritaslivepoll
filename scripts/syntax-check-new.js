const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  'src/Veritas_QuestionBank.gs',
  'src/Veritas_Exams.gs',
  'src/Veritas_Exam_Proctoring.gs',
  'src/Veritas_Exam_Responses.gs',
  'src/API_Exposed_Exams.gs'
];

// Mock basic GAS globals
const context = {
  Veritas: {
      Data: { getSpreadsheet: () => ({ getSheetByName: () => ({}) }) },
      Config: { SHEET_NAMES: {}, SHEET_HEADERS: {} },
      Utils: { withLock: (cb) => cb() },
      Logging: { info:()=>{}, warn:()=>{}, error:()=>{} },
      QuestionBankService: {},
      ExamService: {},
      ExamProctoringService: {},
      ExamResponseService: {}
  },
  Logger: { log: () => {}, error: () => {} },
  SpreadsheetApp: {},
  PropertiesService: {},
  CacheService: {},
  Session: {},
  Utilities: { newBlob: () => {}, base64Decode: () => {}, getUuid: () => 'uuid' },
  ContentService: {},
  HtmlService: {},
  DriveApp: {},
  ScriptApp: { getService: () => ({ getUrl: () => '' }) }
};

// Also mock global functions if defined directly
context.getBankQuestions = () => {};
context.saveBankQuestion = () => {};
context.deleteBankQuestion = () => {};
context.createExam = () => {};
context.getExams = () => {};
context.setExamStatus = () => {};
context.getExamQuestions = () => {};
context.reportExamStart = () => {};
context.reportExamViolation = () => {};
context.submitExamAnswers = () => {};
context.unlockExamStudent = () => {};
context.reportManualExamLock = () => {};
context.getScriptUrl = () => {};


files.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  try {
    const script = new vm.Script(code);
    script.runInNewContext(context);
    console.log('✅ Syntax OK: ' + file);
  } catch (e) {
    console.error('❌ Syntax Error in ' + file + ':', e.message);
    process.exit(1);
  }
});
