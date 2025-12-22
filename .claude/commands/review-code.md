Review the specified code file(s) for:

1. **Security Issues**:
   - Authentication/authorization vulnerabilities
   - Token validation weaknesses
   - Data exposure risks
   - Input sanitization gaps
   - Proctoring bypass opportunities

2. **Code Quality**:
   - Adherence to Google Apps Script best practices
   - Consistent naming conventions
   - Proper error handling
   - Code duplication
   - Complexity (cyclomatic complexity, deeply nested logic)

3. **Performance Concerns**:
   - Inefficient Google Sheets operations
   - N+1 query patterns
   - Missing caching opportunities
   - Excessive API calls
   - Memory leaks or inefficient data structures

4. **Bugs and Edge Cases**:
   - Null/undefined handling
   - Off-by-one errors
   - Race conditions
   - Version mismatch scenarios
   - Boundary conditions

5. **Documentation**:
   - Missing JSDoc comments
   - Unclear function purposes
   - Undocumented assumptions
   - Missing usage examples

Provide specific recommendations with:
- File name and line numbers
- Severity (Critical/High/Medium/Low)
- Explanation of the issue
- Suggested fix with code examples
- Impact on users if not fixed

Focus especially on authentication, proctoring, and state management code as these are security-critical.
