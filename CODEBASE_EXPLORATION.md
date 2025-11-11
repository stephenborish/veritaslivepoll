# Veritas Live Poll - Sessions & Live Polls Structure Analysis

**Analysis Date**: 2025-11-11
**Codebase**: Google Apps Script (6,080 lines in Code.gs)
**Current Branch**: claude/add-individual-timed-session-011CV2o3z2aG5kubLyrCtMy9

---

## 1. DATABASE SCHEMA FOR SESSIONS AND POLLS

### 1.1 Core Sheet Structure

The system uses Google Sheets as the database with 5 primary sheets:

#### **Classes Sheet** (Teacher Roster Management)
```
ClassName (Primary Key) | Description
```
- Used to organize students into logical groups
- One row per class
- Referenced by Rosters and Polls

#### **Rosters Sheet** (Student Lists)
```
ClassName | StudentName | StudentEmail
```
- Maps students to classes
- Email is used as the unique student identifier
- Used to generate token links and track participation

#### **Polls Sheet** (Question Data - Normalized)
```
PollID | PollName | ClassName | QuestionIndex | QuestionDataJSON | CreatedAt | UpdatedAt
```
- **One row per question** (not per poll - normalized design)
- QuestionDataJSON contains:
  ```json
  {
    "questionText": "string",
    "questionImageFileId": "string (Drive ID)",
    "answers": [
      {
        "text": "string",
        "imageFileId": "string (Drive ID)",
        "isCorrect": boolean
      }
    ],
    "metacognitionEnabled": boolean,
    "timerSeconds": number
  }
  ```
- Multiple rows with same PollID = multi-question poll
- QuestionIndex (0-based) establishes question order

#### **LiveStatus Sheet** (Active Session State - Singleton)
```
ActivePollID | ActiveQuestionIndex | PollStatus
```
- **One row only** (singleton pattern)
- PollStatus: "OPEN", "PAUSED", or "CLOSED"
- Also includes Metadata (JSON in Script Properties):
  ```json
  {
    "sessionPhase": "PRE_LIVE|LIVE|PAUSED|RESULTS_HOLD|RESULTS_REVEALED|ENDED",
    "sessionId": "UUID",
    "startedAt": "ISO8601",
    "endedAt": "ISO8601|null",
    "timer": { "duration": number, "remaining": number },
    "isCollecting": boolean,
    "resultsVisibility": "HIDDEN|VISIBLE",
    "responsesClosedAt": "ISO8601|null",
    "revealedAt": "ISO8601|null"
  }
  ```

#### **Responses Sheet** (Audit Log of All Submissions)
```
ResponseID | Timestamp | PollID | QuestionIndex | StudentEmail | Answer | IsCorrect | ConfidenceLevel
```
- **Append-only log** - never updated after insertion
- ResponseID: Unique UUID prefixed with "R-"
- Answer: Letter (A/B/C/D) or special codes (VIOLATION_LOCKED, etc.)
- ConfidenceLevel: 'guessing', 'somewhat-sure', 'very-sure', 'certain', or null
- IsCorrect: Auto-computed based on poll's correctAnswer
- Used for:
  - Audit trails
  - Post-session analytics
  - Proctoring violation records (marked as VIOLATION_LOCKED)

#### **ProctorState Sheet** (Dynamic - Created on Demand)
```
PollID | StudentEmail | Status | LockVersion | LockReason | LockedAt | UnlockApproved | UnlockApprovedBy | UnlockApprovedAt | SessionId
```
- **Authoritative source for lock state** (not Responses sheet)
- Status: 'OK', 'LOCKED', 'AWAITING_FULLSCREEN', 'BLOCKED'
- LockVersion: Integer, incremented with each new violation
- SessionId: Links to LiveStatus.sessionId to track session-specific locks
- LockReason: 
  - 'exit-fullscreen'
  - 'exit-fullscreen-while-awaiting'
  - 'teacher-block::teacherName::reason'
- Created lazily (first use per session)

### 1.2 Script Properties (Fast, Non-Persistent)

Used for performance-critical or temporary state:

```javascript
{
  "LIVE_POLL_METADATA": JSON,  // Current session metadata
  "STATE_VERSION_HISTORY": JSON, // Version tracking
  "CONNECTION_HEARTBEATS": JSON, // Client health monitoring
  "STUDENT_TOKEN_MAP_KEY": JSON, // Token registry
  "STUDENT_TOKEN_INDEX_KEY": JSON, // Email→Token index
  "TEACHER_EMAILS": "email1@,email2@,...", // Multi-teacher config
  "PROCTOR_SHEET_LOGGING": "true|false" // Debug mode
}
```

### 1.3 Google Drive (Image Hosting)

- Question and answer choice images stored as Drive files
- System maintains dedicated folder (ID: 1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi)
- Only fileId stored in poll data (not URLs)
- Served via image proxy: `https://script.google.com/.../exec?fn=image&id=<fileId>&v=<version>`
- Cache busting: `&v=<pollUpdatedAt>` appended to URLs

---

## 2. HOW SESSIONS ARE CREATED & CONFIGURED BY TEACHERS

### 2.1 Poll Creation Flow

**Location**: `TeacherView.html` → `Code.gs` (function: `createNewPoll()`)

```
Teacher Actions:
1. Click "Create Poll"
2. Enter poll name and select class
3. Add questions with:
   - Question text
   - Optional question image (upload to Drive)
   - Multiple answer choices (with optional images)
   - Mark one answer as correct
   - Optional: Enable metacognition (confidence tracking)
4. Click "Save"

Backend: createNewPoll(pollName, className, questions)
↓
Generates UUID: "P-" + Utilities.getUuid()
↓
writePollRows_() writes N rows (one per question) to Polls sheet
↓
Cache invalidated: CacheManager.invalidate('ALL_POLLS_DATA')
↓
Returns: List of all polls for refresh
```

