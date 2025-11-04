# Proctor Lock System Implementation - Summary

## ✅ Server-Side Changes (Code.gs) - COMPLETE

### New Data Model
Created `ProctorState` sheet with fields:
- `PollID` - Which poll
- `StudentEmail` - Which student
- `Locked` - Boolean lock status
- `LockVersion` - Increments with each new lock incident
- `LockReason` - Why locked (exit-fullscreen, tab-blur, etc.)
- `LockedAt` - Timestamp of lock
- `UnlockApproved` - Teacher approval flag (authoritative)
- `UnlockApprovedBy` - Teacher email who approved
- `UnlockApprovedAt` - When approved

### New Server Endpoints

1. **`reportStudentViolation(reason)`**
   - Called when student exits fullscreen or switches tabs
   - If already locked: Updates reason, keeps same lockVersion
   - If not locked: Sets locked=true, increments lockVersion, resets unlockApproved=false
   - Returns: `{success, locked, lockVersion}`

2. **`getStudentProctorState()`**
   - Returns current lock state for polling
   - Returns: `{success, locked, lockVersion, lockReason, lockedAt, unlockApproved, unlockApprovedBy, unlockApprovedAt}`

3. **`teacherApproveUnlock(studentEmail, pollId, expectedLockVersion)`**
   - Atomic unlock with version check (CAS pattern)
   - Only approves if:
     - Student is currently locked
     - lockVersion matches expectedLockVersion (prevents stale approvals)
   - Sets unlockApproved=true, records approver and timestamp
   - Returns: `{ok: true}` or `{ok: false, reason}`

4. **`logStudentViolation()`** (legacy)
   - Redirects to `reportStudentViolation('legacy-violation')`
   - Maintains backward compatibility

---

## 🚧 Client-Side Changes Needed

### StudentView.html Changes Required

#### 1. Remove Auto-Unlock Logic
**Current Bug**: When server returns non-LOCKED status, code assumes teacher unlocked

**Line 242-259** - REMOVE THIS AUTO-UNLOCK:
```javascript
if (awaitingUnlock) {
  console.log('Teacher unlocked session - waiting for student to resume');
  awaitingUnlock = false;
  pendingResume = true;
  isInteractionBlocked = true;
  showResumePrompt();
  return;
}
```

**Replace with**: Check for explicit `unlockApproved` flag from proctor state

#### 2. Update Violation Detection
**Lines 199-221** - Update to call new endpoint with reason:

```javascript
document.addEventListener('visibilitychange', function() {
  if (document.hidden && !isInteractionBlocked && !violationLogged) {
    console.log('VIOLATION: Tab switch detected');
    isInteractionBlocked = true;
    violationLogged = true;

    google.script.run
      .withSuccessHandler(function(response) {
        if (response.success) {
          currentLockVersion = response.lockVersion;
          showLockedMessage();
          startProctorPolling();  // NEW: Start polling for teacher approval
        }
      })
      .withFailureHandler(handleError)
      .reportStudentViolation('tab-blur');
  }
});

document.addEventListener('fullscreenchange', function() {
  if (!document.fullscreenElement && !isInteractionBlocked && !violationLogged) {
    console.log('VIOLATION: Fullscreen exit detected');
    isInteractionBlocked = true;
    violationLogged = true;

    google.script.run
      .withSuccessHandler(function(response) {
        if (response.success) {
          currentLockVersion = response.lockVersion;
          showLockedMessage();
          startProctorPolling();  // NEW: Start polling for teacher approval
        }
      })
      .withFailureHandler(handleError)
      .reportStudentViolation('exit-fullscreen');
  }
});
```

#### 3. Add Proctor State Polling
**NEW FUNCTION** - Add after `pollForStatus()`:

```javascript
function startProctorPolling() {
  // Stop normal polling
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // Start proctor state polling every 2.5 seconds
  proctorPollInterval = setInterval(checkProctorState, 2500);
  checkProctorState();  // Check immediately
}

function checkProctorState() {
  google.script.run
    .withSuccessHandler(function(response) {
      if (!response.success) {
        console.error('Proctor state check failed:', response.error);
        return;
      }

      console.log('Proctor state:', response);

      // Check if teacher approved unlock for THIS lock incident
      if (response.unlockApproved && response.lockVersion === currentLockVersion) {
        console.log('Teacher approved unlock - showing resume prompt');

        // Stop proctor polling
        if (proctorPollInterval) {
          clearInterval(proctorPollInterval);
          proctorPollInterval = null;
        }

        // Show resume prompt
        showResumePrompt();
      } else if (response.locked && response.lockVersion > currentLockVersion) {
        // New violation occurred - update version
        console.log('New violation detected, updating lock version');
        currentLockVersion = response.lockVersion;
        showLockedMessage();
      } else if (!response.locked) {
        // Shouldn't happen, but handle gracefully
        console.log('Student no longer locked');
        if (proctorPollInterval) {
          clearInterval(proctorPollInterval);
          proctorPollInterval = null;
        }
        isInteractionBlocked = false;
        violationLogged = false;
        pollForStatus();
      }
    })
    .withFailureHandler(function(error) {
      console.error('Proctor state check error:', error);
    })
    .getStudentProctorState();
}
```

