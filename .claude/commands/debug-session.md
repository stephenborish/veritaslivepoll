Debug the current live session by analyzing system state:

1. **Session State**:
   - Retrieve SESSION_METADATA from Script Properties
   - Check LiveStatus sheet (active poll ID, question index, poll status)
   - Display current state version
   - Show session timestamps (start time, last update)
   - Identify session phase (PRE_LIVE, LIVE, PAUSED, ENDED)

2. **Student States**:
   - List all students in active poll's class
   - Show each student's:
     - Current answer status (submitted, waiting, locked)
     - Lock version (if locked)
     - Last activity timestamp
     - Proctoring state (NORMAL, LOCKED, AWAITING_FULLSCREEN)
   - Identify stuck students (no activity in >5 minutes)

3. **Data Consistency**:
   - Compare LiveStatus sheet vs SESSION_METADATA (should match)
   - Verify state version is incrementing (check version history)
   - Check for orphaned lock markers (VIOLATION_LOCKED rows without corresponding student)
   - Identify duplicate responses (same student, same question, multiple rows)

4. **Response Analysis**:
   - Count responses for current question
   - Show response distribution (A: 5, B: 12, C: 3, D: 10)
   - Identify students who haven't answered
   - Check for invalid answers (not A-F)

5. **Proctoring Issues**:
   - List all locked students with lock versions
   - Show pending approvals (AWAITING_FULLSCREEN state)
   - Identify students with multiple violations (version > 1)
   - Check for version mismatches (client version != server version)

6. **Performance Metrics**:
   - Show RPC call frequency (from execution logs)
   - Identify slow operations (>2 seconds)
   - Check cache hit rate (if logging enabled)
   - Show polling interval distribution

7. **Recommendations**:
   - Suggest fixes for identified issues
   - Recommend manual interventions if needed (e.g., delete orphaned lock marker)
   - Advise on whether to restart poll or continue

Provide output in a structured format:
```
=== SESSION DEBUG REPORT ===
Generated: [timestamp]

[Session State Section]
[Student States Section]
[Data Consistency Section]
[Response Analysis Section]
[Proctoring Issues Section]
[Performance Metrics Section]
[Recommendations Section]
```

Include specific code to run in Apps Script editor for manual fixes (e.g., "Run this to unlock student manually: ProctorAccess.forceUnlock('student@example.com')").
