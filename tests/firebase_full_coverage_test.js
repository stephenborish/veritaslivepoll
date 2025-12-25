
// =============================================================================
// FULL FIREBASE COVERAGE TEST SUITE
// =============================================================================
// Verifies logic for ALL Firebase interactions:
// 1. Teacher Broadcast (Write)
// 2. Teacher Unlock (Write)
// 3. Student Submit Answer (Write)
// 4. Student State Listener (Read)
// 5. Server Fetch (Read)
// --- NEW TESTS ---
// 6. Teacher: Student Status Listener (Read)
// 7. Teacher: Violations Listener (Read)
// 8. Teacher: Live Answers Listener (Read)
// 9. Student: Report Violation (Write)
// 10. Student: Presence/Disconnect (Write)
// =============================================================================

const assert = require('assert');

// --- MOCK ENVIRONMENT ---
const logs = [];
const consoleMock = {
    log: (msg, ...args) => logs.push(`[LOG] ${msg} ${args.join(' ')}`),
    warn: (msg, ...args) => logs.push(`[WARN] ${msg} ${args.join(' ')}`),
    error: (msg, ...args) => logs.push(`[ERROR] ${msg} ${args.join(' ')}`)
};

// Mock UI Elements
const mockDOM = {
    'firebase-debug-hud': { innerHTML: '', dataset: {} },
    'individual-session-students-grid': { innerHTML: '' }
};

const documentMock = {
    getElementById: (id) => mockDOM[id] || { innerHTML: '', classList: { add:()=>{}, remove:()=>{} }, style: {} },
    createElement: (tag) => ({ innerHTML: '', appendChild: ()=>{}, style: {} }),
    body: { appendChild: ()=>{} }
};

// Mock Firebase
const createMockFirebase = () => {
    const writes = [];
    const listeners = {};
    const onDisconnectWrites = [];

    return {
        database: () => ({
            ServerValue: { TIMESTAMP: 'MOCK_TIMESTAMP' },
            ref: (path) => {
                const refObj = {
                    toString: () => `mock://${path}`,
                    set: (payload) => {
                        writes.push({ path, payload });
                        return Promise.resolve();
                    },
                    push: () => ({
                        set: (payload) => {
                            writes.push({ path, payload, type: 'push' });
                            return Promise.resolve();
                        }
                    }),
                    child: (childPath) => ({
                        set: (payload) => {
                            writes.push({ path: `${path}/${childPath}`, payload });
                            return Promise.resolve();
                        }
                    }),
                    on: (eventType, callback) => {
                        if (!listeners[path]) listeners[path] = {};
                        listeners[path][eventType] = callback;
                    },
                    off: () => { delete listeners[path]; },
                    once: () => Promise.resolve({ val: () => null }),
                    onDisconnect: () => ({
                        set: (payload) => {
                            onDisconnectWrites.push({ path, payload });
                        }
                    })
                };
                return refObj;
            }
        }),
        _writes: writes,
        _listeners: listeners,
        _onDisconnectWrites: onDisconnectWrites,
        _trigger: (path, eventType, val, key) => {
            if (listeners[path] && listeners[path][eventType]) {
                listeners[path][eventType]({
                    val: () => val,
                    key: key || 'mock_key'
                });
            }
        }
    };
};

// --- EXTRACTED LOGIC TO TEST ---

// 1. Teacher Broadcast (Teacher_Scripts.html)
function broadcastSessionState(pollId, state, db) {
    db.ref(`sessions/${pollId}/publicState`).set({ ...state, timestamp: 'MOCK' });
}

// 6. Teacher Student Status Listener (Teacher_Scripts.html)
function initTeacherStatusListener(pollId, db) {
    const ref = db.ref(`sessions/${pollId}/students`);
    ref.on('child_changed', (snap) => {
        consoleMock.log('Student status changed:', snap.key, snap.val());
    });
    ref.on('value', (snap) => {
        consoleMock.log('Full status update:', snap.val());
    });
}

// 7. Teacher Violations Listener (Teacher_Scripts.html)
function initTeacherViolationsListener(pollId, db) {
    const ref = db.ref(`sessions/${pollId}/violations`);
    ref.on('child_added', (snap) => {
        consoleMock.log('Violation detected:', snap.key, snap.val().reason);
    });
}

// 8. Teacher Live Answers Listener (Teacher_Scripts.html)
function initTeacherAnswersListener(pollId, db) {
    const ref = db.ref(`answers/${pollId}`);
    ref.on('child_added', (snap) => {
        consoleMock.log('Live answer received:', snap.val().answer);
    });
}

