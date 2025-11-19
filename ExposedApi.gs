// =============================================================================
// VERITAS LIVE POLL - EXPOSED API
// =============================================================================
// Purpose: Public function wrappers that preserve original names for google.script.run
// Dependencies: TeacherApi, StudentApi
// =============================================================================

// This module contains thin wrappers that delegate to internal API modules
// while preserving the exact function names that the client HTML/JS expects

// CRITICAL: Do NOT change function names in this file without updating ALL
// google.script.run calls in TeacherView.html and StudentView.html

// --- EXAMPLE PATTERN ---
// function originalFunctionName(arg1, arg2) {
//   return Veritas.TeacherApi.newInternalName(arg1, arg2);
// }

// All exposed functions will be created during the extraction phase
// to maintain exact compatibility with existing google.script.run calls
