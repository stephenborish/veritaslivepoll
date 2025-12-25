# Write-Behind Flush Trigger Setup Guide

## ⚠️ CRITICAL: This trigger is REQUIRED for secure assessments to work

Without this trigger, student answers cached in the write-behind system will be **LOST** after 10 minutes (cache TTL expiration).

---

## Automatic Installation (Recommended)

### Prerequisites

1. **OAuth Scope Required:** The project must have the `script.scriptapp` scope in `appsscript.json`:
   ```json
   "oauthScopes": [
     "https://www.googleapis.com/auth/script.scriptapp"
   ]
   ```
   ✅ This scope has been added to the project.

2. **Re-authorization:** After adding the scope, users must re-authorize the script:
   - Go to Apps Script Editor → Run → `setupSheet`
   - Click "Review Permissions"
   - Accept the new permission request

### Installation Steps

1. **Run setupSheet():**
   ```javascript
   // From Apps Script Editor or Teacher UI
   setupSheet()
   ```
   The trigger will be auto-installed during setup.

2. **Verify Installation:**
   ```javascript
   Veritas.TeacherApi.verifyWriteBehindTrigger()
   ```
   Should return:
   ```json
   {
     "success": true,
     "installed": true,
     "message": "Write-behind flush trigger is installed"
   }
   ```

3. **Manual Installation (if auto-install fails):**
   ```javascript
   Veritas.TeacherApi.installWriteBehindTrigger()
   ```

---

## Manual Installation (If Automatic Fails)

If the automatic installation fails due to permissions, install manually:

### Step 1: Open Triggers Menu

1. Open the Apps Script project
2. Click the **clock icon** (⏰) in the left sidebar labeled "Triggers"

### Step 2: Add New Trigger

Click **"+ Add Trigger"** in the bottom right

### Step 3: Configure Trigger

Set the following options:

| Setting | Value |
|---------|-------|
| **Choose which function to run** | `flushAnswersWorkerTrigger` |
| **Choose which deployment should run** | `Head` |
| **Select event source** | `Time-driven` |
| **Select type of time based trigger** | `Minutes timer` |
| **Select minute interval** | `Every minute` |

### Step 4: Save

1. Click **"Save"**
2. You may be prompted to authorize the trigger - click **"Allow"**

### Step 5: Verify

The trigger should now appear in your triggers list:
- **Function:** flushAnswersWorkerTrigger
- **Event:** Time-driven, Every minute

---

## Verification

### Check Trigger Status

From Apps Script Editor, run:
```javascript
Veritas.TeacherApi.verifyWriteBehindTrigger()
```

**Expected Result:**
```json
{
  "success": true,
  "installed": true,
  "triggerInfo": {
    "handlerFunction": "flushAnswersWorkerTrigger",
    "triggerSource": "CLOCK",
    "eventType": "CLOCK"
  },
  "message": "Write-behind flush trigger is installed"
}
```

### Test the Flush

1. Submit a secure assessment answer as a student
2. Check cache contains answer:
   ```javascript
   // From Apps Script
   var cache = CacheService.getScriptCache();
   var keys = cache.get('pending_keys_<POLL_ID>');
   Logger.log(keys); // Should show pending answers
   ```
3. Wait 1 minute for trigger to run
4. Check Responses sheet - answer should be flushed

---

## Troubleshooting

### Error: "Specified permissions are not sufficient"

**Cause:** Missing `script.scriptapp` OAuth scope

**Fix:**
1. Verify `src/appsscript.json` contains the scope (✅ already added)
2. Re-deploy the project (push to Apps Script)
3. Re-authorize by running any function and accepting new permissions
4. Try automatic installation again

### Error: "Cannot call SpreadsheetApp.getUi() from this context"

**Cause:** Script running in a context without UI (e.g., trigger, API call)

**Impact:** Warning messages won't display, but trigger installation should still work

**Fix:** Ignore this warning - it's cosmetic. Verify trigger installed with `verifyWriteBehindTrigger()`

### Trigger Installed But Answers Not Flushing

**Debug Steps:**

1. **Check Trigger Execution:**
   - Go to Apps Script Editor → Executions (play icon in sidebar)
   - Look for `flushAnswersWorkerTrigger` executions
   - Check for errors

2. **Check Pending Answers:**
   ```javascript
   // From Apps Script
   var result = Veritas.Models.Session.flushAnswersWorker();
   Logger.log(result);
   ```

3. **Check Responses Sheet:**
   - Open Responses sheet
   - Verify ResponseID, Timestamp, PollID, QuestionIndex, StudentEmail, Answer columns exist
   - Check for new rows after trigger runs

4. **Common Issues:**
   - Cache expired (10 min TTL) before flush ran
   - Lock contention preventing flush
   - Sheet permissions issue

---

## Monitoring

### Regular Checks

Run these periodically to ensure system health:

```javascript
// 1. Verify trigger still installed
Veritas.TeacherApi.verifyWriteBehindTrigger()

// 2. Check for pending answers
Veritas.Models.Session.flushAnswersWorker()

// 3. Review execution logs
// Apps Script Editor → Executions → Filter by flushAnswersWorkerTrigger
```

### Expected Behavior

- **Trigger runs:** Every 1 minute
- **Execution time:** < 5 seconds (depends on pending answer count)
- **Flushed count:** Varies (0 if no pending answers is normal)
- **Errors:** Should be 0

---

## Re-installation

If you need to reinstall the trigger:

```javascript
// Delete and recreate
Veritas.TeacherApi.installWriteBehindTrigger()
```

This will:
1. Delete any existing `flushAnswersWorkerTrigger` triggers
2. Create a new trigger with correct settings

---

## Impact of Missing Trigger

If the trigger is not installed or stops running:

⚠️ **CRITICAL DATA LOSS RISK:**
- Student answers cached but not yet flushed will be **PERMANENTLY LOST** after 10 minutes
- `hasAnswered()` will continue to prevent duplicates for 10 minutes, then allow resubmission
- No error message shown to students - answers silently lost

🔴 **ALWAYS verify trigger is running before conducting secure assessments!**

---

## Questions?

Contact the Veritas development team or refer to:
- `CRITICAL_FIXES_APPLIED.md` - Full fix documentation
- Apps Script Triggers Documentation: https://developers.google.com/apps-script/guides/triggers

---

**Last Updated:** 2024-12-23
**Related Fixes:** P0-1 Write-Behind Data Loss Prevention
