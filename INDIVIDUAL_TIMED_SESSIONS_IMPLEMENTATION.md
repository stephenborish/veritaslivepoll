# Individual Timed Sessions - Implementation Status

## Overview
This document outlines the implementation of the Individual Timed Sessions feature, which allows teachers to run assessments where students work independently with randomized questions and a global time limit.

## ✅ Completed Backend Implementation

### Database Schema
**File: `Code.gs` - setupSheet()**

Added two new columns to the Polls sheet:
- `SessionType`: 'LIVE_POLL' or 'INDIVIDUAL_TIMED' (defaults to 'LIVE_POLL' for backward compatibility)
- `TimeLimitMinutes`: Number of minutes for the entire session (null for LIVE_POLL)

Created new `IndividualSessionState` sheet with columns:
- `PollID`: Poll identifier
- `SessionID`: Unique session identifier
- `StudentEmail`: Student email address
- `StartTime`: When student began session (ISO timestamp)
- `EndTime`: When student completed or timed out (ISO timestamp, null if in progress)
- `CurrentQuestionIndex`: Progress through their randomized question order (0-based)
- `QuestionOrderJSON`: JSON array of randomized question indices for this student
- `IsLocked`: Boolean indicating if student is locked out (time expired or completed)

### Data Access Layer
**File: `Code.gs` - DataAccess object (lines 612-752)**

Added `DataAccess.individualSessionState` with methods:
- `getByStudent(pollId, sessionId, studentEmail)`: Get student's session state
- `getBySession(pollId, sessionId)`: Get all students in a session
- `initStudent(pollId, sessionId, studentEmail, questionOrder)`: Initialize new student
- `updateProgress(pollId, sessionId, studentEmail, currentQuestionIndex)`: Update student progress
- `lockStudent(pollId, sessionId, studentEmail)`: Lock student out (time expired or completed)
- `clearSession(pollId, sessionId)`: Remove all session state for cleanup

Modified existing data access:
- `DataAccess.polls.getById()` now returns `sessionType` and `timeLimitMinutes`
- `getPolls_()` parses new fields from Polls sheet (lines 5834-5835)
- `writePollRows_()` saves sessionType and timeLimitMinutes (lines 5857-5900)

### Core Session Functions
**File: `Code.gs` (lines 1742-2201)**

#### `startIndividualTimedSession(pollId)`
Starts an individual timed session:
- Validates poll is configured as INDIVIDUAL_TIMED
- Generates unique sessionId
- Sets LiveStatus with sessionPhase='INDIVIDUAL_TIMED'
- Resets proctor state for new session
- Returns session info (pollId, sessionId, timeLimitMinutes, questionCount)

#### `initializeIndividualTimedStudent(pollId, sessionId, studentEmail)`
Initializes or retrieves student state:
- Generates randomized question order using Fisher-Yates shuffle
- Creates IndividualSessionState entry if new student
- Auto-locks if time limit exceeded
- Returns student state with current progress

#### `getIndividualTimedQuestion(pollId, sessionId, studentEmail)`
Gets current question for student:
- Initializes student if first access
- Checks if locked or completed
- Returns question based on randomized order
- Calculates time remaining in seconds
- Prevents viewing future questions

#### `submitIndividualTimedAnswer(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel)`
Records answer and advances progress:
- **SECURITY: Validates elapsed time server-side** - Rejects submissions if time limit exceeded, even if lock sweep hasn't run yet
- Validates current question (prevents backwards navigation)
- Checks for duplicate submissions
- Records response in Responses sheet
- Advances currentQuestionIndex
- Auto-locks when all questions answered
- Returns success, correctness, and completion status

#### `checkAndLockTimedOutStudents(pollId, sessionId)`
Background job to lock students who exceeded time:
- Iterates all students in session
- Calculates elapsed time from startTime
- Locks students who exceeded timeLimitMinutes
- Returns count of newly locked students

#### `endIndividualTimedSession(pollId)`
Closes session and locks all students:
- Retrieves sessionId from LiveStatus metadata
- Locks all unlocked students
- Sets LiveStatus to CLOSED with sessionPhase='ENDED'
- Returns success confirmation

