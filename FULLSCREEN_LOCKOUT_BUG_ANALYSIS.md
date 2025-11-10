# Fullscreen Lockout Bug Analysis - Veritas Live Poll

## Issue Summary
Students are getting locked out for "no fullscreen" before they have even started a live poll session.

## System Architecture Overview

### Lockout State Storage
- **Primary Database**: `ProctorState` sheet in Google Sheets
- **Columns**:
  - A: PollID
  - B: StudentEmail  
  - C: Status (OK, LOCKED, AWAITING_FULLSCREEN)
  - D: LockVersion (for atomic teacher approvals)
  - E: LockReason (e.g., 'exit-fullscreen', 'tab-blur')
  - F: LockedAt (timestamp)
  - G: UnlockApproved (boolean)
  - H: UnlockApprovedBy (teacher email)
  - I: UnlockApprovedAt (timestamp)
  - J: SessionId (unique identifier for each poll session)

### Session ID Mechanism
- **Generated**: Line 1443 in Code.gs when teacher clicks "Start Poll"
  ```javascript
  const sessionId = pollId + '::' + Utilities.getUuid();
  ```
- **Purpose**: Prevent old lockout states from one poll session affecting the next session of the same poll
- **Storage**: Stored in metadata via PropertiesService, Column J of ProctorState sheet
- **Retrieval**: Via DataAccess.liveStatus.get() → metadata.sessionId

## Critical Code Paths

### 1. Teacher Starts Poll (Lines 1435-1462)
```
startPoll(pollId)
  ├─ Generate new sessionId: "pollId::randomUuid"
  ├─ Call DataAccess.liveStatus.set() with metadata including sessionId
  ├─ Call ProctorAccess.resetForNewSession(pollId, sessionId)
  │   └─ This SHOULD reset all students with this pollId to status='OK'
  └─ Return live poll data
```

### 2. Student First Polls (StudentView.html, Lines 1753-1825)
```
Student clicks "Begin Session"
  ├─ Attempt to enter fullscreen (line 1767)
  ├─ Add fullscreenchange listener (line 1818)
  ├─ Add visibilitychange listener (line 1812)
  └─ Call startPolling(true) → pollForStatus()
      └─ Call getStudentPollStatus(SESSION_TOKEN, context)
          └─ Backend checks ProctorAccess.getState(pollId, email, currentSessionId)
              └─ Compare stored sessionId with current sessionId
              └─ Return student status (OK, LOCKED, or AWAITING_FULLSCREEN)
```

### 3. Lockout State Reset Logic (Code.gs, Lines 3465-3541)
```javascript
ProctorAccess.getState(pollId, studentEmail, currentSessionId) {
  // Find existing record for this student+poll
  if (record found) {
    const stateSessionId = data[i][9] || null;
    
    // CRITICAL CHECK (Line 3507):
    if (currentSessionId && stateSessionId !== currentSessionId) {
      // Session changed → reset to OK
      return { status: 'OK', sessionId: currentSessionId, ... };
    }
    
    // Session ID matches or both null → return old state
    return baseState; // Could be LOCKED!
  }
  
  // No record found → return default OK
  return { status: 'OK', ... };
}
```

### 4. Reset for New Session (Code.gs, Lines 3598-3638)
```javascript
resetForNewSession(pollId, sessionId) {
  // Get all rows in ProctorState sheet for this pollId
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === pollId) {
      // Reset each student to OK with new sessionId
      setValues([pollId, email, 'OK', 0, '', '', false, '', '', sessionId])
    }
  }
}
```

## Identified Potential Bugs

### Bug #1: Race Condition - Students Poll Before Reset Completes
**Severity**: HIGH
**Location**: Lines 1435-1462 (startPoll) vs getStudentPollStatus timing

**Issue**: 
- Teacher calls startPoll → creates sessionId → calls resetForNewSession
- But resetForNewSession writes to the sheet asynchronously
- If a student loads the page and polls BEFORE resetForNewSession completes:
  - Their old LOCKED state still exists in ProctorState sheet
  - currentSessionId would be new
  - stateSessionId would be old or missing
  - Should trigger reset logic at line 3507... UNLESS there's a caching issue

