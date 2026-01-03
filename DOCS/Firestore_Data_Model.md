# Firestore Data Model - Veritas Live Poll

## Collections

### `teachers`
Root collection for teacher profiles.
- **Document ID**: `teacherId` (Auth UID)
- **Fields**:
    - `email`: `string`
    - `createdAt`: `timestamp`

### `exams`
Root collection for exam templates.
- **Document ID**: `examId` (Auto-generated)
- **Fields**:
    - `teacherId`: `string` (Owner UID)
    - `title`: `string`
    - `questions`: `array`
        - `id`: `string`
        - `text`: `string`
        - `options`: `array`
        - `correctAnswer`: `number/string`
    - `settings`: `map`
        - `timer`: `number`
        - `shuffle`: `boolean`

### `sessions`
Root collection for live exam instances.
- **Document ID**: `sessionId` (Auto-generated)
- **Fields**:
    - `examId`: `string` (Reference to `exams`)
    - `teacherId`: `string` (Reference to `teachers`)
    - `accessCode`: `string` (6-digit unique code)
    - `status`: `string` (`'WAITING'`, `'LIVE'`, `'CLOSED'`)
    - `createdAt`: `timestamp`

### `polls`
Root collection for poll templates and settings.
- **Document ID**: `pollId` (Auto-generated or provided)
- **Fields**:
    - `teacherId`: `string` (Owner UID)
    - `sessionType`: `string` (`'LIVE_POLL'`, `'SECURE_ASSESSMENT'`)
    - `settings`: `map`
        - `timeLimitMinutes`: `number`
        - `accessCode`: `string`
        - `calculatorEnabled`: `boolean`
        - `proctorMode`: `string` (`'soft'`, `'hard'`)
    - `metacognitionEnabled`: `boolean`
    - `createdAt`: `timestamp`
    - `updatedAt`: `timestamp`

### `polls/{pollId}/questions`
Sub-collection for questions within a poll.
- **Document ID**: `questionId` (Auto-generated or provided)
- **Fields**:
    - `stemHtml`: `string`
    - `options`: `array` of `objects`
        - `text`: `string`
        - `imageUrl`: `string`
    - `correctAnswer`: `mixed`
    - `points`: `number`
    - `order`: `number`

### `classes`
Root collection for class rosters.
- **Document ID**: `classId` (Auto-generated)
- **Fields**:
    - `teacherId`: `string` (Owner UID)
    - `className`: `string`
    - `studentCount`: `number`
    - `updatedAt`: `timestamp`

### `classes/{classId}/students`
Sub-collection for student profiles within a class.
- **Document ID**: `studentEmail` (Sanitized email)
- **Fields**:
    - `email`: `string`
    - `firstName`: `string`
    - `lastName`: `string`
    - `lastActive`: `timestamp`
    - `updatedAt`: `timestamp`
