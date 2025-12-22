Explain the Veritas Live Poll system architecture with focus on:

1. **Overall System Design**:
   - High-level component diagram
   - Data flow between components
   - Client-server interaction patterns
   - Polling vs push mechanisms

2. **Agent Architecture**:
   - List all agents and their responsibilities
   - Dependencies between agents
   - Communication patterns (RPC, polling, event sourcing)
   - Layered architecture (Foundation → Data → Model → API → Routing)

3. **Key Subsystems**:
   - **Authentication System**: Teacher (email-based) vs Student (token-based)
   - **Proctoring System**: Violation detection, lock state, version-based approvals
   - **State Management**: Session state, state versioning, synchronization
   - **Data Persistence**: Google Sheets schema, Script Properties, marker-based state

4. **Critical Flows**:
   - Teacher starts poll → students see question
   - Student submits answer → teacher sees response
   - Student violates proctoring → lock → teacher approves → unlock
   - State version change → client detects staleness → resync

5. **Technical Decisions**:
   - Why Google Apps Script (serverless, integrated with Sheets)
   - Why polling instead of WebSockets (Apps Script limitation)
   - Why version-based sync (detect stale client state)
   - Why marker-based locks (persistent across reloads)

Use diagrams where helpful and reference specific files/functions from the codebase.
