# Veritas Live Poll - Project Roadmap & TODO

**Last Updated**: 2025-12-25
**Status**: ✅ Production-Ready
**Current Version**: v2.1 (Documentation & Architecture Audit Complete)

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
- [x] Comprehensive QA test suite

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

### ✅ Phase 4: Exam System & Question Bank (2025 Q2-Q3)
- [x] Question bank with tagging system
- [x] Exam manager interface
- [x] Exam student proctored interface
- [x] Write-behind cache for exam responses
- [x] Time-based trigger for answer flush (CRITICAL)
- [x] Exam analytics and scoring

### ✅ Phase 5: Documentation & Architecture Audit (2025 Q4)
- [x] Complete README rewrite with hybrid architecture documentation
- [x] Firebase + Sheets "Write-Behind" pattern explained
- [x] Comprehensive code audit (traced all 43 files from entry points)
- [x] Confirmed zero orphaned/dead files
- [x] Documentation reorganization (docs/ and docs/archive/ structure)
- [x] Updated installation guide with Firebase Script Properties setup
- [x] Security documentation (auth, proctoring, lock versioning)
- [x] Complete usage guides for teachers and students
- [x] Troubleshooting section with debug tools

---

## Current Status

### Production Readiness: ✅ STABLE

**System Health**:
- ✅ Core polling functionality stable
- ✅ Proctoring system reliable with version tracking
- ✅ Exam system operational with write-behind cache
- ✅ Firebase RTDB integrated for real-time lock status
- ✅ UI responsive and accessible
- ✅ Network resilience tested (connection drops handled gracefully)
- ✅ Multi-browser compatibility verified (Chrome, Firefox, Safari)
- ✅ Documentation comprehensive and current (as of Dec 25, 2025)

**Known Limitations**:
- ⚠️ Mobile support limited (fullscreen API constraints)
- ⚠️ Safari iOS requires user gesture for fullscreen
- ⚠️ Email quota limits (100/day for free Google accounts, 1500/day for Workspace)
- ⚠️ Firebase config must be manually set in Script Properties (intentional security practice)

---

## Future Enhancements

### High Priority (Next 3-6 Months)

#### 1. Enhanced Analytics Dashboard
**Status**: 📋 Planned
**Effort**: Medium (2-3 weeks)
**Description**: Post-session analytics with:
- Per-student performance reports
- Question difficulty analysis (% correct, time-to-answer)
- Misconception identification (wrong answer clustering)
- Point-biserial correlation for item discrimination
- CSV export for external analysis
- Historical trend tracking

**Technical Approach**:
- Extend Model_Analytics.gs with new metrics
- Add analytics tab to Teacher_View.html
- Integrate Chart.js for advanced visualizations
- Use existing Responses sheet data

#### 2. Poll Templates & Enhanced Question Bank
**Status**: 📋 Planned
**Effort**: Medium (2-3 weeks)
**Description**:
- Save polls as reusable templates
- Advanced question bank filtering (topic, difficulty, standard alignment)
- Quick poll assembly from question bank
- Import/export polls as JSON
- Question versioning and history

**Technical Approach**:
- Add Templates sheet to database
- Enhanced QuestionBankView.html UI
- JSON serialization/deserialization
- Template management API

#### 3. Multiple Choice Type Extensions
**Status**: 📋 Planned
**Effort**: Small-Medium (1-2 weeks)
**Description**:
- Multi-select (choose all that apply)
- True/False (optimized UI)
- Ranking/ordering questions
- Partial credit for multi-select

**Technical Approach**:
- Extend questionType field in poll data
- Conditional rendering in Student_View.html
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
- Answer distribution pie chart

**Technical Approach**:
- New metadata fields in LiveStatus sheet
- Conditional rendering based on teacher settings
- Aggregation in getLivePollData()
- UI toggle in Teacher_View.html

---

### Medium Priority (6-12 Months)

#### 5. LMS Integration (Canvas/Blackboard/Moodle)
**Status**: 💡 Idea Stage
**Effort**: Large (6-8 weeks)
**Description**:
- LTI 1.3 integration
- Grade passback to LMS gradebook
- SSO via LMS authentication
- Roster import from LMS
- Assignment syncing

**Technical Approach**:
- Implement LTI 1.3 standard
- OAuth 2.0 for grade passback
- New middleware layer in routing
- Roster sync with DataAccess layer

**Blocker**: Requires institutional buy-in, LMS admin access

#### 6. Advanced Proctoring Features
**Status**: 💡 Idea Stage (Privacy Concerns)
**Effort**: Large (4-6 weeks)
**Description**:
- Webcam snapshot on violation (requires consent)
- Audio monitoring (detect speaking/external assistance)
- Screen recording option (for dispute resolution)
- Lockdown browser integration

