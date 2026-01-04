# Veritas Live Poll - Class Manager (Greenfield Rebuild)

## Overview

This is a **greenfield rebuild** of the Veritas Live Poll class management system using modern Firebase V9 SDK and Cloud Functions. The legacy Google Apps Script code in the `src/` folder has been replaced with a modern, scalable architecture.

## Architecture

- **Frontend**: Vanilla JavaScript with ES6 modules, Tailwind CSS
- **Backend**: Firebase Cloud Functions (Node.js 22)
- **Database**: Firestore (exclusively - NO Realtime Database)
- **Authentication**: Firebase Auth (Google Sign-In)

## Firestore Schema

### Collections

#### `/teachers/{uid}`
User profiles for teachers.

**Fields:**
- `uid` (string): Firebase Auth UID
- `email` (string): Teacher's email
- `displayName` (string): Teacher's display name
- `createdAt` (timestamp): Account creation timestamp
- `updatedAt` (timestamp): Last update timestamp

#### `/classes/{classId}`
Classes created by teachers.

**Fields:**
- `classId` (string): Unique class identifier
- `className` (string): Human-readable class name
- `teacherId` (string): Reference to teacher UID
- `createdAt` (timestamp): Class creation timestamp
- `updatedAt` (timestamp): Last update timestamp

#### `/classes/{classId}/students/{studentId}`
Students within a class (sub-collection).

**Fields:**
- `studentId` (string): Unique student identifier
- `name` (string): Student's full name
- `email` (string): Student's email (lowercase)
- `emailHash` (string): MD5 hash of email for secure lookups
- `createdAt` (timestamp): When student was added

#### `/polls/{pollId}`
Quiz/poll templates.

**Fields:**
- `pollId` (string): Unique poll identifier
- `pollName` (string): Poll name
- `teacherId` (string): Reference to teacher UID
- `sessionType` (string): 'LIVE_POLL' | 'SECURE_ASSESSMENT'
- `settings` (object): Poll configuration
- `metacognitionEnabled` (boolean): Enable confidence tracking
- `createdAt` (timestamp): Poll creation timestamp
- `updatedAt` (timestamp): Last update timestamp

#### `/sessions/{sessionId}`
Live instances of polls/exams.

**Fields:**
- `sessionId` (string): Unique session identifier
- `pollId` (string): Reference to poll
- `teacherId` (string): Reference to teacher UID
- `status` (string): 'WAITING' | 'ACTIVE' | 'PAUSED' | 'CLOSED'
- `accessCode` (string): 6-digit student join code
- `currentQuestionIndex` (number): Current question being displayed
- `createdAt` (timestamp): Session creation timestamp
- `lastUpdate` (timestamp): Last state update

## Cloud Functions

### `createClass`

Creates a new class for the authenticated teacher.

**Request:**
```javascript
{
  className: "AP Computer Science A - Period 1"
}
```

**Response:**
```javascript
{
  success: true,
  classId: "abc123...",
  message: "Class created successfully."
}
```

**Errors:**
- `unauthenticated`: User not signed in
- `invalid-argument`: Missing or empty className
- `already-exists`: Class name already exists for this teacher

### `bulkAddStudents`

Adds multiple students to a class using batch writes.

**Request:**
```javascript
{
  classId: "abc123...",
  students: [
    { name: "John Smith", email: "jsmith@example.com" },
    { name: "Jane Doe", email: "jdoe@example.com" }
  ]
}
```

**Response:**
```javascript
{
  success: true,
  addedCount: 2,
  skippedCount: 0,
  message: "Successfully added 2 student(s). Skipped 0 duplicate(s)."
}
```

**Features:**
- Automatic duplicate detection (by email)
- Batch writes (up to 500 students per request)
- Email hashing (MD5) for secure lookups
- Validates class ownership

**Errors:**
- `unauthenticated`: User not signed in
- `invalid-argument`: Missing classId or invalid students array
- `not-found`: Class not found
- `permission-denied`: User doesn't own the class