**Risk**: If sheet writes are buffered or delayed, students could see old lockout state

---

### Bug #2: Early fullscreenchange Event Firing
**Severity**: CRITICAL
**Location**: StudentView.html, Lines 1767-1822

**Issue**:
```javascript
// Line 1767: Request fullscreen
if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(function(e) {
        console.warn('Fullscreen denied:', e);
    });
}

// Line 1818-1822: Add listener for fullscreenchange
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement && !isInteractionBlocked && !violationLogged) {
        reportViolationDebounced('exit-fullscreen');
    }
});
```

**Problem**:
- If fullscreenchange event fires WHILE fullscreen is being requested (or if request is denied)
- `document.fullscreenElement` would be `null` (not in fullscreen)
- Condition `!document.fullscreenElement` would be `true`
- Calls `reportViolationDebounced('exit-fullscreen')`
- Student gets LOCKED on their first interaction!

**Timeline**:
1. Student clicks "Begin Session"
2. Browser requests fullscreen permission
3. User sees permission dialog
4. If user denies OR if fullscreenchange event fires during request:
   - `!document.fullscreenElement` = true
   - Violation reported immediately
   - Student locked

---

### Bug #3: Session ID Not Passed Correctly
**Severity**: MEDIUM
**Location**: Multiple places where currentSessionId is derived

**Issue**: If `metadata.sessionId` is not properly retrieved/stored:
- ProctorAccess.getState() line 3507 condition fails: `if (currentSessionId && ...)`
- If currentSessionId is null/undefined, condition is false
- Old LOCKED state is returned instead of reset

**Code Path Analysis**:
```
DataAccess.liveStatus.get() 
  ├─ Reads metadata from PropertiesService
  ├─ metadata = this.getMetadata_() (line 420)
  └─ returns statusValues with .metadata attached

getStudentPollStatus() 
  └─ const currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;
     (line 3084)
```

**Risk**: If PropertiesService.getProperty() fails or returns stale data, sessionId could be missing

---

### Bug #4: Missing Data in ProctorState Sheet
**Severity**: MEDIUM
**Location**: Lines 3616, 3492

**Issue**:
- Old ProctorState data (before sessionId was added) would have Column J empty
- New students without existing ProctorState row would not be reset by resetForNewSession
  - resetForNewSession only updates EXISTING rows (line 3616: `if (data[i][0] === pollId)`)
  - New students have no row yet

**But**: When new students first poll, getState() returns default OK (line 3527-3540), so this isn't the issue for brand new students

---

### Bug #5: Incorrect Fullscreen Status Check Timing
**Severity**: MEDIUM
**Location**: StudentView.html, Line 1818-1822

**Issue**: The fullscreenchange listener checks:
```javascript
if (!document.fullscreenElement && !isInteractionBlocked && !violationLogged)
```

This is checking if fullscreen is NOT active. But:
- On initial page load: `document.fullscreenElement` is always null
- When fullscreen is GRANTED, the event fires and element is set → condition is false (correct)
- But if there's a timing issue or the promise resolves synchronously before listener attaches...

---

### Bug #6: Reset Only Updates Existing Rows
**Severity**: LOW
**Location**: Lines 3614-3622

**Issue**: 
```javascript
const updates = [];
for (let i = 1; i < data.length; i++) {
  if (data[i][0] === pollId) {
    updates.push(...);
  }
}

updates.forEach(entry => {
  sheet.getRange(entry.rowIndex, 1, 1, 10).setValues([[...]]); 
});
```

If a student had NO previous row in ProctorState, they won't be in the `updates` array. But when they first poll, getState() returns default OK, so this isn't actually a problem.

---

## Root Cause Analysis

### Most Likely Cause: **Bug #2 + Bug #1 (Combined)**

**Scenario**:
1. Teacher clicks "Start Poll"
   - Creates sessionId "poll123::uuid-abc"
   - Calls resetForNewSession() → writes to sheet
   - But sheet write might be buffered
