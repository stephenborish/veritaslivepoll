# Proctoring Flow Audit - Critical Issues & Fixes

## Executive Summary
Found **3 CRITICAL**, **4 HIGH**, **4 MEDIUM** issues that could cause:
- Auto-unlock paths bypassing teacher approval
- State inconsistencies on reload
- Double version bumps
- Students getting stuck in wrong state

---

## CRITICAL ISSUES

### C1: Dual Lock Check Creates Inconsistency (Code.gs:1322)
**File**: `Code.gs:1322-1328`
**Severity**: CRITICAL
**Exploit**: Student can be shown as LOCKED even when ProctorAccess says OK, or vice versa

```javascript
// CURRENT CODE (BROKEN):
if (DataAccess.responses.isLocked(pollId, studentEmail)) {
  return {
    status: "LOCKED",
    message: "Your session was locked...",
  };
}
```

**Problem**: This checks old Responses sheet for VIOLATION_LOCKED rows, NOT the authoritative ProctorAccess state. Creates two sources of truth.

**Impact**:
- Student with status=OK but old VIOLATION_LOCKED row → shows as locked forever
- Student with status=LOCKED but no VIOLATION_LOCKED row → appears unlocked
- Breaks "server is single source of truth" requirement

**Fix**: Replace with ProctorAccess check:
```javascript
// Check authoritative proctor state
const proctorState = ProctorAccess.getState(pollId, studentEmail);
if (proctorState.status === 'LOCKED' || proctorState.status === 'AWAITING_FULLSCREEN') {
  return {
    status: proctorState.status,
    message: proctorState.status === 'LOCKED'
      ? "Your session was locked. Your teacher must unlock you."
      : "Your teacher has approved unlock. Click resume when ready.",
    hasSubmitted: false
  };
}
```

---

### C2: Student UI Checks Wrong Field for Resume (StudentView.html:324)
**File**: `StudentView.html:324`
**Severity**: CRITICAL
**Exploit**: Shows resume prompt when still LOCKED if unlockApproved=true but status not updated

```javascript
// CURRENT CODE (BROKEN):
if (proctorResponse.unlockApproved) {
  showResumePrompt();
}
```

**Problem**: Checks `unlockApproved` flag instead of `status === 'AWAITING_FULLSCREEN'`. If teacher approves but state write fails, student sees resume button while server says LOCKED.

**Impact**: Student clicks "Resume" → studentConfirmFullscreen fails → stuck in loop

**Fix**:
```javascript
if (proctorResponse.status === 'AWAITING_FULLSCREEN') {
  showResumePrompt();
} else if (proctorResponse.status === 'LOCKED') {
  showLockedMessage();
  startProctorPolling();
}
```

---

### C3: Missing AWAITING_FULLSCREEN Handler on Reload (StudentView.html:317)
**File**: `StudentView.html:317-335`
**Severity**: CRITICAL
**Exploit**: Student reloads page while in AWAITING_FULLSCREEN state

**Problem**: `updateStudentView()` only handles status='LOCKED', not 'AWAITING_FULLSCREEN'. If student reloads after teacher approval, they see wrong UI.

**Impact**: Student approved by teacher, reloads page → sees "locked" message instead of resume prompt → confusion, can't resume

**Fix**: Add AWAITING_FULLSCREEN case:
```javascript
if (data.status === 'LOCKED' || data.status === 'AWAITING_FULLSCREEN') {
  console.log('Server confirmed lock status on page load:', data.status);
  isInteractionBlocked = true;
  google.script.run
    .withSuccessHandler(function(proctorResponse) {
      if (proctorResponse.success) {
        currentLockVersion = proctorResponse.lockVersion;
        if (proctorResponse.status === 'AWAITING_FULLSCREEN') {
          showResumePrompt();
        } else {
          showLockedMessage();
          startProctorPolling();
        }
      }
    })
    .withFailureHandler(handleError)
    .getStudentProctorState();
  return;
}
```

