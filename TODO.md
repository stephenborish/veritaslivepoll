# Veritas Live Poll - Project Roadmap & TODO

**Last Updated**: 2025-11-10
**Status**: ✅ Production-Ready
**Current Version**: v2.0 (Modernization Complete)

---

## Table of Contents

- [Completed Milestones](#completed-milestones)
- [Current Status](#current-status)
- [Future Enhancements](#future-enhancements)
- [Known Issues & Tech Debt](#known-issues--tech-debt)
- [Maintenance Tasks](#maintenance-tasks)
- [Long-Term Vision](#long-term-vision)

---

## Completed Milestones

### ✅ Phase 1: Core Functionality (2024 Q3-Q4)
- [x] Token-based student authentication system
- [x] Teacher dashboard with poll creation
- [x] Student interface with real-time polling
- [x] Google Sheets database integration
- [x] Basic proctoring (fullscreen enforcement)
- [x] Image upload and hosting via Google Drive
- [x] Email distribution of student links
- [x] Real-time bar chart visualization

### ✅ Phase 2: Enhanced Proctoring (2024 Q4 - 2025 Q1)
- [x] Multi-layer violation detection (fullscreen, tab switch, window blur)
- [x] Version-based unlock approvals (prevents stale approvals)
- [x] Lock state persistence across page reloads
- [x] Teacher approval workflow with visual indicators
- [x] Student unlock flow with fullscreen resume
- [x] Proctoring telemetry and logging
- [x] Comprehensive QA test suite (PROCTOR_QA_CHECKLIST.md)

### ✅ Phase 3: Modernization (2025 Q1 - Q2)
- [x] UI overhaul with Tailwind CSS and Veritas Navy & Gold branding
- [x] AP-style typography (Noto Serif for questions, Inter for UI)
- [x] State version management for sync reliability
- [x] Connection health monitoring with adaptive polling
- [x] Exponential backoff for network resilience
- [x] Timer replacement with 90s default and pause/resume controls
- [x] Student status grid with color-coded tiles
- [x] Live response breakdown with student names
- [x] Question reset functionality (clear or keep responses)
- [x] Post-submission confirmation state (no flicker)
- [x] Improved teacher multi-account authentication

### ✅ Phase 4: Documentation & Quality (2025 Q3)
- [x] Comprehensive README with quick start guide
- [x] Architecture documentation
- [x] Deployment guide
- [x] Troubleshooting guide with debug tools
- [x] Proctoring QA checklist
- [x] Code comments and JSDoc annotations
- [x] Browser compatibility testing
- [x] Production deployment validation

---

## Current Status

### Production Readiness: ✅ READY

**System Health**:
- ✅ Core polling functionality stable
- ✅ Proctoring system reliable with version tracking
- ✅ UI responsive and accessible
- ✅ Network resilience tested (connection drops handled gracefully)
- ✅ Multi-browser compatibility verified (Chrome, Firefox, Safari)
- ✅ Documentation complete and up-to-date

**Known Limitations**:
- ⚠️ Mobile support limited (fullscreen API constraints)
- ⚠️ Safari iOS requires user gesture for fullscreen
- ⚠️ Email quota limits (100/day for free Google accounts)

---

## Future Enhancements

### High Priority (Next 3-6 Months)

#### 1. Analytics Dashboard
**Status**: 📋 Planned
**Effort**: Medium (2-3 weeks)
**Description**: Post-session analytics with:
- Per-student performance reports
- Question difficulty analysis (% correct, time-to-answer)
- Misconception identification (wrong answer clustering)
- Point-biserial correlation for item discrimination
- CSV export for external analysis

**Technical Approach**:
- New Analytics sheet in database
- New AnalyticsView.html UI
- Aggregation functions in Code.gs
- Chart.js integration for advanced visualizations

#### 2. Poll Templates & Question Bank
**Status**: 📋 Planned
**Effort**: Medium (2-3 weeks)
**Description**:
- Save polls as reusable templates
- Question bank with tagging system (topic, difficulty, standard alignment)
- Quick poll assembly from question bank
- Import/export polls as JSON

**Technical Approach**:
- New Templates sheet in database
- New QuestionBank sheet with tags column
- Template management UI in TeacherView
- JSON serialization for portability

#### 3. Multiple Choice Types
**Status**: 📋 Planned
**Effort**: Small-Medium (1-2 weeks)
**Description**:
- Multi-select (choose all that apply)
- True/False (optimized UI)
- Ranking/ordering questions
- Partial credit for multi-select

**Technical Approach**:
- Add `questionType` field to poll data
- Conditional rendering in StudentView
- Updated grading logic for partial credit
- New validation rules

#### 4. Live Class Mode Enhancements
**Status**: 📋 Planned
**Effort**: Small (1 week)
**Description**:
- Display correct answer after question closes
- Show class-wide statistics during session
- Anonymous participation mode (no student names)
- Pace indicator (% of class submitted)

**Technical Approach**:
- New metadata fields in LiveStatus
- Conditional rendering based on teacher settings
- Aggregation in getLivePollData
- UI toggle in TeacherView

---

### Medium Priority (6-12 Months)

#### 5. Advanced Proctoring Features
**Status**: 💡 Idea Stage
**Effort**: Large (4-6 weeks)
**Description**:
- Webcam snapshot on violation (privacy concerns, needs careful design)
- Audio monitoring (detect speaking/external assistance)
- Screen recording option (for dispute resolution)
- Lockdown browser integration

**Considerations**:
- Privacy regulations (FERPA, COPPA, GDPR)
- Parental consent requirements
- Storage costs for media
- Ethical implications

**Decision**: Defer until explicit user demand

#### 6. Integration with LMS
**Status**: 💡 Idea Stage
**Effort**: Large (6-8 weeks)
**Description**:
- LTI integration for Canvas, Blackboard, Moodle
- Grade passback to LMS gradebook
- SSO via LMS authentication
- Assignment syncing

**Technical Approach**:
- Implement LTI 1.3 standard
- OAuth 2.0 for grade passback
- Roster import from LMS
- New middleware layer in Code.gs

#### 7. Collaborative Polls
**Status**: 💡 Idea Stage
**Effort**: Medium (3-4 weeks)
**Description**:
- Team-based polls (groups of students)
- Peer voting on responses
- Discussion mode (students see others' answers)
- Breakout rooms

**Technical Approach**:
- New Groups sheet for team assignments
- Peer response tracking
- WebSockets or long-polling for discussion mode
- UI for group formation

#### 8. Mobile App (Native)
**Status**: 💡 Idea Stage
**Effort**: Very Large (12+ weeks)
**Description**:
- Native iOS/Android apps
- Better fullscreen enforcement on mobile
- Push notifications for poll start
- Offline mode (sync when reconnected)

**Technical Approach**:
- React Native or Flutter
- Apps Script REST API
- Local SQLite database for offline
- Platform-specific proctoring APIs

**Blocker**: Requires significant resources, low ROI given current user base

---

### Low Priority (12+ Months / Nice-to-Have)

#### 9. AI-Powered Features
- Auto-generate questions from lecture notes (GPT integration)
- Misconception detection with explanations
- Adaptive difficulty (adjust question difficulty based on performance)
- Automatic feedback generation

#### 10. Accessibility Enhancements
- Screen reader optimization (WCAG 2.1 AA compliance)
- High contrast mode
- Keyboard-only navigation
- Text-to-speech for questions
- Dyslexia-friendly fonts

#### 11. Internationalization (i18n)
- Multi-language UI support
- RTL language support (Arabic, Hebrew)
- Localized date/time formats
- Translation management system

#### 12. Advanced Media Support
- Audio questions (listening comprehension)
- Video questions
- Interactive diagrams (clickable images)
- LaTeX/MathJax for mathematical notation
- Chemistry notation (ChemDraw integration)

---

## Known Issues & Tech Debt

### Minor Bugs (Non-Blocking)

#### Issue 1: Safari Fullscreen Detection Delay
**Severity**: Low
**Impact**: 1-2 second delay before violation detected
**Workaround**: Works as designed, Safari API limitation
**Fix Effort**: Small (1-2 days)
**Proposed Fix**: Combine fullscreenchange + focus/blur events for faster detection

#### Issue 2: Email Links Line-Wrap in Some Clients
**Severity**: Low
**Impact**: Tokens break across lines in Outlook
**Workaround**: Manually copy/paste full URL
**Fix Effort**: Small (1 day)
**Proposed Fix**: Use URL shortener or QR codes

#### Issue 3: Chart Flash on Question Change
**Severity**: Very Low
**Impact**: Brief flicker when teacher advances question
**Workaround**: None needed (cosmetic only)
**Fix Effort**: Small (1 day)
**Proposed Fix**: CSS transition for chart redraw

---

### Technical Debt

#### Debt 1: No Automated Testing
**Current State**: Manual testing via PROCTOR_QA_CHECKLIST.md
**Risk**: Regressions undetected until production
**Proposed Solution**:
- Implement Apps Script unit tests
- Selenium/Playwright for UI testing
- CI/CD pipeline with GitHub Actions

**Effort**: Medium (2-3 weeks)
**Priority**: Medium

#### Debt 2: Monolithic Code.gs File
**Current State**: Single 4,537-line file
**Risk**: Difficult to maintain, merge conflicts
**Proposed Solution**:
- Split into modules: Auth.gs, DataAccess.gs, Proctoring.gs, etc.
- Use clasp with local development
- Maintain single-file version for legacy compatibility

**Effort**: Small-Medium (1 week)
**Priority**: Low (works well currently)

#### Debt 3: Hard-Coded Configuration
**Current State**: Constants in Code.gs, must redeploy to change
**Risk**: Requires technical knowledge to configure
**Proposed Solution**:
- Admin settings UI in TeacherView
- Store config in Script Properties
- Hot-reload without redeployment

**Effort**: Small (1 week)
**Priority**: Low

#### Debt 4: Limited Error Handling in Frontend
**Current State**: Generic "An error occurred" messages
**Risk**: Users can't self-diagnose issues
**Proposed Solution**:
- Specific error messages for common failures
- Error codes for support tickets
- Client-side retry logic with exponential backoff
- User-friendly error UI with suggested actions

**Effort**: Medium (2 weeks)
**Priority**: Medium

---

## Maintenance Tasks

### Quarterly Tasks (Every 3 Months)

- [ ] **Dependency Updates**
  - Check for Tailwind CSS updates
  - Verify Google Charts API compatibility
  - Test new browser versions (Chrome, Firefox, Safari)

- [ ] **Performance Audit**
  - Review Apps Script execution logs for slow functions
  - Analyze cache hit rates
  - Check database sheet sizes (archive old polls if needed)

- [ ] **Security Review**
  - Audit OAuth scopes (remove unused)
  - Review token expiry settings
  - Check for new Apps Script security best practices
  - Update rate limiting thresholds if needed

- [ ] **Documentation Updates**
  - Verify all screenshots and examples current
  - Update browser compatibility matrix
  - Check for broken links
  - Revise troubleshooting guide with new issues

### Annual Tasks (Once Per Year)

- [ ] **Comprehensive Testing**
  - Full regression test suite
  - Load testing with 50+ concurrent students
  - Multi-browser compatibility verification
  - Proctoring flow validation on all browsers

- [ ] **User Feedback Review**
  - Survey teachers for feature requests
  - Prioritize future enhancements
  - Identify pain points
  - Measure satisfaction metrics

- [ ] **Code Cleanup**
  - Remove deprecated functions
  - Refactor complex functions
  - Update code comments
  - Archive unused features

- [ ] **Backup & Disaster Recovery**
  - Verify backup procedures work
  - Test restoration from backup
  - Document recovery steps
  - Update contingency plans

---

## Long-Term Vision

### 3-Year Goals

**Mission**: Become the de facto live polling solution for secondary education with comprehensive academic integrity features.

**Key Results**:
1. **Adoption**: 100+ schools using the system
2. **Reliability**: 99.9% uptime for live sessions
3. **Features**: Full analytics suite, LMS integration, question bank
4. **Compliance**: FERPA, COPPA, WCAG 2.1 AA certified
5. **Community**: Open-source contributors, plugin ecosystem

### Technical Architecture Evolution

**Current**: Monolithic Google Apps Script app
**Future**: Microservices with Apps Script core

```
┌─────────────────────────────────────────────────┐
│         Frontend (Progressive Web App)         │
│  React/Vue.js with offline support & caching   │
└────────────┬────────────────────────────────────┘
             │
┌────────────┴────────────────────────────────────┐
│          API Gateway (Apps Script)              │
│  Authentication, Rate Limiting, Routing         │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┬──────────┬──────────┐
      │             │          │          │
┌─────▼────┐  ┌────▼────┐ ┌───▼────┐ ┌──▼───────┐
│ Polling  │  │Analytics│ │Proctor │ │ Question │
│ Service  │  │ Service │ │Service │ │  Bank    │
└──────────┘  └─────────┘ └────────┘ └──────────┘
      │             │          │          │
      └──────┬──────┴──────────┴──────────┘
             │
┌────────────┴────────────────────────────────────┐
│       Data Layer (Sheets + Firestore)           │
│  Hot data: Firestore, Archive: Sheets/BigQuery │
└─────────────────────────────────────────────────┘
```

**Migration Path**: Gradual (service-by-service extraction)

---

## Contributing to This Roadmap

### How to Suggest Features

1. **Open GitHub Issue** with template:
   ```markdown
   ## Feature Request: [Name]

   **Problem**: What problem does this solve?
   **Proposed Solution**: How should it work?
   **Users Affected**: Who benefits?
   **Priority**: High/Medium/Low (your opinion)
   **Alternatives Considered**: Other approaches?
   ```

2. **Include**:
   - User stories ("As a teacher, I want to...")
   - Mockups/sketches (if UI change)
   - Technical considerations
   - Estimated complexity (if known)

3. **Discussion**:
   - Community feedback via GitHub comments
   - Maintainer triage (accepted/declined/needs-more-info)
   - Priority assignment

### Decision Criteria

Features are evaluated on:
- **User Value**: Does this solve a real problem?
- **Effort**: How much time to implement?
- **Maintenance**: Ongoing support burden?
- **Alignment**: Fits project mission?
- **Feasibility**: Technically possible with current stack?

---

## Changelog

### v2.0 - Modernization Release (2025-11-10)
- ✅ Complete UI overhaul with Tailwind CSS
- ✅ State version management for sync
- ✅ Connection health monitoring
- ✅ Comprehensive documentation suite
- ✅ Enhanced proctoring with version tracking
- ✅ Timer controls (pause/resume/reset)
- ✅ Question reset functionality
- ✅ Improved multi-account teacher auth

### v1.5 - Proctoring Enhancement (2024-12-15)
- ✅ Version-based unlock approvals
- ✅ Lock state persistence
- ✅ Proctoring telemetry
- ✅ QA test suite

### v1.0 - Initial Release (2024-09-01)
- ✅ Core polling functionality
- ✅ Token-based student auth
- ✅ Teacher dashboard
- ✅ Basic proctoring
- ✅ Image support

---

**Questions?** Open an issue or email sborish@malvernprep.org