**Considerations**:
- Privacy regulations (FERPA, COPPA, GDPR)
- Parental consent requirements
- Storage costs for media
- Ethical implications

**Decision**: Defer until explicit user demand and legal review

#### 7. Collaborative/Discussion Polls
**Status**: 💡 Idea Stage
**Effort**: Medium (3-4 weeks)
**Description**:
- Team-based polls (groups of students)
- Peer voting on responses
- Discussion mode (students see others' answers after submission)
- Breakout rooms

**Technical Approach**:
- New Groups sheet for team assignments
- Peer response tracking in Responses sheet
- Real-time discussion sync via Firebase
- UI for group formation

---

### Low Priority (12+ Months / Nice-to-Have)

#### 8. AI-Powered Features
- Auto-generate questions from lecture notes (GPT integration)
- Misconception detection with AI explanations
- Adaptive difficulty (adjust based on student performance)
- Automatic feedback generation

#### 9. Accessibility Enhancements (WCAG 2.1 AA)
- Screen reader optimization
- High contrast mode
- Keyboard-only navigation
- Text-to-speech for questions
- Dyslexia-friendly fonts (OpenDyslexic)

#### 10. Internationalization (i18n)
- Multi-language UI support
- RTL language support (Arabic, Hebrew)
- Localized date/time formats
- Translation management system

#### 11. Advanced Media Support
- Audio questions (listening comprehension)
- Video questions (embedded YouTube/Vimeo)
- Interactive diagrams (clickable images)
- LaTeX/MathJax for mathematical notation
- Chemistry notation (ChemDraw integration)

#### 12. Native Mobile Apps
**Status**: 💡 Idea Stage
**Effort**: Very Large (12+ weeks)
**Description**:
- Native iOS/Android apps
- Better fullscreen enforcement on mobile
- Push notifications for poll start
- Offline mode (sync when reconnected)

**Blocker**: Requires significant resources, low ROI given current web app works well

---

## Known Issues & Tech Debt

### Minor Bugs (Non-Blocking)

#### Issue 1: Safari Fullscreen Detection Delay
**Severity**: Low
**Impact**: 1-2 second delay before violation detected on Safari (macOS)
**Workaround**: Works as designed, Safari API limitation
**Fix Effort**: Small (1-2 days)
**Proposed Fix**: Combine fullscreenchange + focus/blur events for faster detection
**Priority**: Low

#### Issue 2: Email Links Line-Wrap in Some Clients
**Severity**: Low
**Impact**: Tokens break across lines in Outlook, requiring manual copy/paste
**Workaround**: Manually copy/paste full URL
**Fix Effort**: Small (1 day)
**Proposed Fix**: Use URL shortener (bit.ly API) or QR codes
**Priority**: Low

#### Issue 3: Chart Flash on Question Change
**Severity**: Very Low
**Impact**: Brief flicker when teacher advances question
**Workaround**: None needed (cosmetic only)
**Fix Effort**: Small (1 day)
**Proposed Fix**: CSS transition for chart redraw
**Priority**: Very Low

---

### Technical Debt

#### Debt 1: No Automated Testing
**Current State**: Manual testing via checklists and smoke tests
**Risk**: Regressions undetected until production
**Proposed Solution**:
- Implement Apps Script unit tests (GasTap framework)
- Selenium/Playwright for UI testing
- CI/CD pipeline with GitHub Actions
- Automated regression testing before deploy

**Effort**: Medium (2-3 weeks)
**Priority**: Medium
**Impact**: High (prevents production bugs)

#### Debt 2: Limited Error Handling in Frontend
**Current State**: Generic "An error occurred" messages
**Risk**: Users can't self-diagnose issues
**Proposed Solution**:
- Specific error messages for common failures
- Error codes for support tickets
- Client-side retry logic with exponential backoff
- User-friendly error UI with suggested actions

**Effort**: Medium (2 weeks)
**Priority**: Medium
**Impact**: Medium (improves user experience)

#### Debt 3: Hard-Coded Configuration in Core_Config.gs
**Current State**: Configuration constants in code, requires code change + redeploy
**Risk**: Requires technical knowledge to configure
**Proposed Solution**:
- Admin settings UI in Teacher_View.html
- Store all config in Script Properties (not code)
- Hot-reload without redeployment
- Validation for config changes

**Effort**: Small (1 week)
**Priority**: Low
**Impact**: Low (current system works, but less flexible)

---

## Maintenance Tasks

### Quarterly Tasks (Every 3 Months)

- [ ] **Dependency Updates**
  - Check for Tailwind CSS updates
  - Verify Google Charts API compatibility
  - Test new browser versions (Chrome, Firefox, Safari)
  - Update Firebase SDK if new version available

- [ ] **Performance Audit**
  - Review Apps Script execution logs for slow functions
  - Analyze cache hit rates
  - Check database sheet sizes (archive old polls if >10,000 rows)
  - Verify write-behind trigger is running (check execution logs)

- [ ] **Security Review**
  - Audit OAuth scopes (remove unused)
  - Review token expiry settings (30 days appropriate?)
  - Check for new Apps Script security best practices
  - Update rate limiting thresholds if needed
  - Rotate Firebase database secret if compromised

- [ ] **Documentation Updates**
  - Verify all screenshots and examples current
  - Update browser compatibility matrix
  - Check for broken links in README and docs/
  - Revise docs/TROUBLESHOOTING.md with new issues

### Annual Tasks (Once Per Year)

- [ ] **Comprehensive Testing**
  - Full regression test suite
  - Load testing with 50+ concurrent students
  - Multi-browser compatibility verification
  - Proctoring flow validation on all browsers
  - Firebase connection stress test

- [ ] **User Feedback Review**
  - Survey teachers for feature requests
  - Prioritize future enhancements based on demand
  - Identify pain points and usability issues
  - Measure satisfaction metrics (NPS score)

- [ ] **Code Cleanup**
  - Remove deprecated functions (check for legacy wrappers)
  - Refactor complex functions (>100 lines)
  - Update code comments and JSDoc
  - Archive unused features to docs/archive/

- [ ] **Backup & Disaster Recovery**
  - Verify backup procedures work (test Google Takeout export)
  - Test restoration from backup
  - Document recovery steps (add to docs/TROUBLESHOOTING.md)
  - Update contingency plans

---

## Long-Term Vision (3-Year Goals)

### Mission
Become the de facto live polling solution for secondary education with comprehensive academic integrity features and seamless LMS integration.

### Key Results

1. **Adoption**: 100+ schools using the system actively
2. **Reliability**: 99.9% uptime for live sessions
3. **Features**: Full analytics suite, LMS integration, question bank with 1000+ questions
4. **Compliance**: FERPA, COPPA, WCAG 2.1 AA certified
5. **Community**: Open-source contributors, plugin ecosystem, 10+ community-built extensions

### Technical Architecture Evolution

**Current (v2.1)**: Monolithic Google Apps Script + Firebase RTDB

**Future (v3.0)**: Microservices with Apps Script core

```
┌──────────────────────────────────────────────────┐
│      Frontend (Progressive Web App - PWA)        │
│   React/Vue.js with offline support & caching   │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────┴──────────────────────────────┐
│          API Gateway (Apps Script)               │
│  Authentication, Rate Limiting, Routing          │
└───────────────────┬──────────────────────────────┘
                    │
      ┌─────────────┼─────────────┬─────────────┐
      │             │             │             │
┌─────▼────┐  ┌────▼────┐  ┌─────▼────┐  ┌────▼─────┐
│ Polling  │  │Analytics│  │ Proctor  │  │ Question │
│ Service  │  │ Service │  │ Service  │  │  Bank    │
└──────────┘  └─────────┘  └──────────┘  └──────────┘
      │             │             │             │
      └─────────────┼─────────────┴─────────────┘
                    │
┌───────────────────┴──────────────────────────────┐
│    Data Layer (Firestore + BigQuery)             │
│  Hot data: Firestore, Analytics: BigQuery       │
│  Archive: Google Sheets (long-term storage)     │
└──────────────────────────────────────────────────┘
```

**Migration Path**: Gradual extraction (service-by-service), maintain backward compatibility

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
   - Priority assignment based on user demand

### Decision Criteria

Features are evaluated on:
- **User Value**: Does this solve a real, common problem?
- **Effort**: How much time to implement and test?
- **Maintenance**: Ongoing support burden and complexity?
- **Alignment**: Fits project mission (classroom assessment)?
- **Feasibility**: Technically possible with current stack?
- **Security**: Does it introduce new security risks?

---

## Changelog

### v2.1 - Documentation & Architecture Audit (2025-12-25)
- ✅ Complete README rewrite with hybrid architecture documentation
- ✅ Firebase + Sheets "Write-Behind" pattern explained
- ✅ Comprehensive code audit confirming zero orphaned files
- ✅ Documentation reorganization (docs/ and docs/archive/)
- ✅ Updated installation guide with Firebase Script Properties
- ✅ Security and troubleshooting documentation
- ✅ Complete usage guides for both user types

### v2.0 - Modernization Release (2025-11-10)
- ✅ Complete UI overhaul with Tailwind CSS
- ✅ State version management for sync
- ✅ Connection health monitoring
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

## Questions or Feedback?

- **GitHub Issues**: [Report bugs or request features](https://github.com/stephenborish/veritaslivepoll/issues)
- **Email**: sborish@malvernprep.org
- **Documentation**: See [docs/](docs/) folder for technical guides

---

**Last Updated**: 2025-12-25 | **Maintainer**: Stephen Borish | **License**: MIT