**Poll Data Structure (per question)**:
```javascript
{
  pollId: "P-abc123...",
  pollName: "Biology Unit Test",
  className: "AP Bio Period 3",
  questionIndex: 0,
  questionText: "What is photosynthesis?",
  questionImageFileId: "1abc2def3ghi...", // null if no image
  answers: [
    { text: "Option A", imageFileId: null, isCorrect: false },
    { text: "Option B", imageFileId: "1xyz9abc...", isCorrect: true },
    { text: "Option C", imageFileId: null, isCorrect: false }
  ],
  correctAnswer: "B",
  metacognitionEnabled: true,  // NEW: 2025
  timerSeconds: 90,  // DEFAULT
  createdAt: "2025-11-11T10:30:00Z",
  updatedAt: "2025-11-11T10:30:00Z"
}
```

### 2.2 Session Launch Flow

**Location**: `TeacherView.html` → `Code.gs` (function: `startPoll()`)

```
Teacher clicks "Start" on a saved poll
↓
google.script.run.startPoll(pollId)
↓
startPoll(pollId):
  1. Fetch poll from Polls sheet
  2. Generate sessionId: pollId + '::' + UUID
  3. DataAccess.liveStatus.set(pollId, 0, "OPEN", metadata):
     - Set ActivePollID = pollId
     - Set ActiveQuestionIndex = 0
     - Set PollStatus = "OPEN"
     - Store metadata with:
       - sessionPhase: 'LIVE'
       - sessionId: generated UUID
       - startedAt: ISO8601 timestamp
       - isCollecting: true
       - resultsVisibility: 'HIDDEN'
  4. ProctorAccess.resetForNewSession(pollId, sessionId):
     - Clear any previous lock states for this poll
  5. StateVersionManager.bump():
     - Increment state version (signals all clients)
  6. Return: getLivePollData(pollId, 0) - full question data
↓
Teacher dashboard shows "Live" header with:
- Poll name
- Start/Stop/Next/Previous buttons
- Question navigation dots
```

### 2.3 Session Configuration Options

#### **Question Timer**
- **Location**: Poll creation dialog, TeacherView live controls
- **Default**: 90 seconds per question
- **Controls during live session**:
  - Set timer countdown
  - Pause timer (stops countdown, question stays open)
  - Resume timer (continues countdown)
  - Skip timer (advance to next question immediately)
- **Auto-pause behavior**: When timer expires, question auto-pauses (responses close)
- **Storage**: Metadata.timer = { duration, remaining, expiresAt }

#### **Results Visibility**
- **States**:
  - `HIDDEN`: Responses collected, chart not shown to students
  - `VISIBLE`: Students see live bar chart updating
  - `REVEALED`: Teacher calls `revealResultsToStudents()`, both see answer key
- **Controls**: "End & Reveal" button on teacher header
- **Storage**: Metadata.resultsVisibility + Metadata.revealedAt

#### **Metacognition Tracking** (NEW 2025)
- **Enabled per question** during poll creation
- **Student experience**: After selecting answer, slider appears (guessing → certain)
- **Collection**: ConfidenceLevel stored in Responses sheet
- **Storage**: Question.metacognitionEnabled = true/false
- **Analytics**: `computeMetacognitionAnalysis_()` creates 2x2 matrix:
  ```
  Confident + Correct  (Mastery)
  Confident + Incorrect (RED ALERT)
  Uncertain + Correct   (Lucky/Imposter)
  Uncertain + Incorrect (Good - knows gaps)
  ```

#### **Multi-Teacher Access**
- **Primary Teacher**: Configured in Code.gs constant: `TEACHER_EMAIL`
- **Additional Teachers**: Script Properties: `ADDITIONAL_TEACHER_PROP_KEY`
  ```javascript
  ADDITIONAL_TEACHERS = "teacher2@school.edu,teacher3@school.edu"
  ```
- **Auth Check**: `isTeacherEmail_(email)` checks Session.getActiveUser().getEmail()

### 2.4 Session State Machine

```
PRE_LIVE (idle state)
   ↓
   [Teacher clicks START]
   ↓
LIVE (question open, collecting responses)
   ├─ [Next Question] → LIVE (different question)
   ├─ [Pause] → PAUSED
   │   ├─ [Resume] → LIVE
   │   └─ [End & Reveal] → RESULTS_REVEALED
   ├─ [End & Reveal] → RESULTS_REVEALED
   │   ├─ Show answer key
   │   └─ Students see results
   └─ [Finish Session] → ENDED

PAUSED (question open, not collecting)
   ├─ [Resume] → LIVE
   ├─ [Next Question] → LIVE
   └─ [Finish Session] → ENDED

RESULTS_HOLD (awaiting teacher action after question)
   ├─ [Reveal] → RESULTS_REVEALED
   └─ [Next Question] → LIVE

RESULTS_REVEALED (answer shown, scores visible)
   ├─ [Next Question] → LIVE
   └─ [Finish Session] → ENDED

ENDED (all questions completed or teacher stopped)
   └─ [Archive Session] → Records persisted
```

**Mapping to LiveStatus.PollStatus**:
- PRE_LIVE → PollStatus='CLOSED', QuestionIndex=-1
- LIVE → PollStatus='OPEN', QuestionIndex=0+
- PAUSED → PollStatus='PAUSED', QuestionIndex=0+
- RESULTS_* → PollStatus='PAUSED', sessionPhase in metadata
- ENDED → PollStatus='CLOSED', sessionPhase='ENDED'

---

## 3. HOW STUDENTS JOIN & PARTICIPATE

### 3.1 Student Access Flow

