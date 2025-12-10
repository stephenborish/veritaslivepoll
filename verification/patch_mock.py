import os

file_path = "verification/mock_student_view.html"
with open(file_path, "r") as f:
    content = f.read()

# Expose secureSessionActive
content = content.replace("var secureSessionActive = false;", "var secureSessionActive = false; window.secureSessionActive = secureSessionActive;")

# Expose triggerSecurityViolation
# We need to find the function definition and export it.
# Ideally we just remove the IIFE.
# The IIFE start is usually at the top of the script tag in Student_Scripts.html.
# Let's look for the specific string from the file.

target_start = "(function () {"
target_end = "})();"

# This is risky if there are nested IIFEs.
# Let's instead append the window assignments inside the function.
# We can find a unique string inside the IIFE and inject code after it.

unique_anchor = "var secureSessionActive = false;"
injection = """
var secureSessionActive = false;
window.secureSessionActive = true; // Force active for test
window.triggerSecurityViolation = triggerSecurityViolation;
"""

# Wait,  is defined *after* .
# Let's inject at the end of the IIFE, before the closing brace?
# Or just replace the function definition to also assign to window.

# Replace: function triggerSecurityViolation(reason) {
# With:    window.triggerSecurityViolation = function triggerSecurityViolation(reason) {

content = content.replace("function triggerSecurityViolation(reason) {", "window.triggerSecurityViolation = function triggerSecurityViolation(reason) {")

# Also need to set secureSessionActive to true to allow violations.
# Find "var secureSessionActive = false;" and replace it to expose it or set it true.
# Since it's a var, if we don't expose it, we can't change it.
# But if we change the initialization to true, it might be overwritten by .
# However, for the test we just need it to be true when we trigger the violation.
# If we expose it on window, we can set it.

content = content.replace("var secureSessionActive = false;", "var secureSessionActive = true; window.secureSessionActive = true;")

# We also need  to be false (default) and  false (default).

with open(file_path, "w") as f:
    f.write(content)

print("Mock file patched.")
