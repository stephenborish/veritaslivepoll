const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure public dir exists
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Helper to read file content
function readFile(filename) {
    // Try .html, then .gs (rare for views but possible), then raw
    let candidates = [filename];
    if (!filename.includes('.')) {
        candidates = [filename + '.html', filename + '.gs', filename + '.js', filename + '.css'];
    }

    for (const c of candidates) {
        const p = path.join(SRC_DIR, c);
        if (fs.existsSync(p)) {
            return fs.readFileSync(p, 'utf8');
        }
    }
    console.warn(`Warning: Could not find include file: ${filename}`);
    return '';
}

// Recursive function to process includes
function processContent(content) {
    // Regex for <?!= include('Filename'); ?> or <?!= include('Filename') ?>
    const includeRegex = /<\?!=\s*include\(['"](.+?)['"]\);?\s*\?>/g;

    return content.replace(includeRegex, (match, filename) => {
        console.log(`  Including: ${filename}`);
        const includedContent = readFile(filename);
        return processContent(includedContent); // Recursive resolution
    });
}

// Helper to replace template variables (simulating GAS evaluation)
function processTemplateVars(content, context = {}) {
    // Replace JSON.stringify(firebaseConfig)
    content = content.replace(/<\?!=\s*JSON\.stringify\(firebaseConfig\)\s*\?>/g, JSON.stringify(context.firebaseConfig || null));

    // Replace JSON.stringify(firebaseConfig || {})
    content = content.replace(/<\?!=\s*JSON\.stringify\(firebaseConfig\s*\|\|\s*\{\}\)\s*\?>/g, JSON.stringify(context.firebaseConfig || {}));

    // Replace basic <?= var ?> for specific known vars
    content = content.replace(/<\?=\s*Session\.getActiveUser\(\)\.getEmail\(\)\s*\?>/g, "teacher@demo.com"); // Stub
    content = content.replace(/<\?=\s*examConfig\.examName\s*\?>/g, "Demo Exam"); // Stub if caught in template

    return content;
}

// Main Build Function
function buildPage(entryFile, outputFile) {
    console.log(`Building ${entryFile} -> ${outputFile}...`);
    let content = readFile(entryFile);
    content = processContent(content);

    // Inject Default Config
    const firebaseConfig = {
        apiKey: "AIzaSyAv0bCe5KIuQx_sou8toBy5DG2PYaB_pBM",
        authDomain: "classroomproctor.firebaseapp.com",
        databaseURL: "https://classroomproctor-default-rtdb.firebaseio.com",
        projectId: "classroomproctor",
        storageBucket: "classroomproctor.firebasestorage.app",
        messagingSenderId: "600627073908",
        appId: "1:600627073908:web:935970f5849b28f6ad5221"
    };

    content = processTemplateVars(content, { firebaseConfig });

    fs.writeFileSync(path.join(PUBLIC_DIR, outputFile), content);
    console.log(`Finished ${outputFile}`);
}

// Build steps
buildPage('Teacher_View.html', 'index.html'); // Main Teacher Dashboard
buildPage('Student_View.html', 'student.html');
buildPage('ExamManagerView.html', 'exam_manager.html');
buildPage('ExamTeacherView.html', 'exam_teacher.html');
buildPage('ExamStudentView.html', 'exam_student.html');
// buildPage('QuestionBankView.html', 'question_bank.html'); // Optional if needed

console.log("Build complete.");
