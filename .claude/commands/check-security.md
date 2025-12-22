Perform a comprehensive security audit on the specified code:

1. **Authentication & Authorization**:
   - Verify all RPC functions check authentication (teacher email or student token)
   - Test token validation logic (HMAC signature, expiry, tampering resistance)
   - Check for authorization bypasses (e.g., student accessing teacher functions)
   - Verify multi-account handling (ADDITIONAL_TEACHERS)
   - Check for session fixation or hijacking vulnerabilities

2. **Input Validation**:
   - Identify all user inputs (form data, URL parameters, RPC arguments)
   - Check for missing validation (null checks, type checks, format validation)
   - Test for injection attacks (formula injection in Google Sheets, XSS in HTML)
   - Verify data sanitization before storage or display
   - Check array bounds and length limits

3. **Data Exposure**:
   - Check for PII leakage (student emails in logs, error messages, URLs)
   - Verify response data filtering (students shouldn't see other students' answers)
   - Check for token exposure (logs, error messages, client-side storage)
   - Verify Drive file permissions (images should be view-only)
   - Check for sensitive data in Script Properties or cache

4. **Proctoring Security**:
   - Verify violation detection cannot be bypassed client-side
   - Check lock state persistence (survives page reload, browser close)
   - Test version-based approval logic (prevents stale approvals)
   - Verify lock markers cannot be deleted by students
   - Check for race conditions in lock/unlock flow

5. **State Management**:
   - Verify state version increments are atomic
   - Check for race conditions in concurrent operations
   - Test state synchronization edge cases (network delays, out-of-order responses)
   - Verify state cannot be manipulated by clients

6. **Rate Limiting & DoS**:
   - Check for rate limiting on RPC endpoints
   - Verify resource quotas (Google Sheets size, email limits)
   - Test for infinite loops or unbounded operations
   - Check for memory exhaustion (large arrays, unclosed resources)

7. **Error Handling**:
   - Verify errors don't leak sensitive information (stack traces, database schema)
   - Check for proper exception handling (no unhandled rejections)
   - Test error scenarios don't leave system in inconsistent state

8. **Third-Party Dependencies**:
   - Review CDN-loaded libraries (Tailwind, Google Charts) for supply chain risks
   - Check for HTTPS usage (no mixed content warnings)
   - Verify external API calls are authenticated

For each security issue found, provide:
- Severity (Critical/High/Medium/Low) based on:
  - Critical: Direct student/teacher impersonation, data breach
  - High: Proctoring bypass, unauthorized data access
  - Medium: Information disclosure, DoS risk
  - Low: Missing validation, weak error messages
- Affected code (file and line numbers)
- Attack scenario (how could this be exploited?)
- Impact (what damage could be done?)
- Remediation (specific code changes to fix)
- Testing steps (how to verify the fix)

Focus especially on:
- Token generation/validation (src/Core_Utils.gs)
- Authentication (src/Main_Routing.gs)
- Proctoring (src/Veritas_Exam_Proctoring.gs)
- Student API (src/Student_API.gs)
- Data Access (src/Data_Access.gs)