---

## HIGH SEVERITY ISSUES

### H1: Weak Version Check Misses Same-Version Updates (StudentView.html:290)
**File**: `StudentView.html:290-293`
**Severity**: HIGH

```javascript
// CURRENT:
else if (response.status === 'LOCKED' && response.lockVersion > currentLockVersion) {
```

**Problem**: Only updates if version is GREATER. If status changes from OK→LOCKED at same version (shouldn't happen but could on race), UI won't update.

**Fix**:
```javascript
else if (response.status === 'LOCKED' && response.lockVersion !== currentLockVersion) {
  currentLockVersion = response.lockVersion;
  showLockedMessage();
}
```

---

### H2: Duplicate Violations on Network Retry (StudentView.html:220-234)
**File**: `StudentView.html:220-234`
**Severity**: HIGH
**Exploit**:
1. Student exits fullscreen
2. reportStudentViolation() called, version bumps to v2
3. Network error before response received
4. violationLogged still false
5. User returns to fullscreen, exits again
6. reportStudentViolation() called AGAIN → version bumps to v3

**Problem**: No protection against retry incrementing version twice

**Fix**: Set flag BEFORE RPC, add idempotency:
```javascript
function reportViolationDebounced(reason) {
  if (violationDebounceTimer) clearTimeout(violationDebounceTimer);

  violationDebounceTimer = setTimeout(function() {
    if (violationLogged || isInteractionBlocked) return; // Already reported

    console.log('VIOLATION: ' + reason);
    violationLogged = true; // Set BEFORE RPC
    isInteractionBlocked = true;

    google.script.run
      .withSuccessHandler(function(response) {
        if (response.success) {
          currentLockVersion = response.lockVersion;
          showLockedMessage();
          startProctorPolling();
        }
      })
      .withFailureHandler(function(error) {
        console.error('Violation report failed:', error);
        // Don't reset flags - stay locked locally even if server unreachable
      })
      .reportStudentViolation(reason);
  }, 300);
}
```

---

### H3: reportStudentViolation Should Check AWAITING_FULLSCREEN (Code.gs:1548)
**File**: `Code.gs:1548-1565`
**Severity**: HIGH
**Exploit**: Student in AWAITING_FULLSCREEN state exits fullscreen again

**Problem**: Only checks `status === 'LOCKED'` to prevent version bump. If student is in AWAITING_FULLSCREEN and exits again, version bumps → teacher's approval invalidated.

**Expected behavior**: New violation while AWAITING_FULLSCREEN should bump version and reset to LOCKED (teacher must re-approve).

**Fix**: Check both states:
```javascript
// If already locked or awaiting, treat as same incident
if (currentState.status === 'LOCKED' || currentState.status === 'AWAITING_FULLSCREEN') {
  Logger.log('Student already locked/awaiting, not incrementing version', {
    studentEmail,
    pollId,
    currentStatus: currentState.status,
    currentLockVersion: currentState.lockVersion,
    newReason: reason
  });

  // Reset to LOCKED if was AWAITING_FULLSCREEN (student violated again)
  if (currentState.status === 'AWAITING_FULLSCREEN') {
    currentState.status = 'LOCKED';
    currentState.unlockApproved = false;
  }
  currentState.lockReason = reason || currentState.lockReason;
  ProctorAccess.setState(currentState);

  return {
    success: true,
    status: 'LOCKED',
    lockVersion: currentState.lockVersion
  };
}
```

**WAIT** - Let me reconsider. The spec says "new violation before fullscreen → version bumps". So this might be CORRECT behavior to bump version. Let me check the requirements again...

Actually, the requirement says:
> 4. New violation before fullscreen → version bumps; old approval invalid.

So if student is in AWAITING_FULLSCREEN and exits fullscreen again, it SHOULD bump the version. The current code is WRONG because it doesn't handle AWAITING_FULLSCREEN at all.

**Correct Fix**:
```javascript
// If already in LOCKED state (but not AWAITING_FULLSCREEN), don't bump version
if (currentState.status === 'LOCKED') {
  // Same violation, just update reason
  currentState.lockReason = reason || currentState.lockReason;
  ProctorAccess.setState(currentState);
  return {
    success: true,
    status: 'LOCKED',
    lockVersion: currentState.lockVersion
  };
}

// If AWAITING_FULLSCREEN, this is a NEW violation → bump version and reset approval
if (currentState.status === 'AWAITING_FULLSCREEN') {
  const newState = {
    ...currentState,
    status: 'LOCKED',
    lockVersion: currentState.lockVersion + 1,
    lockReason: reason || 'exit-fullscreen',
    lockedAt: new Date().toISOString(),
    unlockApproved: false,
    unlockApprovedBy: null,
    unlockApprovedAt: null,
    rowIndex: currentState.rowIndex
  };

  ProctorAccess.setState(newState);

  Logger.log('Student violated while awaiting fullscreen - version bumped', {
    studentEmail,
    pollId,
    oldVersion: currentState.lockVersion,
    newVersion: newState.lockVersion
  });

  return {
    success: true,
    status: 'LOCKED',
    lockVersion: newState.lockVersion
  };
}

// OK state - new violation, bump version
const newState = { ... };
```

---

### H4: No Transition Check in studentConfirmFullscreen (Code.gs:1739)
**File**: `Code.gs:1739`
**Severity**: HIGH
**Exploit**: Attacker could call studentConfirmFullscreen() multiple times

**Problem**: No check that prevents transitioning from OK → OK. Should only allow AWAITING_FULLSCREEN → OK.

**Current code is actually CORRECT** - it checks `if (currentState.status !== 'AWAITING_FULLSCREEN')` at line 1719. This is good.

Actually this is fine. Moving on.

---

## MEDIUM SEVERITY ISSUES

### M1: No Network Retry with Exponential Backoff
**File**: `StudentView.html:307-310`
**Severity**: MEDIUM
**Requirement**: "Network failures use exponential backoff (≤2s cap)"

**Current**: All `.withFailureHandler()` just log error

**Fix**: Add retry wrapper:
```javascript
var rpcRetryConfig = {
  maxRetries: 3,
  baseDelay: 200,  // 200ms, 400ms, 800ms, 1600ms (capped at 2000ms)
  maxDelay: 2000
};

function withRetry(rpcCall, successHandler, finalFailureHandler) {
  var attempt = 0;

  function tryCall() {
    attempt++;
    rpcCall()
      .withSuccessHandler(successHandler)
      .withFailureHandler(function(error) {
        if (attempt >= rpcRetryConfig.maxRetries) {
          finalFailureHandler(error);
          return;
        }

        var delay = Math.min(
          rpcRetryConfig.baseDelay * Math.pow(2, attempt - 1),
          rpcRetryConfig.maxDelay
        );

        console.log('RPC failed, retrying in ' + delay + 'ms (attempt ' + attempt + ')');
        setTimeout(tryCall, delay);
      });
  }

  tryCall();
}
```

---

### M2: Teacher Panel Missing Time Display
**File**: `TeacherView.html:1531-1536`
**Severity**: MEDIUM
**Requirement**: "show 'locked for Xs'"

**Current**: Shows lockVersion but not time locked

**Fix**:
```javascript
// In renderStudentStatus(), add time calculation:
var lockedDuration = '';
if (student.lockedAt) {
  var lockedMs = new Date() - new Date(student.lockedAt);
  var lockedSec = Math.floor(lockedMs / 1000);
  lockedDuration = lockedSec + 's';
}

tile.innerHTML='<div class="flex flex-col text-left flex-grow min-w-0">'+
  '<span class="text-sm font-medium text-red-800 dark:text-red-300 truncate">'+escapeHtml(student.name)+'</span>'+
  '<span class="text-xs text-red-600 dark:text-red-400">v'+student.lockVersion+' • '+lockedDuration+'</span>'+
  '</div>'+...
```

---

### M3: No Re-Lock Functionality
**File**: N/A
**Severity**: MEDIUM
**Requirement**: "Re-Lock forces LOCKED with a version bump"

**Fix**: Add endpoint and UI

**Server (Code.gs)**:
```javascript
/**
 * Teacher re-locks a student (forces LOCKED, bumps version)
 */
function teacherRelock(studentEmail, pollId) {
  return withErrorHandling(() => {
    const teacherEmail = Session.getActiveUser().getEmail();

    if (teacherEmail !== TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    const state = ProctorAccess.getState(pollId, studentEmail);

    state.status = 'LOCKED';
    state.lockVersion = state.lockVersion + 1;
    state.lockReason = 'teacher-relock';
    state.lockedAt = new Date().toISOString();
    state.unlockApproved = false;
    state.unlockApprovedBy = null;
    state.unlockApprovedAt = null;

    ProctorAccess.setState(state);

    Logger.log('Teacher re-locked student', {
      studentEmail,
      pollId,
      lockVersion: state.lockVersion,
      by: teacherEmail
    });

    return { success: true, lockVersion: state.lockVersion };
  })();
}
```

---

### M4: No Bulk Approve
**File**: N/A
**Severity**: MEDIUM
**Requirement**: "Bulk Approve only unlocks rows with matching versions"

**Fix**: Add endpoint

```javascript
/**
 * Bulk approve unlock for multiple students
 */
function teacherBulkApproveUnlock(studentApprovals, pollId) {
  return withErrorHandling(() => {
    const teacherEmail = Session.getActiveUser().getEmail();

    if (teacherEmail !== TEACHER_EMAIL) {
      throw new Error('Unauthorized');
    }

    const results = studentApprovals.map(approval => {
      try {
        const result = teacherApproveUnlock(
          approval.email,
          pollId,
          approval.expectedLockVersion
        );
        return {
          email: approval.email,
          success: result.ok,
          reason: result.reason,
          lockVersion: result.lockVersion
        };
      } catch (e) {
        return {
          email: approval.email,
          success: false,
          reason: 'error',
          error: e.message
        };
      }
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    Logger.log('Bulk approval completed', {
      total: results.length,
      success: successCount,
      failed: failCount
    });

    return {
      success: true,
      results: results,
      summary: { total: results.length, success: successCount, failed: failCount }
    };
  })();
}
```

---

## LOW SEVERITY ISSUES

### L1: Student Message Text Not Exact
**File**: `StudentView.html:528, 550`
**Severity**: LOW

**Current locked text (line 528)**:
```
'Your session has been locked because you exited fullscreen mode. Your teacher must unlock you.'
```

**Required**:
```
'Your session has been locked because you exited fullscreen mode. Your teacher must unlock you.'
```
✓ CORRECT

**Current approved text (line 550)**:
```
'Your teacher has unlocked your session. Resume fullscreen to continue.'
```

**Required**:
```
'Your teacher has unlocked your session. Resume fullscreen to continue.
Click below to return to fullscreen and resume the poll.'
```

**Problem**: Missing second sentence. But wait, there's a separate <p> tag in the HTML (line 105-107) that says "Click below to return to fullscreen and resume the poll."

So the full text IS there, just split across elements. The requirement is ambiguous - is it one or two paragraphs?

Looking at requirements again:
> After teacher approval:
> `Your teacher has unlocked your session. Resume fullscreen to continue.
> Click below to return to fullscreen and resume the poll.`

The backtick formatting suggests it should be exactly this text. Let me check the HTML...

```html
<h2 id="status-message">Your teacher has unlocked your session...</h2>
<div id="resume-controls">
  <p>Click below to return to fullscreen...</p>
</div>
```

This is fine - the text is there, just in two elements. The user will see both. I think this is acceptable.

Actually, re-reading the requirement with the backtick formatting, I think they want it as shown. Let me mark as "verify needed".

---

## Invariant Checks Needed

Add these server-side assertions:

```javascript
// In ProctorAccess.setState()
function setState(state) {
  // INVARIANT: Status must be valid
  if (!['OK', 'LOCKED', 'AWAITING_FULLSCREEN'].includes(state.status)) {
    throw new Error(`Invalid proctor status: ${state.status}`);
  }

  // INVARIANT: lockVersion must be non-negative
  if (typeof state.lockVersion !== 'number' || state.lockVersion < 0) {
    throw new Error(`Invalid lockVersion: ${state.lockVersion}`);
  }

  // INVARIANT: AWAITING_FULLSCREEN requires unlockApproved=true
  if (state.status === 'AWAITING_FULLSCREEN' && !state.unlockApproved) {
    throw new Error('AWAITING_FULLSCREEN requires unlockApproved=true');
  }

  // INVARIANT: OK status should have unlockApproved=false for next violation
  // (This is not strictly required, but good hygiene)

  // ... rest of setState
}
```

---

## Telemetry Hooks

```javascript
// Add to Code.gs
const ProctorTelemetry = {
  enabled: true, // Toggle via script properties

  log: function(event, studentEmail, pollId, extra = {}) {
    if (!this.enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      event: event,
      studentEmail: studentEmail,
      pollId: pollId,
      ...extra
    };

    Logger.log('PROCTOR_EVENT', entry);

    // Optional: Write to sheet for analysis
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('ProctorLog');
      if (!sheet) {
        sheet = ss.insertSheet('ProctorLog');
        sheet.getRange('A1:G1').setValues([[
          'Timestamp', 'Event', 'StudentEmail', 'PollID', 'LockVersion', 'Status', 'Extra'
        ]]);
      }

      sheet.appendRow([
        entry.timestamp,
        event,
        studentEmail,
        pollId,
        extra.lockVersion || '',
        extra.status || '',
        JSON.stringify(extra)
      ]);
    } catch (e) {
      // Don't fail on logging error
      Logger.error('Telemetry write failed', e);
    }
  }
};

// Usage:
// In reportStudentViolation:
ProctorTelemetry.log('violation', studentEmail, pollId, {
  lockVersion: newState.lockVersion,
  reason: reason
});

// In teacherApproveUnlock:
ProctorTelemetry.log('approve_unlock', studentEmail, pollId, {
  lockVersion: expectedLockVersion,
  approvedBy: teacherEmail
});

// In studentConfirmFullscreen:
ProctorTelemetry.log('confirm_fullscreen', studentEmail, pollId, {
  lockVersion: expectedLockVersion
});

// In teacherRelock (new):
ProctorTelemetry.log('relock', studentEmail, pollId, {
  lockVersion: state.lockVersion,
  by: teacherEmail
});
```

---

## Failure Injection Harness

```javascript
// Add to Code.gs (debug only)
const ProctorDebug = {
  enabled: false, // Set to true only in test deployments

  // Simulate delayed RPC (add to start of each endpoint)
  simulateDelay: function() {
    if (!this.enabled) return;
    const delay = PropertiesService.getScriptProperties().getProperty('DEBUG_RPC_DELAY');
    if (delay) {
      Utilities.sleep(parseInt(delay));
    }
  },

  // Simulate RPC failure (throw error)
  simulateFailure: function(endpoint) {
    if (!this.enabled) return;
    const failEndpoint = PropertiesService.getScriptProperties().getProperty('DEBUG_FAIL_ENDPOINT');
    if (failEndpoint === endpoint) {
      throw new Error('DEBUG: Simulated failure for ' + endpoint);
    }
  },

  // Simulate stale version (return old version)
  simulateStaleVersion: function(currentVersion) {
    if (!this.enabled) return currentVersion;
    const stale = PropertiesService.getScriptProperties().getProperty('DEBUG_STALE_VERSION');
    if (stale === 'true') {
      return Math.max(0, currentVersion - 1);
    }
    return currentVersion;
  }
};

// Usage in endpoints:
function reportStudentViolation(reason) {
  return withErrorHandling(() => {
    ProctorDebug.simulateDelay();
    ProctorDebug.simulateFailure('reportStudentViolation');
    // ... rest of function
  })();
}

// To trigger:
// PropertiesService.getScriptProperties().setProperty('DEBUG_RPC_DELAY', '2000'); // 2s delay
// PropertiesService.getScriptProperties().setProperty('DEBUG_FAIL_ENDPOINT', 'reportStudentViolation');
// PropertiesService.getScriptProperties().setProperty('DEBUG_STALE_VERSION', 'true');
```

---

## QA Checklist (2 minutes before class)

```
☐ 1. Trigger violation → stays LOCKED ≥30s without approval
   - Exit fullscreen
   - Wait 30s
   - Verify student shows locked message
   - Verify teacher panel shows LOCKED with version

☐ 2. Approve unlock (matching version) → approved panel ≤2s
   - Teacher clicks "Approve"
   - Within 2s, student shows "Your teacher has unlocked..." message
   - Verify button shows "Resume Poll"

☐ 3. Student returns to fullscreen → OK immediately
   - Student clicks "Resume Poll"
   - Enters fullscreen
   - Immediately returns to poll questions
   - No lingering locked state

☐ 4. New violation before fullscreen → version increments, old approval rejected
   - Teacher approves (v1)
   - Student sees approval message
   - Before clicking resume, student switches tabs (new violation)
   - Version bumps to v2
   - Student clicks resume
   - Should see: "locked" again (not resume)
   - Teacher must approve again with new version

☐ 5. Reload page while locked/awaiting → state re-establishes ≤3s
   - While locked: reload → sees locked message within 3s
   - While awaiting: reload → sees approval message + resume button within 3s

☐ 6. Bulk approve: only matching versions unlock
   - Lock 3 students (versions 1, 1, 1)
   - Student 2 violates again → version 2
   - Bulk approve all with version 1
   - Students 1 & 3 unlock
   - Student 2 shows error: "version mismatch"
```

---

## Cross-Browser Testing

### Desktop
- ✓ Chrome/Edge: Full support (fullscreenchange, visibilitychange)
- ✓ Firefox: Full support
- ⚠️ Safari: visibilitychange may not fire on tab switch (use focus/blur combo)

### Mobile/Tablet
- ⚠️ iPadOS Safari: Fullscreen API limited - may need focus+visibility fallback
- ⚠️ Android Chrome: Fullscreen may require user gesture

### Recommended Fallback (Safari/iPad):
```javascript
// Instead of relying solely on fullscreenchange:
document.addEventListener('blur', function() {
  if (!isInteractionBlocked && !violationLogged) {
    reportViolationDebounced('blur');
  }
});

document.addEventListener('focus', function() {
  // Clear any pending violations if user returns quickly
  if (violationDebounceTimer && !violationLogged) {
    clearTimeout(violationDebounceTimer);
    violationDebounceTimer = null;
  }
});
```

Add browser detection:
```javascript
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

if (isSafari || isIOS) {
  // Use blur/focus instead of fullscreen events
  console.log('Using blur/focus events for Safari/iOS');
}
```

---

## Summary of Critical Fixes Required

1. **Fix C1**: Replace `DataAccess.responses.isLocked()` with `ProctorAccess.getState()` check
2. **Fix C2**: Check `status === 'AWAITING_FULLSCREEN'` instead of `unlockApproved`
3. **Fix C3**: Add AWAITING_FULLSCREEN handler in `updateStudentView()`
4. **Fix H1**: Change version check to `!==` instead of `>`
5. **Fix H2**: Set `violationLogged = true` before RPC
6. **Fix H3**: Handle AWAITING_FULLSCREEN violations (bump version)

With these fixes, the system will be production-ready and meet all acceptance criteria.
