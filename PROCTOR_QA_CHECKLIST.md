# Proctoring QA Checklist - Pre-Class Test (2 minutes)

**Purpose**: Verify proctoring flow works correctly before starting a live poll with students.

**Setup**: Open poll in two browsers - one as teacher, one as test student.

---

## Test Cases (Run in Order)

### ☐ Test 1: Violation → LOCKED (stays locked ≥30s)
**Steps**:
1. Student joins poll in fullscreen
2. Student exits fullscreen (press ESC or switch tabs)
3. Verify student sees: "Your session has been locked because you exited fullscreen mode. Your teacher must unlock you."
4. Wait 30 seconds without teacher action
5. Verify student remains locked (no auto-unlock)
6. Teacher panel shows: student name, status "LOCKED", version "v1", time "30s" (or higher)

**Expected**: Student stays locked indefinitely without teacher approval.

---

### ☐ Test 2: Teacher approval → Student sees approved panel ≤2s
**Steps**:
1. (Continuing from Test 1)
2. Teacher clicks "Approve" button next to locked student
3. Verify alert: "Student approval sent. They must return to fullscreen to continue."
4. Within 2 seconds, student screen changes to show:
   - "Your teacher has unlocked your session. Resume fullscreen to continue."
   - "Click below to return to fullscreen and resume the poll."
   - Blue "Resume Poll" button visible
5. Teacher panel shows: student status changes to "AWAITING_FULLSCREEN" (blue)

**Expected**: Student sees approval message within 2 seconds, with clear instructions.

---

### ☐ Test 3: Student returns to fullscreen → OK immediately
**Steps**:
1. (Continuing from Test 2)
2. Student clicks "Resume Poll" button
3. Browser prompts for fullscreen → student allows
4. Immediately after fullscreen granted:
   - Student returns to poll questions
   - No lingering locked state
   - No error messages
5. Teacher panel shows: student status returns to normal (green "Submitted" or waiting)

**Expected**: Instant transition to OK state, no delays.

---

### ☐ Test 4: New violation before fullscreen → version bumps, old approval invalid
**Steps**:
1. Student joins poll, exits fullscreen → LOCKED v1
2. Teacher approves → student sees AWAITING_FULLSCREEN
3. **BEFORE** student clicks Resume, student switches tabs or exits fullscreen again
4. Verify:
   - Student screen immediately changes back to "locked" message (not resume)
   - Teacher panel shows: version "v2", status "LOCKED" (red)
5. Teacher tries to approve with old version → should fail or require re-approval
6. Teacher approves again (with new v2) → student can now resume

**Expected**: New violation invalidates old approval. Teacher must re-approve with new version.

---

### ☐ Test 5: Reload page while locked → state re-establishes ≤3s
**Part A: Reload while LOCKED**
1. Student exits fullscreen → LOCKED
2. Student refreshes browser (F5 or Ctrl+R)
3. Within 3 seconds:
   - Student sees locked message
   - Teacher panel still shows LOCKED

**Part B: Reload while AWAITING_FULLSCREEN**
1. Teacher approves unlock → AWAITING_FULLSCREEN
2. Student refreshes browser
3. Within 3 seconds:
   - Student sees approval message + Resume button
   - Teacher panel still shows AWAITING_FULLSCREEN

**Expected**: State persists across page reloads, no phantom unlocks.

---

### ☐ Test 6: Multiple students (if implemented)
**Steps**:
1. Lock 3 test students (open 3 tabs)
2. One student violates twice → version v2
3. If bulk approve exists:
   - Attempt to approve all with version 1
   - Two students with v1 should unlock
   - Student with v2 shows error: "Student has a newer violation"
4. If no bulk approve:
   - Approve each individually
   - Verify version mismatch error for v2 student

**Expected**: Only matching versions unlock. Stale approvals rejected.

---

## Quick Visual Checks

### Student UI (LOCKED state)
- ✓ Red lock icon
- ✓ Exact text: "Your session has been locked because you exited fullscreen mode. Your teacher must unlock you."
- ✓ No buttons visible (no auto-resume option)

### Student UI (AWAITING_FULLSCREEN state)
- ✓ Blue fullscreen icon
- ✓ Exact text: "Your teacher has unlocked your session. Resume fullscreen to continue."
- ✓ Second line: "Click below to return to fullscreen and resume the poll."
- ✓ "Resume Poll" button visible and clickable

### Teacher Panel
- ✓ LOCKED students show: red background, version number, time locked
- ✓ AWAITING_FULLSCREEN students show: blue background, "Awaiting fullscreen..." text
- ✓ "Approve" button only visible for LOCKED students
- ✓ No "Approve" button for AWAITING_FULLSCREEN students (already approved)

---

## Failure Scenarios (What to Watch For)

❌ **Auto-unlock**: Student locked but then auto-resumes without teacher action
   - **Cause**: Client-side unlock path still exists
   - **Fix**: Check for focus/fullscreen handlers that clear `isInteractionBlocked`

❌ **Stuck lock**: Teacher approves but student never sees approval message
   - **Cause**: Polling interval stopped or network error
   - **Fix**: Check browser console for RPC errors, verify `checkProctorState()` running

❌ **Double version bump**: Single violation increments version twice (v1 → v3 skipping v2)
   - **Cause**: Duplicate violation reports on network retry
   - **Fix**: Ensure `violationLogged` flag set BEFORE RPC call

❌ **Stale approval works**: Student violates twice (v2), but teacher's v1 approval still unlocks them
   - **Cause**: Version check not enforced in `teacherApproveUnlock`
   - **Fix**: Server should return `{ ok: false, reason: 'version_mismatch' }`

❌ **Student sees wrong state after reload**: Locked student reloads, sees poll questions
   - **Cause**: `getStudentPollStatus` not checking ProctorAccess state
   - **Fix**: Must check `ProctorAccess.getState()` before returning status

---

## Post-Test Verification

After passing all tests:
1. Check server logs (Apps Script logs):
   - Should see `PROCTOR_EVENT` entries for: violation, approve_unlock, confirm_fullscreen
   - No errors or exceptions
2. Check ProctorState sheet (if accessible):
   - Verify lockVersion column increments correctly
   - Verify status column shows correct states
3. Clear test data:
   - Stop poll
   - Delete test student entries from ProctorState sheet (or leave for audit)

---

## Browser Compatibility Notes

- **Chrome/Edge**: Full support, all tests should pass
- **Firefox**: Full support, all tests should pass
- **Safari (desktop)**: May require focus/blur combo instead of fullscreenchange
- **iPadOS Safari**: Fullscreen API limited, may need blur-only detection
- **Mobile Chrome**: Fullscreen requires user gesture, may not work on mobile

**Recommended**: Test on Chrome first. If deploying to iPads, test on iPadOS Safari separately.

---

## Emergency Rollback

If proctoring fails during live class:
1. Teacher can disable proctoring by stopping poll
2. Students can reload page - should auto-resume to last question
3. Manual unlock: Teacher opens Apps Script project → ProctorState sheet → delete student's row

---

## Success Criteria

✅ All 6 test cases pass
✅ No console errors in student or teacher browser
✅ State transitions happen within specified time limits (≤2s for approval, ≤3s for reload)
✅ Version mismatches properly rejected
✅ No auto-unlocks observed

**If all checks pass**: Proctoring is ready for production use.
