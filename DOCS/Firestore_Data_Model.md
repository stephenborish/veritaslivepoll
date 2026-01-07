# Firestore Data Model - VERITAS Live Poll

## Overview

This document describes the complete data model for VERITAS Live Poll, which uses a **hybrid database architecture**:

- **Firestore**: Permanent storage for polls, classes, exams, and reports
- **Realtime Database**: Ephemeral storage for live sessions, presence, and real-time signaling

---

## Firestore Collections

### 1. `/teachers/{teacherId}`

Teacher profiles and account settings.

**Document ID**: Firebase Auth UID

**Fields**:
```typescript
{
  uid: string,              // Firebase Auth UID (redundant but useful)
  email: string,            // Teacher's email from Google Sign-In
  displayName: string,      // Display name from Google profile
  createdAt: Timestamp,     // Account creation time
  updatedAt: Timestamp      // Last profile update
}
```

**Security Rules**:
- Teachers can only read/write their own document
- Rule: `allow read, write: if request.auth.uid == teacherId`

**Example**:
```json
{
  "uid": "teacher123abc",
  "email": "jsmith@school.edu",
  "displayName": "John Smith",
  "createdAt": "2025-01-01T12:00:00Z",
  "updatedAt": "2025-01-07T08:30:00Z"
}
```

---

### 2. `/classes/{classId}`

Class rosters created by teachers.

**Document ID**: Auto-generated (Firestore auto-ID)

**Fields**:
```typescript
{
  classId: string,          // Same as document ID
  className: string,        // Human-readable class name
  teacherId: string,        // Reference to teacher UID
  studentCount: number,     // Number of students (denormalized for UI)
  createdAt: Timestamp,     // Class creation time
  updatedAt: Timestamp      // Last modification
}
```

**Security Rules**:
- Teachers can only access classes they own
- Rule: `allow read, write: if request.auth.uid == resource.data.teacherId`

**Example**:
```json
{
  "classId": "class_abc123",
  "className": "AP Biology - Period 1",
  "teacherId": "teacher123abc",
  "studentCount": 28,
  "createdAt": "2025-01-05T09:00:00Z",
  "updatedAt": "2025-01-06T14:30:00Z"
}
```

---

### 3. `/classes/{classId}/students/{studentId}`

**Sub-collection** of students within a class.

**Document ID**: Auto-generated or email-based

**Fields**:
```typescript
{
  studentId: string,        // Same as document ID
  name: string,             // Student's full name
  email: string,            // Student's email (lowercase)
  emailHash: string,        // MD5 hash of email for RTDB lookups
  createdAt: Timestamp      // When student was added to roster
}
```

**Security Rules**:
- Teachers can read/write students in their classes
- Rule: `allow read, write: if get(/databases/$(database)/documents/classes/$(classId)).data.teacherId == request.auth.uid`

**Example**:
```json
{
  "studentId": "student_xyz789",
  "name": "Jane Doe",
  "email": "jdoe@school.edu",
  "emailHash": "5d41402abc4b2a76b9719d911017c592",
  "createdAt": "2025-01-05T09:15:00Z"
}
```

---

### 4. `/polls/{pollId}`

Poll and quiz templates.

**Document ID**: Auto-generated or custom

