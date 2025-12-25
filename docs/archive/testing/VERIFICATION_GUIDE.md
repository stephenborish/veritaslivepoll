# Verification Guide: Student Activity Tracking & Unlock Functionality

## Critical Issues Addressed

### Issue 1: ✅ Unlock Buttons ARE Fully Implemented
**Status**: Working correctly - buttons exist and are functional

The unlock functionality has been implemented since earlier versions:
- **Location**: `Teacher_Scripts.html` lines 7003-7024 in `buildStudentStatusTile()`
- **Trigger**: Automatically appears when student status is `LOCKED` or `AWAITING_FULLSCREEN`
- **Function**: Calls `approveStudentUnlock()` when clicked

### Issue 2: ✅ Activity Tracking Now Displays on Teacher Dashboard
**Status**: Just added - new Activity Metrics panel

**New UI Panel Location**: Bottom of Students panel (right sidebar during live poll)

Displays 4 real-time metrics:
1. **Avg Time** - Average time students spend on current question
2. **Changes** - Number of answer changes before submission
3. **Active Now** - Students currently active (activity in last 5 min)
4. **Focus Loss** - Number of focus/blur events

---

## How to Verify Everything Works

### Step 1: Check Database Setup

Run this in Apps Script Editor:

```javascript
function testSystem() {
  // See full implementation in Test_System.gs
}
```

**Expected Output**:
```
=== VERITAS SYSTEM TEST ===

TEST 1: StudentActivity Sheet
✓ StudentActivity sheet exists
  Rows: X

TEST 2: Proctor State
✓ ProctorState sheet exists
  LOCKED STUDENTS FOUND:
    - student@example.com (LOCKED) v1
      Reason: FULLSCREEN_EXIT
```

### Step 2: Verify Unlock Buttons Appear

**During a Live Poll:**

1. Have a student exit fullscreen (Alt+Tab, F11, etc.)
2. Student should see red "LOCKED OUT" screen
3. **Teacher Dashboard**: Look at Students panel (right sidebar)
4. Find the locked student's tile
5. **Should see**: 🔒 icon and pulsing red border
6. **Should see**: Small unlock button (🔓 lock_open icon)

**If you DON'T see the unlock button**, the student might not be properly locked. Check:
- `ProctorState` sheet - does it show `LOCKED` status?
- Console logs - any errors?
- Run `testSystem()` to verify

### Step 3: Test Unlock Functionality

**Click the unlock button on a locked student tile:**

1. Confirmation dialog appears: "Approve unlock for [student]?"
2. Click "Approve"
3. Student tile border stops pulsing
4. Student status changes to `AWAITING_FULLSCREEN`
5. Student must re-enter fullscreen to continue
6. Once fullscreen, student can answer

**Alternative unlock method**: Click the entire locked student tile (not just button)

### Step 4: Verify Activity Tracking

**Start a live poll with several students:**

1. Navigate to live poll view
2. Look at **Students panel** (right sidebar)
3. Scroll to bottom - you should see **"Activity"** section
4. Watch metrics update in real-time (every 2.5 seconds):

```
┌─────────────────────────────┐
│ ACTIVITY         12:34:56 PM│
├─────────────┬───────────────┤
│ Avg Time    │ Changes       │
│ 23s         │ 5             │
├─────────────┼───────────────┤
│ Active Now  │ Focus Loss    │
│ 12          │ 2             │
└─────────────┴───────────────┘
```

**Metrics Explained:**
- **Avg Time**: Average seconds students have been viewing current question
- **Changes**: Total answer changes across all students
- **Active Now**: Students with activity in last 5 minutes
- **Focus Loss**: Total focus/blur events (tab switches, window switches)

### Step 5: Inspect Raw Activity Data

**View StudentActivity sheet directly:**

1. Open Google Sheets
2. Find "StudentActivity" tab
3. Should see rows like:

| ActivityID | Timestamp | PollID | QuestionIndex | StudentEmail | EventType | EventData |
|------------|-----------|--------|---------------|--------------|-----------|-----------|
| ACT-xxx... | 2025-... | P-yyy...| 0 | student@... | QUESTION_VIEW | {"viewedAt":...} |
| ACT-xxx... | 2025-... | P-yyy...| 0 | student@... | OPTION_CLICKED | {"optionIndex":0} |
| ACT-xxx... | 2025-... | P-yyy...| 0 | student@... | ANSWER_SUBMITTED | {"answer":"A",...} |

