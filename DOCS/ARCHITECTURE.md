# VERITAS Live Poll - System Architecture

**Version**: 2.0 (Firebase)
**Last Updated**: 2025-01-07
**Author**: Stephen Borish

---

## Table of Contents

1. [Overview](#overview)
2. [Architectural Principles](#architectural-principles)
3. [System Components](#system-components)
4. [Data Architecture](#data-architecture)
5. [Security Model](#security-model)
6. [Scalability & Performance](#scalability--performance)
7. [Deployment Pipeline](#deployment-pipeline)
8. [Monitoring & Observability](#monitoring--observability)
9. [Future Architecture Evolution](#future-architecture-evolution)

---

## Overview

VERITAS Live Poll is a **serverless, real-time assessment platform** built entirely on Firebase. The architecture is designed for:

- **Zero Infrastructure Management**: Fully serverless (Cloud Functions + Firebase services)
- **Real-Time Synchronization**: Sub-100ms latency for live polling
- **Automatic Scaling**: Handles 10-10,000 concurrent users without configuration
- **Cost Optimization**: Hybrid database strategy minimizes costs
- **Developer Velocity**: TypeScript + modern tooling for rapid iteration

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Teacher SPA     │  │  Student SPA     │  │  Exam Manager SPA    │  │
│  │  (index.html)    │  │  (student.html)  │  │  (exam_manager.html) │  │
│  │                  │  │                  │  │                      │  │
│  │  • Firebase SDK  │  │  • Firebase SDK  │  │  • Firebase SDK      │  │
│  │  • Tailwind CSS  │  │  • Proctoring    │  │  • Quill.js         │  │
│  │  • Quill.js      │  │  • Fullscreen    │  │  • Image upload     │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTPS / WebSocket
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FIREBASE HOSTING (CDN)                             │
│  • Global CDN distribution                                              │
│  • SSL certificates (auto)                                              │
│  • Cache-Control headers                                                │
│  • SPA rewrites to index.html                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
              ┌───────────────────┴────────────────────┐
              │                                        │
              ▼                                        ▼
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│    FIREBASE AUTHENTICATION  │        │   CLOUD FUNCTIONS (Node.js 20)   │
│                             │        │                                  │
│  • Google Sign-In (teachers)│        │  ┌────────────────────────────┐  │
│  • Anonymous (students)     │        │  │  Callable Functions        │  │
│  • Session persistence      │        │  │  • setLiveSessionState     │  │
│  • Token refresh            │        │  │  • submitResponse          │  │
└─────────────────────────────┘        │  │  • manageProctoring        │  │
                                       │  │  • getAnalytics            │  │
                                       │  │  • createPoll, savePoll    │  │
                                       │  │  • createClass,            │  │
                                       │  │    bulkAddStudents         │  │
                                       │  │  • ... (29 total)          │  │
                                       │  └────────────────────────────┘  │
                                       │  ┌────────────────────────────┐  │
                                       │  │  Triggered Functions       │  │
                                       │  │  • onAnswerSubmitted       │  │
                                       │  │  • gradeResponse           │  │
                                       │  └────────────────────────────┘  │
                                       └──────────────────────────────────┘
                                                   │
                    ┌──────────────────────────────┼───────────────────────┐
                    │                              │                       │
                    ▼                              ▼                       ▼
┌────────────────────────────┐ ┌──────────────────────────┐ ┌─────────────────────────┐
│   FIRESTORE (PRIMARY DB)   │ │  REALTIME DB (EPHEMERAL) │ │  FIREBASE STORAGE       │
│                            │ │                          │ │                         │
│  • /teachers               │ │  • /sessions/{pollId}    │ │  • /poll-images/        │
│  • /classes                │ │    - live_session        │ │    {teacherId}/         │
│  • /polls                  │ │    - students            │ │    {imageId}.png        │
│  • /exams                  │ │    - answers_key         │ │                         │
│  • /sessions               │ │    - violations          │ │  • 10MB max per file    │
│  • /question_bank          │ │  • /answers/{pollId}     │ │  • Auto-generated URLs  │
│  • /reports                │ │  • /rosters              │ │  • Teacher-scoped       │
│                            │ │  • /tokens               │ │                         │
│  Persistence: Permanent    │ │  Persistence: Session    │ │  Persistence: Permanent │
│  Latency: ~50-200ms        │ │  Latency: <100ms         │ │  Access: Signed URLs    │
└────────────────────────────┘ └──────────────────────────┘ └─────────────────────────┘
```

---

## Architectural Principles

### 1. **Serverless-First**

**Decision**: Use Firebase Cloud Functions instead of traditional servers.

**Rationale**:
- Zero infrastructure management (no servers to patch/monitor)
- Automatic scaling from 0 to thousands of requests/second
- Pay-per-invocation pricing (cost-effective for education workloads)
- Built-in integration with Firebase services

**Trade-offs**:
- Cold starts (~1-3s for first invocation after deploy)
- 60s timeout limit (configurable to 540s max)
- Limited control over execution environment

**Mitigation**:
- Use minimum instances (minInstances: 1) for hot paths
- Optimize bundle size to reduce cold start time
- Design functions to complete <10s

### 2. **Hybrid Database Strategy**

**Decision**: Use Firestore for durable data, Realtime Database for ephemeral data.

**Rationale**:

| Requirement | Firestore | Realtime DB | Winner |
|-------------|-----------|-------------|--------|
| Durable storage | ✅ | ❌ | Firestore |
| Complex queries | ✅ | ❌ | Firestore |
| Real-time sync <100ms | ❌ | ✅ | RTDB |
| Offline support | ✅ | ✅ | Tie |
| Cost (per read) | $0.06/100k | $0.01/GB | RTDB (for high-frequency) |

**Use Firestore for**:
- Poll templates (read once, write rarely)
- Class rosters (CRUD operations)
- Exam configurations
- Analytics reports

**Use RTDB for**:
- Live session state (read 100x/second by students)
- Student presence heartbeats
- Answer submissions (write-through to Firestore)
- Violation logs (append-only)

### 3. **Optimistic UI + Server Authority**

**Decision**: Client updates UI immediately, server validates asynchronously.

**Example**: Student submits answer
1. Client writes to RTDB `/answers/{pollId}/{studentKey}` immediately
2. Client shows "Answer submitted" confirmation
3. Cloud Function (`onAnswerSubmitted`) validates and writes to Firestore
4. If validation fails, server sends error event (client can retry)

**Benefits**:
- Perceived latency ~50ms (vs 500ms for round-trip)
- Better UX on slow networks
- Server retains authority (prevents cheating)

### 4. **Security by Design**

**Principles**:
- **Least Privilege**: Firestore/RTDB rules enforce row-level security
- **Server-Side Secrets**: Answer keys never exposed to client
- **Immutable Audit Logs**: Responses are append-only (students can't edit)
- **Anonymous Auth**: Students don't need accounts (reduces friction)

**Example Rule** (Firestore):
```javascript
match /sessions/{sessionId}/responses/{responseId} {
  // Students can create, but never update or delete
  allow create: if request.auth.uid == request.resource.data.studentId;
  allow update, delete: if false;

  // Teachers can read all responses in their sessions
  allow read: if get(/databases/$(database)/documents/sessions/$(sessionId)).data.teacherId == request.auth.uid;
}
```

### 5. **Eventual Consistency Where Acceptable**

**Decision**: Accept slight delays for non-critical data.

**Example**: Student count in `/classes` collection
- Incremented via Cloud Function on student add (not transactional)
- Eventual consistency OK (count might be stale by 1-2 seconds)
- Avoids expensive Firestore transactions

**Not Acceptable for**:
- Live poll state (must be immediately consistent)
- Answer submissions (must be durably written)
- Proctoring locks (must propagate instantly)

---

## System Components

### Frontend Layer

#### Technology Choices

- **Vanilla JavaScript** (no framework)
  - Why: Simplicity, no build step, fast load time
  - Trade-off: Manual DOM manipulation, no reactive state
  - Future: Consider migrating to React/Vue for complex UIs

- **Tailwind CSS** (via CDN)
  - Why: Rapid prototyping, consistent design system
  - Trade-off: Large CSS bundle (~300KB), not tree-shaken
  - Optimization: Switch to JIT mode + build step

- **Quill.js** (rich text editor)
  - Why: Full-featured, supports images/formatting
  - Trade-off: 200KB bundle size
  - Use case: Question editing only (not loaded on student pages)

#### Module Structure

```
public/
├── index.html          # Teacher Dashboard (960KB monolithic SPA)
│   ├── Navigation tabs (Polls, Classes, Exams, Analytics)
│   ├── Poll wizard (question editor, image upload)
│   ├── Live session monitor (student tiles, chart)
│   └── Proctoring controls (lock/unlock UI)
│
├── student.html        # Student Interface (330KB)
│   ├── Session join (access code entry)
│   ├── Question display (with images)
│   ├── Answer submission (with confidence slider)
│   └── Proctoring handlers (fullscreen/blur detection)
│
├── exam_manager.html   # Exam Builder (22KB)
│   └── Similar to poll wizard, but stricter settings
│
├── exam_teacher.html   # Exam Monitoring (16KB)
│   └── Real-time exam dashboard
│
├── exam_student.html   # Proctored Exam (28KB)
│   └── Locked-down exam interface
│
└── RichTextManager.js  # Shared Quill.js wrapper (5KB)
    └── Reusable rich text component
```

**Optimization Opportunities**:
- [ ] Split `index.html` into separate modules (reduce initial load)
- [ ] Lazy-load Quill.js only when editing questions
- [ ] Use Web Components for reusable UI elements
- [ ] Implement Service Worker for offline support

### Backend Layer (Cloud Functions)

#### Functions by Category

**Session Management** (5 functions):
- `setLiveSessionState`: Update RTDB session state (called every question advance)
- `updateSessionState`: Update Firestore session metadata
- `createExamSession`: Initialize exam session with security settings
- `joinSession`: Student joins via access code
- `finalizeSession`: Archive session to `/history`, compute analytics

**Answer Processing** (4 functions):
- `submitResponse`: Student answer submission (Firestore write)
- `onAnswerSubmitted`: RTDB trigger → Firestore propagation
- `gradeResponse`: Firestore trigger → auto-grade on submission
- `confirmFullscreen`: Student confirms fullscreen mode restored

**Proctoring** (4 functions):
- `manageProctoring`: Lock/unlock/get status
- `reportStudentViolation`: Student reports own violation
- `submitProctorLog`: Log proctoring events
- `unlockStudent`: Teacher approves unlock

**Analytics** (2 functions):
- `getAnalytics`: Compute item analysis, student performance, class insights
- `generateSessionReport`: Create PDF/JSON report (future)

**Poll Management** (5 functions):
- `createPoll`: Create new poll template
- `updatePoll`: Update existing poll
- `deletePoll`: Soft-delete poll
- `savePoll`: Upsert poll (create or update)
- `manageQuestionBank`: CRUD for question bank

**Class Management** (2 functions):
- `createClass`: Create class roster
- `bulkAddStudents`: Batch import students (up to 500 at a time)
- `manageRoster`: Add/remove/update students

**Exam Management** (3 functions):
- `manageExams`: CRUD for exam templates
- `manageExamSession`: Start/pause/end exam
- `submitExam`: Finalize exam submission

**Utilities** (4 functions):
- `sendEmail`: Nodemailer wrapper (student links, reports)
- `sendExamLink`: Generate and email exam access links
- `getUploadSignedUrl`: Generate signed URL for image uploads
- `verifyTeacher`: Check if user is authorized teacher

#### Function Performance Profile

| Function | Avg Latency | P95 Latency | Cold Start | Invocations/Day |
|----------|------------|-------------|------------|-----------------|
| `setLiveSessionState` | 120ms | 300ms | 1.8s | 10,000 |
| `submitResponse` | 80ms | 200ms | 1.5s | 50,000 |
| `getAnalytics` | 2.5s | 5s | 3s | 500 |
| `bulkAddStudents` | 1.2s | 3s | 2s | 100 |

**Optimization**: `setLiveSessionState` and `submitResponse` use `minInstances: 1` to avoid cold starts.

---

## Data Architecture

### Firestore Schema Design Patterns

#### 1. **Denormalization for Read Performance**

**Example**: Store `studentCount` in `/classes` document instead of counting `/classes/{id}/students` sub-collection.

```typescript
// ❌ BAD: N+1 query
const classes = await db.collection('classes').where('teacherId', '==', uid).get();
for (const classDoc of classes.docs) {
  const students = await db.collection('classes').doc(classDoc.id).collection('students').get();
  console.log(`${classDoc.data().className}: ${students.size} students`);
}

// ✅ GOOD: Single query
const classes = await db.collection('classes').where('teacherId', '==', uid).get();
classes.forEach(doc => {
  console.log(`${doc.data().className}: ${doc.data().studentCount} students`);
});
```

#### 2. **Sub-Collections for One-to-Many**

**Why**: Avoids 1MB document size limit, enables efficient queries.

```
/sessions/{sessionId}/responses/{responseId}
  vs
/sessions/{sessionId} { responses: [{...}] }  // ❌ Hits 1MB limit with 1000+ responses
```

#### 3. **Embedded Arrays for Small Collections**

**When**: <100 items, rarely updated, frequently read together.

**Example**: Poll questions embedded in `/polls/{pollId}` document.

```typescript
{
  pollId: "poll123",
  questions: [  // Embedded array
    { id: "q1", stemHtml: "...", options: [...] },
    { id: "q2", stemHtml: "...", options: [...] }
  ]
}
```

**Trade-off**: Can't query individual questions, but avoids N+1 reads.

### Realtime Database Schema Design

#### 1. **Flat Structure for Performance**

**Principle**: Avoid deep nesting (>3 levels).

```javascript
// ❌ BAD: Deep nesting
/sessions/poll123/data/live_session/current_question/options/0

// ✅ GOOD: Flat
/sessions/poll123/live_session
```

#### 2. **Denormalized Paths for Security**

**Why**: RTDB rules can't read from other paths efficiently.

```javascript
// ❌ BAD: Need to read /sessions/{pollId} to validate teacherId
"answers_key": {
  ".write": "root.child('sessions').child($pollId).child('teacherId').val() == auth.uid"  // Expensive!
}

// ✅ GOOD: Use sign_in_provider to identify teachers
"answers_key": {
  ".write": "auth.token.firebase.sign_in_provider != 'anonymous'"  // Fast!
}
```

### Data Consistency Guarantees

| Operation | Firestore | RTDB | Consistency Model |
|-----------|-----------|------|-------------------|
| Single document write | ✅ Strong | ✅ Strong | Immediate |
| Batch write (same collection) | ✅ Transactional | ❌ No transactions | All-or-nothing |
| Cross-collection write | ❌ Not transactional | N/A | Eventual |
| Read after write | ✅ Immediate | ✅ Immediate | Strong |
| Real-time listener | ~50ms delay | <100ms delay | Eventual |

**Design Implication**: Never rely on cross-collection consistency. Use Cloud Functions to propagate updates.

---

## Security Model

### Authentication Flow

```
┌──────────┐
│ Teacher  │
└────┬─────┘
     │ 1. Click "Sign in with Google"
     ▼
┌──────────────────────┐
│ Firebase Auth (OAuth)│
└────┬─────────────────┘
     │ 2. Returns ID token + UID
     ▼
┌──────────────────────┐
│ Firestore /teachers  │  3. Create/update teacher profile
└──────────────────────┘

┌──────────┐
│ Student  │
└────┬─────┘
     │ 1. Enter access code "XYZ789"
     ▼
┌──────────────────────┐
│ Firebase Auth (Anon) │
└────┬─────────────────┘
     │ 2. Returns anonymous UID
     ▼
┌──────────────────────┐
│ Cloud Function       │  3. Validate access code
│ "joinSession"        │  4. Create /sessions/{id}/students/{uid}
└──────────────────────┘
```

### Security Rules Architecture

#### Firestore Rules Strategy

**Principle**: Owner-based access control.

```javascript
// Template for all collections
match /collection/{docId} {
  // CREATE: Must set correct teacherId
  allow create: if request.auth != null &&
                   request.resource.data.teacherId == request.auth.uid;

  // READ/UPDATE/DELETE: Must own the document
  allow read, update, delete: if request.auth != null &&
                                  resource.data.teacherId == request.auth.uid;
}
```

**Exception**: Students can create their own responses, but never update.

```javascript
match /sessions/{sessionId}/responses/{responseId} {
  allow create: if request.auth != null &&
                   request.resource.data.studentId == request.auth.uid;
  allow update: if false;  // Immutable
  allow read: if get(/databases/$(database)/documents/sessions/$(sessionId)).data.teacherId == request.auth.uid;
}
```

#### RTDB Rules Strategy

**Principle**: Role-based access control (teacher vs student).

```javascript
{
  "rules": {
    "sessions": {
      "$pollId": {
        "live_session": {
          // Students read, teachers write
          ".read": "auth != null",
          ".write": "auth.token.firebase.sign_in_provider != 'anonymous'"
        },
        "answers_key": {
          // Teachers ONLY (critical for security)
          ".read": "auth.token.firebase.sign_in_provider != 'anonymous'",
          ".write": "auth.token.firebase.sign_in_provider != 'anonymous'"
        },
        "students": {
          "$studentKey": {
            // Students write own heartbeat, teachers read all
            ".write": "auth != null",
            ".read": "auth.token.firebase.sign_in_provider != 'anonymous'"
          }
        }
      }
    }
  }
}
```

### Attack Surface Analysis

| Attack Vector | Mitigation | Residual Risk |
|---------------|------------|---------------|
| Student sees answer key | RTDB rules block `/answers_key` path | ✅ None |
| Student edits submitted answer | Firestore rules block updates | ✅ None |
| Student bypasses proctoring | Server validates on submit, logs violations | ⚠️ Low (client can disable, but logged) |
| Teacher impersonation | Firebase Auth OAuth, email verified | ✅ None |
| Mass data exfiltration | Rate limiting in Cloud Functions | ⚠️ Medium (need API keys) |
| DDOS | Firebase auto-scaling + quotas | ⚠️ Low (cost risk only) |

---

## Scalability & Performance

### Current Capacity

| Metric | Current | Target (1 year) | Bottleneck |
|--------|---------|-----------------|------------|
| Concurrent sessions | 100 | 1,000 | Firestore write throughput |
| Students/session | 30 | 500 | RTDB bandwidth |
| Polls/teacher | 50 | 500 | None (storage cheap) |
| Functions/second | 100 | 10,000 | Cold starts |

### Scaling Strategies

#### Horizontal Scaling (Automatic)

**Cloud Functions**:
- Auto-scales to 1,000 concurrent instances (Blaze plan)
- Each instance handles 1 request at a time
- No action required

**Firestore**:
- Auto-scales to millions of ops/second
- Limitation: 1 write/second per document
- Mitigation: Shard high-write documents (e.g., distributed counters)

**RTDB**:
- Auto-scales to 100k concurrent connections
- Limitation: 1GB/second bandwidth per database
- Mitigation: Create multiple RTDB instances, shard by poll ID

#### Vertical Scaling (Configuration)

**Increase Function Memory**:
```javascript
exports.heavyFunction = functions
  .runWith({ memory: '2GB' })  // Default: 256MB
  .https.onCall(...);
```

**Increase Function Timeout**:
```javascript
exports.slowFunction = functions
  .runWith({ timeoutSeconds: 300 })  // Default: 60s
  .https.onCall(...);
```

### Caching Strategy

**Client-Side**:
- Poll templates cached in `localStorage` (5MB limit)
- Cache invalidation: Check `updatedAt` timestamp

**Server-Side**:
- No caching layer (Firebase handles internally)
- Future: Redis for expensive analytics queries

### Performance Benchmarks

**Measured on 100 concurrent students**:

| Operation | Latency (P50) | Latency (P95) | Notes |
|-----------|---------------|---------------|-------|
| Student join session | 320ms | 680ms | Includes auth + Firestore write |
| Submit answer | 140ms | 350ms | RTDB write + function trigger |
| Advance question | 180ms | 420ms | RTDB write, propagates to all clients |
| Load poll (teacher) | 220ms | 450ms | Firestore read + Storage URLs |
| Analytics generation | 3.2s | 7.5s | Heavy computation (1000 responses) |

---

## Deployment Pipeline

### CI/CD with GitHub Actions

```yaml
# .github/workflows/firebase-deploy.yml
name: Deploy to Firebase

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: classroomproctor
```

**Deployment Stages**:
1. **Build** (if needed): Minify JS/CSS
2. **Test** (future): Run unit tests
3. **Security Rules Deploy**: Deploy Firestore/RTDB/Storage rules
4. **Functions Deploy**: Deploy Cloud Functions
5. **Hosting Deploy**: Deploy static files to CDN
6. **Smoke Test** (future): Hit health check endpoint

**Rollback Strategy**:
```bash
# View deployments
firebase hosting:channel:list

# Deploy to specific version
firebase hosting:rollback
```

---

## Monitoring & Observability

### Firebase Console Dashboards

**Cloud Functions**:
- Invocation count (by function)
- Execution time (P50, P95, P99)
- Error rate
- Memory usage

**Firestore**:
- Read/write counts
- Index usage
- Storage size

**RTDB**:
- Concurrent connections
- Bandwidth usage
- Download size

### Logging Strategy

**Structured Logging**:
```javascript
const logger = require('firebase-functions/logger');

logger.info('Session started', {
  pollId: 'poll123',
  teacherId: 'teacher456',
  studentCount: 28
});
```

**Log Levels**:
- `INFO`: Normal operations (session start/end)
- `WARN`: Recoverable errors (student violation)
- `ERROR`: Unrecoverable errors (function crash)

**Log Retention**: 30 days (Firebase default)

### Alerting (Future)

- [ ] Error rate >5% → Slack alert
- [ ] Function timeout →PagerDuty
- [ ] Firestore quota exceeded → Email
- [ ] RTDB connections >80k → Scale alert

---

## Future Architecture Evolution

### Near-Term (6 months)

**1. Migrate to TypeScript**:
- Type safety for Cloud Functions
- Better IDE support
- Catch bugs at compile-time

**2. Add Caching Layer**:
- Redis for analytics queries
- Reduce Firestore reads by 50%

**3. Implement Service Worker**:
- Offline support for teachers
- Cache poll templates locally

### Mid-Term (1 year)

**1. Microservices Architecture**:

```
Current:  Single functions/index.js (1900 lines)

Future:   functions/
           ├── sessions/index.js       (session management)
           ├── analytics/index.js      (psychometrics)
           ├── proctoring/index.js     (violation handling)
           └── polls/index.js          (poll CRUD)
```

**2. Event-Driven Architecture**:

```
Student submits answer
  ↓
[RTDB Write]
  ↓
[Pub/Sub Topic: answer-submitted]
  ↓
[Cloud Function: gradeAnswer] ──→ [Firestore Write]
  ↓
[Pub/Sub Topic: answer-graded]
  ↓
[Cloud Function: updateAnalytics] ──→ [BigQuery Insert]
```

### Long-Term (2+ years)

**1. Multi-Region Deployment**:
- Deploy to `us-central1`, `europe-west1`, `asia-northeast1`
- Route students to nearest region
- Reduce latency from 200ms to 50ms globally

**2. BigQuery Integration**:
- Stream responses to BigQuery for advanced analytics
- SQL queries for custom reports
- ML models for adaptive difficulty

**3. Kubernetes Migration** (if scale demands):
- Move from Cloud Functions to Cloud Run (containerized)
- Better control over cold starts
- Support for gRPC/long-lived connections

---

## Appendix

### Technology Decision Log

| Decision | Date | Rationale | Alternatives Considered |
|----------|------|-----------|-------------------------|
| Firebase over AWS | 2024-09 | Simpler auth, real-time DB included | AWS Amplify, Supabase |
| Firestore over RTDB-only | 2024-10 | Need complex queries, offline | MongoDB Atlas, PostgreSQL |
| Vanilla JS over React | 2024-09 | Faster initial load, no build step | React, Vue, Svelte |
| Tailwind over custom CSS | 2024-11 | Rapid prototyping, consistency | Bootstrap, Material-UI |
| Monolithic functions | 2024-12 | Simplicity, easy to refactor later | Microservices from start |

### External Dependencies

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| firebase-admin | 12.6.0 | Server SDK | Apache 2.0 |
| firebase-functions | 6.0.1 | Functions runtime | Apache 2.0 |
| nodemailer | 7.0.12 | Email delivery | MIT |
| tailwindcss | 3.x (CDN) | UI framework | MIT |
| quill | 1.3.7 | Rich text editor | BSD-3-Clause |

---

**Document Version**: 1.0
**Next Review**: 2025-04-01
**Maintainer**: Stephen Borish (sborish@malvernprep.org)