#### **Step 1: Generation of Access Links**

**Location**: TeacherView → "Send Links" dialog

```
Teacher clicks "Send Links" for a class
↓
bulkAddStudentsToRoster(className, entries):
  1. Validate student email format
  2. Write to Rosters sheet
  3. For each student:
     - Generate token: TokenManager.generateToken(email, pollId)
     - Token format: base64(email::pollId::timestamp::hmac-signature)
     - Token expires: 30 days (configurable)
  4. Build link: 
     https://script.google.com/macros/d/[DEPLOYMENT_ID]/usercopy?token=[TOKEN]
  5. Send email via MailApp:
     To: student@school.edu
     Subject: "You're invited to a live poll"
     Body: "Click here: [PERSONALIZED_LINK]"
```

**Token Structure**:
```javascript
const tokenPayload = {
  email: "student@school.edu",
  pollId: "P-abc123...",
  timestamp: Date.now(),
  hmac: computeHmac(email:pollId:timestamp, SECRET_KEY)
};
const token = Utilities.base64Encode(JSON.stringify(tokenPayload));
```

**Token Validation** (every request):
```javascript
TokenManager.validateToken(token):
  1. Decode base64 → JSON
  2. Verify HMAC signature (prevents tampering)
  3. Check timestamp not > 30 days old
  4. Extract studentEmail
  5. Return email or null if invalid
```

#### **Step 2: Student Enters Poll**

```
Student clicks link: ?token=ABC123...
↓
doGet(e):
  1. Call TokenManager.validateToken(e.parameter.token)
  2. If valid: return StudentView.html with token embedded
     <script>window.SESSION_TOKEN = '<?= token ?>';</script>
  3. If invalid: return "Access Denied"
↓
StudentView.html loads:
  1. Start polling server every 2.5 seconds
  2. Call: getStudentPollStatus(token, context)
  3. Render appropriate UI state
```

### 3.2 Student Participation States

**Location**: `StudentView.html` → JavaScript polling loop

```javascript
getStudentPollStatus(token, context)
  ↓
  Returns:
  {
    status: "PRE_LIVE|LIVE|PAUSED|RESULTS_HOLD|RESULTS_REVEALED|ENDED",
    pollId: "P-abc...",
    questionIndex: 0,
    question: {
      questionText: "...",
      questionImageUrl: "...",
      answers: [...],
      metacognitionEnabled: boolean,
      correctAnswer: "B"  // Only visible after RESULTS_REVEALED
    },
    stateVersion: 42,  // Used to detect server-side changes
    connectionHealth: "HEALTHY|RECOVERING|RECOVERED_AFTER_OUTAGE",
    advisedPollIntervalMs: 2500,  // Adaptive polling
    proctorState: {
      status: "OK|LOCKED|AWAITING_FULLSCREEN|BLOCKED",
      lockVersion: 2,
      lockReason: "exit-fullscreen|teacher-block::...",
      blockedAt: "ISO8601"
    }
  }
```

**UI States**:

1. **PRE_LIVE**: 
   - Shows "Waiting for teacher to start poll"
   - No questions displayed
   - Button: "Enter Fullscreen" (starts proctoring)

2. **LIVE**:
   - Question displayed with answers
   - If metacognitionEnabled: confidence slider (after selecting answer)
   - Student can select answer and submit
   - Green checkmark shows on submission
   - (Unless locked by proctor)

3. **PAUSED**:
   - Question visible but answers disabled
   - Message: "Poll paused - teacher is reviewing"

4. **RESULTS_HOLD**:
   - Question visible with results chart
   - Teacher controls visibility
   - Message: "Waiting for teacher..."

5. **RESULTS_REVEALED**:
   - Shows correct answer (highlighted)
   - Shows student's answer (marked correct/incorrect)
   - Shows full response breakdown by class
   - Shows own score if poll completed

6. **ENDED**:
   - "Thank you for participating!"
   - Summary statistics if available

### 3.3 Answer Submission Process

**Location**: StudentView.html → `submitStudentAnswer()`

```
Student selects answer and clicks submit
↓
submitStudentAnswer(pollId, questionIndex, answerText, token, confidenceLevel):
  1. Validate token → extract studentEmail
  2. Rate limit check: 5 submissions per 60 seconds
  3. Verify poll is still OPEN for this question
  4. Check student hasn't already answered this question
  5. Look up correct answer for comparison
  6. Calculate isCorrect = (answerText === question.correctAnswer)
  7. DataAccess.responses.add([
       responseId: "R-" + UUID,
       timestamp: Date.now(),
       pollId: pollId,
       questionIndex: questionIndex,
       studentEmail: studentEmail,
       answer: answerText,  // "A", "B", "C", etc.
       isCorrect: boolean,
       confidenceLevel: confidenceLevel  // null if no metacognition
     ])
  8. Return: { success: true }
↓
Student sees:
  - Green checkmark (answer accepted)
  - Question becomes read-only
  - Can still see confidence slider if enabled
  - Message: "Your answer has been submitted"
```

### 3.4 Confidence/Metacognition Collection

**When enabled** on a question:

```
After student selects answer:
  ├─ Answer submitted to server
  ├─ UI shows slider: "How confident are you?"
  │   └─ Range: Guessing → Somewhat Sure → Very Sure → Certain
  ├─ Student adjusts slider (haptic feedback on mobile)
  ├─ Final value sent: submitStudentAnswer(..., confidenceLevel)
  └─ Stored in Responses.ConfidenceLevel

Metacognition states:
  "guessing"      → Low confidence
  "somewhat-sure" → Medium confidence
  "very-sure"     → High confidence (aggregated)
  "certain"       → High confidence (aggregated)
```

---

## 4. HOW PROCTORING IS IMPLEMENTED

