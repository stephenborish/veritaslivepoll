
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const OUT_DIR = path.join(__dirname, '../public');

// Configuration to inject
// NOTE: using the fallback config found in Core_Config.gs
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAv0bCe5KIuQx_sou8toBy5DG2PYaB_pBM",
    authDomain: "classroomproctor.firebaseapp.com",
    databaseURL: "https://classroomproctor-default-rtdb.firebaseio.com",
    projectId: "classroomproctor",
    storageBucket: "classroomproctor.firebasestorage.app",
    messagingSenderId: "600627073908",
    appId: "1:600627073908:web:935970f5849b28f6ad5221"
};

// Variable Replacements
const REPLACEMENTS = {
    "JSON.stringify(firebaseConfig)": JSON.stringify(FIREBASE_CONFIG),
    "Veritas.Config.DEBUG_FIREBASE ? 'true' : 'false'": "false", // Default to false for prod
    // Student view dynamic vars - defaulting to placeholders that client-side Code MUST handle
    "'<?= sessionToken ?>'": "sessionStorage.getItem('veritas_session_token') || ''",
    "'<?= studentEmail ?>'": "sessionStorage.getItem('veritas_student_email') || ''"
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function resolveInclude(content) {
    // Regex to match <?!= include('FileName'); ?>
    // Handling slight variations in spacing ??!=\s*include\(['"](.+?)['"]\);?\s*\?>
    return content.replace(/<\?!=\s*include\(['"](.+?)['"]\);?\s*\?>/g, (match, filename) => {
        const filePath = path.join(SRC_DIR, filename + '.html');
        if (fs.existsSync(filePath)) {
            console.log(`  Included: ${filename}`);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            // Recursively resolve includes in the included file
            return resolveInclude(fileContent);
        } else {
            console.warn(`  WARNING: Include not found: ${filename}`);
            return `<!-- MISSING INCLUDE: ${filename} -->`;
        }
    });
}

function processReplacements(content) {
    let processed = content;

    // Handle literal replacements
    for (const [key, value] of Object.entries(REPLACEMENTS)) {
        // Escape special regex chars if necessary, but here likely simple string replacement is safer or split/join
        // Since key is code pattern, we use split/join for safety
        processed = processed.split('<?!= ' + key + ' ?>').join(value);
        processed = processed.split('<?= ' + key + ' ?>').join(value); // Standard tags

        // Also handle the specific patterns seen in files manually
        if (key.includes('sessionToken')) {
            processed = processed.replace(/'<\?= sessionToken \?>'/g, value);
        }
        if (key.includes('studentEmail')) {
            processed = processed.replace(/'<\?= studentEmail \?>'/g, value);
        }
    }

    // Generic fallback: Replace any remaining <?= ?> or <?!= ?> with safe comments or empty strings to prevent breakage
    // But be careful not to break valid code

    return processed;
}

function buildFile(sourceName, destName) {
    console.log(`Building ${destName} from ${sourceName}...`);
    const srcPath = path.join(SRC_DIR, sourceName);
    const destPath = path.join(OUT_DIR, destName);

    if (!fs.existsSync(srcPath)) {
        console.error(`Source file not found: ${srcPath}`);
        return;
    }

    let content = fs.readFileSync(srcPath, 'utf8');

    // 1. Resolve Includes recursively
    content = resolveInclude(content);

    // 2. Process Replacements
    // Specific config injection logic that regex might miss
    content = content.replace(/<\?!=\s*JSON\.stringify\(firebaseConfig\)\s*\?>/g, JSON.stringify(FIREBASE_CONFIG));
    content = content.replace(/<\?!=\s*Veritas\.Config\.DEBUG_FIREBASE\s*\?\s*'true'\s*:\s*'false'\s*\?>/g, 'false');
    content = processReplacements(content);

    // Write output
    ensureDir(path.dirname(destPath));
    fs.writeFileSync(destPath, content);
    console.log(`✓ Wrote ${destName}`);
}

// Main Build
// Main Build
ensureDir(OUT_DIR);
buildFile('Teacher_View.html', 'index.html'); // Main Landing/Dashboard
buildFile('Student_View.html', 'student.html'); // Student View
buildFile('Teacher_View.html', 'teacher.html'); // Legacy/Direct Access
buildFile('Teacher_View.html', 'teacher/index.html'); // Also support /teacher/ folder style
buildFile('QuestionBankView.html', 'teacher/question_bank.html');
buildFile('ExamManagerView.html', 'teacher/exams.html');
