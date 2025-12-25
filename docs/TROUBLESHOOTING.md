# Veritas Live Poll - Troubleshooting Guide

**Last Updated**: 2025-11-10
**Quick Help**: Use Ctrl+F / Cmd+F to search for your specific error message

---

## Table of Contents

- [Quick Diagnostic Tools](#quick-diagnostic-tools)
- [Teacher Issues](#teacher-issues)
- [Student Issues](#student-issues)
- [Proctoring Issues](#proctoring-issues)
- [Technical Issues](#technical-issues)
- [Performance Issues](#performance-issues)
- [Email & Link Issues](#email--link-issues)
- [Data & Database Issues](#data--database-issues)
- [Advanced Debugging](#advanced-debugging)

---

## Quick Diagnostic Tools

### Check Apps Script Execution Logs

**When to use**: Any server-side error, unexpected behavior, debugging

**How to access**:
1. Open Apps Script editor (Extensions → Apps Script from your sheet)
2. Click **Executions** tab (left sidebar, clock icon)
3. Look for red (failed) executions
4. Click on an execution to see details and error messages

**What to look for**:
- Red status = error occurred
- Execution time > 5 seconds = potential performance issue
- "Authorization required" = permissions problem
- "Service invoked too many times" = quota exceeded

### Check Browser Console

**When to use**: UI not updating, JavaScript errors, client-side issues

**How to access**:
1. Press **F12** (or Right-click → Inspect)
2. Click **Console** tab
3. Look for red error messages

**Common errors**:
- `google.script.run` errors = RPC failure
- `Uncaught TypeError` = JavaScript bug
- `Failed to fetch` = network issue

### Check Google Sheets Database

**When to use**: Data not saving, responses missing, state issues

**What to check**:
1. **LiveStatus sheet**: Has active poll info?
2. **Responses sheet**: New rows appearing for submissions?
3. **Polls sheet**: Poll data exists?
4. **Rosters sheet**: Student emails correct?

---

## Teacher Issues

### Issue 1: "Access Denied" When Opening Web App

**Symptom**: Teacher sees "You do not have permission to access this application"

**Diagnosis**:
1. Check Apps Script execution logs for attempted email address
2. Compare with `TEACHER_EMAIL` constant in Code.gs

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Wrong Google account logged in | Log out of all Google accounts, log back into correct one |
| Email typo in `TEACHER_EMAIL` constant | Edit Code.gs line ~50, fix email, save |
| Using multiple Google accounts | Use incognito mode or a different browser profile |
| Email not in `ADDITIONAL_TEACHERS` | Add to Script Properties (see [DEPLOYMENT.md](DEPLOYMENT.md#33-add-additional-teachers-optional)) |

**Advanced Solution**:
```javascript
// Temporary workaround: Log actual email attempting access
function doGet(e) {
  const userEmail = Session.getActiveUser().getEmail();
  Logger.log(`Access attempt from: ${userEmail}`);
  // ... rest of function
}
```
Check logs to see what email is being detected.

---

### Issue 2: Poll Not Starting (Button Clicks Do Nothing)

**Symptom**: Click "Start Poll" button, nothing happens

**Diagnosis**:
1. Open browser console (F12)
2. Click "Start Poll" again
3. Look for JavaScript errors

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| RPC function error | Check execution logs, look for `startPoll` failures |
| JavaScript error in TeacherView.html | Check console for errors, verify HTML file is latest version |
| Poll dropdown not selected | Select poll from dropdown first |
| LiveStatus sheet corrupted | Clear LiveStatus sheet (delete all rows except header) |
| Script execution timeout | Poll too large or sheet too slow, optimize database |

**Quick Fix**:
1. Refresh page (Ctrl+R / Cmd+R)
2. Re-select poll from dropdown
3. Try again

---

### Issue 3: Student Grid Not Updating

**Symptom**: Students submit answers, but teacher's grid stays empty or doesn't update

**Diagnosis**:
1. Check if responses appearing in Responses sheet
2. Check browser console for RPC errors
3. Watch network tab (F12 → Network) for failed requests

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Polling loop stopped | Check console for errors, refresh page |
| RPC timeout (Google Sheets slow) | Optimize: Archive old responses, reduce roster size |
| JavaScript error in chart rendering | Check console, verify Google Charts loaded |
| Cache issue | Hard refresh: Ctrl+Shift+R / Cmd+Shift+R |
| `getLivePollData()` error | Check execution logs, look for error in function |

**Manual Refresh**:
- Click **Refresh** button (if available)
- Or reload page (data should persist)

---

### Issue 4: Chart Displays Incorrect Data

**Symptom**: Chart shows wrong response counts or doesn't match grid

**Diagnosis**:
1. Check Responses sheet manually count responses
2. Compare with chart display
3. Check console for data parsing errors

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Stale cache | Clear cache in `getLivePollData()` |
| Multiple poll sessions (old responses) | Filter responses by timestamp or session ID |
| Incorrect `IsCorrect` computation | Verify correct answer marked in poll creation |
| Chart library bug | Try hard refresh, or upgrade Google Charts version |

**Workaround**:
Manually verify in Responses sheet, ignore chart if needed (or fix and redeploy).

---

### Issue 5: Can't Create New Poll

**Symptom**: "Create New Poll" button doesn't work, or modal doesn't open

**Diagnosis**:
1. Check browser console for errors
2. Verify JavaScript loaded (check Sources tab in DevTools)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| JavaScript error | Check console, fix syntax errors in TeacherView.html |
| Modal HTML missing | Verify TeacherView.html has modal markup |
| Class list empty (can't select class) | Add at least one class to Classes sheet |
| Tailwind CSS not loaded | Check network tab for failed CDN requests |

---

## Student Issues

### Issue 6: "Invalid or Expired Token"

**Symptom**: Student clicks link, sees error message

**Diagnosis**:
1. Check token format in URL (should be base64 string after `?token=`)
2. Run debug function to decode token (see [Advanced Debugging](#advanced-debugging))

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Token older than 30 days | Regenerate tokens, send new links |
| Email client broke URL across lines | Copy full URL manually, paste in browser |
| Link forwarded from different student | Each student needs their unique link |
| Token validation logic error | Check `TokenManager.validateToken()` in logs |
| HMAC key mismatch (rare) | Regenerate all tokens with new key |

**Regenerate Tokens**:
1. Teacher: Select poll
2. Click "Send Student Links" again
3. Students use new links

---

### Issue 7: Stuck on "Waiting for Poll to Begin"

**Symptom**: Student sees waiting message, but teacher already started poll

**Diagnosis**:
1. Check LiveStatus sheet: Is ActivePollID populated?
2. Check student's browser console for errors
3. Verify student's polling loop is running (see network tab)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Polling loop crashed | Student: Refresh page (F5) |
| Network connectivity issue | Check internet connection, retry |
| LiveStatus sheet not updated | Teacher: Stop poll, start again |
| Token tied to wrong poll | Verify student link matches current poll |
| Browser tab backgrounded (throttled) | Bring tab to foreground, wait 2.5s |

**Quick Fix**:
- **Student**: Refresh page
- **Teacher**: Stop poll, wait 5 seconds, start again

---

### Issue 8: Can't Enter Fullscreen

**Symptom**: Click "Begin Session", nothing happens or immediate exit

**Diagnosis**:
1. Check browser console for fullscreen API errors
2. Test with different browser (Chrome recommended)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Browser doesn't support Fullscreen API | Use Chrome, Firefox, or Safari (desktop) |
| Mobile browser (limited support) | Switch to desktop browser |
| Browser setting disabled fullscreen | Check browser settings, enable fullscreen |
| User didn't allow fullscreen | Click Allow when prompted |
| Safari iOS (requires gesture) | Tap screen first, then click "Begin Session" |

**Browser Compatibility**:
- ✅ Chrome/Edge 90+: Full support
- ✅ Firefox 88+: Full support
- ⚠️ Safari (macOS): Works with slight delay
- ❌ Safari (iOS): Limited support (not recommended)

---

### Issue 9: Question Not Appearing After Join

**Symptom**: Student enters fullscreen, still sees "Waiting..." despite poll started

**Diagnosis**:
1. Check browser console for errors
2. Watch network tab for `getStudentPollStatus` calls (should occur every 2.5s)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Polling function not running | Check console for errors, refresh page |
| RPC call failing | Check network tab for failed requests |
| State version mismatch | Server returns resync hint, client should refresh |
| Student token tied to different poll | Verify token was generated for this poll |
| Server-side error in `getStudentPollStatus` | Check execution logs |

**Workaround**: Refresh page (state should persist)

---

### Issue 10: Submitted Answer, But Sees Question Again

**Symptom**: Submit answer → brief confirmation → question reappears

**Diagnosis**:
1. Check Responses sheet: Is answer logged?
2. Check if teacher advanced to next question
3. Look for state version mismatch

**Expected Behavior**:
- After submission, should see confirmation until teacher advances question
- If question reappears, teacher likely pressed "Reset Question"

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Teacher reset question | Normal behavior, re-submit answer |
| State sync issue | Refresh page |
| Duplicate submission (bug) | Check Responses sheet for duplicates |

---

## Proctoring Issues

### Issue 11: Not Locking on Fullscreen Exit

**Symptom**: Student can exit fullscreen without getting locked

**Diagnosis**:
1. Run [PROCTOR_QA_CHECKLIST.md](PROCTOR_QA_CHECKLIST.md) test suite
2. Check browser console for violation event listeners
3. Verify `logStudentViolation()` is being called

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Event listeners not attached | Check StudentView.html, verify listener code present |
| Browser doesn't fire events (mobile) | Use desktop browser |
| JavaScript error before listeners attach | Fix errors, refresh |
| Proctoring code disabled (testing mode) | Re-enable production proctoring code |

**Debug**:
```javascript
// In StudentView.html, add temporary logging
document.addEventListener('fullscreenchange', () => {
  console.log('Fullscreen changed:', document.fullscreenElement);
});
```

---

### Issue 12: Teacher Clicks "Approve", Student Still Locked

**Symptom**: Teacher approves unlock, student doesn't see unlock message

**Diagnosis**:
1. Check student's browser console for polling errors
2. Verify teacher panel shows "AWAITING_FULLSCREEN" (blue), not still "LOCKED" (red)
3. Check execution logs for `teacherApproveUnlock` result

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Version mismatch (student violated again) | Teacher clicks Approve again (new version) |
| Student's polling loop stopped | Student refreshes page |
| Network issue (approval didn't reach server) | Teacher clicks Approve again |
| Race condition (rare) | Wait 5 seconds, try again |

**Version Mismatch Detection**:
- Teacher panel shows version number (v1, v2, etc.)
- If version changes after approval, old approval is invalid
- Click Approve again with new version

---

### Issue 13: Lock State Doesn't Persist After Refresh

**Symptom**: Student locked, refreshes page, sees normal poll (not locked)

**Diagnosis**:
1. Check Responses sheet for `VIOLATION_LOCKED` marker
2. Verify `getStudentPollStatus()` checks for lock state

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Lock marker not written | Check `logStudentViolation()` logs |
| `isLocked()` check not implemented | Verify DataAccess.responses.isLocked() exists |
| Sheet write failed (permission issue) | Check execution logs |

**Expected**: Lock markers persist in Responses sheet, survive refreshes.

---

### Issue 14: False Positive Locks (Student Didn't Violate)

**Symptom**: Student gets locked despite staying in fullscreen

**Diagnosis**:
1. Ask student what they were doing (window resize? notification?)
2. Check browser for focus/blur events
3. Review violation timestamps

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Browser notification stole focus | Disable notifications during session |
| Window resize triggered blur | Don't resize during session |
| Browser extension interfered | Disable extensions, try again |
| Overly sensitive detection | Increase debounce timeout |

**Adjust Sensitivity** (Code.gs):
```javascript
// Increase violation timeout to reduce false positives
const PROCTOR_CONFIG = {
  violationTimeout: 1000  // Was 30000 (30s), change to 1000ms debounce
};
```

---

## Technical Issues

### Issue 15: "Service Invoked Too Many Times" Error

**Symptom**: Error message in logs, functions stop working

**Diagnosis**:
1. Check execution logs for quota exceeded errors
2. Review Google Apps Script quotas

**Google Apps Script Quotas**:
- URL Fetch calls: 20,000/day
- Email recipients: 100/day (free), 1500/day (Workspace)
- Script runtime: 6 minutes/execution
- Simultaneous executions: 30

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Too many students polling simultaneously | Implement jittered polling (random delay) |
| Email quota exceeded | Wait 24 hours, or upgrade to Workspace |
| Infinite loop in code | Review code, fix loop |
| Development testing (too many runs) | Use a test deployment, not production |

**Jittered Polling** (StudentView.html):
```javascript
// Add random jitter to prevent thundering herd
const jitter = Math.random() * 1000; // 0-1 second
setTimeout(poll, POLL_INTERVAL + jitter);
```

---

### Issue 16: Slow Performance (> 5 Second Response Times)

**Symptom**: Everything works, but very slow

**Diagnosis**:
1. Check execution logs for function runtimes
2. Review Responses sheet size (> 10,000 rows?)
3. Check poll question count (> 50?)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Responses sheet too large | Archive old responses, delete historical data |
| Full table scans on every poll | Implement caching (see ARCHITECTURE.md) |
| Too many students (> 100) | Consider splitting into multiple sessions |
| Google Sheets slow (general) | Migrate to Firestore (advanced) |

**Archive Old Data**:
1. Copy Responses sheet
2. Rename to "Responses_Archive_2025"
3. Delete rows from original (keep header)
4. Performance should improve

---

### Issue 17: Images Not Loading

**Symptom**: Question or answer images show broken icon

**Diagnosis**:
1. Copy image URL from poll data
2. Paste in browser directly
3. Check if URL accessible

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Drive file deleted | Re-upload image |
| Drive permissions incorrect | Share folder "Anyone with link can view" |
| Image URL malformed | Re-upload, verify URL format |
| Network firewall blocking Google Drive | Check school firewall settings |
| Image too large (> 5MB) | Compress image, re-upload |

**Fix Drive Permissions**:
1. Open Google Drive
2. Find "Veritas Live Poll Images" folder
3. Right-click → Share
4. Set to "Anyone with the link can view"

---

## Performance Issues

### Issue 18: High Latency (Students See Delays > 5 Seconds)

**Symptom**: Teacher advances question, students see new question after 10+ seconds

**Diagnosis**:
1. Check network tab in both browsers for request times
2. Review Apps Script execution logs for slow functions
3. Test network speed (speedtest.net)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Poor internet connection | Check WiFi, switch to wired connection |
| Server-side slowness | Optimize database queries, add caching |
| Polling interval too long | Reduce POLL_INTERVAL (not recommended below 2s) |
| Too many concurrent users | Google Sheets limit, consider optimization |

**Expected Latency**: 0.5s - 3s for state propagation

---

### Issue 19: Browser Crashes or Freezes

**Symptom**: Browser becomes unresponsive during poll

**Diagnosis**:
1. Check browser task manager (Shift+Esc in Chrome)
2. Look for high CPU/memory usage

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Memory leak in polling loop | Fix JavaScript leak, redeploy |
| Too many images (large sizes) | Compress images, use smaller dimensions |
| Browser extensions interfering | Disable extensions during poll |
| Old browser version | Update browser to latest |

**Workaround**: Use different browser or incognito mode

---

## Email & Link Issues

### Issue 20: Student Links Not Sending

**Symptom**: "Send Student Links" completes, but no emails arrive

**Diagnosis**:
1. Check Apps Script execution logs for email sending
2. Check spam/junk folders
3. Verify email addresses in Rosters sheet

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Email quota exceeded | Wait 24 hours, or upgrade to Google Workspace |
| Invalid email addresses | Fix typos in Rosters sheet |
| Emails in spam | Ask students to check spam, whitelist sender |
| MailApp API error | Check execution logs, retry |
| School email filter blocking | Contact IT to whitelist Apps Script emails |

**Manual Link Distribution**:
1. Generate tokens programmatically
2. Copy token links
3. Send via school email system or LMS

---

### Issue 21: Email Link Broken (Line Wrap)

**Symptom**: Click email link, goes to wrong page or 404

**Diagnosis**:
1. Check if URL broken across multiple lines in email
2. Verify full URL copied

**Solution**:
- Copy entire URL manually
- Paste into browser address bar
- Or use URL shortener (bit.ly, tinyurl) when generating links

---

## Data & Database Issues

### Issue 22: Poll Disappeared from Dropdown

**Symptom**: Poll existed, now missing from teacher's dropdown

**Diagnosis**:
1. Check Polls sheet: Is poll data still there?
2. Check for filter or hidden rows

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Poll deleted | Restore from backup or recreate |
| Sheet filtered | Clear filter (Data → Remove filter) |
| Dropdown not refreshing | Refresh page |
| Poll tied to deleted class | Verify class still exists in Classes sheet |

---

### Issue 23: Responses Not Saving

**Symptom**: Students submit, but Responses sheet empty

**Diagnosis**:
1. Check execution logs for `submitStudentAnswer` errors
2. Verify Responses sheet not protected (edit permissions)

**Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Sheet write permission error | Check sheet protection, remove if locked |
| `submitStudentAnswer()` error | Check logs, fix code bug |
| Wrong sheet name | Verify sheet named exactly "Responses" |
| Sheet at row limit (rare) | Archive old data |

---

## Advanced Debugging

### Debug Function: Check Session State

```javascript
// Add to Code.gs, run from Apps Script editor
function debugSessionState() {
  const metadata = JSON.parse(
    PropertiesService.getScriptProperties().getProperty('SESSION_METADATA') || '{}'
  );

  Logger.log('=== SESSION STATE ===');
  Logger.log('Session Phase:', metadata.sessionPhase);
  Logger.log('Active Poll:', metadata.activePollId);
  Logger.log('Question Index:', metadata.questionIndex);
  Logger.log('Started At:', metadata.startedAt);
  Logger.log('Timer Remaining:', metadata.timerRemainingSeconds);

  const liveStatus = ss.getSheetByName('LiveStatus').getDataRange().getValues();
  Logger.log('LiveStatus Sheet:', liveStatus[1]); // Row 2 (data row)
}
```

### Debug Function: Decode Student Token

```javascript
// Add to Code.gs
function debugToken(token) {
  try {
    const decoded = Utilities.newBlob(
      Utilities.base64Decode(token)
    ).getDataAsString();

    const parts = decoded.split(':');
    Logger.log('=== TOKEN DEBUG ===');
    Logger.log('Student Email:', parts[0]);
    Logger.log('Poll ID:', parts[1]);
    Logger.log('Timestamp:', new Date(parseInt(parts[2])));
    Logger.log('Age (days):', (Date.now() - parseInt(parts[2])) / (1000 * 60 * 60 * 24));
    Logger.log('HMAC:', parts[3]);

    const isValid = TokenManager.validateToken(token);
    Logger.log('Valid:', isValid);
  } catch (err) {
    Logger.log('ERROR decoding token:', err.message);
  }
}

// Run with: debugToken('paste-token-here')
```

### Debug Function: Check Student Lock Status

```javascript
// Add to Code.gs
function debugStudentLock(studentEmail) {
  const sheet = ss.getSheetByName('Responses');
  const data = sheet.getDataRange().getValues();

  Logger.log('=== LOCK DEBUG: ' + studentEmail + ' ===');

  let foundLock = false;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[4] === studentEmail && row[5] === 'VIOLATION_LOCKED') {
      foundLock = true;
      Logger.log('Lock found:');
      Logger.log('  Timestamp:', row[1]);
      Logger.log('  Metadata:', row[7]);
      break;
    }
  }

  if (!foundLock) {
    Logger.log('No lock found for this student');
  }

  // Check proctor state
  const proctorState = PropertiesService.getScriptProperties()
    .getProperty(`PROCTOR_${studentEmail}`);
  Logger.log('Proctor State (properties):', proctorState);
}

// Run with: debugStudentLock('student@example.com')
```

### Enable Verbose Logging

```javascript
// In Code.gs, find Logger configuration
Logger.LEVEL = 'DEBUG'; // Change from 'INFO' to 'DEBUG'

// Now all debug messages will appear in logs
Logger.log('DEBUG: Extra details here');
```

---

## Getting More Help

### Before Opening an Issue

**Provide**:
1. **Error message** (exact text)
2. **Steps to reproduce** (what you did)
3. **Expected behavior** (what should happen)
4. **Actual behavior** (what happened instead)
5. **Browser & version** (Chrome 120, Firefox 115, etc.)
6. **Apps Script execution logs** (screenshot or copy/paste)
7. **Browser console logs** (screenshot or copy/paste)

### Contact Support

- **GitHub Issues**: [Open an issue](https://github.com/yourorg/veritaslivepoll/issues)
- **Email**: sborish@malvernprep.org
- **Include**: All information from "Before Opening an Issue" above

### Community Resources

- [README.md](README.md) - Overview and quick start
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical deep-dive
- [DEPLOYMENT.md](DEPLOYMENT.md) - Setup instructions
- [PROCTOR_QA_CHECKLIST.md](PROCTOR_QA_CHECKLIST.md) - Test proctoring

---

**Remember**: Most issues are solved by refreshing the page, checking execution logs, or running the diagnostic functions above.
