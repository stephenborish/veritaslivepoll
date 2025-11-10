# Veritas Live Poll

**A real-time, secure classroom polling system with comprehensive proctoring features**

[![Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Setup & Deployment](#setup--deployment)
- [User Workflows](#user-workflows)
- [Configuration](#configuration)
- [Security](#security)
- [Browser Compatibility](#browser-compatibility)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Veritas Live Poll** is a production-ready, real-time interactive polling application designed specifically for classroom environments. Built entirely on Google Apps Script, it provides a serverless, zero-maintenance solution for conducting secure live polls with comprehensive anti-cheating proctoring.

### What Makes It Special

- **🔐 No Student Logins Required**: Token-based authentication eliminates the need for student Google accounts
- **👁️ Comprehensive Proctoring**: Automatic fullscreen enforcement with tab-switching and focus detection
- **📊 Real-Time Analytics**: Live response visualization with per-student tracking
- **🎯 Teacher Authority**: Centralized control with synchronized state across all clients
- **💪 Production-Ready**: Built with resilience patterns including exponential backoff, state versioning, and connection health monitoring
- **🎨 Modern UI**: Clean, accessible interface with Tailwind CSS and AP-style typography

### Technology Stack

- **Backend**: Google Apps Script (V8 runtime)
- **Database**: Google Sheets (relational data model)
- **Storage**: Google Drive (image hosting)
- **Frontend**: HTML5 + JavaScript + Tailwind CSS
- **Charts**: Google Charts API
- **Authentication**: Token-based (30-day expiry)

---

## Key Features

### For Teachers

#### 📋 Poll Management
- Create, edit, duplicate, and delete polls with a visual interface
- Multi-question support with unlimited questions per poll
- Rich media support (images for questions and answer choices)
- Mark correct answers for automatic grading
- Poll preview before going live

#### 🎮 Live Classroom Control
- **Start/Pause/Resume/End** polls with real-time synchronization
- **Question Timer**: Configurable countdown (90s default) with auto-pause on expiry
- **Question Navigation**: Move forward/backward through questions
- **Reset Questions**: Clear responses or keep them while resetting the question

#### 📊 Real-Time Monitoring Dashboard
- **Live Bar Chart**: Google Charts visualization updating every 2.5 seconds
- **Student Status Grid**: Individual tiles showing:
  - Student name and response status
  - Color-coded states (🟢 Submitted, 🔴 Locked, 🔵 Awaiting Fullscreen, ⚪ Waiting)
  - Time elapsed since status change
  - One-click unlock for proctoring violations

#### 👥 Classroom Management
- Create and manage student rosters by class
- Bulk CSV import for student lists
- Auto-generate and email unique access links
- Multi-class support with independent rosters

#### 📈 Analytics & Insights
- Response analysis by student with correctness tracking
- Point-biserial correlation for item discrimination
- Misconception tagging capabilities
- Session performance aggregates

### For Students

#### 🔑 Secure Access
- **Unique Token Links**: 30-day expiration, no account required
- **Email Delivery**: Receive personalized poll links via email
- **One-Click Join**: No password, no login screen

#### 📝 Interactive Polling
- Clean, distraction-free question interface
- Multiple-choice answers with optional images
- Real-time submission confirmation
- Clear waiting states between questions

#### 🔒 Proctoring Features
- **Fullscreen Enforcement**: Automatic entry on session start
- **Violation Detection**: Monitors tab switches, window focus, fullscreen exits
- **Automatic Lock**: Immediate lockout on detected violations
- **Teacher Approval Flow**: Clear unlock instructions with version tracking
- **Page Reload Recovery**: State persists across browser refreshes

#### 💪 Resilience
- Connection health monitoring with visual indicators
- Offline-aware retry logic with exponential backoff
- Adaptive polling intervals (faster when healthy, slower when struggling)
- State version synchronization prevents stale data

---

## Quick Start

### Prerequisites

```bash
✓ Google Workspace account (or standard Google account with Drive/Sheets access)
✓ Basic familiarity with Google Apps Script
✓ Teacher email address for authentication
```

### Installation (5 Minutes)

1. **Create a new Google Sheet**
   ```
   Name it: "Veritas Live Poll Database"
   ```

2. **Open Apps Script Editor**
   ```
   Extensions → Apps Script
   ```

3. **Copy the code files**
   - Copy contents of `Code.gs` to the default `Code.gs` file
   - Create new HTML files: `TeacherView.html`, `StudentView.html`
   - Copy contents from repository

4. **Configure teacher email**
   - Edit `TEACHER_EMAIL` constant in `Code.gs` (line ~50)
   ```javascript
   const TEACHER_EMAIL = "your-email@yourdomain.com";
   ```

5. **Run initial setup**
   - In Apps Script editor, select `setupSheet` from function dropdown
   - Click **Run** (authorize permissions when prompted)
   - Verify 5 new sheets created: Classes, Rosters, Polls, LiveStatus, Responses

6. **Deploy as Web App**
   - Click **Deploy** → **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the URL

7. **Test the deployment**
   - Open the web app URL (you should see Teacher Dashboard)
   - Create a test class and roster
   - Create a test poll

✅ **You're ready to go!** See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Apps Script                      │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ Code.gs      │◄────────┤ Google Sheet │                │
│  │ (Backend)    │         │ (Database)   │                │
│  │              │         └──────────────┘                │
│  │ • Router     │                                          │
│  │ • Auth       │         ┌──────────────┐                │
│  │ • DataAccess │◄────────┤ Google Drive │                │
│  │ • Proctoring │         │ (Images)     │                │
│  │ • State Mgmt │         └──────────────┘                │
│  └──────┬───────┘                                          │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          │ HTTP/RPC
          │
    ┌─────┴─────┐
    │           │
┌───▼───┐   ┌───▼────┐
│Teacher│   │Student │
│  UI   │   │   UI   │
└───────┘   └────────┘
```

### Data Flow

**Teacher → Student Synchronization**
1. Teacher performs action (start poll, next question, unlock student)
2. Backend updates Google Sheet and state version
3. Teacher UI polls `getLivePollData()` every 2.5s
4. Student UIs poll `getStudentPollStatus()` every 2.5s
5. State changes propagate within ~2.5 seconds

**Student → Teacher Reporting**
1. Student submits answer
2. Backend writes to Responses sheet
3. Teacher's next poll cycle includes new response
4. Chart and status grid update automatically

### Google Sheets Database Schema

#### Classes Sheet
```
┌─────────────┬──────────────────────────┐
│ ClassName   │ Description              │
├─────────────┼──────────────────────────┤
│ AP Bio      │ Advanced Placement Bio   │
│ Physics 101 │ Introductory Physics     │
└─────────────┴──────────────────────────┘
```

#### Rosters Sheet
```
┌─────────────┬───────────────┬─────────────────────────┐
│ ClassName   │ StudentName   │ StudentEmail            │
├─────────────┼───────────────┼─────────────────────────┤
│ AP Bio      │ John Smith    │ jsmith@example.com      │
│ AP Bio      │ Jane Doe      │ jdoe@example.com        │
└─────────────┴───────────────┴─────────────────────────┘
```

#### Polls Sheet
```
┌──────────┬───────────┬───────────┬──────────────┬──────────────────┐
│ PollID   │ PollName  │ ClassName │ QuestionIdx  │ QuestionDataJSON │
├──────────┼───────────┼───────────┼──────────────┼──────────────────┤
│ uuid-123 │ Mitosis   │ AP Bio    │ 0            │ {...json...}     │
│ uuid-123 │ Mitosis   │ AP Bio    │ 1            │ {...json...}     │
└──────────┴───────────┴───────────┴──────────────┴──────────────────┘
```

#### LiveStatus Sheet (1 row only)
```
┌──────────────┬──────────────────────┬────────────┐
│ ActivePollID │ ActiveQuestionIndex  │ PollStatus │
├──────────────┼──────────────────────┼────────────┤
│ uuid-123     │ 0                    │ OPEN       │
└──────────────┴──────────────────────┴────────────┘
```

#### Responses Sheet
```
┌────────────┬──────────┬──────────┬───────────┬──────────────────┬────────┬───────────┐
│ ResponseID │ Timestamp│ PollID   │ QIdx      │ StudentEmail     │ Answer │ IsCorrect │
├────────────┼──────────┼──────────┼───────────┼──────────────────┼────────┼───────────┤
│ uuid-456   │ 2025-... │ uuid-123 │ 0         │ jsmith@ex.com    │ B      │ true      │
└────────────┴──────────┴──────────┴───────────┴──────────────────┴────────┴───────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

---

## Setup & Deployment

### Initial Configuration

#### 1. Teacher Email Setup
Edit `Code.gs` around line 50:
```javascript
const TEACHER_EMAIL = "teacher@school.edu";
```

For multiple teachers, use Script Properties:
```javascript
// In Apps Script editor: Project Settings → Script Properties → Add property
Key: ADDITIONAL_TEACHERS
Value: teacher2@school.edu,teacher3@school.edu
```

#### 2. Token Expiry (Optional)
Default: 30 days. To change:
```javascript
const TOKEN_EXPIRY_DAYS = 60; // Line ~53 in Code.gs
```

#### 3. Default Timer (Optional)
Default: 90 seconds. To change:
```javascript
// In TeacherView.html, search for "defaultTimerValue"
const defaultTimerValue = 120; // seconds
```

### Deployment Options

#### Option A: Standard Deployment
```
1. Apps Script Editor → Deploy → New deployment
2. Type: Web app
3. Execute as: Me
4. Who has access: Anyone
5. Deploy
```

#### Option B: Versioned Deployment
```
1. Apps Script Editor → Deploy → Manage deployments
2. Create new version with description
3. Maintains deployment history
4. Allows rollback if needed
```

### Post-Deployment Checklist

- [ ] Run `setupSheet()` function once
- [ ] Verify all 5 sheets created
- [ ] Add at least one class to Classes sheet
- [ ] Add students to Rosters sheet (or use bulk import)
- [ ] Create a test poll
- [ ] Generate and test a student token link
- [ ] Test fullscreen proctoring flow
- [ ] Verify email delivery works
- [ ] Check Apps Script logs for errors
- [ ] Test on target browsers (Chrome, Firefox, Safari)

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment guide with screenshots.

---

## User Workflows

### Teacher Workflow (Complete Session)

#### Phase 1: Preparation
1. **Create Class Roster**
   - Navigate to Classes tab → Create new class
   - Add students manually or via CSV bulk import
   - Verify email addresses are correct

2. **Create Poll**
   - Click "Create New Poll" button
   - Enter poll name and select class
   - Add questions:
     - Type question text (supports rich formatting)
     - Upload question image (optional)
     - Add 2-6 answer choices
     - Upload images for answer choices (optional)
     - Mark the correct answer with radio button
   - Click "Save Poll"

3. **Send Student Links**
   - Select poll from dropdown
   - Click "Send Student Links"
   - System generates unique tokens for each student
   - Automated emails sent with personalized URLs
   - Verify emails delivered (check spam folders if needed)

#### Phase 2: Live Session
4. **Start the Poll**
   - Select poll from dropdown
   - (Optional) Set custom timer value (default: 90s)
   - Click "Start Poll"
   - System enters LIVE state, students can now join

5. **Monitor Responses**
   - **Live Chart**: See response distribution in real-time
   - **Student Grid**: Monitor individual student states:
     - 🟢 **Green**: Student submitted answer
     - ⚪ **Gray**: Student waiting (not submitted)
     - 🔴 **Red**: Student locked (violation detected)
     - 🔵 **Blue**: Student awaiting fullscreen (approved unlock)
   - Click on student tiles to see their answer
   - View time elapsed for each state

6. **Manage Timer**
   - **Pause**: Freeze timer and prevent new submissions
   - **Resume**: Restart timer and reopen submissions
   - **Reset**: Return timer to configured value
   - Auto-pause occurs when timer reaches 0:00

7. **Handle Proctoring Violations**
   - Student exits fullscreen/switches tabs → automatic lock
   - Red tile appears with "LOCKED" status and version number
   - Click "Approve" button on locked student
   - Student sees unlock message, must re-enter fullscreen
   - Tile changes to blue "AWAITING_FULLSCREEN"
   - Once student enters fullscreen, returns to normal state

8. **Advance to Next Question**
   - Click "Next Question" button
   - All students see new question immediately (within 2.5s)
   - Previous answers saved to database
   - Chart resets for new question
   - Student submission states reset

9. **Reset Question (if needed)**
   - Click "Reset Question" button
   - Choose: **Clear responses** or **Keep responses**
   - Students return to unanswered state
   - Use for technical issues or to re-ask question

#### Phase 3: Completion
10. **End the Poll**
    - After last question, click "End Poll"
    - System enters ENDED state
    - All students see "Session Complete" message
    - Responses saved to database
    - Analytics available for review

11. **Review Analytics** (Post-Session)
    - View per-student performance
    - Analyze question difficulty
    - Review misconceptions
    - Export data to CSV (if enabled)

---

### Student Workflow (Complete Session)

#### Phase 1: Access
1. **Receive Email**
   - Email subject: "Your Live Poll Access Link"
   - Contains unique URL (e.g., `.../exec?token=abc123...`)
   - Token valid for 30 days

2. **Click Link**
   - Opens in browser
   - No login required
   - See entry screen with security warning

#### Phase 2: Entry
3. **Read Security Warning**
   ```
   Security Requirements:
   • Stay in fullscreen mode
   • Do not switch tabs
   • Do not minimize window
   • Violations will lock your session
   ```

4. **Click "Begin Session"**
   - Browser requests fullscreen permission
   - Click "Allow" in browser prompt
   - Screen enters fullscreen mode
   - Security monitoring starts

#### Phase 3: Waiting
5. **Wait for Poll Start**
   - See message: "Waiting for the poll to begin..."
   - System polls server every 2.5 seconds
   - Screen updates automatically when teacher starts poll

#### Phase 4: Answering Questions
6. **View Question**
   - Question text appears (large serif font)
   - Question image displays (if present)
   - Answer choices show as buttons
   - Images on answer choices (if present)

7. **Select Answer**
   - Click desired answer button
   - Button highlights with blue border
   - "Submit Answer" button becomes enabled

8. **Submit Answer**
   - Click "Submit Answer"
   - Confirmation message appears
   - Cannot change answer once submitted

9. **Wait for Next Question**
   - See: "Your answer has been submitted. Please wait..."
   - Automatic update when teacher advances question
   - Repeat steps 6-9 for each question

#### Phase 5: Proctoring Scenarios

**Scenario A: Accidental Violation**
1. Student accidentally presses ESC or Alt+Tab
2. Immediate lock screen appears:
   ```
   🔒 Your session has been locked because you exited fullscreen mode.
   Your teacher must unlock you.
   ```
3. Student cannot proceed without teacher approval
4. Teacher clicks "Approve" in dashboard
5. Student sees unlock message:
   ```
   🔵 Your teacher has unlocked your session.
   Resume fullscreen to continue.
   [Resume Poll Button]
   ```
6. Student clicks "Resume Poll"
7. Browser requests fullscreen again
8. Student grants permission
9. Returns to normal poll state

**Scenario B: Page Reload While Locked**
1. Student reloads browser (accidental or intentional)
2. System remembers lock state
3. Lock screen reappears
4. Must still wait for teacher approval
5. State persists across reloads

**Scenario C: Connection Issues**
1. Student loses internet connection
2. Polling fails with connection error
3. Adaptive backoff begins (3s → 6s → 12s intervals)
4. Connection health indicator shows warning
5. When connection restores:
   - Polling resumes normal 2.5s interval
   - State synchronizes automatically
   - Student continues where they left off

#### Phase 6: Completion
10. **Session Ends**
    - Teacher clicks "End Poll"
    - Student sees: "The poll has ended. Thank you for participating!"
    - Can safely exit fullscreen and close browser

---

## Configuration

### Environment Variables (Code.gs)

```javascript
// Core Configuration (Lines ~50-60)
const TEACHER_EMAIL = "teacher@school.edu";        // Primary teacher email
const TOKEN_EXPIRY_DAYS = 30;                      // Student token lifespan
const DEPLOYMENT_URL = ScriptApp.getService().getUrl(); // Auto-detected

// Cache Durations (Lines ~100-110)
const CACHE_TIMES = {
  ONE_SECOND: 1,
  TEN_SECONDS: 10,
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  ONE_HOUR: 3600,
  SIX_HOURS: 21600
};

// Rate Limiting (Lines ~150-160)
const RATE_LIMIT = {
  maxRequests: 100,           // Max requests per user per window
  windowMs: 60000,            // Time window (1 minute)
  banDuration: 300000         // Ban duration (5 minutes)
};

// Proctoring Configuration (Lines ~200-210)
const PROCTOR_CONFIG = {
  enforceFullscreen: true,              // Require fullscreen
  lockOnViolation: true,                // Auto-lock on violation
  requireTeacherApproval: true,         // Teacher must unlock
  trackVersions: true,                  // Version-based approvals
  violationTimeout: 30000               // 30s before violation logged
};
```

### Script Properties (Dynamic Configuration)

Set via Apps Script Editor → Project Settings → Script Properties:

| Key | Value | Purpose |
|-----|-------|---------|
| `ADDITIONAL_TEACHERS` | `email1,email2,email3` | Add multiple teacher accounts |
| `SESSION_METADATA` | `{...json...}` | Active session state (auto-managed) |
| `STATE_VERSION_HISTORY` | `{...json...}` | State version tracking (auto-managed) |
| `CONNECTION_HEARTBEATS` | `{...json...}` | Client health monitoring (auto-managed) |

### Frontend Configuration

#### TeacherView.html
```javascript
// Lines ~50-60
const POLL_INTERVAL = 2500;           // Poll server every 2.5 seconds
const defaultTimerValue = 90;         // Default question timer
const chartRefreshInterval = 2500;    // Chart update frequency
const autoSaveInterval = 10000;       // Auto-save poll edits every 10s
```

#### StudentView.html
```javascript
// Lines ~40-50
const POLL_INTERVAL = 2500;                    // Base polling interval
const CONNECTION_HEALTH_THRESHOLD = 3;         // Failed attempts before "unhealthy"
const ADAPTIVE_BACKOFF_MAX = 15000;            // Max backoff: 15 seconds
const VERSION_MISMATCH_RETRY_DELAY = 5000;     // Wait 5s before resyncing
```

---

## Security

### Authentication

#### Teacher Authentication
- **Method**: Google OAuth 2.0 email verification
- **Validation**: Checks against `TEACHER_EMAIL` and `ADDITIONAL_TEACHERS`
- **Multi-account Support**: Allows multiple teachers via Script Properties
- **Session**: Maintained via Google Apps Script session

#### Student Authentication
- **Method**: Token-based (JWT-like)
- **Generation**: `TokenManager.generateToken(studentEmail, pollId)`
- **Format**: `base64(email:pollId:timestamp:hmac)`
- **Expiry**: 30 days (configurable)
- **Validation**: HMAC signature verification on every request
- **No PII Storage**: Tokens self-contain identity

### Proctoring Security

#### Violation Detection
```javascript
// StudentView.html event listeners
document.addEventListener('fullscreenchange', detectViolation);
document.addEventListener('visibilitychange', detectViolation);
window.addEventListener('blur', detectViolation);
window.addEventListener('focus', detectViolation);
```

#### Version-Based Approvals
- Each violation increments lock version (v1, v2, v3...)
- Teacher approval requests must match current version
- Prevents stale approval exploits
- Example scenario:
  1. Student violates → v1
  2. Teacher clicks approve (queued)
  3. Student violates again → v2
  4. Teacher's v1 approval rejected
  5. Must approve v2 explicitly

#### Lock Persistence
- Lock state stored in Responses sheet (VIOLATION_LOCKED marker)
- Survives page reloads, browser restarts
- Only clearable by teacher or system admin
- Logged with timestamp and version

### Data Security

#### Sensitive Data Protection
- **Student Emails**: Hashed in cache keys, never exposed to frontend
- **Tokens**: HMAC-signed, tamper-proof
- **Responses**: Tied to email (not visible to other students)
- **Images**: Stored in private Drive folder (public URL generation controlled)

#### Rate Limiting
```javascript
// Code.gs RateLimiter
- 100 requests per user per minute
- IP-based tracking (via UserLock)
- 5-minute ban on threshold breach
- Prevents abuse and DoS attempts
```

#### Input Sanitization
- All HTML escaped before rendering
- SQL injection N/A (no direct SQL)
- JSON parsing with error handling
- File upload size limits (5MB per image)

### OAuth Scopes (Minimum Required)
```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.webapp.deploy",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.storage",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.send_mail"
  ]
}
```

---

## Browser Compatibility

### Fully Supported

| Browser | Version | Features | Notes |
|---------|---------|----------|-------|
| **Chrome** | 90+ | ✅ All | Recommended |
| **Edge** | 90+ | ✅ All | Chromium-based |
| **Firefox** | 88+ | ✅ All | Fullscreen API fully supported |
| **Safari (macOS)** | 14+ | ✅ All | Requires focus/blur combo |

### Partial Support

| Browser | Version | Limitations | Workaround |
|---------|---------|-------------|------------|
| **Safari (iOS)** | 14+ | Limited fullscreen API | Use blur-only detection |
| **Safari (iPadOS)** | 14+ | Fullscreen requires gesture | Inform students to tap before join |
| **Mobile Chrome** | 90+ | Fullscreen may not work | Desktop recommended |

### Not Recommended

- **Internet Explorer**: Not supported (lacks ES6 features)
- **Opera Mini**: No fullscreen API
- **Old Android Browsers**: Inconsistent fullscreen behavior

### Testing Recommendations

1. **Primary Testing**: Chrome/Edge on desktop
2. **Secondary Testing**: Firefox, Safari (macOS)
3. **iPad Deployment**: Test on iPadOS Safari separately
4. **Mobile**: Discourage mobile use (small screens + fullscreen issues)

### Known Issues

| Issue | Browsers | Impact | Status |
|-------|----------|--------|--------|
| Fullscreen exit detection delayed | Safari (macOS) | 1-2s delay | Minor |
| Fullscreen unavailable on page load | Safari (iOS) | Requires user gesture first | By design |
| Tab switching undetected | All mobile | Proctoring less effective | Mobile not recommended |
| Page visibility API limited | Old Firefox (<88) | Violation detection gaps | Update browser |

---

## Troubleshooting

### Common Issues

#### Issue 1: "Access Denied" Error for Teacher
**Symptom**: Teacher sees "You do not have permission to access this application"

**Causes**:
- Teacher email not configured in `TEACHER_EMAIL` constant
- Using different Google account than expected
- Multi-account login confusion

**Solutions**:
1. Verify `TEACHER_EMAIL` in Code.gs matches your Google account
2. Check Apps Script Execution log for actual email attempting access
3. Add to `ADDITIONAL_TEACHERS` Script Property if needed
4. Log out of all Google accounts, log back into correct one

#### Issue 2: Student Token Invalid or Expired
**Symptom**: Student clicks link, sees "Invalid or expired token"

**Causes**:
- Token older than 30 days
- Token corrupted (email client wrapped URL)
- Student using wrong link

**Solutions**:
1. Teacher: Regenerate links via "Send Student Links" button
2. Check token timestamp: `TokenManager.decodeToken(token)` in Apps Script
3. Verify URL wasn't broken across multiple lines in email
4. Increase `TOKEN_EXPIRY_DAYS` if 30 days too short

#### Issue 3: Student Stuck in "Waiting for poll to begin" Forever
**Symptom**: Teacher started poll, but student sees waiting message indefinitely

**Causes**:
- LiveStatus sheet not updated correctly
- Student polling function crashed
- Network connectivity issue
- Browser tab in background (throttled)

**Solutions**:
1. Student: Refresh page (F5)
2. Teacher: Stop poll, then start again
3. Check browser console (F12) for JavaScript errors
4. Verify LiveStatus sheet has ActivePollID and PollStatus = "OPEN"
5. Check student's network connection

#### Issue 4: Chart Not Updating in Teacher Dashboard
**Symptom**: Students submitting answers, but chart stays empty

**Causes**:
- `getLivePollData()` function error
- JavaScript error in TeacherView.html
- Google Charts library failed to load
- Caching issue

**Solutions**:
1. Check browser console (F12) for errors
2. Verify Responses sheet has new rows
3. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
4. Clear browser cache and reload
5. Check Apps Script Execution log for RPC errors

#### Issue 5: Student Locked, Teacher Clicks Approve, No Effect
**Symptom**: Teacher approves unlock, but student still sees lock screen

**Causes**:
- Version mismatch (student violated again)
- Student's polling loop stopped
- Network issue between student and server
- Browser tab closed/suspended

**Solutions**:
1. Teacher: Check student tile for version number (v1, v2, etc.)
2. If version changed, click Approve again (invalidates old approval)
3. Student: Refresh page (state should persist)
4. Check browser console for RPC errors
5. Manual unlock: Delete student's row in Responses sheet with "VIOLATION_LOCKED"

#### Issue 6: Images Not Loading
**Symptom**: Question or answer images show broken image icon

**Causes**:
- Drive permissions incorrect
- Image file deleted from Drive
- Image URL expired (shouldn't happen with current setup)
- Network firewall blocking Drive URLs

**Solutions**:
1. Verify image exists in Drive folder
2. Check Drive folder sharing: Should be "Anyone with link can view"
3. Re-upload image via poll editor
4. Test Drive URL directly in browser
5. Check school network firewall settings

#### Issue 7: Email Links Not Sending
**Symptom**: Teacher clicks "Send Student Links", but students don't receive emails

**Causes**:
- Gmail sending limits reached (100 emails/day for free accounts)
- Student email addresses incorrect
- Emails in spam folder
- Apps Script email quota exceeded

**Solutions**:
1. Check Apps Script Execution log for email errors
2. Verify student emails in Rosters sheet (no typos)
3. Ask students to check spam/junk folders
4. Wait 24 hours if quota exceeded
5. Use Google Workspace account (higher limits)
6. Manually send links via school email system as fallback

### Debug Tools

#### Check Active Session State
```javascript
// Run in Apps Script editor
function debugSessionState() {
  const metadata = JSON.parse(PropertiesService.getScriptProperties().getProperty('SESSION_METADATA') || '{}');
  Logger.log('Session Phase:', metadata.sessionPhase);
  Logger.log('Active Poll:', metadata.activePollId);
  Logger.log('Question Index:', metadata.questionIndex);
  Logger.log('Started At:', metadata.startedAt);
}
```

#### View Student Token Details
```javascript
// Run in Apps Script editor (replace with actual token)
function debugToken() {
  const token = 'paste-token-here';
  const decoded = TokenManager.decodeToken(token);
  Logger.log('Student Email:', decoded.email);
  Logger.log('Poll ID:', decoded.pollId);
  Logger.log('Expires:', new Date(decoded.expiry));
}
```

#### Check Student Lock Status
```javascript
// Run in Apps Script editor
function debugStudentLock(studentEmail) {
  const locked = DataAccess.responses.isLocked(studentEmail);
  Logger.log('Is Locked:', locked);

  if (locked) {
    const state = ProctorAccess.getState(studentEmail);
    Logger.log('Lock Version:', state.lockVersion);
    Logger.log('Status:', state.status);
    Logger.log('Locked At:', state.lockedAt);
  }
}
```

### Logging

#### Enable Verbose Logging
```javascript
// Code.gs, change Logger.LEVEL
Logger.LEVEL = 'DEBUG'; // Options: ERROR, WARN, INFO, DEBUG
```

#### View Execution Logs
1. Apps Script Editor → Executions tab
2. Filter by function name, user, status
3. Look for red (error) entries
4. Click to see full stack trace

#### Monitor in Real-Time (Advanced)
1. Apps Script Editor → View → Logs
2. Open during live poll session
3. See RPC calls in real-time
4. Useful for debugging intermittent issues

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for exhaustive issue guide with advanced debugging techniques.

---

## Contributing

### Development Setup

1. **Clone repository** (if using Git):
   ```bash
   git clone https://github.com/yourorg/veritaslivepoll.git
   cd veritaslivepoll
   ```

2. **Install clasp** (Google Apps Script CLI):
   ```bash
   npm install -g @google/clasp
   clasp login
   ```

3. **Link to Apps Script project**:
   ```bash
   clasp clone <scriptId>
   ```

4. **Make changes locally**, then push:
   ```bash
   clasp push
   ```

### Code Style

- **JavaScript**: ES6+ syntax (V8 runtime)
- **Indentation**: 2 spaces
- **Naming**:
  - Functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Classes: `PascalCase`
- **Comments**: JSDoc format for all public functions

### Testing Guidelines

1. **Unit Testing**: Test all DataAccess methods
2. **Integration Testing**: Test full workflows end-to-end
3. **Proctoring Testing**: Run PROCTOR_QA_CHECKLIST.md before deployment
4. **Browser Testing**: Chrome, Firefox, Safari
5. **Load Testing**: Test with 30+ concurrent students

### Pull Request Process

1. Create feature branch: `feature/your-feature-name`
2. Make changes with descriptive commits
3. Update documentation (README, ARCHITECTURE, etc.)
4. Test thoroughly (see Testing Guidelines)
5. Submit PR with description of changes
6. Address review feedback

---

## License

MIT License

Copyright (c) 2025 Veritas Live Poll Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Acknowledgments

- Built with [Google Apps Script](https://developers.google.com/apps-script)
- UI powered by [Tailwind CSS](https://tailwindcss.com)
- Charts by [Google Charts](https://developers.google.com/chart)
- Icons from [Material Symbols](https://fonts.google.com/icons)

---

## Support

### Documentation
- [Architecture Guide](ARCHITECTURE.md) - Technical deep-dive
- [Deployment Guide](DEPLOYMENT.md) - Step-by-step setup with screenshots
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [QA Checklist](PROCTOR_QA_CHECKLIST.md) - Pre-class proctoring tests

### Contact
- **Issues**: [GitHub Issues](https://github.com/yourorg/veritaslivepoll/issues)
- **Email**: sborish@malvernprep.org
- **Documentation**: [Project Wiki](https://github.com/yourorg/veritaslivepoll/wiki)

---

**Made with ❤️ for educators everywhere**
