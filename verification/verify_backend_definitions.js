
const fs = require('fs');
const vm = require('vm');

// Mock GAS environment
const context = {
  Veritas: {},
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({})
  },
  PropertiesService: {
    getScriptProperties: () => ({})
  },
  CacheService: {
    getScriptCache: () => ({})
  },
  Utilities: {
    getUuid: () => 'mock-uuid'
  },
  Logger: {
    log: console.log,
    warn: console.warn,
    error: console.error
  },
  console: console
};

vm.createContext(context);

// Load files in order
const files = [
  'src/Core_Config.gs',
  'src/Core_Utils.gs',
  'src/Data_Access.gs'
];

files.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context);
});

// Verify definitions
if (typeof context.Veritas.Data.ensureSheet === 'function') {
  console.log('SUCCESS: Veritas.Data.ensureSheet is defined.');
} else {
  console.error('FAILURE: Veritas.Data.ensureSheet is NOT defined.');
  process.exit(1);
}

if (typeof context.Veritas.Data.ensureHeaders === 'function') {
  console.log('SUCCESS: Veritas.Data.ensureHeaders is defined.');
} else {
  console.error('FAILURE: Veritas.Data.ensureHeaders is NOT defined.');
  process.exit(1);
}
