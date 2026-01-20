# Test Poll Creation Instructions

This document explains how to create a test poll to verify the live poll visibility fixes.

## Quick Start

### Option 1: Automated Script (Recommended if you have Firebase credentials)

```bash
# Install firebase-admin if not already installed
cd functions
npm install
cd ..

# Run the script
node create-test-poll.js
```

### Option 2: Manual Import via Firebase Console (Works without credentials)

1. **Open Firebase Console:**
   - Go to https://console.firebase.google.com/
   - Select your project: `classroomproctor`

2. **Navigate to Realtime Database:**
   - Click on "Realtime Database" in the left sidebar
   - Click on the "Data" tab

3. **Import the Test Poll:**
   - Click on the three dots menu (⋮) at the root level
   - Select "Import JSON"
   - Choose the file: `test-poll-data.json`
   - Select the path: `/polls/1737337200000`
   - Click "Import"

4. **Verify Import:**
   - Navigate to `/polls/1737337200000` in the database
   - You should see the poll with 3 questions

## Testing the Fixes

### Part 1: Test Student Question Visibility

1. **Deploy your changes:**
   ```bash
   firebase deploy --only hosting,functions
   ```

2. **Access Teacher Dashboard:**
   - Go to your app URL
   - Login as teacher
   - Refresh the page to load the new poll

3. **Start the Test Poll:**
   - Select "Claude Test Poll - Live Poll Visibility Fix" from dropdown
   - Check browser console for diagnostic logs:
     ```
     [onStartPoll] CURRENT_POLL_DATA: { ... }
     [onStartPoll] Question data being sent to Firebase: { ... }
     ```
   - Click "Start Session"
   - The logs should show:
     - `questionsLength: 3`
     - `questionText` should contain the full question text
     - `questionOptions` should be an array with 3-4 items

4. **Test Student View:**
   - Open a student link in an incognito window
   - Join the session
   - Click "Begin Poll"
   - **Expected Result:** You should see the question text and all answer options

5. **Check Student Console:**
   - Open browser console (F12)
   - Look for: `[renderQuestion] Rendering Live Poll question`
   - Should show `questionText` with actual text (not empty)
   - Should show `options` array with items

### Part 2: Test Teacher Dashboard Student Activity

1. **With the test poll running:**
   - Have 2-3 students join the session (use different browsers/devices)
   - **Expected Result:** All students should appear in the teacher dashboard immediately

2. **Verify Real-time Updates:**
   - Have a student submit an answer
   - **Expected Result:** Response count should update: "1 / 3 answered"
   - Student status should change from "Waiting" to "Submitted"

3. **Check Teacher Console:**
   - Look for: `[Firebase] Fetched initial student data: X students`
   - Look for: `[Firebase] Initial student status rendered: X students`

## What Each Question Tests

### Question 1: Complex Multi-line Question
- Tests: Long question text rendering
- Tests: 3 multi-paragraph answer options
- Correct Answer: Option A (index 0)

### Question 2: Standard Multiple Choice
- Tests: Normal question with 4 options
- Tests: Clear correct answer marking
- Correct Answer: Option B (index 1)

### Question 3: Simpler Question
- Tests: Shorter options
- Tests: 3-option format
- Correct Answer: Option A (index 0)

## Troubleshooting

### If questions still don't appear for students:

1. **Check Firebase Realtime Database:**
   - Navigate to `/sessions/{pollId}/live_session`
   - Verify `questionText` is NOT empty
   - Verify `options` array exists and has items

2. **Check Cloud Function Logs:**
   ```bash
   firebase functions:log --only setLiveSessionState
   ```
   - Look for: "Question data received"
   - Verify the options array is not empty

3. **Check Student Console:**
   - Look for: `[renderQuestion] No question text and no options`
   - If you see this, the data didn't make it to Firebase

### If teacher dashboard doesn't show students:

1. **Check Firebase Realtime Database:**
   - Navigate to `/sessions/{pollId}/students`
   - Verify student entries exist

2. **Check Teacher Console:**
   - Look for: `[Firebase] Fetched initial student data`
   - If missing, the fetch didn't run

3. **Force Refresh:**
   - Close and reopen the live session
   - This will re-initialize Firebase listeners

## Expected Diagnostic Output

### Teacher Console (when starting poll):
```
[onStartPoll] CURRENT_POLL_DATA: {
  pollId: "1737337200000",
  questionsLength: 3,
  firstQuestion: { questionText: "Which phase...", options: [...] }
}
[onStartPoll] Question data being sent to Firebase: {
  questionText: "Which phase of the cell cycle...",
  questionOptionsLength: 3,
  questionOptions: ["G1 phase...", "M phase...", "G2 phase..."]
}
[Firebase] Fetched initial student data: 2 students
[Firebase] Initial student status rendered: 2 students
```

### Student Console (when joining):
```
[renderQuestion] Rendering Live Poll question: {
  questionText: "Which phase of the cell cycle...",
  options: ["G1 phase...", "M phase...", "G2 phase..."]
}
```

## Success Criteria

✅ **Fix is working if:**
- Students see the question text and all options
- Teacher dashboard shows all connected students
- Response count updates in real-time
- No "No question text and no options" errors in console

❌ **Fix needs more work if:**
- Students see blank question area
- Teacher dashboard shows 0 students when students are connected
- Console shows empty `questionText` or `options: []`
