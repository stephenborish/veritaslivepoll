# Live Poll Issues and Fixes Documentation

## Overview

This document describes critical issues identified in the Veritas Live Poll student experience and the fixes implemented to resolve them. These fixes must be maintained to ensure proper functionality.

---

## Issue 1: Question Text Missing on Student View (COMPREHENSIVE FIX - 2026-01-19)

### Problem Description
When a teacher performed various actions during a live poll session (resume, pause, reveal results, etc.), students would see "[Question Text Missing]" instead of the actual question content. The console showed errors:
```
[renderQuestion] No question text and no options. Full data: {
  "questionText": "",
  "questionIndex": 0,
  "status": "OPEN",
  "options": [],
  ...
}
```

This issue was widespread and affected **multiple teacher functions**, not just session start.

### Root Cause Analysis
Multiple teacher functions were calling the `setLiveSessionState` Cloud Function **without including complete question data** in the payload. The affected functions were:

1. **onResumePoll()** - Line ~6329 in teacher.js
2. **onStopPoll()** - Line ~6363 in teacher.js
3. **onEndQuestionAndShowAnswer()** - Line ~6419 in teacher.js
4. **onRevealResults()** - Line ~6742 in teacher.js
5. **onHideResults()** - Line ~6791 in teacher.js
6. **onResetLiveQuestion()** - Line ~6666 in teacher.js
7. **onPresentQuestion()** - Line ~17262 in teacher.js
8. **onStartIndividualTimed()** - Line ~13716 in teacher.js

Each of these functions was sending incomplete payloads like:
```javascript
// BEFORE (broken)
setLiveSessionState({
  pollId: pollId,
  status: 'PAUSED',
  questionIndex: qIndex
  // Missing: questionText, options, correctAnswer, questionImageURL, totalQuestions
});
```

The Cloud Function would then broadcast these incomplete payloads to students, causing them to see empty question text and options.

Additionally, the Cloud Function itself wasn't properly handling optional fields like `questionImageURL`, `totalQuestions`, and `calculatorEnabled`.

### Comprehensive Fix Applied

#### 1. Cloud Function Update
**File:** `functions/index.js` - Lines 32-77

Added support for optional fields and proper payload construction:

```javascript
// Extract all needed parameters
const {
  pollId, status, questionIndex, questionText, options, correctAnswer, metadata,
  questionImageURL, totalQuestions, calculatorEnabled,
} = request.data;

const payload = {
  pollId: pollId,
  questionIndex: questionIndex !== undefined ? questionIndex : (status === "PRE_LIVE" ? -1 : 0),
  status: status || "OPEN",
  timestamp: admin.database.ServerValue.TIMESTAMP,
  questionText: questionText || "",
  options: options || [],
  serverProcessed: true,
  metadata: {
    ...existingMetadata,
    ...metadata,
  },
};

// Include optional fields if provided
if (questionImageURL !== undefined) {
  payload.questionImageURL = questionImageURL;
}
if (totalQuestions !== undefined) {
  payload.totalQuestions = totalQuestions;
}
if (calculatorEnabled !== undefined) {
  payload.calculatorEnabled = calculatorEnabled;
}
```

#### 2. Teacher Function Updates
**File:** `src/js/teacher.js`

All affected functions were updated to fetch current question data and include complete payloads:

**Standard Pattern Applied:**
```javascript
// Fetch current question definition to include in broadcast
var qDef = (CURRENT_POLL_DATA.questions && CURRENT_POLL_DATA.questions[qIndex])
  ? CURRENT_POLL_DATA.questions[qIndex]
  : null;

setLiveSessionState({
  pollId: pollId,
  status: 'OPEN',
  questionIndex: qIndex,
  questionText: qDef ? qDef.questionText : '',
  options: qDef ? qDef.options : [],
  correctAnswer: qDef ? qDef.correctAnswer : null,
  questionImageURL: qDef ? (qDef.questionImageURL || qDef.imageURL || qDef.mediaUrl || '') : '',
  totalQuestions: (CURRENT_POLL_DATA.questions && CURRENT_POLL_DATA.questions.length)
    ? CURRENT_POLL_DATA.questions.length
    : 0,
  metadata: { /* function-specific metadata */ }
});
```

