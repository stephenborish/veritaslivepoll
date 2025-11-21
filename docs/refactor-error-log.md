# Refactor Error Log

## Observed breakages

1. **Inline UI handlers not exposed globally**
   - **Files/lines:** `templates/teacher/_Body.html` (navbar/dashboard cards and student insights table inline `onclick` calls) expect `showDashboard`, `openPollCreator`, `filterStudentsByFlag`, `clearStudentFilter`, and `sortStudentsBy` to exist globally.
   - **Symptom:** Browser console showed `ReferenceError: showDashboard is not defined` when clicking the dashboard header because the refactor wrapped teacher scripts in an IIFE without exporting these functions.
   - **Hypothesis:** The modular refactor encapsulated UI helpers but did not re-expose the ones referenced directly by HTML attributes.

2. **Legacy dashboard widgets removed from HTML**
   - **Files/lines:** `templates/teacher/_Scripts.html` functions `renderRecentSessions` and `renderActivityPulse` still query `recent-sessions-container`, `activity-chart-container`, and `activity-summary`, but those elements no longer exist in `templates/teacher/_Body.html`.
   - **Symptom:** When these helpers run (e.g., in older builds), they log warnings about missing containers. The current `renderDashboardSummary` stub avoids invoking them, but the mismatch remains noteworthy.
   - **Hypothesis:** UI cleanup removed the legacy widgets without pruning their render helpers.

## Fixes applied
- Exposed the inline handler functions (`showDashboard`, `openPollCreator`, `filterStudentsByFlag`, `clearStudentFilter`, `sortStudentsBy`) on `window` inside `templates/teacher/_Scripts.html` so HTML attributes resolve correctly.
- Left legacy dashboard helpers untouched but documented the missing containers to prevent reintroducing warnings if they are re-enabled.