### 4.1 Violation Detection (Client-Side)

**Location**: StudentView.html → JavaScript event listeners

```javascript
// Multi-layer detection system:

1. FULLSCREEN DETECTION
   document.addEventListener('fullscreenchange', (e) => {
     if (!document.fullscreenElement && fullscreenEnteredOnce) {
       reportViolationDebounced('exit-fullscreen');
     }
   });

2. TAB SWITCH / FOCUS LOSS
   document.addEventListener('visibilitychange', (e) => {
     if (document.hidden) {
       reportViolationDebounced('tab-switch');
     }
   });
   
   window.addEventListener('blur', (e) => {
     reportViolationDebounced('window-blur');
   });

3. DEBOUNCE (500ms) to prevent false positives:
   function reportViolationDebounced(reason) {
     if (violationDebounceTimer) clearTimeout(violationDebounceTimer);
     violationDebounceTimer = setTimeout(() => {
       if (!violationLogged && !isInteractionBlocked) {
         google.script.run.reportStudentViolation(reason, token);
       }
     }, 500);
   }
```

### 4.2 Violation Reporting & Locking

**Location**: Code.gs → `reportStudentViolation()`

```
Client reports violation (exit-fullscreen, tab-switch, etc.)
↓
reportStudentViolation(reason, token):
  1. Extract studentEmail from token
  2. Get current poll and session
  3. Check ProctorState for this student:
     
     IF status == 'LOCKED':
        → Keep same lockVersion, just update reason
        → Don't increment (prevent thrashing)
     
     ELSE IF status == 'AWAITING_FULLSCREEN':
        → NEW violation while awaiting re-entry
        → Increment lockVersion: v1 → v2
        → Reset approval (teacher must re-approve)
     
     ELSE (status == 'OK'):
        → First violation
        → Create new lock entry with v1
     
  4. Write new state to ProctorState sheet:
     {
       status: 'LOCKED',
       lockVersion: N,
       lockReason: reason,
       lockedAt: ISO8601,
       unlockApproved: false
     }
  
  5. Also log to Responses sheet (audit trail only):
     answer: 'VIOLATION_LOCKED'
     metadata: { version: N }
  
  6. ProctorTelemetry.log('violation', email, pollId, {...})
  
  7. Return: { success: true, status: 'LOCKED', lockVersion: N }
```

**State Stored in ProctorState Sheet**:
```
PollID | StudentEmail | Status | LockVersion | LockReason | LockedAt | SessionId
-------|--------------|--------|-------------|-----------|----------|----------
P-abc  | student@...  | LOCKED | 1           | exit-...  | 2025-... | sess-123
```

### 4.3 Lock State Persistence

**Location**: Code.gs → `ProctorAccess` class

```
Lock state is the AUTHORITATIVE source for student access control

ProctorAccess.getState(pollId, studentEmail, sessionId):
  1. Query ProctorState sheet
  2. Find row: PollID=pollId AND StudentEmail=email
  3. Check SessionId matches current session
  4. Return: {
       status: 'OK'|'LOCKED'|'AWAITING_FULLSCREEN'|'BLOCKED',
       lockVersion: integer,
       lockReason: string,
       lockedAt: ISO8601,
       unlockApproved: boolean,
       unlockApprovedBy: string,
       unlockApprovedAt: ISO8601,
       rowIndex: number (for updates)
     }

Key property: Lock persists across page reloads
  - Student refreshes browser → Lock still exists
  - Student closes tab → Lock still exists (next login sees it)
  - Lock only cleared when:
    a) Teacher manually unlocks
    b) Session ends (archive & cleanup)
```

### 4.4 Teacher Unlock Workflow

**Location**: TeacherView.html → "Live Dashboard" student grid

```
Live Dashboard shows:
  ├─ Student tiles with status:
  │   ├─ 🟢 Green (answered)
  │   ├─ ⭕ Orange (locked)
  │   └─ ⚪ Gray (waiting)
  ├─ Locked students grouped at top
  └─ "Violations" alert panel (red)

Teacher clicks on locked student:
  ├─ Modal shows:
  │   ├─ Student name
  │   ├─ Lock reason (exit fullscreen / tab switch / etc.)
  │   ├─ Timestamp of lock
  │   ├─ Action buttons:
  │   │   ├─ "Approve Unlock" (green)
  │   │   └─ "Block Student" (red)
  │   └─ Comment field (optional)
  └─ Clicks "Approve Unlock"

Unlock flow: teacherApproveUnlock(studentEmail, pollId, expectedLockVersion):
  1. Fetch current ProctorState for student
  2. ATOMIC CHECK:
     if (currentLockVersion !== expectedLockVersion) {
       return { ok: false, reason: 'version_mismatch' }
       // Student violated AGAIN while approval was in flight
     }
  3. Update ProctorState:
     {
       status: 'AWAITING_FULLSCREEN',
       unlockApproved: true,
       unlockApprovedBy: teacherEmail,
       unlockApprovedAt: ISO8601
     }
  4. Student sees: "Resume Session" button
     └─ Button triggers: requestFullscreen()
  5. When student clicks button + enables fullscreen:
     └─ Call: studentConfirmFullscreen(pollId, expectedLockVersion)
     └─ ProctorState updated: status='OK'
```

**Version-Based Atomic Approvals** (prevents race conditions):

```
Timeline 1 (Normal):
  T0: Student exits fullscreen → Lock v1 created
  T1: Teacher clicks Approve (v1)
  T2: Server receives Approve(v1), locks match → ACCEPT
  T3: Student re-enters fullscreen → OK

Timeline 2 (Race condition protection):
  T0: Student exits fullscreen → Lock v1
  T1: Teacher clicks Approve (v1)
  T2: Student exits fullscreen AGAIN → Lock v2 (version bumped!)
  T3: Server receives Approve(v1) → REJECT (v1 ≠ v2)
  T4: Teacher sees "Student has newer violation - try again"
  T5: Teacher clicks Approve (v2)
  T6: Server receives Approve(v2) → ACCEPT
```

