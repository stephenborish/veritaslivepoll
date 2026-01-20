# Complete Testing Walkthrough

Follow these steps to test the live poll visibility fixes.

## Prerequisites
✅ All fixes are committed to branch: `claude/fix-live-poll-visibility-cTmhs`
✅ Test poll data is ready in `test-poll-data.json`

---

## Part 1: Deploy the Fixes (Do this from your authenticated machine)

### Step 1.1: Deploy to Firebase

```bash
# Make sure you're on the fix branch
git checkout claude/fix-live-poll-visibility-cTmhs
git pull origin claude/fix-live-poll-visibility-cTmhs

# Deploy both hosting and functions
firebase deploy --only hosting,functions
```

**Expected output:**
```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/classroomproctor/overview
Hosting URL: https://classroomproctor.web.app
```

**⏱️ This takes about 2-3 minutes.**

---

## Part 2: Import the Test Poll

### Step 2.1: Open Firebase Console

1. Go to: https://console.firebase.google.com/project/classroomproctor/database
2. Click on **Realtime Database** in the left sidebar
3. Click the **Data** tab

### Step 2.2: Import the Test Poll

1. At the database root level, click the **three dots menu (⋮)**
2. Select **"Import JSON"**
3. Click **"Browse"** and select: `test-poll-data.json`
4. For the import path, enter: `/polls/1737337200000`
5. Click **"Import"**

### Step 2.3: Verify Import

Navigate in the database to: `/polls/1737337200000`

You should see:
```
polls
  └─ 1737337200000
      ├─ pollId: "1737337200000"
      ├─ pollName: "Claude Test Poll - Live Poll Visibility Fix"
      ├─ className: "AP Biology"
      ├─ questions: [Array with 3 items]
      ├─ questionCount: 3
      └─ sessionType: "LIVE_POLL"
```

✅ **If you see this, the poll is imported correctly!**

---

## Part 3: Test Student Question Visibility

### Step 3.1: Open Teacher Dashboard

1. Go to your app: `https://classroomproctor.web.app` (or your custom domain)
2. Log in as teacher
3. **Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)** to hard refresh
4. **Open browser console (F12)** - keep this open to watch logs

### Step 3.2: Select and Start the Test Poll

1. In the poll dropdown, select: **"Claude Test Poll - Live Poll Visibility Fix"**
2. Watch the console - you should see:
   ```
   [onStartPoll] CURRENT_POLL_DATA: {
     pollId: "1737337200000",
     hasQuestions: true,
     questionsLength: 3,
     firstQuestion: { questionText: "Which phase...", ... }
   }
   ```

3. If you see `questionsLength: 0` or `NO FIRST QUESTION`, STOP and let me know.

4. If the logs look good, click **"Start Session"**

5. Watch for this log:
   ```
   [onStartPoll] Question data being sent to Firebase: {
     questionText: "Which phase of the cell cycle...",
     questionOptionsLength: 3,
     questionOptions: ["G1 phase...", "M phase...", "G2 phase..."]
   }
   ```

✅ **If you see this with actual text (not empty), the question data is being sent!**

### Step 3.3: Test Student View

1. **Copy the student link** from the teacher dashboard
2. Open an **incognito/private window** (Ctrl+Shift+N / Cmd+Shift+N)
3. Paste the student link
4. **Open browser console (F12)** in the student window too
5. Click **"Begin Poll"** button

### Step 3.4: Check Student Console

Look for this log in the student console:
```
[renderQuestion] Rendering Live Poll question: {
  questionText: "Which phase of the cell cycle is most analogous...",
  options: ["G1 phase - during this growth phase...", ...]
}
```

### Expected Results ✅

**✅ SUCCESS if you see:**
- Full question text is visible (not blank)
- All 3 answer options are visible
- Options are properly formatted
- No errors about "No question text and no options"

**❌ FAILURE if you see:**
- Blank question area
- Console shows: `[renderQuestion] No question text and no options`
- Console shows: `questionText: ""`
- Console shows: `options: []`

---

## Part 4: Test Teacher Dashboard Student Activity

### Step 4.1: Have Students Join