## Security Rules

The `firestore.rules` file implements comprehensive security:

- **Authentication Required**: All operations require Firebase Auth
- **Ownership Validation**: Teachers can only access their own resources
- **Collection-Level Isolation**: Classes/Polls/Students are isolated by teacher
- **Read/Write Separation**: Different permissions for read vs write operations

## Frontend UI

### `/public/teacher/index.html`

Modern, responsive Class Manager dashboard built with:
- **Tailwind CSS** for styling
- **Firebase V9 SDK** (modular imports)
- **Real-time Updates** using Firestore `onSnapshot`
- **Zero Dependencies** on legacy `src/` code

**Features:**
1. **Authentication**
   - Google Sign-In
   - Session persistence
   - Sign-out

2. **Class Management**
   - View all classes (real-time)
   - Create new classes
   - View class details

3. **Student Management**
   - View students in a class
   - Bulk add students (CSV format)
   - Automatic duplicate detection

**CSV Format for Adding Students:**
```
John Smith, jsmith@example.com
Jane Doe, jdoe@example.com
Bob Johnson, bjohnson@example.com
```

## TypeScript Types

Type definitions are available in `/functions/types.ts` for use in Cloud Functions development.

## Deployment

### Prerequisites
- Node.js 22+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project with Firestore enabled

### Deploy Cloud Functions
```bash
cd functions
npm install
npm run deploy
```

### Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### Deploy Hosting
```bash
firebase deploy --only hosting
```

## Testing

### Local Development
```bash
# Start Firebase emulators
firebase emulators:start

# The Class Manager UI will be available at:
# http://localhost:5000/teacher/index.html
```

### Manual Testing Checklist

1. **Authentication**
   - [ ] Sign in with Google works
   - [ ] User info displays correctly
   - [ ] Sign out works

2. **Class Creation**
   - [ ] Can create a class with valid name
   - [ ] Duplicate class names are rejected
   - [ ] Empty class name is rejected
   - [ ] Class appears in real-time list

3. **Student Management**
   - [ ] Can view empty class (shows placeholder)
   - [ ] Can add students via CSV
   - [ ] Duplicate students are skipped
   - [ ] Invalid entries are skipped
   - [ ] Student list updates in real-time

## Migration from Legacy Code

### What Changed

**REMOVED:**
- All `src/` Google Apps Script code
- `google.script.run` API calls
- Realtime Database usage
- Legacy roster management

**ADDED:**
- Firestore-first architecture
- Modern Firebase V9 SDK
- Cloud Functions for server logic
- Real-time UI updates
- Comprehensive security rules

### Data Migration

If migrating from the old system:

1. Export existing rosters from Realtime DB
2. Transform to Firestore schema
3. Use `bulkAddStudents` function to import

Example migration script:
```javascript
// Pseudo-code for migration
const oldRosters = await realtimeDB.ref('rosters').once('value');
for (const [className, students] of Object.entries(oldRosters.val())) {
  const classResult = await createClass({ className });
  await bulkAddStudents({
    classId: classResult.classId,
    students: students.map(s => ({ name: s.name, email: s.email }))
  });
}
```

## Known Limitations

1. **Batch Write Limit**: Maximum 500 students per `bulkAddStudents` call
2. **No Class Deletion**: UI doesn't currently support class deletion (add if needed)
3. **No Student Editing**: Students can't be edited after creation (add if needed)
4. **No Import/Export**: No CSV export feature yet (add if needed)

## Future Enhancements

- [ ] Class deletion with confirmation
- [ ] Edit student information
- [ ] Export class roster to CSV
- [ ] Search/filter students
- [ ] Bulk student deletion
- [ ] Class archiving
- [ ] Student import from Google Classroom API

## Support

For issues or questions, refer to the Firebase documentation:
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)

---

**Last Updated:** January 4, 2026
**Version:** 1.0.0 (Greenfield)