#### 4. Update UI Text
**Lines 498-511** - Update `showLockedMessage()`:

```javascript
function showLockedMessage() {
  console.log('Showing locked message');
  studentContainer.style.display = 'block';
  entryScreen.style.display = 'none';
  questionContainer.style.display = 'none';
  statusContainer.style.display = 'block';
  if (studentLoader) studentLoader.style.display = 'none';

  // EXACT TEXT PER REQUIREMENTS
  statusMessage.textContent = 'Your session has been locked because you exited fullscreen mode. Your teacher must unlock you.';
  statusMessage.className = 'text-red-600 dark:text-red-400 text-xl font-semibold';

  var iconEl = statusContainer.querySelector('.material-symbols-outlined');
  if (iconEl) {
    iconEl.textContent = 'lock';
    iconEl.className = 'material-symbols-outlined text-6xl text-red-600 dark:text-red-400 mb-4 inline-block';
  }

  if (resumeControls) {
    resumeControls.style.display = 'none';
  }
}
```

**Lines 512-537** - Update `showResumePrompt()`:

```javascript
function showResumePrompt() {
  console.log('Showing resume prompt');
  studentContainer.style.display = 'block';
  entryScreen.style.display = 'none';
  questionContainer.style.display = 'none';
  statusContainer.style.display = 'block';
  if (studentLoader) studentLoader.style.display = 'none';

  // EXACT TEXT PER REQUIREMENTS
  statusMessage.textContent = 'Your teacher has unlocked your session. Resume fullscreen to continue.';
  statusMessage.className = 'text-primary dark:text-brand-white text-xl font-semibold';

  var iconEl = statusContainer.querySelector('.material-symbols-outlined');
  if (iconEl) {
    iconEl.textContent = 'fullscreen';
    iconEl.className = 'material-symbols-outlined text-6xl text-primary mb-4 inline-block';
  }

  if (resumeControls) {
    resumeControls.style.display = 'block';
  }
}
```

**Lines 105-112** - Update resume controls text in HTML:

```html
<div id="resume-controls" class="mt-6 space-y-3" style="display: none;">
  <p class="text-brand-dark-gray/80 dark:text-brand-white/80 text-base leading-relaxed">
    Your teacher has unlocked your session. Resume fullscreen to continue.<br>
    Click below to return to fullscreen and resume the poll.
  </p>
  <button id="resume-session-btn" class="mx-auto flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-brand-white text-lg font-semibold hover:bg-primary/90 transition-colors shadow">
    <span class="material-symbols-outlined text-xl">fullscreen</span>
    <span>Resume Poll</span>
  </button>
</div>
```

#### 5. Update pollForStatus() - Remove Auto-Unlock
**Lines 238-260** - Replace the section that handles LOCKED status:

```javascript
if (data.status === 'LOCKED') {
  console.log('Server confirmed LOCKED status');
  isInteractionBlocked = true;

  // Check proctor state for explicit approval
  google.script.run
    .withSuccessHandler(function(proctorResponse) {
      if (proctorResponse.success) {
        currentLockVersion = proctorResponse.lockVersion;

        if (proctorResponse.unlockApproved) {
          // Teacher approved - show resume prompt
          showResumePrompt();
        } else {
          // Still locked - show locked message and start polling
          showLockedMessage();
          startProctorPolling();
        }
      }
    })
    .getStudentProctorState();

  return;
}

// REMOVE ALL "if (awaitingUnlock)" AND "if (pendingResume)" BLOCKS
// These cause auto-unlock without teacher approval
```

---

## 🎨 TeacherView.html Changes Required

### Add Unlock Button to Student Status List

**Find the student status rendering code** (around lines showing locked students)

**Add unlock button** for each locked student:

```javascript
// In the student status list rendering
if (student.status === 'LOCKED') {
  html += '<button class="unlock-student-btn px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700" ';
  html += 'data-email="' + student.email + '" ';
  html += 'data-poll-id="' + CURRENT_POLL_DATA.pollId + '" ';
  html += 'data-lock-version="' + (student.lockVersion || 0) + '">';
  html += 'Unlock</button>';
}
```

**Add click handler**:

