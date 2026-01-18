(function(global) {
  'use strict';

  // Deterministic Student Key Generation (SHA-256)
  // This matches the user's requirement for a collision-resistant key.
  // We use Web Crypto API which is available in modern browsers.

  async function generateStudentHash(email, pollId) {
    if (!email) return 'unknown_student';

    // Normalize: lowercase, trim
    const normalized = email.toLowerCase().trim();

    // Namespace with pollId if provided (optional but good for isolation)
    const data = pollId ? `${pollId}:${normalized}` : normalized;

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      // Convert to hex string
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      // Return first 16 chars as key (enough entropy for this context)
      return hashHex.substring(0, 16);
    } catch (e) {
      console.warn('Web Crypto unavailable, falling back to simple hash', e);
      // Fallback for very old browsers (unlikely in this context but safe)
      var hash = 0;
      for (var i = 0; i < data.length; i++) {
        var char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return 'fb_' + Math.abs(hash).toString(16);
    }
  }

  // Export
  global.VeritasShared = global.VeritasShared || {};
  global.VeritasShared.generateStudentKey = generateStudentHash;

  // ========================================================================
  // VERITAS DEBUG HELPER
  // Accessible from browser console: VeritasDebug.printFirebaseConfig()
  // Safe no-op if Firebase is not available.
  // ========================================================================
  global.VeritasDebug = {
    /**
     * Print Firebase configuration details to console.
     * Call from browser DevTools: VeritasDebug.printFirebaseConfig()
     */
    printFirebaseConfig: function() {
      console.group('🔥 VeritasDebug: Firebase Configuration');

      // Check FIREBASE_CONFIG
      if (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG) {
        console.log('✓ FIREBASE_CONFIG exists');
        console.log('  databaseURL:', FIREBASE_CONFIG.databaseURL || '(not set)');
        console.log('  projectId:', FIREBASE_CONFIG.projectId || '(not set)');
        console.log('  Full config:', FIREBASE_CONFIG);
      } else {
        console.warn('✗ FIREBASE_CONFIG is NOT defined');
      }

      // Check firebase SDK
      if (typeof firebase !== 'undefined') {
        console.log('✓ firebase SDK is loaded');
        console.log('  firebase.apps.length:', firebase.apps ? firebase.apps.length : 'n/a');
        if (firebase.apps && firebase.apps.length > 0) {
          console.log('  Default app name:', firebase.apps[0].name);
          console.log('  Database URL:', firebase.apps[0].options.databaseURL || '(not set)');
        }
      } else {
        console.warn('✗ firebase SDK is NOT loaded');
      }

      // Check firebaseDb reference (if exists in scope)
      if (typeof firebaseDb !== 'undefined' && firebaseDb) {
        console.log('✓ firebaseDb reference exists');
      } else {
        console.log('○ firebaseDb reference not in scope (normal before init)');
      }

      console.groupEnd();
      return {
        configExists: typeof FIREBASE_CONFIG !== 'undefined',
        databaseURL: (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG) ? FIREBASE_CONFIG.databaseURL : null,
        firebaseLoaded: typeof firebase !== 'undefined',
        appsLength: (typeof firebase !== 'undefined' && firebase.apps) ? firebase.apps.length : 0
      };
    },

    /**
     * Print current page context for debugging
     */
    printContext: function() {
      console.group('📋 VeritasDebug: Page Context');
      console.log('Location:', window.location.href);
      console.log('Page type:', document.title);

      // Check for session token (student pages)
      if (typeof SESSION_TOKEN !== 'undefined') {
        console.log('SESSION_TOKEN:', SESSION_TOKEN ? '(present, length=' + SESSION_TOKEN.length + ')' : '(empty)');
      }

      // Check for poll data (teacher pages)
      if (typeof CURRENT_POLL_DATA !== 'undefined') {
        console.log('CURRENT_POLL_DATA:', CURRENT_POLL_DATA);
      }

      console.groupEnd();
    }
  };

})(window);
