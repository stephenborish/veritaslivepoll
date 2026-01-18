# Live Poll Issues and Fixes Documentation

## Overview

This document describes critical issues identified in the Veritas Live Poll student experience and the fixes implemented to resolve them. These fixes must be maintained to ensure proper functionality.

---

## Issue 1: Question Text Missing on Student View

### Problem Description
When a teacher started a live poll session, students would see "[Question Text Missing]" instead of the actual question content. The console showed errors:
```
[renderQuestion] No question text and no options. Full data: {
  "questionText": "",
  "options": [],
  ...
}
```

### Root Cause
The `onStartPoll` function in `Teacher_Scripts.html` was calling the `setLiveSessionState` Cloud Function **without including `questionText` and `options`** in the payload:

```javascript
// BEFORE (broken)
ctx.callable({
  pollId: pollId,
  status: 'OPEN',
  questionIndex: 0,
  metadata: {
    sessionPhase: 'LIVE',
    resultsVisibility: 'HIDDEN'
  }
});
```

The Cloud Function would then store empty strings for question content, which students received via Firebase real-time listeners.

### Fix Applied
**File:** `src/Teacher_Scripts.html` - Lines ~6207-6231

Added extraction of first question data and included it in the payload:

```javascript
// AFTER (fixed)
var firstQuestion = (CURRENT_POLL_DATA.questions && CURRENT_POLL_DATA.questions[0]) ? CURRENT_POLL_DATA.questions[0] : null;
var questionText = firstQuestion ? (firstQuestion.questionText || firstQuestion.stemHtml || firstQuestion.text || '') : '';
var questionOptions = firstQuestion ? (firstQuestion.options || []) : [];
var correctAnswer = firstQuestion ? (firstQuestion.correctAnswer !== undefined ? firstQuestion.correctAnswer : null) : null;
var questionImageURL = firstQuestion ? (firstQuestion.questionImageURL || firstQuestion.imageURL || firstQuestion.mediaUrl || '') : '';
var totalQuestions = (CURRENT_POLL_DATA.questions && CURRENT_POLL_DATA.questions.length) ? CURRENT_POLL_DATA.questions.length : 0;

ctx.callable({
  pollId: pollId,
  status: 'OPEN',
  questionIndex: 0,
  questionText: questionText,
  options: questionOptions,
  correctAnswer: correctAnswer,
  questionImageURL: questionImageURL,
  totalQuestions: totalQuestions,
  metadata: {
    sessionPhase: 'LIVE',
    resultsVisibility: 'HIDDEN'
  }
});
```

### Must Remain Fixed
- All calls to `setLiveSessionState` when starting a new session MUST include `questionText` and `options`
- This applies to both live poll mode AND secure assessment mode
- The `onNextQuestion` and `onPreviousQuestion` functions already included this data (used as reference)

---

## Issue 2: Student Auto-Entry Without Fullscreen Enforcement

### Problem Description
Students were automatically shown the question content without being required to:
1. Click the "Begin Poll" button
2. Enter fullscreen mode

This bypassed the proctoring safeguards and allowed students to access content without proper session initialization.

### Root Cause
When Firebase real-time listeners received poll state updates, the `updateStudentView` function would immediately render the question content, hiding the entry screen without user interaction. The flow was:

1. Student page loads
2. Firebase listener fires with poll state
3. `liveSessionCallback` calls `updateStudentView`
4. Entry screen is hidden, question container is shown
5. Student never clicks "Begin Poll" or enters fullscreen

### Fix Applied
**File:** `src/Student_Scripts.html` - Lines ~2524-2526 and ~4067-4081

1. Added a session gate variable:
```javascript
// --- ENTRY GATE: Prevent auto-bypass of entry screen ---
// Student must explicitly click "Begin Poll" to enter the session
var studentSessionStarted = false;
```

2. Set the gate when user clicks "Begin Poll":
```javascript
startSessionBtn.onclick = function () {
    // FIX: Mark session as started - this gate prevents auto-bypass of entry screen
    studentSessionStarted = true;
    // ... rest of handler
};
```

3. Added gate check in live poll rendering:
```javascript
// FIX: ENTRY GATE - Require student to click "Begin Poll" before showing content
if (!studentSessionStarted) {
    console.log('[ViewManager] Blocking Live Poll render - student has not clicked Begin Poll');
    if (entryScreen) {
        entryScreen.style.display = 'block';
        entryScreen.classList.remove('hidden');
    }
    ViewManager.show('entry-screen');
    return; // Stop here until student clicks Begin Poll
}
```

### Must Remain Fixed
- The `studentSessionStarted` variable must be checked before rendering live poll content
- Only the "Begin Poll" button click should set this flag to `true`
- Firebase real-time updates must NOT bypass this gate

---

## Issue 3: Student Status Not Reflected on Teacher Dashboard

### Problem Description
When students joined a live poll session, their status (INVITED, ACTIVE, SUBMITTED, LOCKED) was not displayed on the teacher dashboard. Student tiles showed "INVITED" with "ANSWER: ---" even when students were actively participating.

### Root Cause
The `currentStudentStatusData` array, which stores student status for UI rendering, was only populated from legacy server polling which had been deprecated. When starting a live poll:

