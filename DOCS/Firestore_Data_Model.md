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

### `sessions/{sessionId}/students`
Sub-collection for student participation in a session.
- **Document ID**: `studentId` (Auth UID, often anonymous)
- **Fields**:
    - `name`: `string`
    - `status`: `string` (`'ACTIVE'`, `'LOCKED'`, `'FINISHED'`)
    - `answers`: `map`
        - `{questionId}`: `mixed` (Student's selected answer)
    - `joinedAt`: `timestamp`
