# Manual Test Scripts for Veritas Live Poll Fixes

## Test Date: 2025-12-17
## Fixes Tested:
1. Auto-unlock bug fix (Poison Pill)
2. Teacher Firebase initialization
3. Student identity deduplication
4. Email sending functionality
5. Calculator button

---

## TEST 1: Teacher RTDB Initialization

### Objective
Verify Firebase initializes correctly on teacher dashboard load, showing `firebase.apps.length === 1`

### Steps
1. Open the Teacher Dashboard
2. Open browser DevTools Console (F12 → Console tab)
3. Look for these log messages:
   ```
   [Firebase] App initialized eagerly at page load
   [Firebase] databaseURL: https://classroomproctor-default-rtdb.firebaseio.com
   [Firebase] apps.length: 1
   ```

### Expected Results
- `firebase.apps.length === 1` (not 0)
- `FIREBASE_CONFIG.databaseURL` is correct
- No error messages about SDK not loaded

### Console Verification Command
```javascript
// Run in browser console on Teacher page
console.log('Firebase apps:', firebase.apps.length);
console.log('FIREBASE_CONFIG:', window.FIREBASE_CONFIG);
console.log('firebase defined:', typeof firebase !== 'undefined');
```

### Pass Criteria
- [ ] Console shows `[Firebase] App initialized eagerly at page load`
- [ ] `firebase.apps.length === 1`
- [ ] No Firebase SDK errors

---

## TEST 2: Student Join (No Duplicates)

### Objective
Verify a single student appears only once on teacher dashboard, even with multiple refreshes

### Steps
1. Start a secure assessment session
2. Have student join with their token link
3. Student refreshes page 3 times
4. Check teacher dashboard student list

### Expected Results
- Student appears exactly ONCE in the student list
- No duplicate entries for the same email
- Name displays correctly (not truncated or duplicated)

### Console Verification (Teacher)
```javascript
// Run on Teacher page
console.log('Student count:', missionControlStudents.length);
var emails = missionControlStudents.map(s => s.email);
var uniqueEmails = [...new Set(emails)];
console.log('Unique emails:', uniqueEmails.length);
console.log('Duplicates exist:', emails.length !== uniqueEmails.length);
```

### Pass Criteria
- [ ] Student list shows one entry per student
- [ ] `emails.length === uniqueEmails.length`
- [ ] RTDB node shows single student key per email

---

## TEST 3: Student Violation → LOCKED (Teacher Sees Reason)

### Objective
Verify that when student violates (exits fullscreen), they're locked and teacher sees the reason

### Steps
1. Start a secure assessment session
2. Student joins and enters fullscreen
3. Student presses ESC or clicks outside to exit fullscreen
4. Check student console for lock messages
5. Check teacher dashboard for violation reason

### Expected Student Console Messages
```
[Proctor] Violation detected: exit-fullscreen - IMMEDIATE LOCK
[Proctor] Violation reported, server response: {lockVersion: 1, success: true, status: 'LOCKED'}
```

### Expected Teacher Dashboard
- Student status changes to "LOCKED"
- Violation reason is visible (e.g., "exit-fullscreen")
- Lock timestamp is shown

### RTDB Paths to Check
```javascript
// In browser console, verify these paths have data:
// /sessions/<pollId>/students/<studentKey> = 'LOCKED'
// /sessions/<pollId>/violations/<studentKey> = {reason: 'exit-fullscreen', timestamp: ...}
```

### Pass Criteria
- [ ] Student sees lock UI immediately
- [ ] Teacher sees LOCKED status within 3 seconds
- [ ] Violation reason is visible to teacher
- [ ] RTDB shows correct status and violation nodes

---

## TEST 4: Student Stays LOCKED Across Refresh (NO Auto-Unlock)

### Objective
Verify that locked students remain locked after page refresh, without automatic unlock

### Steps
1. Student gets locked (see Test 3)
2. Student refreshes the page
3. Wait 30 seconds
4. Check if student is still locked

### Expected Student Console Messages
```
[Proctor] POISON PILL ACTIVE - Restoring lock state from sessionStorage
// OR
[Proctor] Status is OK but Poison Pill still active - keeping lock (waiting for unlock_granted)
```

### CRITICAL: Should NOT see
```
[Proctor] Server granted unlock - clearing Poison Pill
// This message should ONLY appear after explicit teacher unlock
```

### Pass Criteria
- [ ] Student sees lock screen after refresh
- [ ] NO "Server granted unlock" message without teacher action
- [ ] `sessionStorage.getItem('veritas_lock_active') === 'true'`
- [ ] Student cannot access questions while locked

### Console Verification (Student)
```javascript
// Run on Student page while locked
console.log('Lock active:', sessionStorage.getItem('veritas_lock_active'));
console.log('Poison pill:', sessionStorage.getItem('veritas_lock_active') === 'true');
console.log('Local storage lock:', localStorage.getItem('veritas_lock_active'));
```

---

## TEST 5: Teacher Unlock (Only Then Unlocks)

### Objective
Verify that locked students can ONLY be unlocked by explicit teacher action

### Steps
1. Student is locked (from Test 3)
2. Teacher clicks "Approve Unlock" button
3. Student sees "Re-enter Fullscreen" prompt
4. Student clicks button and enters fullscreen
5. Verify student is unlocked

