
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/storage';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Local emulator support for end-to-end workflow testing.
// This keeps production untouched while allowing localhost runs to use emulators.
if (typeof window !== 'undefined') {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalhost) {
        try {
            firebase.auth().useEmulator('http://127.0.0.1:9099');
            firebase.database().useEmulator('127.0.0.1', 9000);
            firebase.firestore().useEmulator('127.0.0.1', 8080);
            firebase.functions().useEmulator('127.0.0.1', 5001);
            // Storage emulator is optional in local runs.
            if (firebase.storage && firebase.storage()) {
                firebase.storage().useEmulator('127.0.0.1', 9199);
            }
            console.log('[Firebase] Connected to local emulators (auth, rtdb, firestore, functions, storage)');
        } catch (err) {
            console.warn('[Firebase] Emulator connection skipped or already initialized:', err && err.message ? err.message : err);
        }
    }
}

// Expose global variable for legacy scripts that expect it (if they check global window.firebase)
window.firebase = firebase;
window.FIREBASE_CONFIG = firebaseConfig; // Some scripts check this global
window.USING_FALLBACK_CONFIG = false;

export default firebase;
