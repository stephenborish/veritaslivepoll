# Veritas Live Poll

**A Hybrid Real-Time Assessment Platform for Classroom Education**

[![Google Apps Script](https://img.shields.io/badge/Built%20with-Google%20Apps%20Script-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![Firebase](https://img.shields.io/badge/Real--time-Firebase%20RTDB-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

---

## Overview

**Veritas Live Poll** is a production-ready, serverless classroom assessment platform combining **Google Apps Script** (backend), **Google Sheets** (persistence), and **Firebase Realtime Database** (real-time signaling) to deliver low-latency interactive polling and secure proctored exams.

### What Makes It Special

- **🎯 Hybrid Architecture**: Firebase for fast real-time updates + Sheets for durable persistence
- **🔐 No Student Logins**: Token-based authentication with 30-day validity
- **👁️ Advanced Proctoring**: Fullscreen enforcement, tab-switch detection, lock versioning
- **📊 Dual Mode**: Live synchronized polling + Individual timed exams
- **⚡ Write-Behind Pattern**: Optimistic client updates with background persistence
- **💪 Production Resilience**: Exponential backoff, state versioning, connection health monitoring

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Google Apps Script (V8) | Serverless compute, RPC layer |
| **Database** | Google Sheets | Source of truth for polls, responses, rosters |
| **Real-Time** | Firebase Realtime Database | Lock status, heartbeats, presence |
| **Storage** | Google Drive | Image hosting with proxy endpoint |
| **Frontend** | HTML5 + JavaScript | Vanilla JS with Tailwind CSS |
| **Charts** | Google Charts API | Live response visualization |
| **Deployment** | Clasp CLI | Version control and deployment |

---

## Architecture Overview

### The "Write-Behind" Pattern

Veritas uses a **hybrid persistence model** to optimize for both speed and durability:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Student/Teacher UI                                      │  │
│  │  • Optimistic updates                                    │  │
│  │  • Polls Firebase every 2.5s for state changes           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           │ Fast Path (Real-time)              │ Slow Path (Durable)
           ▼                                    ▼
┌────────────────────────┐        ┌───────────────────────────────┐
│  Firebase RTDB         │        │  Google Apps Script Backend   │
│  • Lock status         │        │  ┌─────────────────────────┐  │
│  • Student heartbeats  │        │  │ Main_Routing.gs         │  │
│  • Exam proctoring     │        │  │ (doGet, authentication) │  │
│  • Presence detection  │        │  └──────────┬──────────────┘  │
│                        │        │             │                 │
│  TTL: 5-10 minutes     │        │  ┌──────────▼──────────────┐  │
│  (ephemeral state)     │        │  │ Teacher/Student APIs    │  │
│                        │        │  │ (security + validation) │  │
└────────────────────────┘        │  └──────────┬──────────────┘  │
                                  │             │                 │
                                  │  ┌──────────▼──────────────┐  │
                                  │  │ Models Layer            │  │
                                  │  │ (business logic)        │  │
                                  │  └──────────┬──────────────┘  │
                                  │             │                 │
                                  │  ┌──────────▼──────────────┐  │
                                  │  │ Data_Access.gs          │  │
                                  │  │ (Sheet operations)      │  │
                                  │  └──────────┬──────────────┘  │
                                  └─────────────┼─────────────────┘
                                                ▼
                              ┌─────────────────────────────────┐
                              │  Google Sheets Database         │
                              │  • Polls (poll definitions)     │
                              │  • Responses (student answers)  │
                              │  • Rosters (class enrollment)   │
                              │  • Exams (exam configurations)  │
                              │  • LiveStatus (session state)   │
                              │                                 │
                              │  Persistence: Permanent         │
                              └─────────────────────────────────┘
```

### Why This Architecture?

**Fast Path (Firebase):**
- Proctoring violations need <1s detection → Firebase provides real-time sync
- Lock status must propagate instantly to prevent cheating
- Heartbeats detect disconnected students immediately
- No Apps Script quota consumed for read-only monitoring

**Slow Path (Google Sheets):**
- Answer submissions are final → durability matters more than speed
- Exam responses written to cache, flushed to Sheets via time-based trigger
- Poll data/rosters rarely change → Sheets is perfect for infrequent writes
- Free, unlimited storage (within Sheets quota)

**Tradeoff:** Students see lock status updates in ~500ms (Firebase), but answer submissions take ~2-5s to persist to Sheets. This is acceptable because:
1. Students can't change answers after submission (UI enforced)
2. Cache-to-Sheet flush happens every 60 seconds (background worker)
3. On exam submit, all cached answers are immediately written (synchronous)

---

## Prerequisites & Installation

### Requirements

- **Google Workspace** (or personal Google account with Sheets/Drive access)
- **Node.js 16+** and **npm** (for Clasp CLI deployment)
- **Firebase Project** (free Spark plan sufficient)
- **Teacher email** for authentication

### Step 1: Clone Repository

```bash
git clone https://github.com/stephenborish/veritaslivepoll.git
cd veritaslivepoll
```

### Step 2: Install Clasp

```bash
npm install -g @google/clasp
clasp login
```

### Step 3: Create Google Apps Script Project

**Option A: New Project**

1. Create a new Google Sheet named `Veritas Live Poll Database`
2. Open Extensions → Apps Script
3. Note the Script ID from Project Settings
4. Update `.clasp.json`:

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "./src"
}
```

5. Push code:

```bash
clasp push
```

**Option B: Clone Existing**

```bash
clasp clone YOUR_SCRIPT_ID
```

### Step 4: Configure Firebase

**CRITICAL:** Do NOT hardcode Firebase credentials in source files!

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Realtime Database (choose US-central or your region)
3. Set database rules to authenticated access:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

4. Copy Firebase config from Project Settings → Web App
5. Store in Script Properties (recommended):

**Method 1: Via Apps Script Editor**

```
Project Settings → Script Properties → Add Property
Key: FIREBASE_CONFIG
Value: {"apiKey":"...","authDomain":"...","databaseURL":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
```

**Method 2: Via DevTools (after first deployment)**

```javascript
// In Apps Script editor, run this function:
function setupFirebaseConfig() {
  DevTools.setFirebaseConfig({
    apiKey: "YOUR_API_KEY",
    authDomain: "yourproject.firebaseapp.com",
    databaseURL: "https://yourproject.firebaseio.com",
    projectId: "yourproject",
    storageBucket: "yourproject.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
  });
}
```

### Step 5: Configure Teacher Email

Edit `src/Core_Config.gs`:

```javascript
Veritas.Config.TEACHER_EMAIL = "your-email@school.edu";
```

### Step 6: Initialize Database

1. In Apps Script editor, select `setupSheet` from function dropdown
2. Click **Run** (authorize permissions when prompted)
3. Verify 5 sheets created in your spreadsheet:
   - `Classes`
   - `Rosters`
   - `Polls`
   - `LiveStatus`
   - `Responses`

### Step 7: Deploy Web App

```bash
clasp deploy --description "Production v1.0"
```

Or via Apps Script Editor:
- Deploy → New deployment
- Type: **Web app**
- Execute as: **Me (your-email@school.edu)**
- Who has access: **Anyone**
- Deploy

**Copy the Web App URL** - this is your production endpoint.

### Step 8: Test Deployment

1. Open the Web App URL
2. You should see the Teacher Dashboard (if logged in with teacher email)
3. Create a test class and add a student roster
4. Create a test poll
5. Generate student links and verify email delivery

---

## Project Structure

### Backend Architecture (`src/*.gs` - 25 files)

```
Foundation Layer (Core infrastructure)
├── Main.gs                      # Entry point, namespace initialization
├── Core_Base.gs                 # Base configuration and version
├── Core_Config.gs               # Configuration constants (🔑 TEACHER_EMAIL here)
├── Core_Logging.gs              # Logging utilities
├── Core_Security.gs             # Authentication and authorization
└── Core_Utils.gs                # Utility functions (caching, rate limiting)

Data Layer (Persistence)
└── Data_Access.gs               # Abstraction for Sheets/Drive/Properties

Models Layer (Business Logic)
├── Model_Poll.gs                # Poll CRUD, roster management, image handling
├── Model_Session.gs             # Live poll sessions, timing, proctoring
├── Model_Analytics.gs           # Psychometric analysis, insights
└── Model_StudentActivity.gs     # Student activity tracking

API Layer (Exposed to Frontend)
├── Teacher_API.gs               # Teacher-facing RPC methods
├── Student_API.gs               # Student-facing RPC methods
├── API_Exposed.gs               # Main RPC registry (67 functions)
└── API_Exposed_Exams.gs         # Exam-specific RPC methods

Routing Layer
└── Main_Routing.gs              # doGet(), authentication, template serving, image proxy

Exam System (Separate subsystem)
├── Veritas_Exams.gs             # Exam CRUD operations
├── Veritas_QuestionBank.gs      # Question bank management
├── Veritas_Exam_Proctoring.gs   # Exam proctoring logic
├── Veritas_Exam_Responses.gs    # Write-behind response handling
└── Veritas_Exam_Analytics.gs    # Exam analytics and scoring

Development & Testing
├── Shared_Logic.gs              # Shared helper functions
├── DevTools.gs                  # Development utilities (setupFirebaseConfig, etc.)
├── Test_System.gs               # Testing framework
└── Verification_SmokeTest.gs    # Smoke tests for CI/CD
```

### Frontend Architecture (`src/*.html` - 18 files)

```
Main Application Views
├── Teacher_View.html            # Teacher dashboard (Live Polls mode)
│   └── Includes: Common_Head, Common_TailwindConfig, Proctoring_Shared,
│       Common_Styles, Teacher_Styles, Teacher_Body, Common_Scripts, Teacher_Scripts
│
└── Student_View.html            # Student polling interface
    └── Includes: Common_Head, Common_TailwindConfig, Proctoring_Shared,
        Common_Styles, Student_Styles, Student_Body, Common_Scripts, Student_Scripts

Exam System Views
├── ExamManagerView.html         # Exam CRUD interface (teacher)
├── ExamTeacherView.html         # Live exam monitoring dashboard
├── ExamStudentView.html         # Student exam interface (proctored)
├── ExamClaimView.html           # Manual seat claiming (if tokens disabled)
└── QuestionBankView.html        # Question bank editor

Shared Components (Included via <?!= include('...') ?>)
├── Common_Head.html             # Meta tags, Google Fonts, Material Symbols
├── Common_Styles.html           # Global CSS variables, utility classes
├── Common_Scripts.html          # Shared JavaScript utilities
├── Common_TailwindConfig.html   # Tailwind CSS CDN configuration
├── Proctoring_Shared.html       # Proctoring JavaScript library
├── Teacher_Body.html            # Teacher dashboard HTML structure
├── Teacher_Styles.html          # Teacher-specific CSS
├── Teacher_Scripts.html         # Teacher polling logic, chart rendering
├── Student_Body.html            # Student interface HTML structure
├── Student_Styles.html          # Student-specific CSS
└── Student_Scripts.html         # Student polling logic, proctoring handlers
```

### Google Sheets Database Schema

#### **Classes Sheet**
```
┌─────────────┬─────────────────────────┐
│ ClassName   │ Description             │
├─────────────┼─────────────────────────┤
│ AP Biology  │ Advanced Placement Bio  │
│ Physics 101 │ Introductory Physics    │
└─────────────┴─────────────────────────┘
```

#### **Rosters Sheet**
```
┌─────────────┬───────────────┬────────────────────────┐
│ ClassName   │ StudentName   │ StudentEmail           │
├─────────────┼───────────────┼────────────────────────┤
│ AP Biology  │ John Smith    │ jsmith@example.com     │
│ AP Biology  │ Jane Doe      │ jdoe@example.com       │
└─────────────┴───────────────┴────────────────────────┘
```

#### **Polls Sheet**
```
┌──────────┬───────────┬─────────────┬──────────────┬──────────────────┐
│ PollID   │ PollName  │ ClassName   │ QuestionIdx  │ QuestionDataJSON │
├──────────┼───────────┼─────────────┼──────────────┼──────────────────┤
│ uuid-123 │ Mitosis   │ AP Biology  │ 0            │ {...json...}     │
│ uuid-123 │ Mitosis   │ AP Biology  │ 1            │ {...json...}     │
└──────────┴───────────┴─────────────┴──────────────┴──────────────────┘
```

#### **LiveStatus Sheet** (Single Row - Current Session State)
```
┌──────────────┬──────────────────────┬────────────┬─────────────┬───────────┐
│ ActivePollID │ ActiveQuestionIndex  │ PollStatus │ StateVersion│ Timestamp │
├──────────────┼──────────────────────┼────────────┼─────────────┼───────────┤
│ uuid-123     │ 2                    │ OPEN       │ 15          │ 2025...   │
└──────────────┴──────────────────────┴────────────┴─────────────┴───────────┘
```

**PollStatus Values:**
- `OPEN` - Poll running, students can submit
- `PAUSED` - Poll paused, no submissions
- `ENDED` - Poll completed

#### **Responses Sheet**
```
┌────────────┬──────────────┬──────────┬──────┬──────────────────┬────────┬───────────┬──────────────┐
│ ResponseID │ Timestamp    │ PollID   │ QIdx │ StudentEmail     │ Answer │ IsCorrect │ Confidence   │
├────────────┼──────────────┼──────────┼──────┼──────────────────┼────────┼───────────┼──────────────┤
│ uuid-456   │ 2025-01-15...│ uuid-123 │ 0    │ jsmith@ex.com    │ B      │ true      │ High         │
│ uuid-457   │ 2025-01-15...│ uuid-123 │ 0    │ jdoe@ex.com      │ A      │ false     │ Medium       │
└────────────┴──────────────┴──────────┴──────┴──────────────────┴────────┴───────────┴──────────────┘
```

**Special Response Markers:**
- `VIOLATION_LOCKED` in Answer column → Student locked due to proctoring violation
- `VIOLATION_TEACHER_BLOCK` → Teacher manually blocked student

---

## Usage Guide

### For Teachers

#### 1. Create a Class Roster

1. Navigate to **Classes** tab in dashboard
2. Click **Create New Class**
3. Enter class name (e.g., "AP Biology - Period 3")
4. Add students:
   - **Manual**: Click "Add Student", enter name + email
   - **CSV Import**: Upload CSV with columns `Name,Email`

#### 2. Create a Poll

1. Click **Create New Poll**
2. Enter poll name and select target class
3. Add questions:
   - Question text (supports HTML formatting)
   - Question image (optional, uploads to Drive)
   - Add 2-6 answer choices
   - Mark correct answer (for auto-grading)
   - Add images to answer choices (optional)
4. Click **Save Poll**

#### 3. Send Student Links

1. Select poll from dropdown
2. Click **Send Student Links**
3. System generates unique tokens for each student (format: `https://script.google.com/macros/s/.../exec?token=abc123...`)
4. Emails sent automatically via `MailApp.sendEmail()`
5. Tokens valid for 30 days (configurable in `Core_Config.gs`)

#### 4. Start Live Poll Session

1. Select poll from dropdown
2. (Optional) Adjust timer (default: 90 seconds)
3. Click **Start Poll**
4. LiveStatus sheet updates to `OPEN`
5. Students receive state update within 2.5 seconds

#### 5. Monitor Responses

**Live Bar Chart:**
- Updates every 2.5 seconds via `google.script.run.getLivePollData()`
- Shows answer distribution (A, B, C, D...)
- Bars color-coded: green = correct, gray = incorrect

**Student Status Grid:**
- Individual tiles for each student
- Color-coded states:
  - 🟢 **Green (SUBMITTED)**: Answer received
  - 🔴 **Red (LOCKED)**: Proctoring violation detected
  - 🔵 **Blue (AWAITING_FULLSCREEN)**: Teacher approved unlock, student must re-enter fullscreen
  - ⚪ **Gray (WAITING)**: Not submitted yet
- Click tile to see student's answer
- Click **Approve** to unlock locked student

#### 6. Control Poll Flow

- **Pause**: Freezes timer, prevents new submissions
- **Resume**: Restarts timer and submissions
- **Next Question**: Advances to next question, saves current responses
- **Reset Question**:
  - Option 1: Clear responses (delete from Responses sheet)
  - Option 2: Keep responses (reset UI only)
- **End Poll**: Closes poll, students see "Session Complete"

#### 7. Handle Proctoring Violations

**Scenario:** Student exits fullscreen or switches tabs

1. Student's browser detects violation via `fullscreenchange`/`visibilitychange` listeners
2. `reportStudentViolation()` called → writes `VIOLATION_LOCKED` to Responses sheet
3. Firebase RTDB updated: `/sessions/{pollId}/students/{emailHash} = "LOCKED"`
4. Teacher dashboard shows red tile with lock icon and version (v1, v2, v3...)
5. Teacher clicks **Approve** → `teacherApproveUnlock()` increments unlock version
6. Student sees unlock message, clicks "Resume Fullscreen"
7. Student re-enters fullscreen → `studentConfirmFullscreen()` validates version match
8. If versions match, lock cleared; if student violated again (version mismatch), approval rejected

**Lock Versioning** prevents race conditions:
- Student violates → v1
- Teacher approves → expects v1
- Student violates again → v2
- Teacher's v1 approval rejected (stale)
- Teacher must approve v2 explicitly

### For Students

#### 1. Receive Access Link

- Email subject: **"Your Veritas Live Poll Access Link"**
- Contains personalized URL with token
- Example: `https://script.google.com/macros/s/ABC.../exec?token=def456`
- Valid for 30 days (no re-authentication needed)

#### 2. Join Poll

1. Click link → opens `Student_View.html`
2. See entry screen with security warning
3. Click **"Begin Session"**
4. Browser requests fullscreen permission → click **Allow**
5. Screen enters fullscreen, proctoring starts

#### 3. Answer Questions

1. View question text and optional image
2. Click desired answer choice
3. Answer highlights with blue border
4. Click **Submit Answer**
5. Confirmation message: "Your answer has been submitted. Please wait..."
6. Cannot change answer after submission (enforced via `hasSubmitted` flag)

#### 4. Wait for Next Question

- Teacher advances question → students see new question within 2.5 seconds
- Previous answers saved to Responses sheet
- Chart on teacher side resets for new question

#### 5. Proctoring Scenarios

**If you accidentally exit fullscreen:**

1. Lock screen appears immediately: "🔒 Your session has been locked"
2. Cannot proceed without teacher approval
3. Teacher sees red tile, clicks **Approve**
4. You see: "🔵 Your teacher has unlocked your session. Resume fullscreen to continue."
5. Click **Resume Poll** → re-enter fullscreen
6. Poll resumes

**Connection health monitoring:**
- Green indicator: Connected (polling every 2.5s)
- Yellow indicator: Struggling (3+ failed requests, backoff to 5s)
- Red indicator: Offline (switched to 10s polling with exponential backoff)
- Auto-recovery when connection restores

---

## Configuration

### Script Properties (Dynamic Config)

Set via **Apps Script Editor → Project Settings → Script Properties**:

| Key | Value | Purpose |
|-----|-------|---------|
| `FIREBASE_CONFIG` | `{"apiKey":"...","databaseURL":"..."}` | Firebase credentials (🔑 REQUIRED) |
| `TEACHER_EMAILS` | `teacher2@school.edu,teacher3@school.edu` | Additional authorized teachers (comma-separated) |

### Core_Config.gs (Static Config)

```javascript
// Teacher Authentication
Veritas.Config.TEACHER_EMAIL = "primary-teacher@school.edu";

// Token Expiry
Veritas.Config.TOKEN_EXPIRY_DAYS = 30; // Student tokens valid for 30 days

// Proctoring
Veritas.Config.DEBUG_FIREBASE = false; // Set true to show Firebase debug HUD
Veritas.Config.ALLOW_MANUAL_EXAM_CLAIM = false; // Allow students to claim exams without tokens
```

### Frontend Config (Teacher_Scripts.html / Student_Scripts.html)

```javascript
// Polling Intervals
const POLL_INTERVAL = 2500; // Poll server every 2.5 seconds
const CONNECTION_HEALTH_THRESHOLD = 3; // Mark unhealthy after 3 failures

// Adaptive Backoff
const ADAPTIVE_BACKOFF_MAX = 15000; // Max 15s between polls when struggling
```

---

## Deployment

### Via Clasp (Recommended)

```bash
# Push code changes
clasp push

# Deploy new version
clasp deploy --description "v2.1.0 - Added exam analytics"

# List deployments
clasp deployments

# Promote deployment to production
clasp deploy --deploymentId ABC123
```

### Via Apps Script Editor

1. **Deploy → Manage deployments**
2. **Create new version** with description
3. Copy **Web App URL**
4. Test deployment before sharing with students

### Post-Deployment Checklist

- [ ] Run `setupSheet()` once (initializes database)
- [ ] Verify all 5 sheets exist (Classes, Rosters, Polls, LiveStatus, Responses)
- [ ] Configure `FIREBASE_CONFIG` in Script Properties
- [ ] Add teacher email to `Core_Config.gs`
- [ ] Create test class and roster
- [ ] Create test poll
- [ ] Generate student token and verify email delivery
- [ ] Test fullscreen proctoring flow
- [ ] Verify Firebase connection (check browser console for "Firebase initialized")
- [ ] Check Apps Script Execution logs for errors

---

## Security

### Authentication

**Teacher:**
- Google OAuth 2.0 via `Session.getActiveUser().getEmail()`
- Validated against `Veritas.Config.TEACHER_EMAIL` and `TEACHER_EMAILS` Script Property
- Multi-account support via comma-separated list

**Student:**
- Token-based (no Google account required)
- Format: `base64(email:pollId:timestamp:hmac)`
- HMAC signature using `Utilities.computeHmacSha256Signature()`
- 30-day expiry enforced in `TokenManager.validateToken()`
- Tokens self-contain identity (no database lookup needed)

### Proctoring Security

**Violation Detection:**
```javascript
// Student_Scripts.html
document.addEventListener('fullscreenchange', detectViolation);
document.addEventListener('visibilitychange', detectViolation);
window.addEventListener('blur', detectViolation);
```

**Lock Versioning:**
- Each violation increments `lockVersion` (v1 → v2 → v3...)
- Teacher approval includes `expectedLockVersion` parameter
- If student violates again after teacher approval, version mismatch detected
- Prevents stale approvals from unlocking students who violated multiple times

**Lock Persistence:**
- Lock state written to Responses sheet as `VIOLATION_LOCKED` marker
- Survives page reloads, browser restarts
- Only clearable via `teacherApproveUnlock()` or `teacherForceUnlock()`

### Data Security

**Sensitive Data:**
- Student emails hashed for Firebase keys: `SHA-256(email).substring(0, 32)`
- Tokens HMAC-signed, tamper-proof
- Images stored in private Drive folder, proxied via `serveImage()` with folder validation

**Rate Limiting:**
```javascript
// Core_Utils.gs
- 100 requests per user per minute (tracked via UserLock)
- 5-minute ban on threshold breach
- Prevents DoS and abuse
```

**Input Sanitization:**
- All HTML escaped via `Veritas.Routing.escapeHtml()`
- JSON parsing with try-catch wrappers
- File upload size limits (5MB per image)

---

## Troubleshooting

### Common Issues

#### **Issue:** "Access Denied" for Teacher

**Cause:** Teacher email not configured

**Solution:**
1. Verify `Veritas.Config.TEACHER_EMAIL` in `Core_Config.gs` matches your Google account
2. Check Apps Script Execution log for actual email attempting access
3. Add to `TEACHER_EMAILS` Script Property if multiple teachers

#### **Issue:** Student Token Invalid

**Cause:** Token expired (>30 days) or corrupted

**Solution:**
1. Teacher regenerates links via "Send Student Links"
2. Verify URL not broken across multiple lines in email
3. Increase `TOKEN_EXPIRY_DAYS` if needed

#### **Issue:** Firebase Not Connecting

**Cause:** Missing or invalid `FIREBASE_CONFIG`

**Solution:**
1. Verify `FIREBASE_CONFIG` exists in Script Properties
2. Check JSON is valid (no trailing commas)
3. Verify Firebase RTDB is enabled in Firebase Console
4. Check browser console for errors: `Firebase initialized successfully`

#### **Issue:** Chart Not Updating

**Cause:** JavaScript error in `Teacher_Scripts.html`

**Solution:**
1. Open browser console (F12)
2. Look for errors in `getLivePollData()` or `renderChart()`
3. Verify Google Charts library loaded: `google.visualization` should exist
4. Hard refresh: Ctrl+Shift+R

#### **Issue:** Images Not Loading

**Cause:** Drive permissions or deleted file

**Solution:**
1. Verify image exists in Drive folder (check `ALLOWED_FOLDER_ID` in `Core_Config.gs`)
2. Re-upload image via poll editor
3. Test Drive URL directly: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w800`

### Debug Tools

**Check Session State:**
```javascript
// Run in Apps Script editor
function debugSessionState() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var liveStatus = ss.getSheetByName('LiveStatus');
  var values = liveStatus.getRange(2, 1, 1, liveStatus.getLastColumn()).getValues()[0];
  Logger.log('Active Poll:', values[0]);
  Logger.log('Question Index:', values[1]);
  Logger.log('Poll Status:', values[2]);
}
```

**Validate Token:**
```javascript
// Run in Apps Script editor
function debugToken() {
  var token = 'PASTE_TOKEN_HERE';
  var decoded = TokenManager.validateToken(token);
  Logger.log(decoded);
}
```

---

## Contributing

### Development Workflow

1. **Clone repo**:
   ```bash
   git clone https://github.com/stephenborish/veritaslivepoll.git
   cd veritaslivepoll
   ```

2. **Install Clasp**:
   ```bash
   npm install -g @google/clasp
   clasp login
   ```

3. **Link to Apps Script project**:
   ```bash
   clasp clone YOUR_SCRIPT_ID
   ```

4. **Make changes locally**, then push:
   ```bash
   clasp push
   ```

5. **Test in Apps Script editor** (Run → Execute)

6. **Deploy**:
   ```bash
   clasp deploy --description "Feature: Add timer presets"
   ```

### Code Style

- **JavaScript**: ES6+ syntax (V8 runtime)
- **Indentation**: 2 spaces
- **Naming**:
  - Functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Namespaces: `PascalCase` (e.g., `Veritas.Config`)
- **Comments**: JSDoc format for public functions

### Testing Guidelines

1. **Unit Tests**: Run `Test_System.gs` functions
2. **Smoke Tests**: Execute `Verification_SmokeTest.gs`
3. **Proctoring Tests**: Manually test fullscreen violations, lock versioning, unlock flow
4. **Browser Tests**: Chrome, Firefox, Safari (macOS)
5. **Load Tests**: Test with 30+ concurrent students

---

## License

MIT License

Copyright (c) 2025 Stephen Borish

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

- **Google Apps Script** - Serverless backend platform
- **Firebase Realtime Database** - Real-time signaling
- **Tailwind CSS** - Modern UI framework (CDN)
- **Google Charts** - Live response visualization
- **Material Symbols** - Icon library

---

## Support

### Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical deep-dive (if exists)
- **[AGENTS.md](AGENTS.md)** - System components guide (if exists)
- **Apps Script Execution Logs** - Debug failed RPC calls

### Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/stephenborish/veritaslivepoll/issues)
- **Email**: sborish@malvernprep.org

---

**Built with ❤️ for educators | Powered by Google Apps Script + Firebase**
