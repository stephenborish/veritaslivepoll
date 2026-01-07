# VERITAS Live Poll

**A Modern Real-Time Assessment Platform for Classroom Education**

[![Firebase](https://img.shields.io/badge/Backend-Firebase-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Cloud Functions](https://img.shields.io/badge/Functions-Node.js%2020-339933?logo=node.js&logoColor=white)](https://firebase.google.com/docs/functions)
[![Firestore](https://img.shields.io/badge/Database-Firestore-4285F4?logo=google-cloud&logoColor=white)](https://firebase.google.com/docs/firestore)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

---

## Overview

**VERITAS Live Poll** is a production-ready, serverless classroom assessment platform built on **Firebase** that delivers low-latency interactive polling, secure proctored exams, and comprehensive analytics for educators.

### What Makes It Special

- **⚡ Real-Time Architecture**: Firestore + Realtime Database for instant synchronization
- **🔐 Secure Authentication**: Firebase Auth with Google Sign-In for teachers, anonymous auth for students
- **👁️ Advanced Proctoring**: Fullscreen enforcement, violation detection, teacher approval workflows
- **📊 Dual Mode**: Live synchronized polling + Individual timed exams
- **🎯 Analytics Engine**: Psychometric analysis with point-biserial correlation and item difficulty
- **💪 Production Ready**: Cloud Functions backend with automatic scaling and 99.9% uptime

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Firebase Cloud Functions (Node.js 20) | Serverless compute, 29+ callable functions |
| **Database** | Firestore | Primary data store (polls, classes, exams, sessions) |
| **Real-Time** | Firebase Realtime Database | Live session state, student presence, answer submissions |
| **Storage** | Firebase Storage | Question images, poll assets (10MB max per file) |
| **Frontend** | Firebase Hosting | Static HTML/JS with Tailwind CSS |
| **Authentication** | Firebase Auth | Google Sign-In (teachers), Anonymous (students) |
| **Analytics** | Custom Analytics Engine | Item analysis, point-biserial correlation |
| **Deployment** | GitHub Actions + Firebase CLI | Automated CI/CD pipeline |

**Project ID**: `classroomproctor`

---

## Architecture Overview

### Modern Firebase Architecture

VERITAS uses a **hybrid persistence model** optimizing for both real-time updates and durable storage:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Teacher Dashboard (public/index.html)                   │  │
│  │  Student Interface (public/student.html)                 │  │
│  │  Exam Manager (public/exam_manager.html)                 │  │
│  │  • Firebase SDK v9+ (modular)                            │  │
│  │  • Real-time Firestore listeners                         │  │
│  │  • RTDB listeners for live sessions                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           │ Firestore (durable)                │ RTDB (ephemeral)
           ▼                                    ▼
┌────────────────────────┐        ┌───────────────────────────────┐
│  Firestore             │        │  Realtime Database            │
│  • /teachers           │        │  • /sessions/{pollId}         │
│  • /classes            │        │    - live_session (state)     │
│  • /polls              │        │    - students (presence)      │
│  • /exams              │        │    - answers_key (secure)     │
│  • /sessions           │        │    - violations (logs)        │
│  • /question_bank      │        │  • /answers/{pollId}          │
│  • /reports            │        │    - {studentKey} (responses) │
│                        │        │  • /tokens (auth)             │
│  Persistence: Permanent│        │  Persistence: Session-scoped  │
└────────────────────────┘        └───────────────────────────────┘
           │                                    │
           └────────────┬───────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              Firebase Cloud Functions (functions/)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Callable Functions (29 total):                           │  │
│  │  • setLiveSessionState - Update session state            │  │
│  │  • submitResponse - Handle student answers               │  │
│  │  • manageProctoring - Lock/unlock students               │  │
│  │  • getAnalytics - Psychometric analysis                  │  │
│  │  • createPoll, updatePoll, deletePoll                    │  │
│  │  • createClass, bulkAddStudents                          │  │
│  │  • manageExams, createExamSession, joinSession           │  │
│  │  • sendEmail, sendExamLink                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Triggered Functions:                                     │  │
│  │  • onAnswerSubmitted (RTDB trigger)                      │  │
│  │  • gradeResponse (Firestore trigger)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Modules:                                                 │  │
│  │  • analytics_engine.js - Item analysis algorithms        │  │
│  │  • email_service.js - Nodemailer integration             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

**Firestore (Durable Path):**
- Poll configurations, class rosters, exam templates stored permanently
- Strong consistency guarantees for critical data
- Offline support with automatic sync when reconnected
- Complex queries with compound indexes
- Automatic scaling to millions of documents

**Realtime Database (Fast Path):**
- Live session state propagates to all clients in <100ms
- Student presence/heartbeat detection for proctoring
- Lock status updates instantly visible to teachers
- Answer submissions buffered before Firestore write
- Lower latency than Firestore for high-frequency updates

**Cloud Functions (Business Logic):**
- Server-side validation and security enforcement
- Answer key stored securely (never exposed to students)
- Automatic grading with point-biserial correlation
- Email delivery via Nodemailer
- Scalable to 10,000+ concurrent requests

---

## Data Models

### Firestore Collections

#### `/teachers/{teacherId}`
Teacher profiles and settings.

```typescript
{
  uid: string,              // Firebase Auth UID
  email: string,            // Teacher's email
  displayName: string,      // Display name
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `/classes/{classId}`
Class rosters created by teachers.

```typescript
{
  classId: string,
  className: string,
  teacherId: string,        // Reference to teacher UID
  studentCount: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Sub-collection**: `/classes/{classId}/students/{studentId}`

```typescript
{
  studentId: string,
  name: string,
  email: string,
  emailHash: string,        // MD5 for secure lookups
  createdAt: Timestamp
}
```

#### `/polls/{pollId}`
Poll/quiz templates.

```typescript
{
  pollId: string,
  pollName: string,
  teacherId: string,
  sessionType: 'LIVE_POLL' | 'SECURE_ASSESSMENT',
  questions: Array<Question>,
  settings: {
    timeLimitMinutes: number,
    calculatorEnabled: boolean,
    proctorMode: 'soft' | 'hard'
  },
  metacognitionEnabled: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `/sessions/{sessionId}`
Live instances of polls/exams.

```typescript
{
  sessionId: string,
  pollId: string,
  teacherId: string,
  status: 'WAITING' | 'ACTIVE' | 'PAUSED' | 'CLOSED',
  accessCode: string,       // 6-digit join code
  currentQuestionIndex: number,
  createdAt: Timestamp,
  lastUpdate: Timestamp
}
```

#### `/exams/{examId}`
Secure exam templates.

```typescript
{
  examId: string,
  teacherId: string,
  title: string,
  questions: Array<Question>,
  settings: {
    timer: number,
    shuffle: boolean,
    proctorMode: 'fullscreen' | 'lockdown'
  },
  createdAt: Timestamp
}
```

### Realtime Database Structure

```
/sessions/{pollId}/
  ├─ live_session/
  │   ├─ pollId: string
  │   ├─ questionIndex: number
  │   ├─ status: 'PRE_LIVE' | 'OPEN' | 'PAUSED' | 'ENDED'
  │   ├─ timestamp: ServerValue.TIMESTAMP
  │   ├─ questionText: string
  │   ├─ options: Array<string>
  │   └─ metadata: object
  ├─ students/
  │   └─ {emailHash}/
  │       ├─ status: 'ACTIVE' | 'LOCKED' | 'FINISHED'
  │       ├─ lastHeartbeat: timestamp
  │       └─ lockVersion: number
  ├─ answers_key/          # TEACHER-ONLY (secured via rules)
  │   └─ {questionIndex}: correctAnswer
  ├─ violations/
  │   └─ {emailHash}/
  │       ├─ count: number
  │       └─ events: Array<ViolationEvent>
  └─ activities/           # Audit logs

/answers/{pollId}/
  └─ {studentEmailKey}/
      ├─ questionIndex: number
      ├─ answer: mixed
      ├─ timestamp: ServerValue.TIMESTAMP
      └─ confidence: 'High' | 'Medium' | 'Low'  # If metacognition enabled

/rosters/
  ├─ classes: Array<ClassName>
  └─ rosters/
      └─ {className}/
          └─ {emailHash}: { name, email }

/tokens/                   # Authentication tokens
  └─ {token}: { email, pollId, expiry }

/history/{pollId}/         # Archived sessions
  └─ {sessionId}: SessionSnapshot
```

---

## Prerequisites & Installation

### Requirements

- **Node.js 20+** and **npm**
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Firebase Project** (Blaze plan recommended for production)
- **Google Account** for Firebase Console access

### Step 1: Clone Repository

```bash
git clone https://github.com/stephenborish/veritaslivepoll.git
cd veritaslivepoll
```

### Step 2: Install Dependencies

```bash
# Install root dependencies
npm install

# Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

### Step 3: Firebase Project Setup

**Option A: Use Existing Project (classroomproctor)**

```bash
firebase login
firebase use classroomproctor
```

**Option B: Create New Project**

```bash
firebase login
firebase projects:create your-project-id
firebase use your-project-id
```

Update `.firebaserc`:
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

### Step 4: Enable Firebase Services

In [Firebase Console](https://console.firebase.google.com):

1. **Authentication**
   - Enable Google Sign-In provider
   - Enable Anonymous authentication

2. **Firestore Database**
   - Create database in production mode
   - Choose region (us-central1 recommended)

3. **Realtime Database**
   - Create database
   - Set region to match Firestore

4. **Storage**
   - Enable Firebase Storage
   - Same region as above

5. **Upgrade to Blaze Plan** (for Cloud Functions)
   - Required for external API calls (email, etc.)

### Step 5: Configure Firebase

**Deploy Security Rules:**

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Realtime Database rules
firebase deploy --only database

# Deploy Storage rules
firebase deploy --only storage
```

### Step 6: Deploy Cloud Functions

```bash
cd functions

# Set environment variables (if using email)
firebase functions:config:set email.service="gmail" \
  email.user="your-email@gmail.com" \
  email.password="your-app-password"

# Deploy functions
npm run deploy

# OR deploy everything at once from root
cd ..
firebase deploy
```

### Step 7: Deploy Frontend

```bash
firebase deploy --only hosting
```

Your app will be live at: `https://your-project-id.web.app`

### Step 8: Test Deployment

1. Navigate to `https://your-project-id.web.app`
2. Sign in with Google (teacher account)
3. Create a test class
4. Add students to roster
5. Create a test poll
6. Start a live session
7. Open student view in incognito: `https://your-project-id.web.app/student.html`

---

## Project Structure

```
veritaslivepoll/
├── public/                      # Firebase Hosting (frontend)
│   ├── index.html              # Teacher dashboard (960KB, feature-rich SPA)
│   ├── student.html            # Student polling interface
│   ├── exam_manager.html       # Exam creation UI
│   ├── exam_teacher.html       # Exam monitoring dashboard
│   ├── exam_student.html       # Proctored exam interface
│   └── RichTextManager.js      # Quill.js integration for rich text
│
├── functions/                   # Cloud Functions (Node.js 20)
│   ├── index.js                # Main functions file (1900+ lines, 29 exports)
│   ├── analytics_engine.js     # Psychometric analysis algorithms
│   ├── email_service.js        # Nodemailer email delivery
│   ├── types.ts                # TypeScript type definitions
│   └── package.json            # Dependencies (firebase-admin, nodemailer)
│
├── src/                         # LEGACY Google Apps Script (archived, not used)
│   └── [Legacy .gs files - DO NOT USE]
│
├── firestore.rules             # Firestore security rules
├── database.rules.json         # Realtime Database security rules
├── storage.rules               # Firebase Storage security rules
├── firebase.json               # Firebase configuration
├── .firebaserc                 # Project aliases
│
├── DOCS/
│   ├── Firestore_Data_Model.md # Database schema documentation
│   └── ARCHITECTURE.md          # System design documentation
│
├── .github/
│   └── workflows/
│       ├── firebase-deploy.yml # Auto-deploy on push to main
│       └── DEPLOYMENT_SETUP.md # CI/CD setup guide
│
└── README.md                    # This file
```

---

## Cloud Functions Reference

### Session Management

#### `setLiveSessionState`
Updates live session state (question index, status).

```javascript
const result = await setLiveSessionState({
  pollId: 'poll123',
  status: 'OPEN',
  questionIndex: 1,
  questionText: 'What is the capital of France?',
  options: ['London', 'Paris', 'Berlin', 'Madrid'],
  correctAnswer: 1,  // Stored securely, not exposed to students
  metadata: { timer: 90 }
});
```

#### `submitResponse`
Handles student answer submission.

```javascript
await submitResponse({
  pollId: 'poll123',
  studentId: 'student456',
  questionIndex: 1,
  answer: 'B',
  confidence: 'High',
  timestamp: Date.now()
});
```

### Proctoring

#### `manageProctoring`
Lock/unlock students, handle violations.

```javascript
await manageProctoring({
  action: 'LOCK' | 'UNLOCK' | 'GET_STATUS',
  pollId: 'poll123',
  studentEmail: 'student@example.com',
  reason: 'Fullscreen violation'
});
```

#### `reportStudentViolation`
Student-side violation reporting.

```javascript
await reportStudentViolation({
  pollId: 'poll123',
  studentEmail: 'student@example.com',
  violationType: 'FULLSCREEN_EXIT' | 'TAB_SWITCH' | 'WINDOW_BLUR',
  timestamp: Date.now()
});
```

### Analytics

#### `getAnalytics`
Comprehensive psychometric analysis.

```javascript
const analytics = await getAnalytics({
  pollId: 'poll123'
});

// Returns:
// {
//   itemAnalysis: {
//     questions: [{
//       difficulty: 0.75,        // % correct
//       discrimination: 0.42,    // Point-biserial correlation
//       distractorAnalysis: {...}
//     }]
//   },
//   studentPerformance: {...},
//   classInsights: {...}
// }
```

### Class Management

#### `createClass`
Create a new class roster.

```javascript
await createClass({
  className: 'AP Biology - Period 1'
});
```

#### `bulkAddStudents`
Add multiple students to a class (batch write).

```javascript
await bulkAddStudents({
  classId: 'class123',
  students: [
    { name: 'John Smith', email: 'jsmith@school.edu' },
    { name: 'Jane Doe', email: 'jdoe@school.edu' }
  ]
});
```

### Poll Management

#### `savePoll`
Create or update a poll.

```javascript
await savePoll({
  pollId: 'poll123',  // Omit for new poll
  pollName: 'Unit 1 Quiz',
  className: 'AP Biology - Period 1',
  questions: [{
    stemHtml: '<p>What is photosynthesis?</p>',
    options: [
      { text: 'A chemical reaction', imageUrl: null },
      { text: 'A physical process', imageUrl: null }
    ],
    correctAnswer: 0,
    points: 1
  }],
  settings: {
    timeLimitMinutes: 30,
    calculatorEnabled: false,
    proctorMode: 'soft'
  }
});
```

---

## Usage Guide

### For Teachers

#### 1. First-Time Setup

1. Navigate to `https://classroomproctor.web.app`
2. Click **Sign in with Google**
3. Authorize the app
4. You'll see the Teacher Dashboard

#### 2. Create a Class Roster

1. Click **"Create New Class"** in Classes section
2. Enter class name (e.g., "AP Biology - Period 1")
3. Click **"Add Students"**
4. Paste CSV data:
   ```
   John Smith, jsmith@school.edu
   Jane Doe, jdoe@school.edu
   ```
5. Click **"Import"**
6. Students appear in roster immediately (real-time Firestore)

#### 3. Create a Poll

1. Navigate to **Poll Manager** tab
2. Click **"Create New Poll"**
3. Enter poll name
4. For each question:
   - Write question text (supports rich text via Quill editor)
   - Upload optional image (stored in Firebase Storage)
   - Add 2-6 answer choices
   - Mark correct answer
   - Set point value
5. Click **"Save Poll"**

#### 4. Start a Live Session

1. Select poll from dropdown
2. Click **"Start Live Session"**
3. System generates 6-digit access code (e.g., `ABC123`)
4. Share code with students
5. Students join via student interface
6. Monitor submissions in real-time:
   - **Green tiles**: Answer submitted
   - **Red tiles**: Locked due to violation
   - **Blue tiles**: Unlocked, awaiting fullscreen
   - **Gray tiles**: Waiting

#### 5. Control Poll Flow

- **Next Question**: Advances to next question, saves responses
- **Pause**: Freezes timer, prevents submissions
- **Resume**: Restarts from current state
- **End Session**: Finalizes session, triggers analytics

#### 6. Handle Proctoring Violations

**Scenario**: Student exits fullscreen

1. Student tile turns **red** with lock icon
2. Click student tile to view violation details
3. Click **"Approve Unlock"**
4. Student sees unlock message
5. Student clicks **"Resume Fullscreen"**
6. Lock clears if student re-enters fullscreen
7. If student violates again, lock version increments (prevents stale approvals)

### For Students

#### 1. Join a Poll

1. Navigate to `https://classroomproctor.web.app/student.html`
2. Enter 6-digit access code from teacher
3. Click **"Join Session"**
4. Enter your name and email
5. Click **"Begin Session"**
6. Browser requests fullscreen → Click **"Allow"**

#### 2. Answer Questions

1. Read question and view image (if present)
2. Click answer choice (highlights in blue)
3. If metacognition enabled, select confidence level
4. Click **"Submit Answer"**
5. Confirmation appears: "Answer submitted"
6. Wait for teacher to advance to next question

#### 3. Proctoring Requirements

**You must maintain fullscreen mode**

If you accidentally exit:
- Lock screen appears immediately
- Cannot proceed until teacher approves
- Teacher clicks "Approve" in their dashboard
- You click "Resume Fullscreen"
- Poll continues

**Violations detected**:
- Exiting fullscreen (F11 or Esc key)
- Switching tabs (Cmd+Tab / Alt+Tab)
- Clicking browser address bar
- Opening developer tools

---

## Security

### Authentication

**Teachers**:
- Firebase Auth with Google Sign-In
- Email verified by Google
- UID stored in Firestore `/teachers/{uid}`

**Students**:
- Anonymous authentication (no login required)
- 6-digit access codes for session entry
- Email collected for roster matching only

### Firestore Security Rules

```javascript
// Teachers can only access their own data
match /classes/{classId} {
  allow read, write: if request.auth.uid == resource.data.teacherId;
}

// Students can only write their own responses
match /sessions/{sessionId}/responses/{responseId} {
  allow create: if request.auth.uid == request.resource.data.studentId;
  allow update: if false;  // Immutable
}

// Reports are read-only for all, write-only for Cloud Functions
match /reports/{reportId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

### Realtime Database Security

```javascript
// Answer keys are TEACHER-ONLY
"answers_key": {
  ".read": "auth.token.firebase.sign_in_provider != 'anonymous'",
  ".write": "auth.token.firebase.sign_in_provider != 'anonymous'"
}

// Students can submit answers
"answers": {
  "$pollId": {
    "$studentKey": {
      ".write": "auth != null"
    }
  }
}
```

### Storage Security

```javascript
// Teachers can upload images to their own folder
match /poll-images/{teacherId}/{imageFile} {
  allow create: if request.auth.uid == teacherId &&
                   request.resource.size < 10 * 1024 * 1024 &&
                   request.resource.contentType.matches('image/.*');
}
```

### Data Protection

- **Answer keys** stored in secure RTDB path, never exposed to client
- **Student emails** hashed (MD5) for RTDB keys
- **Access codes** are 6-digit random strings, expire after session
- **Violation logs** append-only (students can't delete)
- **HTTPS enforced** on all Firebase Hosting routes

---

## Deployment

### Local Development

```bash
# Start Firebase emulators (Firestore, RTDB, Functions, Hosting)
firebase emulators:start

# Access local UI
open http://localhost:5000           # Teacher dashboard
open http://localhost:5000/student.html  # Student interface

# View emulator UI
open http://localhost:4000           # Firebase Emulator Suite
```

### Production Deployment

**Option 1: Manual Deploy**

```bash
# Deploy everything
firebase deploy

# Deploy specific targets
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

**Option 2: GitHub Actions (Automated)**

Configured in `.github/workflows/firebase-deploy.yml`

**Triggers**:
- Push to `main` branch → Full deploy
- Pull request → Preview deployment with unique URL

**Setup**:
1. Add `FIREBASE_SERVICE_ACCOUNT` to GitHub Secrets
2. Service account JSON from Firebase Console → Project Settings → Service Accounts
3. Push to `main` triggers deployment automatically

See `.github/DEPLOYMENT_SETUP.md` for details.

### Post-Deployment Checklist

- [ ] Navigate to `https://your-project-id.web.app`
- [ ] Sign in with Google (teacher)
- [ ] Create test class
- [ ] Add test students
- [ ] Create test poll
- [ ] Start live session
- [ ] Join as student (incognito window)
- [ ] Submit test answer
- [ ] Verify real-time updates
- [ ] Check Firestore console for data
- [ ] Review Cloud Functions logs

---

## Monitoring & Debugging

### Firebase Console

**Firestore Database**:
- View `/classes`, `/polls`, `/sessions` collections
- Monitor real-time document changes
- Check indexes (automatically created)

**Realtime Database**:
- View `/sessions/{pollId}/live_session` for current state
- Monitor `/answers/{pollId}` for submissions
- Check `/violations` for proctoring logs

**Cloud Functions**:
- Functions → Logs → Filter by function name
- Monitor invocation count, execution time, errors
- Check for cold starts (first invocation after deploy)

**Authentication**:
- View user list (teachers + anonymous students)
- Check sign-in methods enabled
- Review authentication logs

### Common Issues

#### Issue: "Permission Denied" in Firestore

**Cause**: Security rules blocking access

**Solution**:
```bash
# Check current rules
firebase firestore:rules

# Deploy updated rules
firebase deploy --only firestore:rules
```

Verify teacher is authenticated with correct UID.

#### Issue: Cloud Function Timeout

**Cause**: Function exceeds 60s timeout (default)

**Solution**:
```javascript
// In functions/index.js
exports.slowFunction = functions
  .runWith({ timeoutSeconds: 300 })  // 5 minutes
  .https.onCall(async (data, context) => { ... });
```

#### Issue: Student Can't Join Session

**Causes**:
1. Access code expired
2. Session status not `ACTIVE`
3. RTDB rules blocking anonymous auth

**Debug**:
```bash
# Check session in RTDB
firebase database:get /sessions/{pollId}/live_session

# Verify anonymous auth enabled
firebase auth:export users.json
```

#### Issue: Images Not Loading

**Cause**: Storage rules or incorrect path

**Debug**:
1. Check Firebase Storage console
2. Verify file exists in `/poll-images/{teacherId}/`
3. Check Storage rules allow read for authenticated users
4. Test direct URL: `https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media`

---

## Performance Optimization

### Firestore Indexes

Composite indexes are auto-created on first query. Monitor in Firestore console.

**Example**: Query classes by teacher, sorted by creation date
```javascript
db.collection('classes')
  .where('teacherId', '==', uid)
  .orderBy('createdAt', 'desc')
```

Creates index:
```
Collection: classes
Fields: teacherId (Ascending), createdAt (Descending)
```

### Cloud Functions

**Cold Starts**: First invocation after deploy takes 1-3s

**Mitigation**:
- Use minimum instances (Blaze plan only):
  ```javascript
  exports.hotFunction = functions
    .runWith({ minInstances: 1 })
    .https.onCall(...)
  ```

**Reduce Bundle Size**:
- Avoid large dependencies in `functions/package.json`
- Use tree-shaking (ES6 imports)
- Split into multiple codebase deployments

### Realtime Database

**Optimize Reads**:
```javascript
// ❌ BAD: Downloads entire session
db.ref(`sessions/${pollId}`).once('value')

// ✅ GOOD: Downloads only live_session
db.ref(`sessions/${pollId}/live_session`).once('value')
```

**Use Indexes**:
```json
// In database.rules.json
"sessions": {
  "$pollId": {
    "students": {
      ".indexOn": ["lastHeartbeat"]
    }
  }
}
```

---

## Contributing

### Development Workflow

1. **Fork repository**
2. **Create feature branch**:
   ```bash
   git checkout -b feature/add-timer-presets
   ```
3. **Make changes locally**
4. **Test with emulators**:
   ```bash
   firebase emulators:start
   ```
5. **Commit changes**:
   ```bash
   git add .
   git commit -m "feat: Add timer presets to poll settings"
   ```
6. **Push to fork**:
   ```bash
   git push origin feature/add-timer-presets
   ```
7. **Open Pull Request** on GitHub

### Code Style

- **JavaScript**: ES6+ syntax, async/await preferred
- **Indentation**: 2 spaces
- **Naming**:
  - Functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Files: `lowercase_with_underscores.js`
- **Comments**: JSDoc for public functions

### Testing Checklist

- [ ] Test in Chrome, Firefox, Safari
- [ ] Test teacher dashboard with 30+ students
- [ ] Test proctoring violations (fullscreen exit, tab switch)
- [ ] Test offline/online transitions
- [ ] Check Cloud Functions logs for errors
- [ ] Verify security rules (unauthorized access blocked)

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

- **Firebase** - Serverless backend platform
- **Google Cloud** - Infrastructure and hosting
- **Tailwind CSS** - Modern UI framework
- **Quill.js** - Rich text editor
- **Nodemailer** - Email delivery

---

## Support

### Documentation

- **[DOCS/Firestore_Data_Model.md](DOCS/Firestore_Data_Model.md)** - Complete database schema
- **[DOCS/ARCHITECTURE.md](DOCS/ARCHITECTURE.md)** - System design deep-dive
- **[.github/DEPLOYMENT_SETUP.md](.github/DEPLOYMENT_SETUP.md)** - CI/CD setup guide

### Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/stephenborish/veritaslivepoll/issues)
- **Email**: sborish@malvernprep.org
- **Firebase Documentation**: [firebase.google.com/docs](https://firebase.google.com/docs)

---

**Built with ❤️ for educators | Powered by Firebase**

**Production URL**: https://classroomproctor.web.app
