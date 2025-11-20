// =============================================================================
// VERITAS LIVE POLL - ENTRY POINT
// =============================================================================
// This file serves as the minimal entry point for the Veritas Live Poll system.
// All business logic has been extracted to modular files for maintainability.
// =============================================================================

// =============================================================================
// NAMESPACE INITIALIZATION
// =============================================================================

/**
 * Global Veritas namespace
 * All modules are organized under this namespace for clarity and collision prevention
 */
var Veritas = Veritas || {};

/**
 * Environment metadata
 */
Veritas.Env = {
  VERSION: '2.0.0',
  PHASE: 'Phase 2D Complete - Modular Architecture',
  LAST_UPDATED: '2025-11-20'
};

// =============================================================================
// MODULE ORGANIZATION
// =============================================================================
//
// The Veritas Live Poll system is organized into the following modules:
//
// FOUNDATION LAYER
// - _01_Core.gs (Veritas.Core)
//   Namespace initialization and global setup
//
// - _02_Config.gs (Veritas.Config)
//   Configuration constants, session types, proctoring rules
//
// - _03_Logging.gs (Veritas.Logging)
//   Logging utilities and error tracking
//
// - _04_Security.gs (Veritas.Security)
//   Authentication, authorization, and teacher verification
//
// - _05_Utils.gs (Veritas.Utils)
//   Utility functions: error handling, caching, logging, rate limiting, tokens
//
// - _06_DataAccess.gs (DataAccess)
//   Data access layer for spreadsheet operations (polls, responses, roster, etc.)
//
// MODELS LAYER (Business Logic)
// - _07_Models_Poll.gs (Veritas.Models.Poll)
//   Poll CRUD, roster management, question normalization, image management
//
// - _08_Models_Session.gs (Veritas.Models.Session)
//   Live poll sessions, secure assessments, proctoring, timing control
//
// - _09_Models_Analytics.gs (Veritas.Models.Analytics)
//   Analytics hub, psychometrics, insights, interpretations, dashboard summaries
//
// API/ROUTING LAYER
// - _10_TeacherApi.gs (Veritas.TeacherApi)
//   Teacher-facing server methods with security enforcement
//   58 functions: dashboard, analytics, poll management, roster, sessions, setup
//
// - _11_StudentApi.gs (Veritas.StudentApi)
//   Student-facing methods with token validation
//   7 functions: live poll operations, secure assessment operations
//
// - _12_Routing.gs (Veritas.Routing)
//   Web app routing, authentication, template serving, image proxy
//
// - _13_ExposedApi.gs
//   Centralized registry of all 79 functions exposed to google.script.run
//   Thin wrappers that delegate to TeacherApi, StudentApi, or Routing
//
// DEVELOPMENT TOOLS
// - _14_DevTools.gs (Veritas.DevTools)
//   Development utilities and smoke tests
//
// =============================================================================

// =============================================================================
// ARCHITECTURE NOTES
// =============================================================================
//
// CALL FLOW:
// Frontend (google.script.run)
//     ↓
// ExposedApi wrapper
//     ↓
// TeacherApi / StudentApi (security checks)
//     ↓
// Models layer (business logic)
//     ↓
// DataAccess / Config / Utils
//     ↓
// SpreadsheetApp / DriveApp / PropertiesService
//
// SECURITY:
// - Teacher operations: Verified via Veritas.Routing.isTeacherEmail()
// - Student operations: Validated via TokenManager.validateToken()
// - All sensitive operations protected by security checks in API layer
//
// BACKWARD COMPATIBILITY:
// - All 67 exposed functions maintain original signatures
// - Legacy wrappers ensure zero breaking changes
// - Existing frontend code works unchanged
//
// =============================================================================

// =============================================================================
// GLOBAL INITIALIZATION
// =============================================================================

/**
 * This space intentionally left minimal.
 * All implementations are in the modular files listed above.
 *
 * If you need to add new functionality:
 * 1. Add business logic to appropriate Models file
 * 2. Add security wrapper to TeacherApi or StudentApi
 * 3. Expose to frontend via ExposedApi
 * 4. Update documentation
 */

// =============================================================================
// END OF CODE.GS
// =============================================================================
// Total Lines: ~105
// Phase: 2D Complete - Full Modular Architecture
// Reduction: From 7,972 lines to ~105 lines (98.7% reduction)
// =============================================================================
