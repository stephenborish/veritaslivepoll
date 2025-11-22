#!/usr/bin/env node
const assert = require('assert');
const path = require('path');

// Treat .gs files as plain JavaScript so Node can load Apps Script modules
require.extensions['.gs'] = require.extensions['.js'];
const pure = require(path.join(__dirname, '..', 'src', 'Shared_Logic.gs'));

function testEscapeHtml() {
  assert.strictEqual(pure.escapeHtml('<script>'), '&lt;script&gt;');
  assert.strictEqual(pure.escapeHtml('"test"'), '&quot;test&quot;');
  assert.strictEqual(pure.escapeHtml(null), '');
}

function testBuildQueryString() {
  assert.strictEqual(pure.buildQueryString({}), '');
  assert.strictEqual(pure.buildQueryString({ a: 1, b: 'two' }), '?a=1&b=two');
  assert.strictEqual(pure.buildQueryString({ a: null, b: undefined }), '');
}

function testNameExtraction() {
  const parts = pure.extractStudentNameParts('Ada Lovelace');
  assert.strictEqual(parts.displayName, 'Ada L.');
  assert.strictEqual(parts.firstName, 'Ada');
  assert.strictEqual(parts.lastName, 'Lovelace');
  assert.strictEqual(pure.formatStudentName('Ada'), 'Ada');
}

function testBooleanCoercion() {
  assert.strictEqual(pure.coerceBoolean('yes'), true);
  assert.strictEqual(pure.coerceBoolean('0'), false);
  assert.strictEqual(pure.normalizeSheetBoolean('', true), true);
}

function testParseDateInput() {
  const parsed = pure.parseDateInput('2025-01-15T12:00:00Z');
  assert(parsed instanceof Date);
  assert.strictEqual(pure.parseDateInput('not-a-date'), null);
}

function run() {
  testEscapeHtml();
  testBuildQueryString();
  testNameExtraction();
  testBooleanCoercion();
  testParseDateInput();
  console.log('All pure utility tests passed.');
}

run();
