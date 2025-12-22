Guide me through deploying Veritas Live Poll to production:

1. **Pre-Deployment Checklist**:
   - Verify Core_Config.gs has correct TEACHER_EMAIL
   - Check all environment-specific settings
   - Review recent code changes for breaking changes
   - Run full test suite (Test_System.gs)
   - Review security audit results
   - Test proctoring flow end-to-end

2. **Database Setup**:
   - Run setupSheet() function to initialize/verify schema
   - Verify all 5 sheets exist (Classes, Rosters, Polls, LiveStatus, Responses)
   - Check sheet permissions (Script owner has edit access)
   - Validate sample data (create test class, poll, student)

3. **Apps Script Configuration**:
   - Check OAuth scopes in appsscript.json
   - Verify Script Properties (if ADDITIONAL_TEACHERS needed)
   - Review execution logs for errors
   - Clear old logs and cache if needed

4. **Deployment**:
   - Create new deployment version with descriptive message
   - Note deployment ID for rollback if needed
   - Copy web app URL
   - Test web app URL loads correctly

5. **Post-Deployment Testing**:
   - Teacher login test (verify email authentication)
   - Create test poll
   - Generate student token
   - Test student flow (fullscreen, answer submission, violations)
   - Test proctoring lock/unlock cycle
   - Verify real-time updates (teacher dashboard, student polling)
   - Test on target browsers (Chrome, Firefox, Safari)

6. **Rollout**:
   - Send test email with student link
   - Verify email delivery
   - Test with small group of students first
   - Monitor Apps Script execution logs during first session
   - Have rollback plan ready (previous deployment ID)

7. **Monitoring**:
   - Check Apps Script Executions tab for errors
   - Monitor quota usage (execution time, email sends)
   - Review proctoring violation logs
   - Gather teacher/student feedback

8. **Rollback Procedure** (if issues found):
   - Apps Script → Deploy → Manage deployments
   - Select previous working deployment
   - Click "Set as active deployment"
   - Verify rollback successful
   - Debug issues before re-deploying

Provide a deployment checklist with checkboxes and guide me through each step with verification commands or actions.