**Fields**:
```typescript
{
  pollId: string,
  pollName: string,         // Poll title
  teacherId: string,        // Owner UID
  sessionType: 'LIVE_POLL' | 'SECURE_ASSESSMENT',
  questions: Array<{        // Embedded question array
    id: string,
    stemHtml: string,       // Question text (HTML)
    imageUrl?: string,      // Optional image from Storage
    options: Array<{
      text: string,
      imageUrl?: string
    }>,
    correctAnswer: number | string,  // Index or value of correct answer
    points: number,         // Point value
    order: number           // Display order
  }>,
  settings: {
    timeLimitMinutes: number,
    calculatorEnabled: boolean,
    proctorMode: 'soft' | 'hard' | 'none',
    shuffleQuestions: boolean,
    shuffleOptions: boolean
  },
  metacognitionEnabled: boolean,  // Show confidence selector
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Security Rules**:
- Teachers can only access polls they own
- Rule: `allow read, write: if request.auth.uid == resource.data.teacherId`

**Example**:
```json
{
  "pollId": "poll_biology_unit1",
  "pollName": "Unit 1: Cell Structure Quiz",
  "teacherId": "teacher123abc",
  "sessionType": "LIVE_POLL",
  "questions": [
    {
      "id": "q1",
      "stemHtml": "<p>What organelle is responsible for protein synthesis?</p>",
      "imageUrl": "https://storage.googleapis.com/.../ribosome.png",
      "options": [
        { "text": "Ribosome", "imageUrl": null },
        { "text": "Mitochondria", "imageUrl": null },
        { "text": "Golgi apparatus", "imageUrl": null },
        { "text": "Nucleus", "imageUrl": null }
      ],
      "correctAnswer": 0,
      "points": 1,
      "order": 0
    }
  ],
  "settings": {
    "timeLimitMinutes": 30,
    "calculatorEnabled": false,
    "proctorMode": "soft",
    "shuffleQuestions": false,
    "shuffleOptions": true
  },
  "metacognitionEnabled": true,
  "createdAt": "2025-01-06T10:00:00Z",
  "updatedAt": "2025-01-06T10:30:00Z"
}
```

---

### 5. `/sessions/{sessionId}`

Live instances of polls/exams.

**Document ID**: Auto-generated

**Fields**:
```typescript
{
  sessionId: string,
  pollId: string,           // Reference to poll template
  teacherId: string,        // Session owner
  status: 'WAITING' | 'ACTIVE' | 'PAUSED' | 'CLOSED',
  accessCode: string,       // 6-digit join code (e.g., "ABC123")
  currentQuestionIndex: number,
  startedAt?: Timestamp,    // When session became ACTIVE
  endedAt?: Timestamp,      // When session was CLOSED
  createdAt: Timestamp,
  lastUpdate: Timestamp     // Last state change
}
```

**Security Rules**:
- Teachers can manage their own sessions
- All authenticated users can read sessions (for joining)
- Rule: `allow read: if request.auth != null; allow write: if request.auth.uid == resource.data.teacherId`

**Example**:
```json
{
  "sessionId": "session_20250107_1430",
  "pollId": "poll_biology_unit1",
  "teacherId": "teacher123abc",
  "status": "ACTIVE",
  "accessCode": "XYZ789",
  "currentQuestionIndex": 2,
  "startedAt": "2025-01-07T14:30:00Z",
  "createdAt": "2025-01-07T14:25:00Z",
  "lastUpdate": "2025-01-07T14:35:00Z"
}
```

---

### 6. `/sessions/{sessionId}/students/{studentId}`

**Sub-collection** tracking student participation in a session.

**Document ID**: Firebase Auth UID (anonymous)

**Fields**:
```typescript
{
  studentId: string,        // Auth UID
  name: string,             // Display name
  email: string,            // For roster matching
  status: 'ACTIVE' | 'LOCKED' | 'FINISHED',
  answers: Map<number, any>,  // { questionIndex: answer }
  unlockCount: number,      // How many times teacher unlocked
  lockVersion: number,      // Current lock version
  joinedAt: Timestamp,
  lastActivity: Timestamp
}
```

**Security Rules**:
- Students can read/write their own document
- Teachers can read all students in their sessions
- Rule: `allow read, write: if request.auth.uid == studentId || get(/databases/$(database)/documents/sessions/$(sessionId)).data.teacherId == request.auth.uid`

---

### 7. `/sessions/{sessionId}/responses/{responseId}`

**Sub-collection** storing individual answer submissions.

**Document ID**: Auto-generated

**Fields**:
```typescript
{
  responseId: string,
  studentId: string,        // Auth UID
  questionIndex: number,
  answer: any,              // Student's answer
  confidence?: 'High' | 'Medium' | 'Low',
  isCorrect?: boolean,      // Computed by gradeResponse function
  timestamp: Timestamp
}
```

**Security Rules**:
- Students can create their own responses (immutable)
- Teachers can read all responses
- Rule: `allow create: if request.auth.uid == request.resource.data.studentId; allow update: if false`

---

### 8. `/exams/{examId}`

Secure exam templates (similar to polls but with stricter proctoring).

**Document ID**: Auto-generated

**Fields**:
```typescript
{
  examId: string,
  teacherId: string,
  title: string,
  description?: string,
  questions: Array<Question>,  // Same structure as polls
  settings: {
    timer: number,          // Minutes
    shuffle: boolean,
    proctorMode: 'fullscreen' | 'lockdown',
    allowCalculator: boolean,
    allowNotes: boolean
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Security Rules**:
- Teachers can only access exams they own
- Rule: `allow read, write: if request.auth.uid == resource.data.teacherId`

---

### 9. `/question_bank/{questionId}`

Reusable question library.

**Document ID**: Auto-generated

**Fields**:
```typescript
{
  questionId: string,
  teacherId: string,        // Owner
  stemHtml: string,
  imageUrl?: string,
  options: Array<{text: string, imageUrl?: string}>,
  correctAnswer: number | string,
  points: number,
  tags: Array<string>,      // e.g., ["biology", "cell structure"]
  difficulty?: 'easy' | 'medium' | 'hard',
  standard?: string,        // e.g., "NGSS HS-LS1-2"
  createdAt: Timestamp,
  usageCount: number        // How many times used in polls
}
```

**Security Rules**:
- Teachers can only access questions they created
- Rule: `allow read, write: if request.auth.uid == resource.data.teacherId`

---

### 10. `/reports/{reportId}`

Generated analytics reports (write-only for Cloud Functions).

**Document ID**: Auto-generated

**Fields**:
```typescript
{
  reportId: string,
  sessionId: string,        // Reference to session
  teacherId: string,        // Report owner
  reportType: 'item_analysis' | 'student_performance' | 'class_insights',
  data: object,             // Report-specific data structure
  generatedAt: Timestamp
}
```

**Security Rules**:
- All authenticated users can read
- Only Cloud Functions can write
- Rule: `allow read: if request.auth != null; allow write: if false`

---

## Realtime Database Structure

### Purpose

Realtime Database (RTDB) is used for **ephemeral, high-frequency data** that doesn't need permanent storage:

- Live session state (current question, timer)
- Student presence/heartbeats
- Answer submissions (before Firestore write)
- Violation logs
- Teacher-only answer keys

### Structure

```
/sessions/{pollId}/
  ├─ live_session/
  │   ├─ pollId: string
  │   ├─ questionIndex: number
  │   ├─ status: 'PRE_LIVE' | 'OPEN' | 'PAUSED' | 'ENDED'
  │   ├─ timestamp: ServerValue.TIMESTAMP
  │   ├─ questionText: string
  │   ├─ options: Array<string>
  │   ├─ serverProcessed: boolean  // Set by Cloud Function
  │   └─ metadata: object (timer, settings, etc.)
  │
  ├─ students/
  │   └─ {emailHash}/              # MD5(email)
  │       ├─ status: 'ACTIVE' | 'LOCKED' | 'FINISHED'
  │       ├─ lastHeartbeat: timestamp
  │       ├─ lockVersion: number   # Increments on each violation
  │       └─ name: string
  │
  ├─ answers_key/                  # TEACHER-ONLY ACCESS
  │   └─ {questionIndex}: correctAnswer
  │
  ├─ violations/
  │   └─ {emailHash}/
  │       ├─ count: number
  │       └─ events: Array<{
  │           timestamp: number,
  │           type: 'FULLSCREEN_EXIT' | 'TAB_SWITCH' | 'WINDOW_BLUR',
  │           lockVersion: number
  │         }>
  │
  └─ activities/                   # Audit logs
      └─ {timestamp}: { action, user, details }

/answers/{pollId}/
  └─ {studentEmailKey}/            # MD5(email)
      ├─ questionIndex: number
      ├─ answer: mixed
      ├─ timestamp: ServerValue.TIMESTAMP
      └─ confidence?: 'High' | 'Medium' | 'Low'

/rosters/
  ├─ classes: Array<ClassName>     # List of class names
  └─ rosters/
      └─ {className}/
          └─ {emailHash}: {
              name: string,
              email: string
            }

/tokens/                           # Authentication tokens
  └─ {tokenString}: {
      email: string,
      pollId: string,
      expiry: timestamp
    }

/history/{pollId}/                 # Archived session snapshots
  └─ {sessionId}: {
      sessionId: string,
      timestamp: timestamp,
      pollName: string,
      className: string,
      finalQuestionIndex: number,
      totalResponses: number,
      answers: object,             # All student answers
      questions: Array<Question>   # Snapshot of poll at runtime
    }
```

### Security Rules (RTDB)

**Key Security Principles**:

1. **Answer Keys are Teacher-Only**:
   ```json
   "answers_key": {
     ".read": "auth.token.firebase.sign_in_provider != 'anonymous'",
     ".write": "auth.token.firebase.sign_in_provider != 'anonymous'"
   }
   ```

2. **Students Can Submit Answers**:
   ```json
   "answers": {
     "$pollId": {
       "$studentKey": {
         ".write": "auth != null"
       }
     }
   }
   ```

3. **Teachers Can Read All Session Data**:
   ```json
   "sessions": {
     "$pollId": {
       "students": {
         ".read": "auth.token.firebase.sign_in_provider != 'anonymous'"
       }
     }
   }
   ```

---

## Data Flow Examples

### Example 1: Teacher Creates a Poll

1. **Firestore Write**:
   - Collection: `/polls`
   - Document: Auto-generated ID
   - Data: `{ pollName, questions, settings, teacherId, ... }`

2. **Storage Upload (if images)**:
   - Path: `/poll-images/{teacherId}/{imageId}.png`
   - Returns: Download URL stored in `question.imageUrl`

### Example 2: Teacher Starts Live Session

1. **Firestore Write**:
   - Collection: `/sessions`
   - Document: Auto-generated ID
   - Data: `{ pollId, teacherId, status: 'ACTIVE', accessCode, ... }`

2. **RTDB Write (via Cloud Function)**:
   - Path: `/sessions/{pollId}/live_session`
   - Data: `{ status: 'OPEN', questionIndex: 0, timestamp, ... }`

3. **RTDB Write (Answer Key)**:
   - Path: `/sessions/{pollId}/answers_key/0`
   - Value: `correctAnswer` (secure, teacher-only)

### Example 3: Student Joins Session

1. **Anonymous Auth**:
   - Firebase Auth creates anonymous UID

2. **Firestore Write**:
   - Collection: `/sessions/{sessionId}/students`
   - Document: `{studentId}`
   - Data: `{ name, email, status: 'ACTIVE', joinedAt }`

3. **RTDB Write (Presence)**:
   - Path: `/sessions/{pollId}/students/{emailHash}`
   - Data: `{ status: 'ACTIVE', lastHeartbeat: timestamp }`

### Example 4: Student Submits Answer

1. **RTDB Write (Fast Path)**:
   - Path: `/answers/{pollId}/{emailHash}`
   - Data: `{ questionIndex, answer, confidence, timestamp }`

2. **Cloud Function Trigger** (`onAnswerSubmitted`):
   - Reads answer from RTDB
   - Writes to Firestore `/sessions/{sessionId}/responses`
   - Marks as graded if correct answer available

3. **Firestore Trigger** (`gradeResponse`):
   - Computes `isCorrect` by comparing to answer key
   - Updates response document

---

## Indexing Strategy

### Firestore Composite Indexes

Automatically created on first query:

1. **Classes by Teacher**:
   - Collection: `classes`
   - Fields: `teacherId` (ASC), `createdAt` (DESC)

2. **Polls by Teacher**:
   - Collection: `polls`
   - Fields: `teacherId` (ASC), `updatedAt` (DESC)

3. **Sessions by Status**:
   - Collection: `sessions`
   - Fields: `teacherId` (ASC), `status` (ASC), `createdAt` (DESC)

### RTDB Indexes

Defined in `database.rules.json`:

```json
"sessions": {
  "$pollId": {
    "students": {
      ".indexOn": ["lastHeartbeat", "status"]
    }
  }
}
```

---

## Migration Notes

### From Legacy Google Apps Script

If migrating from the old `src/` codebase:

**DO NOT USE**:
- ❌ Any `.gs` files in `src/`
- ❌ Google Sheets as database
- ❌ Clasp deployment
- ❌ `google.script.run` API calls

**USE INSTEAD**:
- ✅ Cloud Functions (`functions/index.js`)
- ✅ Firestore + RTDB
- ✅ Firebase SDK v9+
- ✅ `firebase deploy`

### Data Mapping

| Legacy (Apps Script) | Modern (Firebase) |
|---------------------|-------------------|
| `Classes` sheet | `/classes` collection |
| `Rosters` sheet | `/classes/{id}/students` sub-collection |
| `Polls` sheet | `/polls` collection |
| `LiveStatus` sheet | `/sessions/{pollId}/live_session` (RTDB) |
| `Responses` sheet | `/sessions/{id}/responses` sub-collection |
| Drive images | Firebase Storage `/poll-images` |
| Script Properties | Firebase Remote Config (future) |

---

## Performance Considerations

### Firestore

- **Document Limit**: 1MB per document
  - Workaround: Use sub-collections for large datasets (e.g., `/sessions/{id}/responses`)

- **Write Limits**: 1 write/second per document
  - Workaround: Batch writes, distributed counters

- **Read Pricing**: $0.06 per 100k reads
  - Optimization: Cache frequently accessed data, use RTDB for real-time

### Realtime Database

- **Path Limit**: 768 bytes per path
  - Workaround: Use MD5 hashes for email keys

- **Download Size**: Charged per GB downloaded
  - Optimization: Query specific paths, not entire session

- **Concurrent Connections**: 100k simultaneous connections (Blaze plan)
  - Scaling: Use Firestore for persistent data, RTDB only for real-time

---

## Backup & Recovery

### Firestore

**Automated Backups**:
- Enable in Firebase Console → Firestore → Backups
- Schedule: Daily at 2 AM UTC
- Retention: 30 days

**Manual Export**:
```bash
gcloud firestore export gs://your-bucket/firestore-backups
```

### Realtime Database

**Manual Backup**:
```bash
firebase database:get / > rtdb-backup.json
```

**Automated Backup**:
- Use Cloud Scheduler + Cloud Functions
- Trigger: Daily export to Cloud Storage

---

## Schema Version

**Current Version**: 2.0 (Firebase Architecture)
**Last Updated**: 2025-01-07
**Breaking Changes**: Complete rewrite from Google Apps Script to Firebase

**Changelog**:
- **v2.0** (2025-01): Firebase Cloud Functions + Firestore + RTDB
- **v1.0** (2024-09): Google Apps Script + Sheets + RTDB (DEPRECATED)
