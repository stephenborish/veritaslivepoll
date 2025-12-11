const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  'src/Veritas_QuestionBank.gs',
  'src/Veritas_Exams.gs',
  'src/Veritas_Exam_Proctoring.gs',
  'src/Veritas_Exam_Responses.gs',
  'src/Veritas_Exam_Analytics.gs',
  'src/API_Exposed_Exams.gs',
  'src/Main_Routing.gs'
];

// Mock basic GAS globals
const context = {
  Veritas: {
      Data: {
          getSpreadsheet: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [] }), getLastRow: () => 0, getRange: () => ({ setValue:()=>{}, setValues:()=>{} }), appendRow:()=>{} }) }),
          ensureSheet: () => ({ getRange: () => ({ setValues: () => {} }) }),
          ensureHeaders: () => {},
          Rosters: { getByClass: () => [] }
      },
      Config: { SHEET_NAMES: {}, SHEET_HEADERS: { EXAM_RESPONSES: [], EXAM_ANALYTICS: [], EXAM_STATUS: [], EXAM_RESPONSES: [] } },
      Utils: { withLock: (cb) => cb() },
      Logging: { info:()=>{}, warn:()=>{}, error:()=>{} },
      QuestionBankService: {},
      ExamService: { getExamConfig: () => ({ proctorMode: 'hard' }) },
      ExamProctoringService: { isStudentLocked: () => false },
      ExamResponseService: {},
      ExamAnalyticsService: {},
      Routing: {} // Define Routing for Main_Routing.gs
  },
  Logger: { log: () => {}, error: () => {} },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  CacheService: {},
  Session: { getActiveUser: () => ({ getEmail: () => '' }) },
  Utilities: { newBlob: () => {}, base64Decode: () => {}, getUuid: () => 'uuid' },
  ContentService: {},
  HtmlService: { createHtmlOutput: () => ({ setTitle: () => ({}) }), createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ setXFrameOptionsMode: () => ({ addMetaTag: () => ({}) }) }) }) }) },
  DriveApp: {},
  ScriptApp: { getService: () => ({ getUrl: () => '' }) },
  TokenManager: { generateToken: () => 'token', validateToken: () => ({}) }
};

// Also mock global functions
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
context.claimExamSeat = () => {};

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
