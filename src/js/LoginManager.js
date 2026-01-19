
(function () {
    // Expose LoginManager globally
    window.LoginManager = {
        show: function () {
            var el = document.getElementById('login-overlay');

            if (el) {
                // Force Layout Reset for visibility
                el.style.display = 'flex';
                // Trigger animations by reflowing?
                // Actually the CSS animations run on mount, but if it was hidden with display:none, they might re-run or be stalled.
                // This manager seems to toggle visibility.
            }
        },
        hide: function () {
            var el = document.getElementById('login-overlay');
            if (el) el.style.display = 'none';
        },
        setError: function (msg) {
            var el = document.getElementById('login-error');
            if (el) {
                el.textContent = msg;
                el.style.display = 'block';
            }
        },
        init: function (onSuccess) {
            // Buffer onSuccess to handle multiple triggers
            var handleSuccess = function (user) {
                if (onSuccess) onSuccess(user);
            };

            // Google Login Logic
            var btn = document.getElementById('google-login-btn');
            if (btn) {
                btn.addEventListener('click', function () {
                    // Show loading state on button
                    var originalHtml = btn.innerHTML;
                    btn.innerHTML = '<span>Signing in...</span>';
                    btn.disabled = true;

                    var provider = new firebase.auth.GoogleAuthProvider();
                    provider.setCustomParameters({
                        prompt: 'select_account'
                    });

                    firebase.auth().signInWithPopup(provider)
                        .then(function (result) {
                            var user = result.user;
                            console.log('[Auth] Signed in as:', user.email);

                            // Persist session for teachers
                            sessionStorage.setItem('veritas_session_token', user.uid);
                            sessionStorage.setItem('veritas_teacher_email', user.email);

                            // Update Global State
                            window.SESSION_TOKEN = user.uid;
                            window.TEACHER_EMAIL = user.email;

                            LoginManager.hide();
                            handleSuccess(user);
                        })
                        .catch(function (error) {
                            console.error('[Auth] Login failed:', error);
                            LoginManager.setError(error.message || 'Authentication failed. Please try again.');
                        })
                        .finally(function () {
                            btn.innerHTML = originalHtml;
                            btn.disabled = false;
                        });
                });
            }

            // Simple Login Logic (Teacher/1234)
            var simpleBtn = document.getElementById('simple-login-btn');
            if (simpleBtn) {
                simpleBtn.addEventListener('click', function () {
                    var usernameInput = document.getElementById('login-username');
                    var passwordInput = document.getElementById('login-password');

                    var username = usernameInput ? usernameInput.value.trim() : '';
                    var password = passwordInput ? passwordInput.value.trim() : '';

                    if (!username || !password) {
                        LoginManager.setError('Please enter username and password.');
                        return;
                    }

                    // Override Button State
                    var originalText = simpleBtn.innerText;
                    simpleBtn.innerText = 'Verifying...';
                    simpleBtn.disabled = true;

                    // Magic Credential Mapping
                    var targetEmail = '';
                    var targetPwd = '';

                    if (username.toLowerCase() === 'teacher' && password === '1234') {
                        targetEmail = 'teacher@veritas.app'; // Internal System Account
                        targetPwd = 'password1234';          // Meets min 6 char requirement
                    } else if (username.includes('@')) {
                        // Allow direct email access (e.g. sborish@malvernprep.org)
                        targetEmail = username;
                        if (password.length < 6) {
                            // Firebase enforces 6+ char passwords; transparently pad
                            targetPwd = 'password' + password;
                        } else {
                            targetPwd = password;
                        }
                    } else {
                        LoginManager.setError('Invalid username or password.');
                        simpleBtn.innerText = originalText;
                        simpleBtn.disabled = false;
                        return;
                    }

                    // Attempt Login
                    firebase.auth().signInWithEmailAndPassword(targetEmail, targetPwd)
                        .then(function (result) {
                            console.log('[Auth] Simple login success:', result.user.email);
                            LoginManager.hide();
                            handleSuccess(result.user);
                        })
                        .catch(function (error) {
                            // If user not found, auto-create (Lazy Registration for Demo)
                            var isAuthError = (
                                error.code === 'auth/user-not-found' ||
                                error.code === 'auth/invalid-login-credentials' ||
                                error.code === 'auth/wrong-password' ||
                                error.code === 'auth/invalid-credential'
                            );

                            if (isAuthError) {
                                console.log('[Auth] User or Credential issue, attempting auto-create/recovery for demo...');
                                return firebase.auth().createUserWithEmailAndPassword(targetEmail, targetPwd)
                                    .then(function (result) {
                                        console.log('[Auth] Demo account created:', result.user.email);
                                        LoginManager.hide();
                                        handleSuccess(result.user);
                                    });
                            }
                            throw error;
                        })
                        .catch(function (finalError) {
                            console.error('[Auth] Login failed:', finalError);
                            if (finalError.code === 'auth/email-already-in-use') {
                                LoginManager.setError('Incorrect password for existing demo account.');
                            } else {
                                LoginManager.setError(finalError.message);
                            }
                            simpleBtn.innerText = originalText;
                            simpleBtn.disabled = false;
                        });
                });
            }
        }
    };
})();