With the test poll still running:

1. Open **2-3 more incognito windows** (simulating different students)
2. In each window:
   - Paste the student link
   - Join the session
   - Click "Begin Poll"

### Step 4.2: Check Teacher Dashboard

**In the teacher dashboard, you should immediately see:**

1. **Student cards appearing** in the dashboard
2. **Student count updating**: Shows "3 students connected" (or however many joined)
3. Check teacher console for:
   ```
   [Firebase] Fetched initial student data: 3 students
   [Firebase] Initial student status rendered: 3 students
   ```

### Step 4.3: Test Real-time Updates

1. In one student window, **select an answer** and submit
2. Watch the teacher dashboard:
   - Response count should update: **"1 / 3 answered"**
   - That student's card should change from "Waiting" to "Submitted"
   - Progress should update in real-time

### Expected Results ✅

**✅ SUCCESS if:**
- All students appear immediately when they join
- Response count updates in real-time
- Student status changes (Waiting → Submitted)
- No need to refresh to see students

**❌ FAILURE if:**
- Teacher dashboard shows "0 students" when students are connected
- Need to refresh to see students
- Response count doesn't update

---

## Part 5: Verify in Firebase Realtime Database

### Step 5.1: Check Live Session Node

While the poll is running, go to Firebase Console and navigate to:

`/sessions/1737337200000/live_session`

**You should see:**
```
live_session
  ├─ pollId: "1737337200000"
  ├─ questionIndex: 0
  ├─ status: "OPEN"
  ├─ questionText: "Which phase of the cell cycle..."  ← NOT EMPTY!
  ├─ options: ["G1 phase...", "M phase...", "G2 phase..."]  ← HAS ITEMS!
  └─ metadata: {...}
```

**❌ If you see:**
- `questionText: ""` (empty)
- `options: []` (empty array)
- Missing `options` field entirely

Then the question data is not being written to Firebase.

### Step 5.2: Check Students Node

Navigate to: `/sessions/1737337200000/students`

**You should see entries like:**
```
students
  ├─ 7f9ebd6592cbebf9
  │   ├─ status: "ACTIVE"
  │   └─ lastActiveAt: 1737337250000
  ├─ 8a3bc4de71afce82
  │   └─ ...
```

Each student who joined should have an entry here.

---

## Troubleshooting

### Issue: "Poll has no questions" error when starting

**This means CURRENT_POLL_DATA.questions is empty.**

1. Check console log: `[onStartPoll] CURRENT_POLL_DATA`
2. Verify the poll was imported correctly in Firebase
3. Try hard refresh (Ctrl+Shift+R) on teacher dashboard
4. If still empty, reimport the test poll

### Issue: Students see blank question

**This means questionText or options aren't reaching Firebase.**

1. Check teacher console: `[onStartPoll] Question data being sent to Firebase`
2. If the data looks good there, check Cloud Function logs:
   ```bash
   firebase functions:log --only setLiveSessionState
   ```
3. Look for: "Question data received" log
4. Check `/sessions/{pollId}/live_session` in Firebase database

### Issue: Teacher dashboard shows 0 students

**This means initFirebaseMissionControl isn't fetching initial data.**

1. Check teacher console for: `[Firebase] Fetched initial student data`
2. If missing, the fetch didn't run
3. Check `/sessions/{pollId}/students` in Firebase - do entries exist?
4. Try closing and reopening the live session

---

## Success Criteria Summary

### ✅ Both Fixes Working If:

1. **Student Visibility:**
   - Students see question text (not blank)
   - Students see all answer options
   - Console shows proper `questionText` and `options` array

2. **Teacher Dashboard:**
   - All students visible immediately when they join
   - Response count updates: "X / Y answered"
   - Student status changes in real-time
   - No refresh needed to see students

---

## Next Steps After Testing

If both fixes work:
- ✅ Create a pull request to merge the fix branch
- ✅ Document any additional findings
- ✅ Test with a real classroom scenario

If issues persist:
- 📸 Take screenshots of console logs
- 📸 Screenshot Firebase database structure
- 📋 Share the diagnostic output with me
