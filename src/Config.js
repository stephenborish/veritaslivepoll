// src/Config.js

// --- MASTER SWITCH ---
// Set to TRUE to wear a costume. Set to FALSE for real life.
var IS_TESTING = true; 

// --- THE COSTUMES ---
var TEST_STUDENT = "student@test.com"; // A fake student email
var TEST_TEACHER = "sborish@malvernprep.org"; // Your real email

// --- CURRENT COSTUME ---
// Change this variable to swap views instantly!
var CURRENT_TEST_USER = TEST_STUDENT; 

// --- THE HELPER FUNCTION ---
// This decides whether to ask Google or use the costume
function getUserEmail() {
  if (IS_TESTING) {
    return CURRENT_TEST_USER;
  } else {
    // This is the real Google check
    return Veritas.Dev.getCurrentUser();
  }
}