### 4.5 Teacher Block Feature

**Location**: Code.gs → `teacherBlockStudent()`

```
Teacher clicks "Block" instead of "Approve":
  ├─ Confirmation dialog: "Block this student from voting?"
  ├─ Reason field (required)
  └─ Clicks confirm

teacherBlockStudent(studentEmail, pollId, reason):
  1. Update ProctorState:
     {
       status: 'BLOCKED',
       lockReason: 'teacher-block::' + teacherEmail + '::' + reason,
       blockedAt: ISO8601
     }
  2. Student gets message:
     "You have been blocked from this poll by [Teacher].
      Reason: [reason]"
  3. Student sees disabled interface (no answer submission)
  4. Lock cannot be auto-cleared
  5. Teacher can unblock via: teacherUnblockStudent()
```

### 4.6 Proctoring Telemetry & Logging

**Location**: Code.gs → `ProctorTelemetry` object

```javascript
ProctorTelemetry.log(event, studentEmail, pollId, extra):
  1. Always logs to console (visible in Apps Script logs)
  2. Optionally logs to ProctorLog sheet (if enabled)
  3. Events logged:
     - 'violation': Student violated
     - 'unlock_requested': Teacher approved unlock
     - 'unlock_confirmed': Student re-entered fullscreen
     - 'blocked': Teacher blocked student
     - 'unblocked': Teacher unblocked student

Example log entry:
  {
    timestamp: "2025-11-11T10:35:42.123Z",
    event: "violation",
    studentEmail: "alice@school.edu",
    pollId: "P-abc123...",
    lockVersion: 2,
    reason: "exit-fullscreen",
    status: "LOCKED"
  }
```

---

## 5. HOW RESPONSES & VIOLATIONS ARE TRACKED

### 5.1 Response Recording

**Location**: Responses Sheet (append-only log)

```
Each student answer creates a row:

ResponseID | Timestamp | PollID | QuestionIndex | StudentEmail | Answer | IsCorrect | ConfidenceLevel
-----------|-----------|--------|---------------|--------------|--------|-----------|----------------
R-uuid1    | 1731238... | P-abc  | 0             | alice@s...   | B      | true      | very-sure
R-uuid2    | 1731238... | P-abc  | 0             | bob@s...     | C      | false     | guessing
R-uuid3    | 1731238... | P-abc  | 0             | carol@s...   | B      | true      | certain
V-uuid4    | 1731239... | P-abc  | -1            | bob@s...     | VIOLATION_LOCKED | false | null

Timestamp: Milliseconds since epoch (for microsecond accuracy)
Answer: Letter (A/B/C/etc.) OR special markers
IsCorrect: Auto-computed when submitted
ConfidenceLevel: Only if metacognitionEnabled on question
```

### 5.2 Violation Markers in Responses

```
Special response types (for audit trail):

1. VIOLATION_LOCKED
   - Marks a proctoring event (not an answer)
   - QuestionIndex = -1 (indicates system event)
   - Timestamp: when violation occurred
   - Metadata: { version: N } (lock version)

2. Used for historical analysis, but NOT authoritative
   - ProctorState sheet is authoritative for lock status
   - Responses sheet used for "times locked" count
   - Multiple VIOLATION_LOCKED rows per student = multiple violations
```

### 5.3 Data Access for Analytics

**Location**: Code.gs → `DataAccess` object

```javascript
// Reading responses:
DataAccess.responses.getByPoll(pollId)
  → Returns all responses for a poll
  → Used by: analytics, teacher dashboard

DataAccess.responses.getByPollAndQuestion(pollId, qIdx)
  → Returns responses for specific question
  → Used by: item analysis, answer breakdown

DataAccess.responses.hasAnswered(pollId, qIdx, email)
  → Checks if student already answered
  → Used by: prevent duplicate submissions

// Reading violation markers:
responseValues.filter(r => r[5] === PROCTOR_VIOLATION_CODES.LOCKED)
  → Counts violations per student
  → Used by: violation summaries
```

### 5.4 Student Performance Tracking

**Location**: Code.gs → `computeStudentAggregates_()`

```javascript
For each student across all polls:
  {
    email: "student@school.edu",
    name: "Alice Smith",
    totalAttempted: 15,      // Questions answered
    totalCorrect: 12,        // Correct responses
    accuracy: 80.0,          // %correct
    violations: 2,           // Times locked
    averageConfidence: 3.2,  // On 1-4 scale (if metacognition used)
    confidenceCalibration: -0.8,  // Difference: actual vs perceived accuracy
    performanceTrend: 'improving', // Trend analysis
    strugglingTopics: ['Photosynthesis', 'Cellular Respiration'],  // Per poll analysis
    streakData: {
      currentStreak: 3,
      longestStreak: 7
    }
  }
```

### 5.5 Violation Analysis

**Location**: Code.gs → `getStudentInsights()`

```javascript
For violation tracking:
  {
    violations: [
      {
        pollId: "P-abc...",
        timestamp: "2025-11-11T10:35:00Z",
        reason: "exit-fullscreen",
        duration: 45000  // milliseconds locked
      },
      {
        pollId: "P-xyz...",
        timestamp: "2025-11-11T11:15:00Z",
        reason: "tab-switch",
        duration: 12000
      }
    ],
    violationCount: 2,
    violationRate: "Moderate",  // Based on frequency
    averageLockDuration: 28500,
    lastViolation: "2025-11-11T11:15:00Z",
    pattern: "repeated-tab-switching"  // Inferred pattern
  }
```