1. `currentStudentStatusData` was empty
2. Firebase real-time updates modified `realtimeStatuses` but had nothing to merge into
3. `renderStudentStatus()` rendered an empty grid

The existing roster fetch from Firebase used an incorrect path and had no fallback mechanisms.

### Fix Applied
**File:** `src/Teacher_Scripts.html` - Lines ~16648-16745

Improved roster loading with multiple fallback sources:

```javascript
// FIX: If no students loaded yet, try multiple sources for roster data
var studentsToUse = currentStudentStatusData;
if (!studentsToUse || studentsToUse.length === 0) {
    var className = CURRENT_POLL_DATA ? CURRENT_POLL_DATA.className : null;

    // First try: Check in-memory rosterData (most reliable)
    if (className && rosterData && rosterData[className] && rosterData[className].length > 0) {
        // Load from memory
        currentStudentStatusData = rosterData[className].map(/* transform */);
        finishLightweightUpdate(data, questionDef, qIndex, currentStudentStatusData);
        return;
    }

    // Second try: Check poll definition for roster
    if (CURRENT_POLL_DATA && CURRENT_POLL_DATA.roster && CURRENT_POLL_DATA.roster.length > 0) {
        // Load from poll definition
        currentStudentStatusData = CURRENT_POLL_DATA.roster.map(/* transform */);
        finishLightweightUpdate(data, questionDef, qIndex, currentStudentStatusData);
        return;
    }

    // Third try: Fetch from Firebase if className is available
    if (className) {
        firebase.database().ref('rosters/rosters/' + className).once('value')
            .then(/* load and transform */);
        return;
    }
}
```

### Must Remain Fixed
- Student roster data must be loaded before rendering the dashboard
- Multiple fallback sources should be maintained (memory, poll definition, Firebase)
- The `updateRealtimeUI()` function depends on `currentStudentStatusData` being populated

---

## Issue 4: Student Tile Actions Not Working

### Problem Description
When a teacher hovered over a student tile and clicked action buttons (UNLOCK, RESET), nothing happened. The sidebar panel did not open and the functions did not execute.

### Root Cause
The button creation functions (`createUnlockButton`, `createResetButton`, `createBlockButton`, `createUnblockButton`) created buttons with CSS classes and data attributes but **no click event handlers**:

```javascript
// BEFORE (broken)
function createUnlockButton(student) {
    var button = document.createElement('button');
    button.className = '...';
    button.dataset.email = student.email || '';
    // ... append child elements
    return button; // No click handler!
}
```

### Fix Applied
**File:** `src/Teacher_Scripts.html` - Lines ~8400-8481

Added click event handlers to all button creation functions:

```javascript
// AFTER (fixed)
function createUnlockButton(student) {
    var button = document.createElement('button');
    // ... existing setup code

    // FIX: Add click handler for unlock button
    button.addEventListener('click', function (e) {
        e.stopPropagation(); // Prevent card click from opening inspector
        if (student.email) {
            proctorAction('UNLOCK', student.email);
        }
    });

    return button;
}
```

Applied the same pattern to:
- `createResetButton` - calls `proctorAction('RESET', email)`
- `createBlockButton` - calls `proctorAction('BLOCK', email)`
- `createUnblockButton` - calls `proctorAction('UNBLOCK', email)`

### Must Remain Fixed
- All action buttons must have click handlers that call `proctorAction()`
- `e.stopPropagation()` is required to prevent the card click from also firing
- The `proctorAction` function is exposed to window scope and must remain accessible

---

## Testing Checklist

After any modifications to the affected code, verify:

### Question Display
- [ ] Start a live poll and confirm students see the question text
- [ ] Confirm answer options are displayed correctly
- [ ] Confirm question images (if any) are displayed

### Entry Gate
- [ ] Load student page and confirm entry screen is shown
- [ ] Confirm question content is NOT visible before clicking "Begin Poll"
- [ ] Click "Begin Poll" and confirm fullscreen is requested
- [ ] Confirm question content appears after clicking "Begin Poll"

### Student Status
- [ ] Start a live poll with multiple students in the roster
- [ ] Confirm student tiles appear on teacher dashboard
- [ ] Have a student answer a question
- [ ] Confirm student tile updates to show "ANSWERED" status
- [ ] Confirm answer text appears on the tile

### Action Buttons
- [ ] Hover over a submitted student's tile
- [ ] Confirm action overlay appears with buttons
- [ ] Click "RESET" button and confirm it triggers the reset action
- [ ] For a locked student, click "UNLOCK" and confirm it works

---

## Related Files

| File | Purpose |
|------|---------|
| `src/Teacher_Scripts.html` | Teacher dashboard logic, session management, student tile rendering |
| `src/Student_Scripts.html` | Student view logic, entry gate, question rendering |
| `functions/index.js` | Cloud Functions (setLiveSessionState, onAnswerSubmitted) |
| `src/Teacher_Body.html` | Teacher UI structure (student-inspector-panel, student-status-grid) |
| `src/Student_Body.html` | Student UI structure (entry-screen, question-container) |

---

## Commit Reference

All fixes were implemented in commit: `ff652f4`
Branch: `claude/fix-live-poll-student-lqefz`