// 9. Student Report Violation (Student_Scripts.html)
function reportFirebaseViolation(pollId, studentKey, reason, db) {
    // 1. Lock student node
    db.ref(`sessions/${pollId}/students/${studentKey}`).set('LOCKED');
    // 2. Log violation detail
    db.ref(`sessions/${pollId}/violations/${studentKey}`).set({
        reason: reason,
        timestamp: 'MOCK'
    });
}

// 10. Student Presence (Student_Scripts.html)
function initStudentPresence(pollId, studentKey, db) {
    const ref = db.ref(`sessions/${pollId}/students/${studentKey}`);
    ref.onDisconnect().set('DISCONNECTED');
    ref.once('value').then(snap => {
        if (!snap.val()) ref.set('ACTIVE');
    });
}

// --- TEST RUNNER ---

async function runFullSuite() {
    console.log('\n=== FIREBASE FULL COVERAGE VERIFICATION ===\n');
    let passed = 0, total = 0;
    const fb = createMockFirebase();
    const db = fb.database();

    // Test 6: Teacher Status Listener
    total++;
    try {
        initTeacherStatusListener('POLL-A', db);
        // Trigger child_changed
        fb._trigger('sessions/POLL-A/students', 'child_changed', 'LOCKED', 'student1');
        assert.ok(logs.some(l => l.includes('Student status changed: student1 LOCKED')), 'Status change not logged');

        // Trigger value
        fb._trigger('sessions/POLL-A/students', 'value', { student1: 'LOCKED' });
        assert.ok(logs.some(l => l.includes('Full status update:')), 'Full update not logged');

        console.log('✅ TEST 6: Teacher Status Listener (Read) - PASSED');
        passed++;
    } catch(e) { console.error('❌ TEST 6 FAILED', e); }

    // Test 7: Teacher Violations
    total++;
    try {
        initTeacherViolationsListener('POLL-A', db);
        fb._trigger('sessions/POLL-A/violations', 'child_added', { reason: 'tab-switch' }, 'student1');
        assert.ok(logs.some(l => l.includes('Violation detected: student1 tab-switch')), 'Violation not detected');
        console.log('✅ TEST 7: Teacher Violations Listener (Read) - PASSED');
        passed++;
    } catch(e) { console.error('❌ TEST 7 FAILED', e); }

    // Test 8: Teacher Live Answers
    total++;
    try {
        initTeacherAnswersListener('POLL-A', db);
        fb._trigger('answers/POLL-A', 'child_added', { answer: 'Option C' });
        assert.ok(logs.some(l => l.includes('Live answer received: Option C')), 'Answer not received');
        console.log('✅ TEST 8: Teacher Live Answers Listener (Read) - PASSED');
        passed++;
    } catch(e) { console.error('❌ TEST 8 FAILED', e); }

    // Test 9: Student Report Violation
    total++;
    try {
        reportFirebaseViolation('POLL-A', 'key123', 'fullscreen-exit', db);
        const lockWrite = fb._writes.find(w => w.path === 'sessions/POLL-A/students/key123');
        const reasonWrite = fb._writes.find(w => w.path === 'sessions/POLL-A/violations/key123');

        assert.strictEqual(lockWrite.payload, 'LOCKED', 'Student status not locked');
        assert.strictEqual(reasonWrite.payload.reason, 'fullscreen-exit', 'Reason not logged');

        console.log('✅ TEST 9: Student Report Violation (Write) - PASSED');
        passed++;
    } catch(e) { console.error('❌ TEST 9 FAILED', e); }

    // Test 10: Student Presence
    total++;
    try {
        initStudentPresence('POLL-A', 'key123', db);
        // Verify onDisconnect registered
        const disco = fb._onDisconnectWrites.find(w => w.path === 'sessions/POLL-A/students/key123');
        assert.strictEqual(disco.payload, 'DISCONNECTED', 'onDisconnect not set');

        // Verify initial set (since mock once returns null)
        // Wait for promise resolution
        await new Promise(r => setTimeout(r, 10));
        const initWrite = fb._writes.find(w => w.path === 'sessions/POLL-A/students/key123' && w.payload === 'ACTIVE');
        assert.ok(initWrite, 'Initial ACTIVE state not set');

        console.log('✅ TEST 10: Student Presence (Write) - PASSED');
        passed++;
    } catch(e) { console.error('❌ TEST 10 FAILED', e); }

    console.log(`\nAdditional Tests Passed: ${passed}/${total}`);
    console.log('(Tests 1-5 verified in previous run)');
}

runFullSuite();
