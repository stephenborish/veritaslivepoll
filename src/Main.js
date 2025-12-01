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
  VERSION: '2.1.0',
  PHASE: 'Modular source tree under src/server',
  LAST_UPDATED: '2025-03-03'
};

// =============================================================================
// MODULE ORGANIZATION
// =============================================================================
//
// The Veritas Live Poll system is organized into the following modules under
// src/server:
//
// FOUNDATION LAYER
// - foundation/Core.gs (Veritas.Core)
//   Namespace initialization and global setup
// - foundation/Config.gs (Veritas.Config)
//   Configuration constants, session types, proctoring rules
// - foundation/Logging.gs (Veritas.Logging)
//   Logging utilities and error tracking
// - foundation/Security.gs (Veritas.Security)
//   Authentication, authorization, and teacher verification
// - foundation/Utils.gs (Veritas.Utils)
//   Utility functions: error handling, caching, logging, rate limiting, tokens
// - shared/VeritasPure.gs
//   Pure helpers shared with tests and Utils
//
// DATA LAYER
// - data/DataAccess.gs (DataAccess)
//   Spreadsheet operations (polls, responses, roster, etc.)
//
// MODELS LAYER (Business Logic)
// - models/Poll.gs (Veritas.Models.Poll)
//   Poll CRUD, roster management, question normalization, image management
// - models/Session.gs (Veritas.Models.Session)
//   Live poll sessions, secure assessments, proctoring, timing control
// - models/Analytics.gs (Veritas.Models.Analytics)
//   Analytics hub, psychometrics, insights, interpretations, dashboard summaries
//
// API/ROUTING LAYER
// - api/TeacherApi.gs (Veritas.TeacherApi)
//   Teacher-facing server methods with security enforcement
// - api/StudentApi.gs (Veritas.StudentApi)
//   Student-facing methods with token validation
// - api/ExposedApi.gs
//   Centralized registry of functions exposed to google.script.run
// - routing/Routing.gs (Veritas.Routing)
//   Web app routing, authentication, template serving, image proxy
//
// DEVELOPMENT TOOLS
// - devtools/DevTools.gs (Veritas.DevTools)
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

/**
 * Creates a custom menu in the spreadsheet UI.
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Veritas Tools')
      .addItem('Run Student Simulation', 'runSmokeTest')
      .addToUi();
}