---

## 6. HOW METACOGNITION IS TRACKED DURING SESSIONS

### 6.1 Metacognition Collection

**Location**: StudentView.html + Code.gs

```
Teacher enables metacognition during poll creation:
  ├─ Question dialog → Checkbox "Track confidence"
  └─ Stored: question.metacognitionEnabled = true

Student submits answer:
  1. Selects answer (A/B/C/etc.)
  2. Clicks submit
  3. Confidence slider appears with options:
     ├─ 🤔 Guessing (low confidence)
     ├─ 🤔 Somewhat Sure (medium)
     ├─ ✔️ Very Sure (high)
     └─ ✔️ Certain (very high)
  4. Student adjusts slider
  5. Final submission:
     submitStudentAnswer(pollId, qIdx, answer, token, confidenceLevel)
     └─ confidenceLevel: 'guessing' | 'somewhat-sure' | 'very-sure' | 'certain'
  6. Stored in Responses sheet, column 8: ConfidenceLevel

If metacognition NOT enabled:
  └─ confidenceLevel = null (slider not shown)
```

### 6.2 Metacognition Analysis Matrix

**Location**: Code.gs → `computeMetacognitionAnalysis_()`

```javascript
Creates 2x2 matrix:

                  Confident          Uncertain
                  (very-sure,        (guessing,
                   certain)          somewhat-sure)
Correct     ┌─────────────────────┬──────────────┐
            │ MASTERY             │ LUCKY        │
            │ (Conscious          │ (Imposter    │
            │  Competence)        │  Syndrome)   │
            └─────────────────────┴──────────────┘
            │ 45% of class        │ 8%           │
            └─────────────────────┴──────────────┘

Incorrect   ┌─────────────────────┬──────────────┐
            │ RED ALERT!          │ GOOD         │
            │ (Confident but      │ (Conscious   │
            │  wrong)             │  Incompetence│
            │ = MISCONCEPTION     │  - knows     │
            │                     │  gaps)       │
            └─────────────────────┴──────────────┘
            │ 12% of class        │ 35%          │
            └─────────────────────┴──────────────┘

Computed:
  {
    enabled: true,
    overall: {
      confidentCorrect: 45,      // %
      confidentIncorrect: 12,    // % = RED FLAG
      uncertainCorrect: 8,       // %
      uncertainIncorrect: 35     // %
    },
    overallCounts: {
      confidentCorrect: 18,      // # of students
      confidentIncorrect: 5,
      uncertainCorrect: 3,
      uncertainIncorrect: 14
    },
    byQuestion: [
      {
        questionIndex: 0,
        questionText: "...",
        matrix: { ... },
        confidentlyIncorrectPct: 12
      }
    ],
    totalResponses: 40  // Students with confidence data
  }
```

### 6.3 Metacognition Insights for Teachers

**Location**: TeacherView.html → Analytics → Insights section

```
Red flags identified:
  1. Overconfidence (Confident + Incorrect):
     → Indicates misconception
     → Requires re-teaching
     → May suggest unclear explanation

  2. Underconfidence (Uncertain + Correct):
     → Student got it right but unsure
     → Imposter syndrome
     → Needs confidence building

  3. Calibration mismatch:
     → Student's confidence ≠ actual accuracy
     → Weak self-assessment skills
     → Suggest study techniques

Action items generated:
  - "12% overconfident on Q3 - may indicate misconception"
  - "Reteach energy conversion before next topic"
  - "Highlight successful students as models"
  - "Consider peer teaching for Q2"
```

### 6.4 Student Historical Metacognition Tracking

**Location**: Code.gs → `getStudentHistoricalAnalytics()`

```javascript
For each student across multiple polls:
  {
    email: "alice@...",
    confidenceData: {
      confidentCorrect: 42,    // Times confident + correct
      confidentIncorrect: 8,   // Times confident + wrong
      uncertainCorrect: 6,     // Times unsure but right
      uncertainIncorrect: 24   // Times unsure + wrong
    },
    calibration: {
      perceivedAccuracy: 75,  // (confident correct / confident total)
      actualAccuracy: 68,     // (correct / total)
      calibrationError: 7,    // Difference (positive = overconfident)
      trend: 'improving'      // Over time
    }
  }
```

---

## 7. WHERE TEACHER ANALYTICS/REPORTS ARE GENERATED

### 7.1 Analytics Architecture

**Location**: Code.gs → Multiple analytics functions

```
Analytics Pipeline:

  Raw Data (Sheets)
    ├─ Polls
    ├─ Responses
    ├─ Rosters
    └─ ProctorState
         ↓
    DataAccess layer (filters, indexes)
         ↓
    Analytics Computation Functions:
    ├─ buildResponseMaps_(responseValues)
    ├─ computeSessionAggregates_()
    ├─ computeItemAggregates_()
    ├─ computeStudentAggregates_()
    ├─ computeTopicAggregates_()
    ├─ computeMetacognitionAnalysis_()
    └─ computeDistributionAnalysis_()
         ↓
    CacheManager (600s default)
         ↓
    TeacherView.html
    ├─ KPI cards (accuracy, response rate, etc.)
    ├─ Item difficulty heatmap
    ├─ Student performance table
    └─ Item scatter plot (difficulty vs discrimination)
```

### 7.2 Post-Session Analytics

**Location**: Code.gs → `getAnalyticsData()` and `getPostPollAnalytics()`

