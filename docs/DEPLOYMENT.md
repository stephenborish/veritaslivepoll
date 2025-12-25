# Veritas Live Poll - Deployment Guide

**Last Updated**: 2025-11-10
**Estimated Time**: 15-20 minutes for first deployment
**Difficulty**: Beginner-friendly (step-by-step instructions)

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Create Google Sheet](#step-1-create-google-sheet)
- [Step 2: Set Up Apps Script Project](#step-2-set-up-apps-script-project)
- [Step 3: Configure Settings](#step-3-configure-settings)
- [Step 4: Initialize Database](#step-4-initialize-database)
- [Step 5: Deploy Web App](#step-5-deploy-web-app)
- [Step 6: Test Deployment](#step-6-test-deployment)
- [Step 7: Create First Poll](#step-7-create-first-poll)
- [Updating Existing Deployment](#updating-existing-deployment)
- [Troubleshooting Deployment Issues](#troubleshooting-deployment-issues)

---

## Prerequisites

### Required
- ✅ Google account (free Gmail or Google Workspace)
- ✅ Modern web browser (Chrome, Firefox, or Safari)
- ✅ Basic familiarity with Google Sheets and Google Drive
- ✅ Teacher email address for authentication

### Recommended
- Google Workspace account (higher email quota: 1500/day vs 100/day for free accounts)
- Desktop computer (mobile not recommended for setup)

### Access the Project Files
You should have access to these files:
- `Code.gs` - Backend server logic
- `TeacherView.html` - Teacher dashboard UI
- `StudentView.html` - Student interface UI
- `appsscript.json` - Project configuration

---

## Step 1: Create Google Sheet

### 1.1 Create New Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Click **+ Blank** to create a new spreadsheet
3. Rename it: Click "Untitled spreadsheet" → Type "Veritas Live Poll Database" → Press Enter

**Why this matters**: This spreadsheet will serve as your application's database, storing all polls, rosters, and responses.

### 1.2 Note the Spreadsheet ID (Optional)

If you plan to use `clasp` for local development:
1. Look at the URL: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`
2. Copy the `SPREADSHEET_ID` (between `/d/` and `/edit`)
3. Save it for later reference

---

## Step 2: Set Up Apps Script Project

### 2.1 Open Apps Script Editor

1. In your Google Sheet, click **Extensions** → **Apps Script**
2. A new tab opens with the Apps Script editor
3. You'll see a default `Code.gs` file with sample code

### 2.2 Copy Project Files

#### Option A: Manual Copy (Recommended for Beginners)

1. **Replace Code.gs**:
   - Select all text in the editor (Ctrl+A / Cmd+A)
   - Delete it
   - Copy contents from your `Code.gs` file
   - Paste into the editor (Ctrl+V / Cmd+V)
   - File saves automatically

2. **Add TeacherView.html**:
   - Click **+ (Add file)** → **HTML**
   - Name it: `TeacherView`
   - Delete placeholder content
   - Copy contents from your `TeacherView.html` file
   - Paste into the editor

3. **Add StudentView.html**:
   - Click **+ (Add file)** → **HTML**
   - Name it: `StudentView`
   - Delete placeholder content
   - Copy contents from your `StudentView.html` file
   - Paste into the editor

4. **Update appsscript.json**:
   - Click on `appsscript.json` in the file list (left sidebar)
   - If you don't see it: Click **Project Settings** (gear icon) → Check "Show appsscript.json manifest file in editor"
   - Replace contents with your `appsscript.json` file

#### Option B: Using clasp (Advanced Users)

```bash
# Install clasp globally
npm install -g @google/clasp

# Log in to Google account
clasp login

# Clone this project
git clone https://github.com/yourorg/veritaslivepoll.git
cd veritaslivepoll

# Create new Apps Script project
clasp create --type sheets --title "Veritas Live Poll" --rootDir .

# Push files to Apps Script
clasp push

# Open in browser
clasp open
```

### 2.3 Verify Files

Check that you have these files in the editor:
- ✅ Code.gs
- ✅ TeacherView.html
- ✅ StudentView.html
- ✅ appsscript.json

---

## Step 3: Configure Settings

### 3.1 Set Teacher Email

1. In `Code.gs`, find line ~50:
   ```javascript
   const TEACHER_EMAIL = "teacher@example.com";
   ```

2. Replace `"teacher@example.com"` with your email address:
   ```javascript
   const TEACHER_EMAIL = "your-email@yourdomain.com";
   ```

3. Save (Ctrl+S / Cmd+S)

**Important**: Use the exact email address you'll log into Google with. This determines who can access the teacher dashboard.

### 3.2 Configure Additional Settings (Optional)

**Token Expiry** (default: 30 days):
```javascript
// Line ~53
const TOKEN_EXPIRY_DAYS = 60; // Change to 60 days
```

**Timer Default** (default: 90 seconds):
```javascript
// In TeacherView.html, search for "defaultTimerValue"
const defaultTimerValue = 120; // Change to 120 seconds
```

### 3.3 Add Additional Teachers (Optional)

To allow multiple teachers:

1. Click **Project Settings** (gear icon)
2. Scroll to **Script Properties**
3. Click **Add script property**
4. **Property**: `ADDITIONAL_TEACHERS`
5. **Value**: `teacher2@school.edu,teacher3@school.edu` (comma-separated)
6. Click **Save script properties**

---

## Step 4: Initialize Database

### 4.1 Run Setup Function

1. In the Apps Script editor, find the function dropdown (next to Debug button)
2. Select `setupSheet` from the dropdown
3. Click **Run** (▶️ button)

### 4.2 Authorize Permissions

**First-time authorization** (only happens once):

1. Dialog appears: "Authorization required"
2. Click **Review permissions**
3. Select your Google account
4. Warning: "Google hasn't verified this app"
   - Click **Advanced**
   - Click **Go to Veritas Live Poll (unsafe)** [This is your own app, it's safe]
5. Review permissions list:
   - Send email as you
   - See, edit, create, and delete your spreadsheets
   - See, edit, create, and delete your Google Drive files
6. Click **Allow**

### 4.3 Verify Database Creation

1. Return to your Google Sheet tab
2. You should now see 5 sheets (tabs at bottom):
   - **Classes**: For managing class lists
   - **Rosters**: For storing student information
   - **Polls**: For storing poll questions
   - **LiveStatus**: For tracking active poll state (only 1 row)
   - **Responses**: For logging student answers

3. Check each sheet has headers:
   - **Classes**: `ClassName`, `Description`
   - **Rosters**: `ClassName`, `StudentName`, `StudentEmail`
   - **Polls**: `PollID`, `PollName`, `ClassName`, `QuestionIndex`, `QuestionDataJSON`, `CreatedAt`, `UpdatedAt`
   - **LiveStatus**: `ActivePollID`, `ActiveQuestionIndex`, `PollStatus`
   - **Responses**: `ResponseID`, `Timestamp`, `PollID`, `QuestionIndex`, `StudentEmail`, `Answer`, `IsCorrect`, `Metadata`

**If any sheets are missing**, re-run `setupSheet()`.

---

## Step 5: Deploy Web App

### 5.1 Create Deployment

1. In Apps Script editor, click **Deploy** → **New deployment**
2. Click **Select type** (gear icon) → **Web app**
3. Fill in deployment settings:
   - **Description**: "Initial deployment" or "v1.0"
   - **Execute as**: **Me** (your email)
   - **Who has access**: **Anyone** (required for student access)
4. Click **Deploy**

### 5.2 Authorize Deployment

If prompted again for permissions:
1. Click **Authorize access**
2. Select your Google account
3. Click **Allow**

### 5.3 Copy Web App URL

1. Deployment success dialog appears
2. Copy the **Web app URL** (looks like: `https://script.google.com/macros/s/[LONG_ID]/exec`)
3. Save this URL somewhere safe (you'll need it to access the app)

**This is your production URL** - share it with yourself for easy access, but don't share with students (they get unique token links).

---

## Step 6: Test Deployment

### 6.1 Access Teacher Dashboard

1. Open a new browser tab
2. Paste the Web app URL
3. Press Enter
4. **Expected**: You see the Teacher Dashboard with:
   - "Veritas Live Poll" header
   - Poll selector dropdown (empty)
   - "Create New Poll" button
   - Navigation buttons

**If you see "Access Denied"**:
- Verify `TEACHER_EMAIL` matches the email you're logged into Google with
- Try logging out of all Google accounts, then log back in with the correct account
- See [Troubleshooting](#troubleshooting-deployment-issues) below

### 6.2 Test Student View (Without Token)

1. Open an incognito/private browsing window
2. Paste the Web app URL
3. **Expected**: You see "Access Denied" or "Invalid Token"

**This is correct** - students need unique token links generated later.

---

## Step 7: Create First Poll

### 7.1 Create a Class

1. In Teacher Dashboard, look for class management section (or you can directly edit the Classes sheet)
2. **Option A**: Use UI (if available):
   - Click "Manage Classes"
   - Click "Add Class"
   - Enter class name: "Test Class"
   - Click "Save"

3. **Option B**: Edit sheet directly:
   - Go to your Google Sheet
   - Click **Classes** tab
   - In row 2, enter:
     - `ClassName`: "Test Class"
     - `Description`: "For testing deployment"

### 7.2 Add Test Students to Roster

**Option A**: Via UI bulk import (if available)

**Option B**: Direct sheet entry:
1. Go to your Google Sheet
2. Click **Rosters** tab
3. Add rows starting from row 2:

   | ClassName | StudentName | StudentEmail |
   |-----------|-------------|--------------|
   | Test Class | Test Student 1 | teststudent1@example.com |
   | Test Class | Test Student 2 | your-personal-email@gmail.com |

**Pro tip**: Use your own personal email as "Test Student 2" so you can receive the token link.

### 7.3 Create a Test Poll

1. In Teacher Dashboard, click **Create New Poll**
2. Fill in poll details:
   - **Poll Name**: "Deployment Test"
   - **Class**: Select "Test Class"
3. Add a simple question:
   - **Question Text**: "What is 2 + 2?"
   - **Answer A**: "3"
   - **Answer B**: "4" (select as correct)
   - **Answer C**: "5"
4. Click **Save Poll**

### 7.4 Send Student Links

1. In Poll selector dropdown, select "Deployment Test"
2. Click **Send Student Links** button
3. **Expected**: Confirmation message: "Links sent to 2 students"
4. Check your email (the one you used for "Test Student 2")
5. You should receive an email:
   - **Subject**: "Your Live Poll Access Link"
   - **Body**: Contains a unique URL with token parameter

### 7.5 Test Student Flow

1. Click the link in the email
2. **Expected**: You see Student entry screen with security warning
3. Click **Begin Session**
4. **Expected**: Browser requests fullscreen (click Allow)
5. **Expected**: You see "Waiting for poll to begin..."

### 7.6 Test Full Session

**In Teacher Browser**:
1. Select "Deployment Test" poll
2. Click **Start Poll**
3. **Expected**: Live dashboard appears with chart and student grid

**In Student Browser**:
1. Question appears: "What is 2 + 2?"
2. Click "4"
3. Click **Submit Answer**
4. **Expected**: "Your answer has been submitted" message

**In Teacher Browser**:
1. Chart updates to show 1 response for "B"
2. Student grid shows "Test Student 2" as "Submitted" (green)

**In Teacher Browser**:
1. Click **End Poll**

**In Student Browser**:
1. **Expected**: "The poll has ended. Thank you for participating!"

✅ **If all steps worked, deployment is successful!**

---

## Updating Existing Deployment

### When to Update

- After code changes
- After fixing bugs
- After adding new features

### Update Process

**Option A: Replace Code (Simple)**
1. Open Apps Script editor
2. Select and replace contents of changed files
3. Save (Ctrl+S)
4. No redeployment needed (changes take effect immediately)

**Option B: Create New Deployment Version (Recommended for Major Changes)**
1. Make code changes
2. Click **Deploy** → **Manage deployments**
3. Click **Edit** (pencil icon) on current deployment
4. Change **Version** to **New version**
5. Update description: "v1.1 - Added analytics"
6. Click **Deploy**
7. Old version remains accessible (can rollback if needed)

### Rollback to Previous Version

1. Click **Deploy** → **Manage deployments**
2. Click **Edit** on current deployment
3. Change **Version** to previous version from dropdown
4. Click **Deploy**

---

## Troubleshooting Deployment Issues

### Issue 1: "Authorization required" Loop

**Symptom**: Keeps asking for permissions even after authorizing

**Solutions**:
1. Clear browser cache and cookies for `accounts.google.com`
2. Try a different browser
3. Check that you're logged into the correct Google account
4. Disable browser extensions (especially ad blockers)
5. Try incognito mode

### Issue 2: "Access Denied" for Teacher

**Symptom**: Teacher sees access denied even with correct email

**Solutions**:
1. Verify `TEACHER_EMAIL` in Code.gs exactly matches your Google account email
2. Check for trailing spaces in the email constant
3. Log out of all Google accounts, log back into the correct one
4. Check Apps Script execution logs:
   - Apps Script editor → **Executions** tab
   - Look for the email that attempted access
   - Verify it matches `TEACHER_EMAIL`

### Issue 3: setupSheet() Fails

**Symptom**: Error message when running setupSheet()

**Common Errors**:
- "Exception: Service Spreadsheets failed" → Sheet is open in another tab, close and retry
- "Exception: Cannot find function setupSheet" → Code didn't save, re-paste Code.gs
- Timeout error → Sheet too large, create a fresh sheet

**Solutions**:
1. Check Apps Script execution logs for specific error
2. Ensure Code.gs saved correctly
3. Try running from a fresh Google Sheet
4. Check permissions were granted

### Issue 4: Web App URL Doesn't Work

**Symptom**: 404 error or blank page when accessing URL

**Solutions**:
1. Verify you copied the **entire** URL (very long)
2. Check you're accessing `/exec` not `/dev` endpoint
3. Redeploy:
   - **Deploy** → **Manage deployments**
   - Click **Archive** on current deployment
   - Create new deployment
4. Wait 1-2 minutes (deployment can take time to propagate)

### Issue 5: Student Links Not Sending

**Symptom**: "Send Student Links" button doesn't send emails

**Solutions**:
1. Check execution logs for email errors:
   - Apps Script editor → **Executions** tab
   - Look for MailApp errors
2. Verify student email addresses are valid (no typos)
3. Check Gmail sending quota:
   - Free accounts: 100 emails/day
   - Workspace: 1500 emails/day
4. Wait 24 hours if quota exceeded
5. Manually send links as fallback

### Issue 6: Proctoring Not Working

**Symptom**: Students can exit fullscreen without getting locked

**Solutions**:
1. Run [PROCTOR_QA_CHECKLIST.md](PROCTOR_QA_CHECKLIST.md)
2. Check browser compatibility (Chrome/Firefox recommended)
3. Test in different browser
4. Ensure `StudentView.html` has latest proctoring code
5. Check browser console (F12) for JavaScript errors

---

## Post-Deployment Checklist

- [ ] Teacher can access dashboard with correct email
- [ ] setupSheet() created all 5 sheets
- [ ] Test poll created successfully
- [ ] Student roster added
- [ ] Student links generated and sent
- [ ] Student can access link and join poll
- [ ] Teacher can start poll
- [ ] Student sees question
- [ ] Student can submit answer
- [ ] Teacher sees response in chart
- [ ] Teacher can end poll
- [ ] Proctoring tested (ESC → lock → unlock flow)
- [ ] Web app URL bookmarked for easy access
- [ ] Spreadsheet shared with other teachers (if multi-teacher)

---

## Security Checklist

- [ ] `TEACHER_EMAIL` configured correctly (no typos)
- [ ] Web app deployed with "Execute as: Me"
- [ ] OAuth permissions reviewed and authorized
- [ ] Student token expiry set appropriately (30 days default)
- [ ] No sensitive data in code (passwords, API keys)
- [ ] Spreadsheet permissions reviewed (only teachers have edit access)
- [ ] Google Drive folder permissions checked (images folder)

---

## Next Steps

1. **Production Use**:
   - Create real class rosters
   - Build your first real poll
   - Test with a small group before full classroom deployment

2. **Documentation**:
   - Bookmark the web app URL
   - Save student link generation process
   - Document any custom configuration

3. **Maintenance**:
   - Review [TODO.md](TODO.md) maintenance tasks
   - Set calendar reminder for quarterly updates
   - Monitor Apps Script execution logs for errors

---

## Support

**Issues During Deployment?**
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for comprehensive issue guide
- Review Apps Script execution logs
- Open GitHub issue with deployment logs
- Email: sborish@malvernprep.org

---

**Congratulations on deploying Veritas Live Poll! You're ready to conduct secure, proctored live polls with your students.**
