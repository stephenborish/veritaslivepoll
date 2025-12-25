# Secure Exam Module Documentation

## 1. Data Model & Schemas

The Secure Exam module introduces 5 new sheets to the Google Spreadsheet database.

### `QuestionBank`
Centralized repository for reusable questions.
*   **QuestionId**: Unique identifier (e.g., `Q_123ABC`).
*   **ClassId**: Optional. If blank, question is global/shared.
*   **UnitTag**, **TopicTag**: Filtering metadata.
*   **Difficulty**: `Easy`, `Medium`, `Hard`.
*   **QuestionType**: `MC` (Multiple Choice) or `SA` (Short Answer).
*   **StemHtml**: The question text/HTML.
*   **StemImageFileId**: Google Drive File ID for the question image.
*   **ChoiceA_Text`...`ChoiceD_Text**: Option text.
*   **ChoiceA_ImageFileId`...`ChoiceD_ImageFileId**: Option images.
*   **CorrectOption**: For MC (`A`, `B`, `C`, `D`).
*   **CorrectShortAnswer**: For SA. Exact match text for auto-grading.
*   **Points**: Numeric point value.
*   **Active**: `TRUE`/`FALSE`.
*   **TagsCsv**: Comma-separated tags.
*   **LastUpdated**: Timestamp.

### `Exams`
Defines a scheduled exam instance.
*   **ExamId**: Unique ID (e.g., `APBIO_Exam1_2025`).
*   **ClassId**: The class taking the exam.
*   **SourceType**:
    *   `Poll`: Questions sourced from an existing `Poll` definition.
    *   `QuestionBank`: Questions sourced from `QuestionBank` sheet.
*   **SourcePollId**: ID of the source poll (if SourceType=`Poll`).
*   **QuestionIdsCsv**: CSV of QuestionIds (if SourceType=`QuestionBank`).
*   **StartTime` / `EndTime**: Availability window.
*   **IsOpen**: Master switch for student access.
*   **DurationMinutes**: Time limit (enforced client-side and server-side).
*   **RandomizeOrder**: `TRUE` to shuffle questions per student.
*   **ProctorMode**:
    *   `soft`: Violations lock UI, student can self-resume.
    *   `hard`: Violations lock UI, teacher must unlock. Submission blocked if locked.
*   **ShowScoreToStudent**: `TRUE`/`FALSE`.

### `ExamStatus`
Tracks per-student exam state. Source of Truth for proctoring.
*   **ExamId**, **StudentId**.
*   **Locked**: `TRUE` if currently locked due to violation.
*   **ViolationCount**: Total number of violations.
*   **LastEvent**: `start`, `violation: reason`, `resume`, `unlock`, `submit`.
*   **LastEventTime**: Timestamp.
*   **TotalScore**: Final score after submission.

### `ExamResponses`
Stores individual question responses.
*   **ExamId**, **StudentId**, **QuestionId**.
*   **QuestionType**: `MC` or `SA`.
*   **ChosenOption**: `A`, `B`, `C`, `D` (for MC).
*   **ShortAnswerText**: Student's typed answer (for SA).
*   **CorrectOption` / `CorrectShortAnswer**: The key used for grading.
*   **IsCorrect**: `TRUE`/`FALSE`, or `null` if manual grading needed.
*   **PointsEarned**: Points awarded.

### `ExamAnalytics`
Aggregated statistics per question.
*   **ExamId**, **QuestionId**.
*   **NumResponses**, **NumCorrect**.
*   **PercentCorrect**, **AveragePointsEarned**.

## 2. Proctoring & Firebase Sidecar

The system uses **Firebase Realtime Database** as a "Sidecar" for instant state synchronization, while Google Sheets remains the authoritative log.

*   **Database Path**: `sessions/<examId>/students/<studentKey>`
    *   `studentKey` is a **sanitized identifier** (e.g., `sborish_malvernprep_org`), NOT a raw email.
*   **States**:
    *   `ACTIVE`: Normal state.
    *   `LOCKED`: Student is blocked (red screen).
    *   `DISCONNECTED`: Client lost connection.
    *   `FINISHED`: Exam submitted.

### Lock Behaviors

| Feature | Soft Lock (`proctorMode='soft'`) | Hard Lock (`proctorMode='hard'`) |
| :--- | :--- | :--- |
| **Trigger** | Tab switch, Window blur, Fullscreen exit | Same |
| **UI State** | Red Lock Screen | Red Lock Screen (No Resume Button) |
| **Firebase** | Set to `LOCKED` | Set to `LOCKED` |
| **Sheet Status** | `Locked=TRUE`, Log Violation | `Locked=TRUE`, Log Violation |
| **Recovery** | Student clicks "Return to Fullscreen" | **Teacher must click Unlock** in Dashboard |
| **Resume** | Client sets Firebase `ACTIVE`, logs `resume` | Server clears `Locked` flag on teacher action |
| **Submission**| Allowed | **Rejected** by server if currently Locked |

## 3. Grading Logic

### Multiple Choice (MC)
*   Auto-graded against `CorrectOption`.

### Short Answer (SA)
*   **Auto-Grading**: Performed **only** if `CorrectShortAnswer` is present in the definition.
    *   Logic: `StudentAnswer.trim().toLowerCase() === CorrectAnswer.trim().toLowerCase()`
*   **Manual Grading**: If `CorrectShortAnswer` is blank:
    *   `IsCorrect` is set to `null`.
    *   `PointsEarned` is set to `0`.
    *   Teachers can identify these via query: `QuestionType="SA" AND CorrectShortAnswer="" AND IsCorrect is null`.

## 4. User Interfaces

*   **Question Bank (`mode=questionBank`)**: Manage questions, filters, image uploads.
*   **Exam Manager (`mode=examManager`)**: Schedule exams, toggle open/close, monitor status.
*   **Student Exam (`mode=examStudent`)**: Fullscreen exam interface with timer and "Sidecar" connection.
*   **Teacher Dashboard (`mode=examTeacher`)**: Real-time grid of student status (Active/Locked/Finished) with remote controls.

## 5. Backward Compatibility

*   **Live Polls**: Completely unaffected. Do not use Firebase.
*   **Routing**: New modes handled explicitly; default falls back to Live Poll.