2. Student A already has old LOCKED state from previous session with sessionId "poll123::uuid-xyz"
3. Student clicks "Begin Session" before sheet is fully written
4. Browser requests fullscreen
5. If fullscreenchange fires before fullscreen is granted:
   - `!document.fullscreenElement` = true
   - `isInteractionBlocked` = false
   - `violationLogged` = false
   - → Calls reportViolationDebounced('exit-fullscreen')
   - → Calls reportStudentViolation('exit-fullscreen')
   - → ProctorAccess.getState() called
   - → Finds old LOCKED state
   - → Returns LOCKED (because resetForNewSession hasn't completed)
6. Student is locked with new violation

---

## The Bug: Premature Fullscreenchange Listener Execution

### Root Issue
The fullscreenchange event listener (StudentView.html, line 1818) is checking `!document.fullscreenElement` which is ALWAYS true when the page first loads or when fullscreen is NOT currently active.

When the student clicks "Begin Session":
1. Line 1767 requests fullscreen
2. Line 1818 adds the fullscreenchange listener

If ANY fullscreenchange event fires (whether from success or denial of fullscreen), and at that moment `document.fullscreenElement` is null:
- The listener fires
- Reports a violation
- Locks the student

### Why This Happens "Before Starting"
"Before they have even started a live poll session" could mean:
- They haven't answered any questions yet
- They've just clicked "Begin Session"
- The fullscreenchange listener (intended to detect EXITING fullscreen) fires at the wrong moment

### Timing Issue
The requestFullscreen() promise might resolve or reject quickly, and the fullscreenchange event might fire at a moment when the listener is checking `!document.fullscreenElement`.

---

## Recommended Fixes

### Fix #1: Prevent False Fullscreenchange Violations (PRIORITY 1)
Add a flag to track if fullscreen entry is in progress:

```javascript
var fullscreenRequestInProgress = false;

if (document.documentElement.requestFullscreen) {
    fullscreenRequestInProgress = true;
    document.documentElement.requestFullscreen()
        .then(() => {
            fullscreenRequestInProgress = false;
        })
        .catch(function(e) {
            fullscreenRequestInProgress = false;
            console.warn('Fullscreen denied:', e);
        });
}

document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement && !isInteractionBlocked && !violationLogged && !fullscreenRequestInProgress) {
        reportViolationDebounced('exit-fullscreen');
    }
});
```

### Fix #2: Delay Fullscreenchange Listener Until After Fullscreen Granted
```javascript
var fullscreenChangeListenerAttached = false;

document.documentElement.requestFullscreen()
    .then(() => {
        // Fullscreen granted - NOW attach listener
        if (!fullscreenChangeListenerAttached) {
            attachFullscreenChangeListener();
            fullscreenChangeListenerAttached = true;
        }
    })
    .catch(e => console.warn('Fullscreen denied:', e));

function attachFullscreenChangeListener() {
    document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement) {
            reportViolationDebounced('exit-fullscreen');
        }
    });
}
```

### Fix #3: Ensure resetForNewSession Completes Before Students Can Poll
Add a completion signal or ensure all updates are flushed:

```javascript
resetForNewSession: function(pollId, sessionId) {
  // ... existing code ...
  
  // Force flush all pending writes
  if (updates.length > 0) {
    const range = sheet.getRange(1, 1, sheet.getLastRow(), 10);
    range.clearContent(); // or use batch update
    // Re-write all data
  }
}
```

### Fix #4: Add Logging to Track Session ID Propagation
Add debug logging to verify sessionId is being passed correctly:

```javascript
const proctorState = ProctorAccess.getState(pollId, studentEmail, currentSessionId);
console.log('Proctor state check', {
  pollId,
  studentEmail,
  currentSessionId,
  storedSessionId: proctorState.sessionId,
  status: proctorState.status
});
```

---

## Files to Review/Modify

| File | Lines | Purpose |
|------|-------|---------|
| `/home/user/veritaslivepoll/StudentView.html` | 1767-1822 | Fix fullscreenchange timing issue |
| `/home/user/veritaslivepoll/Code.gs` | 3507 | Verify session ID reset logic |
| `/home/user/veritaslivepoll/Code.gs` | 1435-1462 | Ensure resetForNewSession completes |
| `/home/user/veritaslivepoll/Code.gs` | 3598-3638 | Verify reset logic completeness |