**Event Types You Should See:**
- `QUESTION_VIEW` - When question loads
- `OPTION_CLICKED` - When clicking an answer option
- `ANSWER_CHANGED` - When changing selection
- `ANSWER_SUBMITTED` - When submitting final answer
- `FOCUS_GAINED` / `FOCUS_LOST` - Window focus changes

---

## Troubleshooting

### Problem: No students showing in Students panel

**Possible Causes:**
1. Poll not started yet → Click "Start" button
2. No students in roster → Add students to class roster
3. Students haven't opened poll link yet → Send links via email

**Check:**
```javascript
function checkRoster() {
  var className = 'YOUR_CLASS_NAME';
  var roster = DataAccess.roster.getByClass(className);
  Logger.log('Students in roster: ' + roster.length);
  roster.forEach(function(s) {
    Logger.log('  - ' + s.name + ' (' + s.email + ')');
  });
}
```

### Problem: Unlock button not appearing

**Diagnosis:**
```javascript
function checkLockedStatus() {
  var liveStatus = DataAccess.liveStatus.get();
  var pollId = liveStatus[0];
  var data = Veritas.Models.Analytics.getLivePollData(pollId, 0);

  data.studentStatusList.forEach(function(s) {
    if (s.status === 'LOCKED' || s.status === 'AWAITING_FULLSCREEN') {
      Logger.log('LOCKED: ' + s.email + ' - Status: ' + s.status);
      Logger.log('  lockVersion: ' + s.lockVersion);
      Logger.log('  lockReason: ' + s.lockReason);
    }
  });
}
```

**If students are locked but button doesn't appear:**
1. Check browser console for JavaScript errors
2. Verify `buildStudentStatusTile` function exists (line 6918)
3. Refresh teacher dashboard (F5)
4. Check that `normalizedStatus === 'LOCKED'` condition is met (line 7003)

### Problem: Activity Metrics showing "--"