```
Teacher clicks "View Analytics" after session:
  ├─ Filter by class and date range
  ├─ Load data: getAnalyticsData(filters)
  └─ Render tabs:
     1. Overview (KPIs + visualizations)
     2. Items (question difficulty analysis)
     3. Students (performance breakdown)

getAnalyticsData(filters = {}):
  1. Fetch all polls matching filters
  2. Fetch all responses from Responses sheet
  3. buildResponseMaps_():
     - Group responses by poll and question
     - Track violation count per poll
     - Create timestamp index
  4. computeSessionAggregates_():
     - Per poll: participation rate, avg score, time per Q
     - Calculate point-biserial discrimination index
     - Identify difficult questions
  5. computeItemAggregates_():
     - Per question across all polls:
       - Difficulty (% correct)
       - Discrimination (do high performers get it right?)
       - Distractor analysis (wrong answer clustering)
  6. computeStudentAggregates_():
     - Per student: accuracy, participation, trends
     - Identify struggling students
     - Calculate Z-scores for distribution
  7. computeTopicAggregates_():
     - Group questions by topic (via poll name patterns)
     - Per topic: strength areas vs weak areas
  8. computeKPIs_():
     - School-wide metrics
     - Class-wide metrics
     - Engagement metrics
     - Integrity metrics (violations per session)
  9. Cache result (600 seconds)
  10. Return structured analytics object
```

### 7.3 Item Analysis

**Location**: Code.gs → `computeItemAnalysis_()`

```javascript
For each question:
  {
    pollId: "P-abc...",
    questionIndex: 0,
    questionText: "What is...",
    
    // Difficulty metrics
    difficulty: {
      pValue: 0.75,           // % correct (0=hardest, 1=easiest)
      interpretation: "Easy (75%+ correct)",
      difficulty_level: "easy",
      color: "green"
    },
    
    // Discrimination index (point-biserial correlation)
    discrimination: {
      index: 0.52,            // -1 to +1 (higher = better)
      interpretation: "Good discrimination",
      quality: "good",
      color: "green"
    },
    
    // Item quality rating (combines difficulty + discrimination)
    quality: {
      rating: "Good",
      feedback: "Question effectively distinguishes..."
    },
    
    // Distractor analysis (why students pick wrong answers)
    distractorAnalysis: {
      totalResponses: 42,
      correctResponse: { answer: "B", count: 31, percentage: 73.8 },
      distractors: [
        {
          answer: "A",
          count: 6,
          percentage: 14.3,
          analysis: "Misunderstood X concept",
          correctionAdvice: "Review..." 
        },
        {
          answer: "C",
          count: 5,
          percentage: 11.9,
          analysis: "Common misconception Y"
        }
      ]
    },
    
    // Student performance by question
    studentPerformance: {
      averageConfidence: 3.1,  // 1-4 scale
      highPerformersAccuracy: 95,
      lowPerformersAccuracy: 45,
      confidenceCalibration: 2  // Slight overconfidence
    }
  }
```

### 7.4 Student Performance Report

**Location**: Code.gs → `computeStudentAggregates_()` + TeacherView Analytics tab

```javascript
For each student:
  {
    email: "alice@school.edu",
    name: "Alice Smith",
    
    // Performance summary
    performance: {
      totalAttempted: 15,
      totalCorrect: 12,
      accuracy: 80,             // %
      participationRate: 100,   // % of polls attended
      performanceTrend: 'improving'  // Over time
    },
    
    // Per-poll breakdown
    pollData: [
      {
        pollId: "P-abc",
        pollName: "Biology Unit 1",
        attempted: 5,
        correct: 4,
        accuracy: 80,
        response_time_avg: 12500,  // milliseconds
        violations: 0
      }
    ],
    
    // Metacognition
    confidenceData: {
      confidentCorrect: 8,
      confidentIncorrect: 1,
      uncertainCorrect: 2,
      uncertainIncorrect: 5,
      calibration: -2  // Slightly underconfident
    },
    
    // Integrity
    violations: [
      {
        pollId: "P-xyz",
        timestamp: "...",
        reason: "tab-switch",
        duration: 12000
      }
    ],
    violationCount: 1,
    
    // Trends
    trend: {
      direction: 'up',
      improvementRate: 2.5,  // % per session
      consistencyScore: 0.85,  // How consistent is performance
      engagementLevel: 'high'
    },
    
    // Strengths & struggles
    strengths: {
      topics: ['Photosynthesis', 'Cell Structures'],
      trend: 'getting better'
    },
    struggles: {
      topics: ['Cellular Respiration'],
      recommendation: 'Review metabolism chapter'
    }
  }
```

### 7.5 KPI Dashboard Cards

**Location**: TeacherView.html → Analytics Overview → KPI section

```
Cards displayed:

1. CLASS ENGAGEMENT
   ├─ Metric: % of roster who participated
   ├─ Value: "87%" (23 of 26 students)
   ├─ Trend: 📈 +5% since last poll
   └─ Color: Green if > 80%, Yellow if 60-80%, Red if < 60%

2. AVERAGE ACCURACY
   ├─ Metric: % correct across all responses
   ├─ Value: "73.4%"
   ├─ Trend: 📈 +2.1% (improving)
   └─ Benchmark: Shows vs. class average

3. INTEGRITY RATE
   ├─ Metric: Lockouts per 10 students
   ├─ Value: "0.8" (8 lockouts / 100 student-attempts)
   ├─ Trend: 📉 -0.2 (improving focus)
   ├─ Rating: "Excellent focus!"
   └─ Color: Green if <1, Yellow if 1-2, Red if >2

4. RESPONSE TIME
   ├─ Metric: Average seconds to answer
   ├─ Value: "18.5s"
   ├─ Trend: 📉 -1.2s (faster)
   └─ Analysis: "Students are thinking, not guessing"

5. TOPIC MASTERY
   ├─ Metric: Performance by topic
   └─ Shows heatmap:
       Topic 1: ████████░░ 82%
       Topic 2: █████░░░░░ 51%
       Topic 3: █████████░ 91%

6. MISCONCEPTION ALERTS
   ├─ Shows questions where:
   │   - >15% confident + incorrect
   │   - >50% chose same wrong answer
   ├─ Example: "15 students confident but wrong on Q3"
   └─ Recommendation: "Reteach mechanism of photosynthesis"

7. STUDENT DISTRIBUTION
   ├─ Histogram of class scores
   ├─ Shows: Mean, Median, Std Dev
   └─ Identifies outliers
```