**Functions Fixed:**
- ✅ onResumePoll() - Lines 6326-6338
- ✅ onStopPoll() - Lines 6362-6374
- ✅ onEndQuestionAndShowAnswer() - Lines 6420-6431
- ✅ onNextQuestion() - Lines 6562-6575 (enhanced with images)
- ✅ onPreviousQuestion() - Lines 6470-6479 (enhanced with images)
- ✅ onRevealResults() - Lines 6751-6763
- ✅ onHideResults() - Lines 6788-6800
- ✅ onResetLiveQuestion() - Lines 6663-6676
- ✅ onPresentQuestion() - Lines 17262-17271
- ✅ onStartIndividualTimed() - Lines 13713-13723

### Data Fields Now Consistently Broadcast

Every `setLiveSessionState` call now includes:
1. **questionText** - The question content (with fallbacks to stemHtml, text fields)
2. **options** - Array of answer choices with text and images
3. **correctAnswer** - Answer key (stored securely server-side)
4. **questionImageURL** - Question image if present (with fallbacks to imageURL, mediaUrl)
5. **totalQuestions** - Total number of questions in the poll
6. **calculatorEnabled** - Whether calculator is enabled (when applicable)

### Must Remain Fixed - Prevention Measures

#### Critical Rules for Future Development:

1. **ALL calls to `setLiveSessionState` MUST include complete question data:**
   - questionText
   - options
   - correctAnswer (for secure storage)
   - questionImageURL (if available)
   - totalQuestions

2. **Standard Pattern for Question Data Extraction:**
   ```javascript
   var qDef = (CURRENT_POLL_DATA.questions && CURRENT_POLL_DATA.questions[qIndex])
     ? CURRENT_POLL_DATA.questions[qIndex]
     : null;
   ```

3. **Standard Pattern for Image URL with Fallbacks:**
   ```javascript
   questionImageURL: qDef
     ? (qDef.questionImageURL || qDef.imageURL || qDef.mediaUrl || '')
     : ''
   ```

4. **When adding new teacher functions that modify session state:**
   - Copy the complete payload structure from `onNextQuestion`
   - Never omit question data fields
   - Test with students to verify question display

5. **Cloud Function Contract:**
   - The `setLiveSessionState` function expects these fields
   - Optional fields should be conditionally added to payload
   - Empty strings/arrays are acceptable fallbacks, not `undefined`

### Testing Checklist

After any modifications to `setLiveSessionState` calls, verify:

- [ ] Start a live poll - students see question text and options
- [ ] Click "Pause" - students still see question text and options
- [ ] Click "Resume" - students see question text and options
- [ ] Click "Next Question" - students see new question text and options
- [ ] Click "Previous Question" - students see previous question text and options
- [ ] Click "Show Answer" - students see question text, options, AND correct answer highlighted
- [ ] Click "Hide Answer" - students see question text and options (answer hidden)
- [ ] Click "Reset Question" - students see question text and options refreshed
- [ ] Start secure assessment - students see first question text and options
- [ ] Present question from preview mode - students see question text and options

All scenarios should show complete question data, not "[Question Text Missing]".

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

### Original Fixes (Issues 2-4)
Commit: `ff652f4`
Branch: `claude/fix-live-poll-student-lqefz`

### Comprehensive Question Sync Fix (Issue 1 - Updated 2026-01-19)
Branch: `claude/fix-student-poll-display-AYV3J`
- Fixed 10 teacher functions missing question data in broadcasts
- Enhanced Cloud Function to handle optional fields
- Ensures complete question synchronization across all teacher actions
