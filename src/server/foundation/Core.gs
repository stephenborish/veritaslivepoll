// =============================================================================
// VERITAS LIVE POLL - CORE MODULE
// =============================================================================
// Purpose: Root namespace declaration and version constants
// Dependencies: None (must load first)
// =============================================================================

/**
 * Global namespace for all Veritas Live Poll modules.
 * Prevents naming collisions and provides organized structure.
 */
var Veritas = Veritas || {};

/**
 * Environment and version information
 */
Veritas.Env = {
  VERSION: '2.0.0-refactored',
  BUILD_DATE: '2025-11-19',
  APP_NAME: 'Veritas Live Poll'
};

/**
 * Initialize the Veritas application.
 * Called once when the script loads.
 */
Veritas.init = function() {
  Veritas.Logging.info('Veritas Live Poll initialized', {
    version: Veritas.Env.VERSION,
    buildDate: Veritas.Env.BUILD_DATE
  });
};