#### `getIndividualTimedSessionAnalytics(pollId, sessionId)`
Comprehensive analytics report:
- **Session Info**: pollId, sessionId, pollName, className, timeLimitMinutes, questionCount
- **Overall Stats**: totalStudents, completedStudents, completionRate, timedOutStudents, averageScore, averageTimeSpent, totalViolations
- **Student Analytics** (per student):
  - progress, progressPercent, score, correctCount, totalAnswered
  - violationCount, timeSpentMinutes
  - isCompleted, isLocked, isTimedOut
  - metacognitionScore, calibrationStatus (Well-Calibrated, Overconfident, Mixed)
  - startTime, endTime
- **Question Analytics**: questionIndex, questionText, totalResponses, correctResponses, difficulty (Easy/Medium/Hard)

### Modified Functions
**File: `Code.gs`**

Updated to support sessionType and timeLimitMinutes:
- `createNewPoll()` (lines 1634-1662): Accepts and validates new parameters
- `savePollNew()` (lines 1539-1568): Accepts and validates new parameters
- `updatePoll()` (lines 2064-2091): Preserves existing session type when updating
- `duplicateQuestion()` (lines 1698): Maintains session type when duplicating
- `copyPoll()` (lines 1749): Copies session type to new poll

## ✅ Completed Teacher UI Implementation

### Poll Creation/Editing Interface
**File: `TeacherView.html` (lines 1868-1880)**

Added UI controls to poll creator modal:
- **Session Type Dropdown**: Choose between LIVE_POLL and INDIVIDUAL_TIMED
  - Clear descriptions for each option
  - Default: LIVE_POLL
- **Time Limit Input**: Number input for minutes (1-180)
  - Only visible when INDIVIDUAL_TIMED selected
  - Validation ensures value > 0
  - Helpful hint text about auto-locking

### JavaScript Integration
**File: `TeacherView.html`**

#### Event Handlers (lines 2932-2944)
- Session type change listener shows/hides time limit field
- Marks poll as dirty when session type changes

#### Poll Saving Logic (lines 8142-8156)
- Extracts sessionType from dropdown
- Extracts timeLimitMinutes when INDIVIDUAL_TIMED selected
- Validates time limit is set and > 0 for individual timed sessions
- Passes parameters to API calls

#### API Calls (lines 8381-8384)
- `createNewPoll()` includes sessionType and timeLimitMinutes
- `updatePoll()` includes sessionType and timeLimitMinutes

#### Poll Editor Initialization (lines 7675-7689, 7734-7740)
- When editing: Populates sessionType and timeLimitMinutes from poll data
- When creating new: Resets to LIVE_POLL with empty time limit
- Shows/hides time limit field appropriately

## 🔨 Remaining Frontend Work

### 1. Teacher: Start Button Logic
**File: `TeacherView.html` - `onStartPoll()` function**

Currently, the "Start Poll" button calls `startPoll()` for all sessions. Need to:
- Check poll.sessionType before starting
- If LIVE_POLL: Call `google.script.run.startPoll(pollId)` (current behavior)
- If INDIVIDUAL_TIMED: Call `google.script.run.startIndividualTimedSession(pollId)`
- Update UI to show different dashboard based on session type

**Example pseudocode:**
```javascript
function onStartPoll() {
  var selectedPoll = getSelectedPoll();
  if (selectedPoll.sessionType === 'INDIVIDUAL_TIMED') {
    google.script.run
      .withSuccessHandler(function(result) {
        // Show individual timed session dashboard
        showIndividualTimedDashboard(result);
      })
      .withFailureHandler(handleError)
      .startIndividualTimedSession(selectedPoll.pollId);
  } else {
    // Existing live poll logic
    google.script.run.withSuccessHandler(...).startPoll(selectedPoll.pollId);
  }
}
```

### 2. Teacher: Individual Timed Session Dashboard
**File: `TeacherView.html` - New section/modal**

Create a monitoring interface that shows:
- **Session Header**: Poll name, class, time limit, elapsed time
- **Overall Progress**: Students started, completed, timed out
- **Student List/Grid**: Real-time progress for each student
  - Student name/email
  - Progress indicator (e.g., "5/10 questions answered")
  - Time remaining/spent
  - Lock status (⏱️ In Progress, ✅ Completed, 🔒 Timed Out)
  - Violation count
- **Controls**:
  - "End Session" button (calls `endIndividualTimedSession()`)
  - "View Analytics" button (calls `getIndividualTimedSessionAnalytics()`)
  - "Refresh" button for manual updates
- **Auto-Refresh**: Poll server every 5-10 seconds for updates

**Data Source:**
- Call `getIndividualTimedSessionAnalytics(pollId, sessionId)` periodically
- Parse `studentAnalytics` array for grid display
- Parse `overallStats` for header metrics