### Expected Flow
1. **Teacher clicks unlock** → Status changes to "AWAITING_FULLSCREEN"
2. **Student sees prompt** → "Re-enter Fullscreen" button appears
3. **Student enters fullscreen** → Calls `studentConfirmFullscreen()`
4. **Server responds** → `{ success: true, status: 'OK', unlock_granted: true }`
5. **Antidote runs** → `[Proctor] Server EXPLICITLY granted unlock (unlock_granted=true) - clearing Poison Pill`

### Expected Student Console Messages (in order)
```
[Proctor] Status is AWAITING_FULLSCREEN - showing resume prompt
// User clicks re-enter fullscreen
[Proctor] Server confirmed unlock via fullscreen confirmation - clearing Poison Pill
// OR
[Proctor] Server EXPLICITLY granted unlock (unlock_granted=true) - clearing Poison Pill
```

### Pass Criteria
- [ ] Teacher unlock button works
- [ ] Student sees "Re-enter Fullscreen" prompt
- [ ] Student can resume session after entering fullscreen
- [ ] `sessionStorage.getItem('veritas_lock_active')` is cleared
- [ ] Student can access questions again

---

## TEST 6: Email Sending

### Objective
Verify emails send correctly with proper terminology and accurate result reporting

### Steps
1. Create a Live Poll session for a class with 2+ students
2. Click "Send Links" button
3. Check returned result object
4. Check email inbox of test students

### Expected Behavior
- For Live Polls: Email subject is "Live Poll: [Poll Name]"
- For Secure Assessments: Email subject is "Secure Assessment: [Poll Name]"
- Body uses "live poll" or "secure assessment" terminology correctly

### Expected Result Object
```javascript
{
  success: true,  // or false if any failed
  status: 'SENT', // or 'PARTIAL' or 'FAILED'
  sentCount: 2,   // actual number sent
  failedCount: 0, // actual number failed
  failures: []    // array of failures with reasons
}
```

### Email Body Check
- **Live Poll**: "Please click the link below to join the live poll"
- **Secure Assessment**: "Here is your unique link for the secure assessment"

### Pass Criteria
- [ ] Email sends successfully
- [ ] `sentCount` matches actual recipients
- [ ] `failedCount` is accurate
- [ ] UI shows success/failure correctly (not success when failed)
- [ ] Email terminology is correct

---

## TEST 7: Calculator Button

### Objective
Verify calculator toggle works during secure assessment sessions

### Steps
1. Start a Secure Assessment session
2. Check calculator button state in header
3. Click calculator toggle button
4. Verify state changes and persists
5. Check student view reflects change

### Expected Behavior
1. Calculator button is visible during secure sessions
2. Clicking toggles the state (on/off)
3. Toast notification shows state change
4. State persists across page refresh
5. Student sees calculator enabled/disabled accordingly

### Console Verification (Teacher)
```javascript
// Run before and after toggle
console.log('Calculator enabled:', liveCalculatorEnabled);
console.log('CURRENT_POLL_DATA.calculatorEnabled:', CURRENT_POLL_DATA.calculatorEnabled);
```

### Pass Criteria
- [ ] Button is clickable during secure session
- [ ] State changes visually (button color/icon)
- [ ] Toast notification appears
- [ ] State persists in metadata
- [ ] Student calculator visibility syncs

---

## RTDB Path Reference

### Paths Used
| Path | Written By | Purpose |
|------|------------|---------|
| `/sessions/<pollId>/students/<studentKey>` | Student | Status: 'ACTIVE', 'LOCKED', 'DISCONNECTED' |
| `/sessions/<pollId>/violations/<studentKey>` | Student | Violation details: {reason, timestamp} |
| `/sessions/<pollId>/studentInfo/<studentKey>` | Student | Student info: {email, name, lastSeen} |
| `/.info/connected` | Firebase | Connection state |

### Student Key Generation
```javascript
// Deterministic key from email + pollId (SHA-256, first 16 chars)
const key = await window.VeritasShared.generateStudentKey(email, pollId);
```

---

## Quick Debug Commands

### Teacher Console
```javascript
// Check Firebase state
console.log('Firebase apps:', firebase.apps.length);
console.log('Firebase DB:', firebaseDb);
console.log('Subscribed path:', actualSubscribedPath);
console.log('Realtime connected:', realtimeConnected);
console.log('Current poll:', CURRENT_POLL_DATA.pollId);

// Check student data
console.log('Student count:', missionControlStudents.length);
console.log('Realtime statuses:', realtimeStatuses);
```

### Student Console
```javascript
// Check lock state
console.log('Lock active:', sessionStorage.getItem('veritas_lock_active'));
console.log('Lock reason:', sessionStorage.getItem('lock_reason'));
console.log('Local lock:', localStorage.getItem('veritas_lock_active'));

// Check Firebase
console.log('Firebase apps:', firebase.apps.length);
console.log('Student key:', studentKey);
console.log('Current status:', currentStatus);
```

---

## Summary of Changes

### File Changes Made

1. **Model_Session.gs:2225-2244** - Removed auto-unlock by not setting `unlock_granted` in `getStudentProctorState`

2. **Student_Scripts.html:2730-2768** - Changed unlock condition to ONLY respond to `unlock_granted === true`, not `status === 'OK'`

3. **Teacher_Scripts.html:10517-10546** - Added eager Firebase initialization at page load

4. **Teacher_Scripts.html:5972-5993** - Fixed calculator toggle by updating `pollSessionType` from server data

5. **Teacher_API.gs:1267-1332** - Updated email terminology to use "live poll" and "secure assessment"

6. **Data_Access.gs:277-311** - Added email deduplication in roster retrieval