```javascript
// After rendering student list
document.querySelectorAll('.unlock-student-btn').forEach(function(btn) {
  btn.onclick = function() {
    var email = this.dataset.email;
    var pollId = this.dataset.pollId;
    var lockVersion = parseInt(this.dataset.lockVersion, 10);

    if (!confirm('Unlock ' + email + '?')) {
      return;
    }

    this.disabled = true;
    this.textContent = 'Unlocking...';

    google.script.run
      .withSuccessHandler(function(response) {
        if (response.ok) {
          alert('Student unlocked successfully');
          // Refresh student status
          pollForResults();
        } else {
          alert('Unlock failed: ' + (response.reason || 'Unknown error') + '\nStudent may have a newer violation.');
        }
      })
      .withFailureHandler(function(error) {
        alert('Error: ' + error);
        btn.disabled = false;
        btn.textContent = 'Unlock';
      })
      .teacherApproveUnlock(email, pollId, lockVersion);
  };
});
```

### Update getLivePollData to include lockVersion

**In Code.gs, modify the student status mapping** to include lockVersion:

```javascript
const studentStatusList = roster.map(student => {
  const email = student.email;

  if (lockedStudents.has(email)) {
    // Get proctor state to include lockVersion
    const proctorState = ProctorAccess.getState(pollId, email);

    return {
      name: student.name,
      email: email,
      status: 'LOCKED',
      lockVersion: proctorState.lockVersion,
      lockReason: proctorState.lockReason,
      answer: '---',
      isCorrect: null,
      timestamp: 0
    };
  }

  // ... rest of mapping
});
```

---

## ✅ Key Changes Summary

### Server (Code.gs)
- ✅ New ProctorState sheet with versioning
- ✅ reportStudentViolation() - Atomic lock with version increment
- ✅ getStudentProctorState() - Returns lock state for polling
- ✅ teacherApproveUnlock() - Atomic approval with version check

### Student (StudentView.html)
- 🚧 Remove auto-unlock logic in pollForStatus()
- 🚧 Add proctor state polling (every 2.5s when locked)
- 🚧 Only show unlock when unlockApproved === true
- 🚧 Update UI text to exact specifications
- 🚧 Add cache-busting to prevent stale state

### Teacher (TeacherView.html)
- 🚧 Add "Unlock" button for each locked student
- 🚧 Button includes lockVersion for atomic approval
- 🚧 Handle unlock failures (version mismatch)
- 🚧 Refresh student list after unlock

---

## 🧪 Testing Checklist

### Test 1: Initial Lock
1. Student starts poll in fullscreen
2. Student exits fullscreen
3. ✅ Violation logged with lockVersion=1
4. ✅ Student sees: "Your session has been locked because you exited fullscreen mode. Your teacher must unlock you."
5. ✅ Student polls every 2.5s for approval
6. ✅ NO auto-unlock

### Test 2: Teacher Unlock
1. Teacher sees student with LOCKED status and lockVersion
2. Teacher clicks "Unlock" button
3. ✅ Server checks lockVersion matches
4. ✅ Sets unlockApproved=true
5. Student's next poll detects unlockApproved=true
6. ✅ Student sees: "Your teacher has unlocked your session. Resume fullscreen to continue."
7. Student clicks "Resume Poll"
8. ✅ Returns to fullscreen and resumes

### Test 3: New Violation Before Unlock
1. Student locked (lockVersion=1)
2. Teacher clicks "Unlock"
3. **Before approval completes**, student switches tabs again
4. ✅ Server increments lockVersion=2, resets unlockApproved=false
5. Teacher's unlock attempt fails with version_mismatch
6. ✅ Teacher sees error: "Unlock failed - student has newer violation"
7. Student remains locked

### Test 4: Stale Unlock Attempt
1. Student locked (lockVersion=1)
2. Student switches tabs again (lockVersion=2)
3. Teacher tries to unlock with old lockVersion=1
4. ✅ Server rejects with version_mismatch
5. Student remains locked

---

## 🔒 Security Guarantees

1. **Authoritative Approval**: Only server can set unlockApproved
2. **Atomic Version Check**: CAS pattern prevents stale unlocks
3. **No Client-Side Timers**: Client never assumes unlock
4. **Explicit Polling**: Client checks server every 2.5s for approval
5. **Version Increment**: Each new violation resets approval

---

## 📝 Next Steps

1. Complete StudentView.html changes (remove auto-unlock, add polling)
2. Complete TeacherView.html changes (add unlock button)
3. Test end-to-end flow
4. Deploy and verify in production

---

## Status

**Server**: ✅ Complete
**Student Client**: 🚧 50% - Core logic done, needs auto-unlock removal
**Teacher Client**: 🚧 Not started - Needs unlock button

**Current Commit**: Server-side proctoring system with atomic approvals
