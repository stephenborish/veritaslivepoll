const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILD_SCRIPT = path.join(ROOT, 'tools', 'build.js');
const PUBLIC_DIR = path.join(ROOT, 'public');

function runBuild() {
  console.log('Running build...');
  execFileSync('node', [BUILD_SCRIPT], { stdio: 'inherit' });
}

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected file does not exist: ${path.relative(ROOT, filePath)}`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Expected a file but found something else at: ${path.relative(ROOT, filePath)}`);
  }

  if (stats.size === 0) {
    throw new Error(`File is empty: ${path.relative(ROOT, filePath)}`);
  }
}

function assertNoIncludeDirectives(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const includePattern = /<\?!=\s*include\(['"][^'"]+['"]\);\s*\?>/;
  if (includePattern.test(content)) {
    throw new Error(`Unresolved include directive found in ${path.relative(ROOT, filePath)}`);
  }
}

function main() {
  runBuild();

  const expectedFiles = [
    path.join(PUBLIC_DIR, 'index.html'),
    path.join(PUBLIC_DIR, 'student.html'),
    path.join(PUBLIC_DIR, 'teacher.html'),
    path.join(PUBLIC_DIR, 'teacher', 'index.html'),
    path.join(PUBLIC_DIR, 'teacher', 'question_bank.html'),
    path.join(PUBLIC_DIR, 'teacher', 'exams.html')
  ];

  expectedFiles.forEach(assertFileExists);
  expectedFiles.forEach(assertNoIncludeDirectives);

  console.log('All checks passed.');
}

main();