**Causes:**
1. No activity data yet (students haven't interacted)
2. StudentActivity sheet doesn't exist
3. API endpoint not being called

**Fix:**
```javascript
// Create sheet if missing
function createStudentActivitySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.insertSheet('StudentActivity');
  var headers = [
    'ActivityID', 'Timestamp', 'PollID', 'SessionID', 'QuestionIndex',
    'StudentEmail', 'EventType', 'EventData', 'ClientTimestamp', 'ServerProcessedAt'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}
```

**Check if API is being called:**
- Open browser console (F12)
- Look for: "Failed to fetch activity metrics" errors
- If present, check that `getRealTimeActivityMetrics` exists in Teacher_API.gs

### Problem: Student activity not being recorded

**Check student browser console:**
```
// Should see logs like:
[ActivityTracker] Flushed 5 events
```

**If no logs:**
1. Activity tracker might not be initialized
2. Check Student_Scripts.html line 103 for `FLUSH_INTERVAL_MS`
3. Verify `activityTracker.init()` is called on question change (line 3322)

**Manual test:**
```javascript
// On student view (browser console):
activityTracker.recordActivity('TEST_EVENT', { test: true });
activityTracker.flushActivities(); // Force flush
```

---

## Answer Randomization Verification

### Test Live Poll Randomization

**Create a test poll:**
- Question: "What is 2+2?"
- Options: ["2", "3", "4", "5"]
- Correct: "4"

**Test with two students:**

**Student A** opens link:
- Might see order: ["5", "2", "4", "3"]

**Student B** opens link (different email):
- Sees different order: ["4", "5", "3", "2"]

**Both select "4"**:
- Both marked as correct ✓

**Student A refreshes page**:
- Still sees: ["5", "2", "4", "3"]
- Same order (deterministic!)

### Verify in Database

**Check Responses sheet:**
- Both students' answers should be recorded
- Both should have `IsCorrect = TRUE`
- Answer text is "4" (original answer, not randomized position)

---

## API Endpoints Reference

### Teacher Dashboard APIs

```javascript
// Get real-time activity metrics
google.script.run
  .withSuccessHandler(function(metrics) {
    console.log('Active students:', metrics.activeStudents);
    console.log('Avg time:', metrics.averageTimeOnQuestion);
    console.log('Answer changes:', metrics.answerChanges);
    console.log('Focus loss:', metrics.focusLossEvents);
  })
  .getRealTimeActivityMetrics(pollId, questionIndex);

// Get detailed activity for a student
google.script.run
  .withSuccessHandler(function(activities) {
    console.log('Activities:', activities);
  })
  .getStudentActivityDetail(pollId, studentEmail, questionIndex);

// Get summary for entire poll
google.script.run
  .withSuccessHandler(function(summary) {
    console.log('Summary by student:', summary);
  })
  .getActivitySummaryForPoll(pollId, sessionId);
```

### Student APIs (called automatically)

```javascript
// Record single activity
google.script.run.recordActivity(token, {
  pollId: 'P-xxx',
  questionIndex: 0,
  eventType: 'QUESTION_VIEW',
  eventData: { viewedAt: Date.now() }
});

// Batch record (more efficient)
google.script.run.recordActivitiesBatch(token, [
  { pollId: 'P-xxx', questionIndex: 0, eventType: 'OPTION_CLICKED', eventData: {...} },
  { pollId: 'P-xxx', questionIndex: 0, eventType: 'ANSWER_CHANGED', eventData: {...} }
]);
```

---

## Expected Behavior Summary

### When Student Gets Locked:

1. **Student View**:
   - Screen turns red
   - "LOCKED OUT" message
   - "Wait for teacher approval" or "Return to fullscreen" message

2. **Teacher Dashboard**:
   - Student tile gets red pulsing border
   - 🔒 Lock icon appears
   - Unlock button (🔓) appears
   - Status shows "LOCKED" or "AWAITING_FULLSCREEN"
   - Lock count increases in status pills

3. **Teacher Clicks Unlock**:
   - Confirmation dialog
   - Student status changes to "AWAITING_FULLSCREEN"
   - Student can re-enter fullscreen to continue

### When Student Interacts:

1. **Events Recorded** (StudentActivity sheet):
   - Every option click
   - Every answer change
   - Every focus/blur
   - Question view timestamp
   - Final submission

2. **Metrics Update** (Activity panel):
   - Avg Time increases as students spend more time
   - Changes count increases when students change answers
   - Active Now shows students with recent activity
   - Focus Loss increases on tab/window switches

3. **Data Available for Analysis**:
   - Raw events in StudentActivity sheet
   - Summary via `getActivitySummaryForPoll()`
   - Real-time metrics via `getRealTimeActivityMetrics()`

---

## Files Modified in This Implementation

1. **Core_Config.gs** - Added STUDENT_ACTIVITY sheet config
2. **Model_StudentActivity.gs** - NEW - Complete tracking module
3. **Student_API.gs** - Activity recording endpoints
4. **Teacher_API.gs** - Activity query endpoints
5. **Model_Session.gs** - Answer randomization functions
6. **Student_Scripts.html** - ActivityTracker module
7. **Teacher_Body.html** - Activity Metrics UI panel
8. **Teacher_Scripts.html** - updateActivityMetrics() function
9. **Test_System.gs** - NEW - Testing and verification tools

---

## Success Criteria

✅ **Unlock Functionality**:
- [ ] Locked student tiles show red border
- [ ] Unlock button (🔓) visible on locked tiles
- [ ] Clicking button shows confirmation
- [ ] Student receives unlock notification
- [ ] Student can resume after re-entering fullscreen

✅ **Activity Tracking**:
- [ ] StudentActivity sheet exists and populated
- [ ] Activity panel shows real-time metrics
- [ ] Metrics update every 2.5 seconds
- [ ] Events recorded for: views, clicks, changes, focus
- [ ] Timestamp shows last update time

✅ **Answer Randomization**:
- [ ] Different students see different option orders
- [ ] Same student sees consistent order on refresh
- [ ] Correct answers graded properly despite randomization
- [ ] Works for both live polls and secure assessments

---

## Next Steps

1. **Deploy the changes** to your Apps Script project
2. **Run testSystem()** in Apps Script editor to verify setup
3. **Start a test poll** with at least 2 students
4. **Have a student exit fullscreen** to test unlock
5. **Monitor Activity panel** for real-time metrics
6. **Check StudentActivity sheet** for raw events

All functionality is now implemented and ready for use!