### 3. Teacher: Analytics Display
**File: `TeacherView.html` - New analytics view**

After session ends, show comprehensive report:
- **Summary Cards**: Completion rate, average score, time stats
- **Student Performance Table**: Sortable by score, time, violations
  - Click student row for detailed breakdown
- **Question Analysis**: Difficulty distribution, most missed questions
- **Metacognition Insights**: Calibration status distribution
- **Violation Summary**: Students with violations, types of violations
- **Export Options**: CSV download of student results

**Data Source:**
- Call `getIndividualTimedSessionAnalytics(pollId, sessionId)` once when view opens
- Use returned data structure to populate all sections

### 4. Student: Individual Timed Session UI
**File: `StudentView.html` - New session flow**

Modify student interface to detect session type and show appropriate UI:

#### Session Detection
When student loads page, check `sessionPhase` from LiveStatus metadata:
- If `sessionPhase === 'INDIVIDUAL_TIMED'`: Use individual timed flow
- Otherwise: Use existing live poll flow

#### Individual Timed Session Flow
**Components needed:**
1. **Welcome Screen**: Shows poll name, question count, time limit, instructions
2. **Question Display**: One question at a time with options
3. **Timer Display**: Countdown timer showing time remaining (see below)
4. **Progress Indicator**: "Question 3 of 10"
5. **Submit Button**: Advances to next question (no "back" button)
6. **Completion Screen**: Shows when all questions answered
7. **Timeout Screen**: Shows when time expires

**JavaScript Logic:**
```javascript
// Initialize session
google.script.run
  .withSuccessHandler(function(questionData) {
    if (questionData.locked) {
      showLockedScreen(questionData.message);
    } else if (questionData.completed) {
      showCompletionScreen();
    } else {
      renderQuestion(questionData);
      startTimer(questionData.timeRemainingSeconds);
    }
  })
  .getIndividualTimedQuestion(pollId, sessionId, studentEmail);

// Submit answer
function submitAnswer(selectedAnswer) {
  google.script.run
    .withSuccessHandler(function(result) {
      if (result.isComplete) {
        showCompletionScreen();
      } else {
        // Auto-advance to next question
        loadNextQuestion();
      }
    })
    .submitIndividualTimedAnswer(pollId, sessionId, studentEmail, questionIndex, selectedAnswer, confidenceLevel);
}

// Load next question
function loadNextQuestion() {
  google.script.run
    .withSuccessHandler(renderQuestion)
    .getIndividualTimedQuestion(pollId, sessionId, studentEmail);
}
```

### 5. Student: Timer Display
**File: `StudentView.html` - Timer component**

Add prominent countdown timer:
- **Format**: "25:30" (minutes:seconds) or "59s" (under 1 minute)
- **Position**: Top of screen, always visible
- **Color Coding**:
  - Green: > 5 minutes remaining
  - Yellow: 1-5 minutes remaining
  - Red: < 1 minute remaining
  - Pulsing red: < 10 seconds
- **Auto-Lock**: When timer reaches 0, automatically lock student out

**Implementation:**
```javascript
var timerInterval;
var secondsRemaining;

function startTimer(initialSeconds) {
  secondsRemaining = initialSeconds;
  updateTimerDisplay();

  timerInterval = setInterval(function() {
    secondsRemaining--;
    updateTimerDisplay();

    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      handleTimeout();
    }
  }, 1000);
}

function updateTimerDisplay() {
  var minutes = Math.floor(secondsRemaining / 60);
  var seconds = secondsRemaining % 60;
  var display = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;

  document.getElementById('timer').textContent = display;
  document.getElementById('timer').className = getTimerClass(secondsRemaining);
}

function getTimerClass(seconds) {
  if (seconds <= 10) return 'timer-critical';
  if (seconds <= 60) return 'timer-urgent';
  if (seconds <= 300) return 'timer-warning';
  return 'timer-normal';
}

function handleTimeout() {
  // Lock UI and show timeout message
  document.getElementById('question-container').style.display = 'none';
  document.getElementById('timeout-screen').style.display = 'block';
}
```

### 6. Proctoring Integration
**File: `StudentView.html` - Existing proctoring code**

Individual timed sessions use the same proctoring rules as live polls. Ensure:
- Fullscreen enforcement works
- Tab switch detection works
- Violation reporting calls same backend functions
- Teacher can unlock students via same ProctorState mechanism

## Testing Checklist

