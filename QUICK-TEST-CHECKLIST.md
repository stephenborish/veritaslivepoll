# Quick Test Checklist ✅

Use this as a quick reference while testing.

## Pre-Test Setup
- [ ] Deploy: `firebase deploy --only hosting,functions`
- [ ] Import test-poll-data.json to `/polls/1737337200000` in Firebase Console
- [ ] Verify poll appears in database with 3 questions

## Test 1: Student Question Visibility

### Teacher Side:
- [ ] Open teacher dashboard with console (F12)
- [ ] Select "Claude Test Poll - Live Poll Visibility Fix"
- [ ] Check console log shows: `questionsLength: 3`
- [ ] Check console log shows: `questionText: "Which phase..."`
- [ ] Check console log shows: `questionOptions: [...]` with 3 items
- [ ] Start session

### Student Side:
- [ ] Open student link in incognito with console (F12)
- [ ] Join session and click "Begin Poll"
- [ ] ✅ SEE question text (not blank)
- [ ] ✅ SEE all 3 answer options
- [ ] Check console: `questionText` has actual text
- [ ] Check console: `options` array has items

### Firebase Database:
- [ ] Navigate to `/sessions/1737337200000/live_session`
- [ ] ✅ `questionText` is NOT empty
- [ ] ✅ `options` array has 3 items

## Test 2: Teacher Dashboard Student Activity

### With Poll Running:
- [ ] Open 2-3 student windows (incognito)
- [ ] Have students join the session
- [ ] ✅ All students appear immediately in teacher dashboard
- [ ] Check teacher console: `[Firebase] Fetched initial student data: X students`
- [ ] Check teacher console: `[Firebase] Initial student status rendered: X students`

### Real-time Updates:
- [ ] Have one student submit an answer
- [ ] ✅ Response count updates: "1 / 3 answered"
- [ ] ✅ Student status changes: "Waiting" → "Submitted"
- [ ] ✅ No refresh needed

### Firebase Database:
- [ ] Navigate to `/sessions/1737337200000/students`
- [ ] ✅ See entry for each connected student

## Success = All ✅ Checked

If any test fails, refer to TESTING-WALKTHROUGH.md for troubleshooting.
