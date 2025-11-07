Veritas Live Poll

Overview

Veritas Live Poll is a real-time, interactive polling application built on Google Apps Script. It's designed for a classroom environment, allowing a teacher (sborish@malvernprep.org) to control a live poll and students to participate from their devices using unique, secure links.

The system uses a Google Sheet as a database and Google Drive to host images, providing a robust, serverless solution.

Core Features

Teacher Dashboard: A central control panel to start, stop, pause, and advance poll questions.

Live Results: The teacher sees a real-time bar chart of incoming answers.

Student Status Grid: The teacher can monitor the status of every student in the roster (Waiting, Submitted, Locked).

Secure Student Access: Students use unique, token-based links that expire after 30 days. This avoids the need for students to have Google accounts.

Anti-Violation/Cheating: The student view locks if they navigate away, switch tabs, or exit fullscreen, requiring a manual unlock from the teacher.

Image Support: Both questions and answer choices can include images, which are uploaded to a dedicated Google Drive folder.

Data Storage: All poll data, rosters, and responses are stored neatly in a single Google Sheet.

Technical Workflow & Components

The app is comprised of server-side logic, two distinct HTML frontends, and a Google Sheet for data.

Code.gs (Backend): This file contains all server-side logic.

Routing (doGet): Serves the correct HTML view (TeacherView or StudentView) based on who is accessing the app (teacher or student with a token).

Data Access (DataAccess): A pattern to query the Google Sheet like a database.

Authentication (TokenManager): Generates, validates, and manages secure student tokens.

Teacher Functions: startPoll, nextQuestion, stopPoll, resumePoll, closePoll, getLivePollData.

Student Functions: getStudentPollStatus, submitStudentAnswer, logStudentViolation.

Drive Integration: uploadImageToDrive handles all image uploads.

Google Sheet (Database):

Rosters: Stores class lists (ClassName, StudentName, StudentEmail).

Polls: Stores all poll questions. Each row is one question, linked by a PollID.

LiveStatus: A 1-row sheet that acts as the "state manager" for the entire app, tracking the active poll, question, and sessionPhase metadata (PRE_LIVE, LIVE, PAUSED, ENDED).

Responses: A log of all student submissions, including violation locks.

TeacherView.html (Frontend): The teacher's control panel. It uses google.script.run to call functions in Code.gs.

StudentView.html (Frontend): The student's interface. It polls getStudentPollStatus every 2.5 seconds to check for new questions or status changes.

Styling.html (CSS): Contains all styles for both views, included via <?!= include('Styling.html'); ?>.

Teacher Workflow (Full)

One-Time Setup: The teacher must run the setupSheet() function once from the Apps Script editor to create the necessary sheets and headers in the Google Sheet.

Step 1: Create Roster: The teacher manually enters their class rosters into the Rosters sheet.

Step 2: Create a Poll:

The teacher opens the Web App URL. They are identified by their email (TEACHER_EMAIL) and see the Teacher Dashboard.

They click "Create New Poll."

In the modal, they enter a Poll Name and select the corresponding Class (from the Rosters sheet).

They add questions. For each question, they can add text, upload an image, and add multiple answer choices (each with optional text and an image).

They must select one radio button to mark the correct answer.

They click "Save Poll." This writes the poll data to the Polls sheet.

Step 3: Send Student Links:

From the main dashboard, the teacher selects the poll they just created.

They click the "Send Student Links" button.

The app calls sendPollLinkToClass(). This function:

Finds all students in the poll's class (from the Rosters sheet).

Generates a unique, secure token for each student using TokenManager.generateToken().

Emails this unique URL (.../exec?token=...) directly to each student.

Step 4: Start the Poll:

The teacher selects the poll from the dropdown.

(Optional) They enter a time (in seconds) into the "Timer" field.

They click "Start Poll."

This calls startPoll(), which sets the LiveStatus sheet to (PollID, 0, "OPEN") and marks the sessionPhase metadata as "LIVE" with a fresh startedAt timestamp.

Step 5: Conduct the Poll:

The "Live Dashboard" view appears. The teacher sees the first question, the live chart, and the student status grid.

Students can now answer. As responses come in, the chart and student grid update automatically (by polling getLivePollData).

PAUSED: If the timer runs out or the teacher clicks "Pause Poll," the LiveStatus is set to PAUSED and the sessionPhase becomes "PAUSED." Students can no longer submit answers and see a pause banner while the teacher can click "Resume Poll" to reopen it.

NEXT: The teacher clicks "Next Question." This calls nextQuestion(), which increments the question index in LiveStatus. Students who have answered will now see the new question.

LOCKED: If a student appears as "LOCKED" in the grid, the teacher can click the "Unlock" button on that student's tile. This calls unlockStudent(), which deletes their "VIOLATION_LOCKED" entry from the Responses sheet, allowing them to participate again.

Step 6: End the Poll:

When the last question is finished, the teacher clicks "End Poll" (or "Finish Poll").

This calls closePoll(), which clears the active poll row and records a sessionPhase of "ENDED" (with an endedAt timestamp) so every client recognizes the session as finished.

The poll is over for all participants.

Student Workflow (Full)

Step 1: Receive Link: The student receives an email with their unique, personalized poll link.

Step 2: Join Session:

The student clicks the link. doGet validates their token and serves the StudentView.html file.

They see the "Entry Screen" with the security warning.

Step 3: Begin Session:

The student clicks "Begin Session."

The app immediately requests fullscreen and attaches security listeners.

The app's main loop starts, polling getStudentPollStatus() every 2.5 seconds.

Step 4: Wait for Question:

getStudentPollStatus() returns { status: "PRE_LIVE", ... } until the teacher starts the poll.

The student sees the "Waiting for the poll to begin..." message.

Step 5: Answer Question:

The teacher starts the poll. getStudentPollStatus() now returns { status: "LIVE", ...questionData }.

The "Waiting" message disappears, and the question text, image, and answer buttons appear.

The student clicks an answer. This calls submitStudentAnswer() with their choice.

Step 6: Wait Again:

After submission, getStudentPollStatus() sees they have already answered (DataAccess.responses.hasAnswered(...)) and returns { status: "LIVE", message: "Your answer has been submitted...", hasSubmitted: true }.

The student sees this confirmation until the teacher clicks "Next Question," at which point the cycle repeats from Step 5.

Student Violation Workflow

Violation: The student switches tabs, exits fullscreen, or minimizes the window.

Lock: The browser's security listener fires and immediately calls logStudentViolation().

Server: logStudentViolation() adds a "VIOLATION_LOCKED" entry for that student in the Responses sheet.

Lockout: On the next 2.5-second poll, getStudentPollStatus() sees the locked status (DataAccess.responses.isLocked(...)) and returns { status: "LOCKED", message: "Your session was locked..." }.

Result: The student's screen is now permanently locked on this message. They cannot answer questions, even if they return to the tab.

Resolution: The student must get the teacher's attention. The teacher must find them in the "Student Status" grid and click "Unlock." This clears the lock, and the student's app will recover on its next poll.