### Teacher Workflow
- [ ] Create new poll as LIVE_POLL (should work as before)
- [ ] Create new poll as INDIVIDUAL_TIMED with 30 min limit
- [ ] Edit existing LIVE_POLL (should preserve type)
- [ ] Edit existing INDIVIDUAL_TIMED (should show time limit)
- [ ] Start INDIVIDUAL_TIMED session
- [ ] Monitor student progress in dashboard
- [ ] End session manually
- [ ] View analytics after session ends

### Student Workflow
- [ ] Join INDIVIDUAL_TIMED session (sees welcome screen)
- [ ] Answer questions one by one (can't go back)
- [ ] See timer counting down
- [ ] Complete all questions before time expires
- [ ] Get locked out when time expires (if not finished)
- [ ] Proctoring violations get recorded

### Edge Cases
- [ ] Student refreshes page mid-session (should resume at current question)
- [ ] Student joins after some time has elapsed (gets less time)
- [ ] All students finish before time limit (teacher can end early)
- [ ] Time limit expires (all students auto-locked)
- [ ] Student violates proctoring rules (handled same as live poll)

## Backward Compatibility

All existing functionality preserved:
- Existing polls default to LIVE_POLL if sessionType not set
- Live poll flow unchanged
- Database queries handle missing sessionType/timeLimitMinutes gracefully
- Teacher UI defaults to LIVE_POLL for new polls

## Performance Considerations

- IndividualSessionState sheet grows with each student per session
  - Consider cleanup policy for old sessions (e.g., delete after 90 days)
- Analytics query scans IndividualSessionState and Responses sheets
  - For large classes (>100 students), may take 2-5 seconds
  - Consider caching analytics results for recently ended sessions
- Student timer uses client-side countdown (not server-dependent)
  - Server-side checks on question load prevent time manipulation

## Security Considerations

### Time Limit Enforcement
**Critical:** Time limits are enforced server-side in `submitIndividualTimedAnswer()` to prevent bypass:
- Each submission calculates elapsed time from `studentState.startTime`
- If `elapsedMinutes >= timeLimitMinutes`, submission is rejected and student is locked
- This protects against:
  - Client-side timer manipulation
  - Delayed lock sweep jobs
  - Race conditions between question load and submission
- Lock state is updated atomically before throwing error

### Other Security Measures
- Question randomization prevents sharing answer order
- Backwards navigation prevention enforced server-side (validates `expectedQuestionIndex`)
- Session ID prevents cross-session data access
- Proctoring violations recorded same as live polls
- Duplicate submission check prevents double-answering

## API Reference

### Backend Functions (Google Apps Script)

```javascript
// Session Management
startIndividualTimedSession(pollId)
  → {success, pollId, sessionId, pollName, className, timeLimitMinutes, questionCount}

endIndividualTimedSession(pollId)
  → {success, message, sessionId}

// Student Operations
getIndividualTimedQuestion(pollId, sessionId, studentEmail)
  → {sessionId, question, actualQuestionIndex, progressIndex, totalQuestions, timeRemainingSeconds, startTime, timeLimitMinutes}
  OR {locked: true, message, ...}
  OR {completed: true, message, totalQuestions}

submitIndividualTimedAnswer(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel)
  → {success, isCorrect, isComplete, nextProgressIndex, totalQuestions}

// Analytics & Monitoring
getIndividualTimedSessionAnalytics(pollId, sessionId)
  → {sessionInfo, overallStats, studentAnalytics[], questionAnalytics[]}

checkAndLockTimedOutStudents(pollId, sessionId)
  → {success, lockedCount}

// Poll Creation (updated signatures)
createNewPoll(pollName, className, questions, sessionType, timeLimitMinutes)
  → [Array of all polls]

updatePoll(pollId, pollName, className, questions, sessionType, timeLimitMinutes)
  → [Array of all polls]
```

## Summary

**✅ Complete:**
- Full backend infrastructure for individual timed sessions
- Teacher UI for creating and configuring sessions
- Data persistence and retrieval
- Analytics and reporting backend
- Backward compatibility

**🔨 To Do:**
- Teacher start button logic (session type routing)
- Teacher monitoring dashboard (real-time progress)
- Teacher analytics display (post-session report)
- Student question flow (one-at-a-time progression)
- Student timer display (countdown with color coding)
- End-to-end testing

The backend is production-ready. The remaining work is primarily UI/UX implementation in TeacherView.html and StudentView.html.
