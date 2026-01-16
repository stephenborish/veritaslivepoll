# Veritas Live Poll

**A Real-Time Assessment Platform for Classroom Education**

[![Firebase](https://img.shields.io/badge/Powered%20by-Firebase-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Cloud Functions](https://img.shields.io/badge/Backend-Cloud%20Functions-4285F4?logo=google-cloud&logoColor=white)](https://firebase.google.com/docs/functions)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

---

## Overview

**Veritas Live Poll** is a production-ready, serverless classroom assessment platform built on **Firebase**. It delivers low-latency interactive polling and secure proctored exams using Firebase Realtime Database for live state management, Firestore for persistent data, and Cloud Functions for backend logic.

### Key Features

- **🎯 Real-Time Synchronization**: Firebase RTDB powers instant question broadcasting and response collection
- **🔐 Secure Assessments**: Fullscreen enforcement, tab-switch detection, and lock versioning
- **👁️ Advanced Proctoring**: Individual student monitoring with lock/unlock controls
- **📊 Dual Mode**: Live synchronized polling + Individual timed exams
- **🧠 Metacognition Tracking**: Confidence-based answer analysis
- **📈 Psychometric Analytics**: Item analysis, discrimination indices, and distractor effectiveness

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Firebase Cloud Functions (Node.js) | Serverless compute, business logic |
| **Realtime Database** | Firebase RTDB | Live session state, presence, proctoring |
| **Persistent Storage** | Firestore | Polls, rosters, history, analytics |
| **File Storage** | Cloud Storage for Firebase | Image uploads, assets |
| **Authentication** | Firebase Auth | Teacher login, anonymous student sessions |
| **Hosting** | Firebase Hosting | Static assets, student/teacher dashboards |
| **Charts** | Google Charts API | Live response visualization |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Teacher Dashboard / Student Interface                   │  │
│  │  • Real-time listeners on Firebase RTDB                  │  │
│  │  • Cloud Function calls via httpsCallable()              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           │ Real-time (RTDB)                   │ RPC (Cloud Functions)
           ▼                                    ▼
┌────────────────────────┐        ┌───────────────────────────────┐
│  Firebase RTDB         │        │  Cloud Functions (Node.js)    │
│  • Session state       │        │  ┌─────────────────────────┐  │
│  • Student status      │        │  │ 80+ Function Exports    │  │
│  • Lock/unlock state   │        │  │ • setLiveSessionState   │  │
│  • Heartbeats          │        │  │ • submitResponse        │  │
│  • Proctoring events   │        │  │ • manageProctoring      │  │
└────────────────────────┘        │  │ • getAnalytics          │  │
                                  │  │ • sendEmail             │  │
                                  │  └──────────┬──────────────┘  │
                                  └─────────────┼─────────────────┘
                                                ▼
                              ┌─────────────────────────────────┐
                              │  Firestore (Persistent Data)    │
                              │  • Polls & Questions            │
                              │  • Classes & Rosters            │
                              │  • Session History              │
                              │  • Analytics Reports            │
                              └─────────────────────────────────┘
```

---

## Prerequisites & Installation

### Requirements

- **Node.js 18+** and **npm**
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Firebase Project** with Blaze plan (required for Cloud Functions)

### Step 1: Clone Repository

```bash
git clone https://github.com/stephenborish/veritaslivepoll.git
cd veritaslivepoll
```

### Step 2: Install Dependencies

```bash
# Root dependencies
npm install

# Cloud Functions dependencies
cd functions && npm install && cd ..
```

### Step 3: Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable the following services:
   - **Authentication** → Enable Email/Password and Anonymous sign-in
   - **Realtime Database** → Create database in your preferred region
   - **Firestore Database** → Create database in Native mode
   - **Hosting** → Initialize hosting
   - **Cloud Functions** → Requires Blaze (pay-as-you-go) plan
   - **Storage** → Create default bucket

3. Login and initialize Firebase:

```bash
firebase login
firebase use --add  # Select your project
```

### Step 4: Configure Environment

Create `functions/.env` with your SMTP credentials (for email sending):

```bash
SMTP_PASSWORD=your_smtp_password_here
```

### Step 5: Deploy Security Rules

```bash
# Deploy Realtime Database rules
firebase deploy --only database

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage
```

### Step 6: Deploy Cloud Functions

```bash
firebase deploy --only functions
```

### Step 7: Build & Deploy Hosting

```bash
# Build the static files
node builder.js

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Step 8: Access Your Application

After deployment, access your app at:
- **Teacher Dashboard**: `https://your-project.web.app/`
- **Student Portal**: `https://your-project.web.app/student.html`

---

## Local Development

### Simplified Development Commands

Starting with Version 3.0, you can use the following `npm` commands from the root directory:

```bash
# Full local development (Build + Watch + Emulate)
npm run dev

# Run only the File Watcher (Auto-rebuild src -> public)
npm run watch

# Run only the Firebase Emulators
npm run emulate

# Manual Rebuild
npm run build
```

### Using Firebase Emulators

The emulators provide a local instance of Firebase services, allowing you to test without affecting production data.

- **Emulator UI**: `http://localhost:4000`
- **Hosting**: `http://localhost:5002` (Teacher Dashboard)
- **Functions Port**: `5001`
- **Firestore Port**: `8080`
- **RTDB Port**: `9000`
- **Auth Port**: `9099`

---

## Project Structure

```
veritaslivepoll/
├── functions/               # Cloud Functions backend
│   ├── index.js            # 80+ function exports
│   ├── analytics_engine.js # Psychometric calculations
│   ├── email_service.js    # Email utilities
│   └── package.json
├── public/                  # Built static files (deployed to Hosting)
│   ├── index.html          # Teacher dashboard
│   ├── student.html        # Student interface
│   ├── exam_*.html         # Exam-related pages
│   └── favicon.png
├── src/                     # Source HTML components
│   ├── Teacher_*.html      # Teacher view components
│   ├── Student_*.html      # Student view components
│   ├── Common_*.html       # Shared components
│   └── Exam*.html          # Exam components
├── DOCS/                    # Documentation
│   └── Firestore_Data_Model.md
├── firebase.json           # Firebase configuration
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore indexes
├── database.rules.json     # RTDB security rules
├── storage.rules           # Cloud Storage rules
├── builder.js              # Build script
└── watch.js                # File watcher for development
```

---

## Cloud Functions Reference

### Session Management
| Function | Description |
|----------|-------------|
| `setLiveSessionState` | Control session status (OPEN, PAUSED, REVEAL, ENDED) |
| `finalizeSession` | Archive session to history |
| `joinSession` | Student joins via access code |
| `updateSessionState` | Update session metadata |

### Answer Processing
| Function | Description |
|----------|-------------|
| `onAnswerSubmitted` | RTDB trigger for answer writes |
| `submitResponse` | Student answer submission |
| `gradeResponse` | Firestore trigger for auto-grading |

### Proctoring
| Function | Description |
|----------|-------------|
| `manageProctoring` | Unlock/block/unblock students |
| `reportStudentViolation` | Log fullscreen/tab violations |
| `confirmFullscreen` | Verify student re-entered fullscreen |
| `unlockStudent` | Teacher unlocks locked student |

### Analytics
| Function | Description |
|----------|-------------|
| `getAnalytics` | Comprehensive analytics engine |
| `generateSessionReport` | Create session report with item analysis |

### Data Management
| Function | Description |
|----------|-------------|
| `createPoll`, `updatePoll`, `deletePoll` | Poll CRUD |
| `savePoll` | Atomic poll save with questions |
| `manageRoster` | Class roster management |
| `createClass`, `bulkAddStudents` | Class management |
| `manageQuestionBank` | Question bank CRUD |

### Communication
| Function | Description |
|----------|-------------|
| `sendEmail` | Send emails via Nodemailer/SMTP |
| `verifyTeacher` | Validate teacher authentication |

---

## Security Rules

### Realtime Database (`database.rules.json`)

Key security patterns:
- Teachers can read/write session state for their polls
- Students can only write to their own answer nodes
- Proctoring state is locked per-student with version control

### Firestore (`firestore.rules`)

Key security patterns:
- Polls are readable only by authenticated users
- Write access restricted to poll owner (teacherId)
- Questions subcollection inherits parent poll permissions

### Storage (`storage.rules`)

Key security patterns:
- Uploads allowed for authenticated teachers
- Read access for all (images need to be viewable by students)

---

## Usage Guide

### For Teachers

1. **Login**: Access the dashboard and sign in
2. **Create Class**: Add classes and import student rosters (CSV supported)
3. **Create Poll**: Build polls with multiple-choice questions and images
4. **Send Links**: Generate and email student access links
5. **Start Session**: Open the poll and monitor student responses in real-time
6. **Manage Proctoring**: Unlock students who trigger violations
7. **View Analytics**: Review psychometric analysis and student performance

### For Students

1. **Access Link**: Click the personalized link received via email
2. **Enter Fullscreen**: Click "Begin Session" to enter proctored mode
3. **Answer Questions**: Select answers and submit before timer expires
4. **Stay Focused**: Any fullscreen exit or tab switch triggers a violation lock

---

## Troubleshooting

### Common Issues

#### "Permission Denied" Errors
- Verify security rules are deployed: `firebase deploy --only database,firestore:rules`
- Check that the user is properly authenticated
- For teachers: Ensure email matches authorized teacher list

#### Cloud Functions Not Working
- Verify Blaze plan is active (required for external network calls)
- Check function logs: `firebase functions:log`
- Redeploy functions: `firebase deploy --only functions`

#### Students Can't Join
- Ensure Anonymous Authentication is enabled in Firebase Console
- Check that session status is "OPEN" in RTDB
- Verify access code matches

### Debug Commands

```bash
# View function logs
firebase functions:log --only setLiveSessionState

# Test functions locally
firebase emulators:start --only functions

# Check deployment status
firebase deploy --only hosting --debug
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test` (in functions directory)
5. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/stephenborish/veritaslivepoll/issues)
- **Email**: sborish@malvernprep.org

---

**Last Updated**: 2026-01-16 | **Version**: 3.0 (Firebase Architecture)
