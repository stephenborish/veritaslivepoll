var Veritas = Veritas || {};
Veritas.Dev = {};

// 1. CONSTANTS - The Fake Identities
Veritas.Dev.MOCK_STUDENT = "student_test@school.edu";
// We use your real email for teacher mode so permissions work
Veritas.Dev.MOCK_TEACHER = Session.getActiveUser().getEmail();

// 2. THE MAGICAL SWITCHER
// This looks at your "User Properties" (a hidden setting just for you)
Veritas.Dev.getCurrentUser = function() {
  // Check if you have set a fake role for yourself
  var role = PropertiesService.getUserProperties().getProperty('DEV_ROLE');
  
  if (role === 'STUDENT') {
    return Veritas.Dev.MOCK_STUDENT;
  }
  if (role === 'TEACHER') {
    return Veritas.Dev.MOCK_TEACHER;
  }
  
  // If no role is set, be your real self
  return Session.getActiveUser().getEmail();
};

// 3. THE BOOKMARK LISTENER
// This runs when you click the magic bookmarks
Veritas.Dev.handleRouteSwitch = function(e) {
  if (!e || !e.parameter) return;
  
  if (e.parameter.switchRole) {
    var newRole = e.parameter.switchRole; // 'STUDENT', 'TEACHER', or 'RESET'
    
    if (newRole === 'RESET') {
      PropertiesService.getUserProperties().deleteProperty('DEV_ROLE');
    } else {
      PropertiesService.getUserProperties().setProperty('DEV_ROLE', newRole);
    }
  }
};