### 7.6 Live Dashboard Analytics

**Location**: TeacherView.html → During live session

```
Real-time updates (every 2.5 seconds):

1. RESPONSE CHART (Google Charts ColumnChart)
   ├─ Shows answer distribution (A: 5, B: 18, C: 2, D: 3)
   ├─ Updates as responses arrive
   ├─ Shows correct answer bar in green
   ├─ Shows % of class participated

2. STUDENT GRID TILES
   ├─ Each student is a colored tile:
   │   ├─ 🟢 Green: Submitted answer
   │   ├─ ⭕ Orange: Locked (violation)
   │   ├─ 🔵 Blue: Awaiting fullscreen
   │   ├─ ⚪ Gray: Hasn't answered yet
   │   └─ 🖤 Black: Teacher blocked
   ├─ Tile shows:
   │   ├─ Student first name
   │   ├─ Time in state
   │   └─ Their answer (if submitted)
   └─ Click tile → unlock modal

3. RESPONSE BREAKDOWN (Collapsible)
   ├─ Full list of respondents:
   │   | Name | Time | Answer | Correct? | Confidence |
   │   |------|------|--------|----------|------------|
   │   | Alice| 8s   | B      | ✓ Yes    | Very Sure  |
   │   | Bob  | 12s  | C      | ✗ No     | Guessing   |
   └─ Sortable by: Time, Name, Correctness, Confidence

4. VIOLATIONS ALERT
   ├─ Red banner appears when violations happen
   ├─ Shows: "3 students locked - need approval"
   ├─ Lists locked students as quick-click buttons
   └─ "Violations" count (1, 2, 3...)
```

### 7.7 Analytics Data Export

**Location**: TeacherView.html → "Export" button

```
Available exports:

1. STUDENT REPORT (CSV)
   Student Name | Email | # Answered | # Correct | % Accuracy | Violations | ...

2. ITEM ANALYSIS (CSV)
   Question # | Text | % Correct | Discrimination | Quality | Feedback | ...

3. FULL RESPONSE LOG (CSV)
   Timestamp | Student | Poll | Question | Answer | Correct | Confidence | ...

4. INTEGRITY REPORT (CSV)
   Student | Poll | Violation Time | Reason | Duration | ...

5. METACOGNITION MATRIX (CSV)
   Question | Confident+Correct | Confident+Wrong | Uncertain+Correct | ...

6. CLASS SUMMARY (PDF)
   ├─ KPI cards
   ├─ Charts
   ├─ Item analysis table
   └─ Student rankings
```

---

## 8. SESSION TYPES & STATES SUMMARY

### State Machine (Simplified):

```
PRE_LIVE
  ↓ (Teacher: Start)
LIVE (collecting responses, timer running)
  ├─ (Teacher: Next) → LIVE (next question)
  ├─ (Timer expires) → PAUSED (auto-pause)
  ├─ (Teacher: Pause) → PAUSED
  ├─ (Teacher: End & Reveal) → RESULTS_REVEALED
  └─ (Teacher: Finish Session) → ENDED

PAUSED (responses locked, question visible)
  ├─ (Teacher: Resume) → LIVE
  ├─ (Teacher: End & Reveal) → RESULTS_REVEALED
  └─ (Teacher: Finish Session) → ENDED

RESULTS_HOLD (after closing responses, before reveal)
  ├─ (Teacher: Reveal Results) → RESULTS_REVEALED
  └─ (Teacher: Next Question) → LIVE

RESULTS_REVEALED (answer & breakdown visible)
  ├─ (Teacher: Next Question) → LIVE
  └─ (Teacher: Finish Session) → ENDED

ENDED (session closed)
  └─ (Archived for analytics)
```

### Session Phases (Metadata.sessionPhase):
- `PRE_LIVE`: Before teacher starts
- `LIVE`: Actively collecting responses
- `PAUSED`: Question open but not collecting
- `RESULTS_HOLD`: Responses closed, waiting for reveal
- `RESULTS_REVEALED`: Correct answer + breakdown shown
- `ENDED`: Session completed

---

## CURRENT DEVELOPMENT BRANCH

**Branch**: `claude/add-individual-timed-session-011CV2o3z2aG5kubLyrCtMy9`

**Objective**: Add per-student timed session tracking

**Expected features** (inferred from git branch name):
- Individual student timers (currently global per question)
- Per-student session start/end tracking
- Response time analytics per student
- Adaptive timing based on student pace
- Session-specific lock isolation (no cross-session bleed)

---

## KEY FILES REFERENCE

| File | Purpose | Lines |
|------|---------|-------|
| `Code.gs` | Backend: RPC handlers, data access, analytics | 6,080 |
| `TeacherView.html` | Teacher dashboard & controls | 8,615 |
| `StudentView.html` | Student polling interface | 2,678 |
| `ARCHITECTURE.md` | System design documentation | 892 |
| `README.md` | Feature overview & quick start | 500+ |
| `TODO.md` | Roadmap & completed milestones | 400+ |

---

**Analysis Complete** ✓

This comprehensive exploration covers all major areas of the Veritas Live Poll system. The architecture is modular, with clear separation between data access, business logic, and UI layers, making it suitable for the planned feature additions.
