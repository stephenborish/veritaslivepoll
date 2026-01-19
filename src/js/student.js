    (function () {
        console.log('Veritas Student Script IIFE executing...');
        var secureFocusContainer = document.getElementById('individual-timed-session');
        var secureProgressLabel = document.getElementById('secure-progress-label');
        var secureCountdownEl = document.getElementById('secure-countdown');
        var secureTopbarTimer = document.getElementById('secure-topbar-timer');
        var timerVisibilityToggle = document.getElementById('timer-visibility-toggle');
        var questionProgressEl = document.getElementById('question-progress');
        var studentModeLabel = document.getElementById('student-mode-label');
        var questionLayout = document.getElementById('question-content');
        var questionVisual = document.getElementById('question-visual');
        var secureQuestionLayout = document.getElementById('secure-question-layout');
        var secureQuestionVisual = document.getElementById('secure-question-visual');
        var secureConnectionDot = document.getElementById('secure-connection-dot');
        var secureConnectionIndicator = document.getElementById('secure-connection-indicator');
        var secureConnectionStatus = document.getElementById('secure-connection-status');
        var secureConnectionWarning = document.getElementById('secure-connection-warning');
        var secureQuestionText = document.getElementById('secure-question-text');
        var secureQuestionSubline = document.getElementById('secure-question-subline');
        var secureQuestionImage = document.getElementById('secure-question-image');
        var secureOptionsList = document.getElementById('secure-options-list');
        var secureSubmitBtn = document.getElementById('secure-submit-btn');
        var secureSubmitLabel = document.getElementById('secure-submit-label');
        var secureSubmitHint = document.getElementById('secure-submit-hint');
        var secureConfidencePrompt = document.getElementById('secure-confidence-prompt');
        var timerHidden = false;
        var lastTimerDisplay = '00:00';
        var secureCountdownTotal = 0;
        var bodyEl = document.body;
        var secureCloseTimer = null;
        var firebaseDb = null;
        var firebaseFunctions = null;
        var firebaseRef = null;
        var studentKey = null;

        // --- FIREBASE INIT ---
        var currentFirebasePollId = null; // Store pollId for debug HUD
        var lastQuestionIndex = -1;
        var liveSessionRef = null;
        var connectedRef = null;

        // =============================================================================
        // STATE REHYDRATION - Prevents "White Flash" or "Lobby Loop" on refresh
        // Caches poll state to sessionStorage and restores on page load
        // =============================================================================
        var STATE_CACHE_KEY = 'vlp_poll_state_cache';
        var STATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

        function cachePollState(state) {
            if (!state || !state.pollId) return;
            try {
                var cacheData = {
                    state: state,
                    cachedAt: Date.now()
                };
                sessionStorage.setItem(STATE_CACHE_KEY, JSON.stringify(cacheData));
                console.log('[StateCache] Cached poll state for:', state.pollId);
            } catch (e) {
                console.warn('[StateCache] Failed to cache state:', e);
            }
        }

        function getCachedPollState() {
            try {
                var cached = sessionStorage.getItem(STATE_CACHE_KEY);
                if (!cached) return null;

                var cacheData = JSON.parse(cached);
                var age = Date.now() - cacheData.cachedAt;

                // Check TTL - only use cache if less than 5 minutes old
                if (age > STATE_CACHE_TTL_MS) {
                    console.log('[StateCache] Cache expired (age:', Math.round(age / 1000), 's)');
                    sessionStorage.removeItem(STATE_CACHE_KEY);
                    return null;
                }

                console.log('[StateCache] Found valid cache (age:', Math.round(age / 1000), 's)');
                return cacheData.state;
            } catch (e) {
                console.warn('[StateCache] Failed to read cache:', e);
                return null;
            }
        }

        function clearStateCache() {
            try {
                sessionStorage.removeItem(STATE_CACHE_KEY);
            } catch (e) { }
        }

        /**
         * Transform Firebase live_session data to view data format
         * Used for immediate fetch and listener callbacks
         */
        function transformLiveSessionToViewData(sessionData, pollId) {
            if (!sessionData) return null;

            return {
                pollId: pollId,
                status: sessionData.status,
                questionIndex: typeof sessionData.currentQuestionIndex === 'number' ? sessionData.currentQuestionIndex : null,
                questionText: sessionData.questionText || null,
                options: sessionData.options || null,
                resultsVisibility: sessionData.resultsVisibility || null,
                studentEmail: window.STUDENT_EMAIL,
                calculatorEnabled: sessionData.calculatorEnabled === true,
                liveProctoring: sessionData.liveProctoring === true,
                sessionType: sessionData.sessionType || 'LIVE_POLL'
            };
        }

        /**
         * EARLY STATE REHYDRATION
         * Called synchronously on page load BEFORE network requests
         * Renders cached state immediately to prevent white flash
         */
        function attemptEarlyRehydration() {
            var cachedState = getCachedPollState();
            if (!cachedState) {
                console.log('[StateRehydration] No valid cached state found');
                return false;
            }

            console.log('[StateRehydration] Rehydrating from cache immediately');

            // Only rehydrate if the session is still active (not ENDED)
            if (cachedState.status === 'ENDED' || cachedState.status === 'CLOSED') {
                console.log('[StateRehydration] Cached state is ENDED/CLOSED, clearing cache');
                clearStateCache();
                return false;
            }

            // Render cached state synchronously
            try {
                updateStudentView(cachedState);
                console.log('[StateRehydration] Successfully rendered from cache');
                return true;
            } catch (e) {
                console.error('[StateRehydration] Failed to render cached state:', e);
                return false;
            }
        }

        // =============================================================================
        // PHASE 2: STRICT LISTENER MANAGER PATTERN
        // Prevents memory leaks and "ghost" re-renders from zombie listeners
        // =============================================================================
        var ListenerManager = (function () {
            var registeredListeners = {};

            return {
                /**
                 * Attach a listener with automatic cleanup tracking
                 * @param {string} key - Unique identifier for this listener
                 * @param {object} ref - Firebase reference
                 * @param {string} eventType - Event type ('value', 'child_added', etc.)
                 * @param {function} callback - Callback function
                 */
                attach: function (key, ref, eventType, callback) {
                    // CRITICAL: Detach existing listener for this key first
                    this.detach(key);

                    // Attach new listener
                    ref.on(eventType, callback);

                    // Track for cleanup
                    registeredListeners[key] = {
                        ref: ref,
                        eventType: eventType,
                        callback: callback,
                        attachedAt: Date.now()
                    };

                    console.log('[ListenerManager] Attached listener: ' + key);
                },

                /**
                 * Detach a specific listener by key
                 * @param {string} key - Unique identifier for the listener
                 */
                detach: function (key) {
                    if (registeredListeners[key]) {
                        var listener = registeredListeners[key];
                        try {
                            listener.ref.off(listener.eventType, listener.callback);
                            console.log('[ListenerManager] Detached listener: ' + key);
                        } catch (e) {
                            console.warn('[ListenerManager] Error detaching ' + key + ':', e);
                        }
                        delete registeredListeners[key];
                    }
                },

                /**
                 * Detach all listeners (for cleanup on session change)
                 */
                detachAll: function () {
                    var keys = Object.keys(registeredListeners);
                    keys.forEach(function (key) {
                        ListenerManager.detach(key);
                    });
                    console.log('[ListenerManager] Detached all listeners (' + keys.length + ' total)');
                },

                /**
                 * Get count of active listeners (for debugging)
                 */
                getActiveCount: function () {
                    return Object.keys(registeredListeners).length;
                },

                /**
                 * List all active listener keys (for debugging)
                 */
                listActive: function () {
                    return Object.keys(registeredListeners);
                }
            };
        })();

        // EAGER INIT: Ensure Firebase handles are ready before any UI interaction
        if (typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined') {
            if (!firebase.apps.length) {
                try {
                    firebase.initializeApp(FIREBASE_CONFIG);
                    console.log('[Init] Firebase initialized eagerly');
                } catch (e) {
                    console.error('[Init] Firebase eager init failed:', e);
                }
            }
            // Set global references immediately
            if (firebase.apps.length) {
                firebaseDb = firebase.database();
                if (firebase.functions) {
                    firebaseFunctions = firebase.functions();
                }
            }
        }

        // UUID Generator (Polyfill)
        function generateUUID() {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        // Rich Text Renderer (Sanitization & Math/Formula Support)
        function renderRichText(htmlContent) {
            if (!htmlContent) return '';

            var cleanHtml = htmlContent;

            // 1. Sanitize
            if (typeof DOMPurify !== 'undefined') {
                cleanHtml = DOMPurify.sanitize(htmlContent, {
                    ADD_TAGS: ['math', 'annotation', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'sub', 'sup'], // Allow MathML tags if present
                    ADD_ATTR: ['class', 'style'] // Allow classes for Quill/KaTeX
                });
            } else {
                console.warn('DOMPurify not loaded - rendering as raw HTML');
            }

            // 2. Post-Process for KaTeX (Scan for LaTeX delimiters if not already rendered)
            // Note: If the editor saves as HTML with KaTeX rendered spans, we just display it.
            // If it saves as raw text with $$...$$, we might need to parse, but Quill usually handles this.

            // 3. Return wrapped content (optional)
            return '<div class="ql-editor">' + cleanHtml + '</div>';
        }

        function triggerMathRender() {
            // Re-render KaTeX if any auto-render scripts are used, or strictly rely on existing spans.
            // If using KaTeX auto-render extension:
            if (window.renderMathInElement) {
                renderMathInElement(document.body, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ]
                });
            }
        }

        async function initFirebaseSidecar(pollId, studentEmail) {
            if (!FIREBASE_CONFIG || !pollId || !studentEmail) return;

            // PHASE 2 FIX: Use ListenerManager for strict cleanup of zombie listeners
            // CHECK: If pollId changed, cleanup ALL old listeners via ListenerManager
            if (currentFirebasePollId && currentFirebasePollId !== pollId) {
                console.log('[Firebase] PollId changed from ' + currentFirebasePollId + ' to ' + pollId + ' - Cleaning up via ListenerManager...');

                // Use ListenerManager to detach all listeners for the old poll
                ListenerManager.detachAll();

                // Clear ref handles
                firebaseRef = null;
                liveSessionRef = null;
                connectedRef = null;
                currentFirebasePollId = null;
            }

            // Prevent double init for same pollId
            if (firebaseRef && currentFirebasePollId === pollId) {
                console.log('[Firebase] Already initialized for pollId: ' + pollId + ' (Active listeners: ' + ListenerManager.getActiveCount() + ')');
                return;
            }

            if (typeof firebase !== 'undefined' && !firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }

            if (typeof firebase !== 'undefined') {
                firebaseDb = firebase.database();
                if (firebase.functions) {
                    firebaseFunctions = firebase.functions();
                }
                // Deterministic key generation
                studentKey = await window.VeritasShared.generateStudentKey(studentEmail, pollId);
                currentFirebasePollId = pollId; // Store for debug HUD

                var path = 'sessions/' + pollId + '/students/' + studentKey;
                firebaseRef = firebaseDb.ref(path);

                // 1. Set Initial State with Read-Before-Write
                // schema-fix: Ensure we write an OBJECT, not a string, for proctoring compatibility.
                firebaseRef.once('value').then(function (snapshot) {
                    var current = snapshot.val();

                    // If no data, or it's a legacy string, or disconnected string
                    // We must initialize the proper object structure.
                    // Preserve existing lockVersion if possible, though unlikely in init.

                    var needsInit = !current || typeof current !== 'object';

                    if (needsInit) {
                        var initialData = {
                            status: 'ACTIVE',
                            name: window.STUDENT_NAME || 'Unknown',
                            email: window.STUDENT_EMAIL || 'unknown',
                            joinedAt: firebase.database.ServerValue.TIMESTAMP,
                            lockVersion: 0,
                            userAgent: navigator.userAgent
                        };
                        firebaseRef.set(initialData);
                        console.log('[Firebase] Initialized student state object:', initialData);
                    } else {
                        // Ensure status is active if it was generic 'DISCONNECTED'
                        // But obey locks.
                        if (current.status === 'DISCONNECTED' || !current.status) {
                            firebaseRef.update({ status: 'ACTIVE', lastActiveAt: firebase.database.ServerValue.TIMESTAMP });
                        }
                    }
                });

                // 2. On Disconnect -> Update status to DISCONNECTED (preserving object structure)
                // CRITICAL FIX: Use update() instead of set() to preserve student object fields
                firebaseRef.onDisconnect().update({
                    status: 'DISCONNECTED',
                    lastDisconnectedAt: firebase.database.ServerValue.TIMESTAMP
                });

                // 3. Listen for changes (Remote Lock/Unlock) - VIA LISTENER MANAGER
                var studentStatusCallback = function (snapshot) {
                    var status = snapshot.val();
                    handleRemoteStatusChange(status);
                    updateDebugHud(status, null, currentFirebasePollId);
                };
                ListenerManager.attach('studentStatus_' + pollId, firebaseRef, 'value', studentStatusCallback);

                // Connection State for HUD, Adaptive Polling & Connectivity Toast - VIA LISTENER MANAGER
                connectedRef = firebaseDb.ref('.info/connected');
                var connectionCallback = function (snap) {
                    var connected = snap.val() === true;
                    updateDebugHud(null, connected, currentFirebasePollId);

                    // PHASE 4: Show/hide connectivity recovery toast
                    showConnectivityToast(connected);

                    // ADAPTIVE POLLING: Reduce server load when Firebase is active
                    // If connected, we receive "signals" for state changes, so we can poll slowly.
                    // If disconnected, we fallback to fast polling to ensure responsiveness.
                    if (connected) {
                        console.log('[Adaptive Polling] Firebase connected - switching to balanced poll (5s)');
                        defaultPollInterval = 5000;

                        // PHASE 4: Auto-recovery - trigger soft poll to check if we missed a slide transition
                        console.log('[Connectivity Recovery] Reconnected - triggering soft poll to sync state');
                        if (typeof startPolling === 'function') {
                            startPolling(true); // Force immediate poll
                        }
                    } else {
                        console.log('[Adaptive Polling] Firebase disconnected - switching to fast poll (2.5s)');
                        defaultPollInterval = 2500;
                    }
                };
                ListenerManager.attach('connectionState', connectedRef, 'value', connectionCallback);

                // 4. Signal-to-Poll: Listen for public state changes - VIA LISTENER MANAGER
                // When teacher advances slide, a signal is written here.
                // NEW: Listen to 'live_session' for instant updates (Hybrid Architecture)
                var sessionPath = 'sessions/' + pollId + '/live_session';
                liveSessionRef = firebaseDb.ref(sessionPath);

                // PHASE 4 FIX: IMMEDIATE FETCH - Execute .once('value') immediately on init
                // This prevents the "white flash" by getting state before the first listener event
                console.log('[Firebase] Executing immediate fetch on live_session...');
                liveSessionRef.once('value').then(function (snapshot) {
                    var sessionData = snapshot.val();
                    if (sessionData) {
                        console.log('[Firebase] Immediate fetch received:', sessionData.status);
                        // Only process if we haven't already received an update from the listener
                        if (!window._immediateFetchProcessed) {
                            window._immediateFetchProcessed = true;
                            var viewData = transformLiveSessionToViewData(sessionData, pollId);
                            if (viewData) {
                                updateStudentView(viewData);
                            }
                        }
                    }
                }).catch(function (err) {
                    console.warn('[Firebase] Immediate fetch failed:', err);
                });

                var liveSessionCallback = function (snapshot) {
                    var data = snapshot.val();
                    if (data) {
                        console.log('[Firebase] Live Session update received:', data);

                        // SYNC SPINE: Capture the server's question index and validate local state
                        if (typeof data.questionIndex === 'number') {
                            var serverQuestionIndex = data.questionIndex;
                            // If server says different question than our local lastQuestionIndex, we MUST sync
                            if (lastQuestionIndex !== serverQuestionIndex) {
                                console.log('[Sync Spine] Server question index (' + serverQuestionIndex + ') differs from local (' + lastQuestionIndex + ') - forcing sync');
                            }
                        }

                        // If we have full metadata and a current pollId, update UI directly
                        // We strictly check for question content to ensure it's a 'Fast Path' signal
                        if (data.questionText && data.pollId && typeof updateStudentView === 'function') {
                            console.log('[Firebase] Fast Path: Updating view from pushed state');

                            // Synthesize the state payload for updateStudentView
                            var statePayload = {
                                pollId: data.pollId,
                                questionIndex: data.questionIndex,
                                status: data.status || 'OPEN',
                                questionText: data.questionText,
                                questionImageURL: data.questionImageURL,
                                options: data.options || [],
                                totalQuestions: data.totalQuestions, // Optional, caller handles if null
                                sessionPhase: data.sessionPhase || (data.metadata && data.metadata.sessionPhase) || 'LIVE',
                                resultsVisibility: data.resultsVisibility || (data.metadata && data.metadata.resultsVisibility) || 'HIDDEN'
                            };

                            // Add any extra metadata from the payload
                            if (data.metadata) {
                                for (var key in data.metadata) {
                                    if (!statePayload.hasOwnProperty(key)) {
                                        statePayload[key] = data.metadata[key];
                                    }
                                }
                            }

                            // IMMEDIATE MATH RENDER: Call triggerMathRender after view update for fast path
                            updateStudentView(statePayload);
                            setTimeout(triggerMathRender, 50); // Allow DOM to settle
                        } else {
                            // Fallback to polling for full state if data is incomplete
                            // FIX: If status changed (e.g. CLOSED), we should respect that even without text
                            if (data.status && data.status !== 'OPEN') {
                                console.log('[Firebase] Fast Path (Status Only): Processing status change to ' + data.status);
                                // Call updateStudentView with minimal data to trigger status change
                                if (typeof updateStudentView === 'function') {
                                    updateStudentView({
                                        pollId: data.pollId || pollId,
                                        questionIndex: data.questionIndex,
                                        status: data.status,
                                        sessionPhase: data.sessionPhase || 'LIVE'
                                    });
                                }
                            }

                            console.log('[Firebase] Slow Path: Incomplete data, polling server to ensure consistency');
                            startPolling(true);
                        }
                    }
                };
                ListenerManager.attach('liveSession_' + pollId, liveSessionRef, 'value', liveSessionCallback);

                console.log('[Firebase] Sidecar initialized for', path, '(Listeners: ' + ListenerManager.getActiveCount() + ')');
            }
        }

        // =============================================================================
        // PHASE 4: CONNECTIVITY RECOVERY TOAST
        // Visual "Reconnecting..." toast that appears onDisconnect and disappears onConnect
        // =============================================================================
        var connectivityToastVisible = false;
        var connectivityToastEl = null;

        function showConnectivityToast(isConnected) {
            // Create toast element if it doesn't exist
            if (!connectivityToastEl) {
                connectivityToastEl = document.createElement('div');
                connectivityToastEl.id = 'connectivity-toast';
                connectivityToastEl.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-full shadow-lg transition-all duration-300 flex items-center gap-3';
                connectivityToastEl.style.cssText = 'opacity: 0; pointer-events: none;';
                document.body.appendChild(connectivityToastEl);
            }

            if (!isConnected && !connectivityToastVisible) {
                // Show "Reconnecting..." toast
                connectivityToastEl.innerHTML = '<span class="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span><span class="font-semibold text-amber-900">Reconnecting...</span>';
                connectivityToastEl.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-full shadow-lg transition-all duration-300 flex items-center gap-3 bg-amber-100 border border-amber-300';
                connectivityToastEl.style.opacity = '1';
                connectivityToastEl.style.pointerEvents = 'auto';
                connectivityToastVisible = true;
                console.log('[Connectivity] Showing reconnecting toast');
            } else if (isConnected && connectivityToastVisible) {
                // Show brief "Connected" confirmation then hide
                connectivityToastEl.innerHTML = '<span class="inline-block w-3 h-3 rounded-full bg-emerald-500"></span><span class="font-semibold text-emerald-900">Connected</span>';
                connectivityToastEl.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-full shadow-lg transition-all duration-300 flex items-center gap-3 bg-emerald-100 border border-emerald-300';

                // Hide after 2 seconds
                setTimeout(function () {
                    connectivityToastEl.style.opacity = '0';
                    connectivityToastEl.style.pointerEvents = 'none';
                    connectivityToastVisible = false;
                    console.log('[Connectivity] Hiding toast - connection restored');
                }, 2000);
            }
        }

        /**
         * Submit answer directly to Firebase (Fast Path) - DUAL-WRITE IMPLEMENTATION
         *
         * PHASE 2 FIX: Implements "Dual-Write" submission pattern to eliminate Cloud Function lag.
         * Write 1: Full answer payload to secure answers/ node (for grading)
         * Write 2: CONCURRENT status update to public sessions/{pollId}/students/{studentKey} node
         *
         * Result: Teacher sees student turn "Green" INSTANTLY while backend grades securely in background.
         */
        async function submitAnswerToFirebase(pollId, questionIndex, answer, answerId, confidence, email, telemetry) {
            if (!firebaseDb) {
                console.warn('[Firebase] DB not initialized, skipping fast write');
                return null;
            }

            try {
                // Determine email if not provided
                var studentEmail = email || window.STUDENT_EMAIL || sessionStorage.getItem('veritas_student_email');
                if (!studentEmail) {
                    console.error('[Firebase] Cannot submit answer - no email found');
                    return null;
                }

                var responseId = generateUUID();
                var timestamp = new Date().toISOString();

                var payload = {
                    responseId: responseId,
                    pollId: pollId,
                    questionIndex: questionIndex,
                    answer: answer,
                    answerId: answerId,
                    studentEmail: studentEmail,
                    confidenceLevel: confidence || null,
                    timestamp: timestamp,
                    clientTimestamp: Date.now(),
                    // Capture Telemetry
                    timeOnQuestionMs: telemetry ? telemetry.timeOnQuestion : null,
                    usingCalculator: telemetry ? telemetry.usingCalculator : false,
                    activityStatus: telemetry ? telemetry.status : null
                };

                // Determine student key
                var key = studentKey || studentEmail.replace(/\./g, ',');
                if (!key) {
                    console.error('[Firebase] No student key available for submission');
                    return null;
                }

                // DUAL-WRITE IMPLEMENTATION
                // Write 1: Full answer payload to secure answers/ node (for grading via Cloud Function)
                var answerPath = 'answers/' + pollId + '/' + key;
                var answerWritePromise = firebaseDb.ref(answerPath).set(payload);

                // Write 2: CONCURRENT status update to public student node (for instant Teacher visibility)
                // This allows the Teacher to see "Submitted" status IMMEDIATELY without waiting for Cloud Function
                var studentStatusPath = 'sessions/' + pollId + '/students/' + key;
                var statusPayload = {
                    status: 'Submitted',
                    lastActive: firebase.database.ServerValue.TIMESTAMP,
                    lastSubmissionQuestionIndex: questionIndex,
                    lastSubmissionTimestamp: firebase.database.ServerValue.TIMESTAMP
                };
                var statusWritePromise = firebaseDb.ref(studentStatusPath).update(statusPayload);

                // Execute both writes concurrently for minimum latency
                await Promise.all([answerWritePromise, statusWritePromise]);

                console.log('[Firebase] DUAL-WRITE successful:');
                console.log('  - Answer path: ' + answerPath);
                console.log('  - Status path: ' + studentStatusPath);

                return { success: true, responseId: responseId, timestamp: timestamp };
            } catch (e) {
                console.error('[Firebase] Fast Answer Failed:', e);
                return null;
            }
        }

        // =============================================================================
        // STUDENT ACTIVITY TRACKER MODULE
        // =============================================================================

        /**
         * Activity Tracker - Singleton for tracking granular student activity
         */
        var ActivityTracker = (function () {
            var instance = null;

            function createInstance() {
                var activityBuffer = [];
                var currentPollId = null;
                var currentSessionId = null;
                var currentQuestionIndex = null;
                var questionStartTime = null;
                var lastAnswer = null;
                var focusState = document.hasFocus();
                var flushInterval = null;
                var FLUSH_INTERVAL_MS = 3000; // Send batch every 3 seconds
                var MAX_BUFFER_SIZE = 50; // Flush if buffer exceeds 50 events

                function init(pollId, sessionId, questionIndex) {
                    currentPollId = pollId;
                    currentSessionId = sessionId || '';
                    currentQuestionIndex = questionIndex;
                    questionStartTime = Date.now();
                    lastAnswer = null;

                    // Start periodic flush
                    if (!flushInterval) {
                        flushInterval = setInterval(flushActivities, FLUSH_INTERVAL_MS);
                    }

                    // Track focus events
                    if (!window._activityTrackerFocusAttached) {
                        window.addEventListener('focus', onFocusGained);
                        window.addEventListener('blur', onFocusLost);
                        window._activityTrackerFocusAttached = true;
                    }

                    // Record question view
                    recordActivity('QUESTION_VIEW', {
                        viewedAt: Date.now(),
                        questionIndex: questionIndex
                    });
                }

                function setQuestionStart(timestamp) {
                    questionStartTime = timestamp || Date.now();
                }

                function recordActivity(eventType, eventData) {
                    if (!currentPollId) return;

                    var activity = {
                        pollId: currentPollId,
                        sessionId: currentSessionId,
                        questionIndex: currentQuestionIndex !== undefined ? currentQuestionIndex : '',
                        eventType: eventType,
                        eventData: eventData || {},
                        clientTimestamp: new Date().toISOString()
                    };

                    activityBuffer.push(activity);

                    // Flush if buffer is full
                    if (activityBuffer.length >= MAX_BUFFER_SIZE) {
                        flushActivities();
                    }
                }

                function recordAnswerSelected(answer, isChange) {
                    var eventType = isChange ? 'ANSWER_CHANGED' : 'ANSWER_SELECTED';
                    var timeOnQuestion = questionStartTime ? Date.now() - questionStartTime : 0;

                    recordActivity(eventType, {
                        answer: answer,
                        previousAnswer: lastAnswer,
                        timeOnQuestionMs: timeOnQuestion
                    });

                    lastAnswer = answer;
                }

                function recordAnswerSubmitted(answer, confidenceLevel) {
                    var timeOnQuestion = questionStartTime ? Date.now() - questionStartTime : 0;

                    recordActivity('ANSWER_SUBMITTED', {
                        answer: answer,
                        confidenceLevel: confidenceLevel || null,
                        timeOnQuestionMs: timeOnQuestion,
                        totalTimeMs: timeOnQuestion
                    });
                }

                function recordOptionClick(optionIndex, optionText) {
                    recordActivity('OPTION_CLICKED', {
                        optionIndex: optionIndex,
                        optionText: optionText
                    });
                }

                function onFocusGained() {
                    focusState = true;
                    recordActivity('FOCUS_GAINED', {
                        timestamp: Date.now()
                    });
                }

                function onFocusLost() {
                    focusState = false;
                    recordActivity('FOCUS_LOST', {
                        timestamp: Date.now()
                    });
                }

                async function flushActivities() {
                    if (activityBuffer.length === 0 || !firebaseDb) return;

                    var toSend = activityBuffer.slice();
                    activityBuffer = [];

                    var pollId = currentFirebasePollId || (toSend.length > 0 ? toSend[0].pollId : null);
                    if (!pollId || !studentKey) {
                        // Restore buffer if we can't send yet
                        activityBuffer = toSend.concat(activityBuffer);
                        return;
                    }

                    try {
                        var activitiesRef = firebaseDb.ref('sessions/' + pollId + '/activities/' + studentKey);
                        var updates = {};
                        toSend.forEach(function (activity) {
                            var newKey = activitiesRef.push().key;
                            updates[newKey] = activity;
                        });

                        await activitiesRef.update(updates);
                        console.log('[ActivityTracker] (Firebase) Flushed ' + toSend.length + ' events');
                    } catch (error) {
                        console.error('[ActivityTracker] Firebase Flush failed:', error);
                        // Re-add to buffer on failure (at front)
                        activityBuffer = toSend.concat(activityBuffer);
                    }
                }

                function reset() {
                    flushActivities(); // Flush before reset
                    currentPollId = null;
                    currentSessionId = null;
                    currentQuestionIndex = null;
                    questionStartTime = null;
                    lastAnswer = null;
                }

                function destroy() {
                    if (flushInterval) {
                        clearInterval(flushInterval);
                        flushInterval = null;
                    }
                    flushActivities(); // Final flush
                }

                return {
                    init: init,
                    setQuestionStart: setQuestionStart,
                    recordActivity: recordActivity,
                    recordAnswerSelected: recordAnswerSelected,
                    recordAnswerSubmitted: recordAnswerSubmitted,
                    recordOptionClick: recordOptionClick,
                    flushActivities: flushActivities,
                    reset: reset,
                    destroy: destroy
                };
            }

            return {
                getInstance: function () {
                    if (!instance) {
                        instance = createInstance();
                    }
                    return instance;
                }
            };
        })();

        // Global shorthand
        var activityTracker = ActivityTracker.getInstance();

        // =============================================================================
        // END ACTIVITY TRACKER
        // =============================================================================

        function updateDebugHud(status, connected, pollId) {
            // Debug HUD disabled - can be enabled by removing this return
            return;
            // if (!FIREBASE_CONFIG) return;

            var hud = document.getElementById('firebase-debug-hud');
            if (!hud) {
                hud = document.createElement('div');
                hud.id = 'firebase-debug-hud';
                hud.style.cssText = 'position:fixed;bottom:10px;left:10px;background:rgba(0,0,0,0.95);color:#4ade80;font-family:monospace;font-size:11px;padding:12px;z-index:9999;pointer-events:none;max-width:350px;border:2px solid #4ade80;border-radius:8px;';
                document.body.appendChild(hud);
            }

            // We store state on the DOM element dataset for merging updates
            if (status !== undefined && status !== null) hud.dataset.status = status;
            if (connected !== undefined && connected !== null) hud.dataset.connected = connected;
            if (pollId !== undefined && pollId !== null) hud.dataset.pollId = pollId;

            var currentStatus = hud.dataset.status || 'UNKNOWN';
            var isConnected = hud.dataset.connected === 'true';
            var currentPollId = hud.dataset.pollId || 'N/A';

            var connDot = isConnected ? '<span style="color:#4ade80">●</span>' : '<span style="color:#f87171">●</span>';
            var html = '<strong style="color:#fff">🔥 FIREBASE DEBUG (STUDENT)</strong><br>';
            html += connDot + ' <strong>.info/connected:</strong> ' + isConnected + '<br>';
            html += '<strong>PollId (sessionKey):</strong> ' + currentPollId + '<br>';
            html += '<strong>StudentKey:</strong> ' + (studentKey ? studentKey.substring(0, 12) + '...' : 'N/A') + '<br>';

            var statusColor = currentStatus === 'LOCKED' ? '#f87171' : currentStatus === 'ACTIVE' ? '#4ade80' : '#facc15';
            html += '<strong>RTDB Status:</strong> <span style="color:' + statusColor + '">' + currentStatus + '</span><br>';

            // Show last violation reason
            var lockReason = '';
            try {
                lockReason = sessionStorage.getItem('lock_reason') || 'None';
            } catch (e) {
                lockReason = 'N/A';
            }
            html += '<strong>Last violation:</strong> ' + lockReason;

            hud.innerHTML = html;
        }

        function handleRemoteStatusChange(statusData) {
            console.log('[Firebase] Remote status update:', statusData);

            // SYNC SPINE FIX: Handle both legacy string status and proper object status
            // The status can be either a string 'LOCKED'/'ACTIVE' (legacy) or an object {status: 'LOCKED', ...}
            var statusValue;
            if (typeof statusData === 'string') {
                statusValue = statusData;
            } else if (statusData && typeof statusData === 'object') {
                statusValue = statusData.status;
            } else {
                console.warn('[Firebase] Invalid status data received:', statusData);
                return;
            }

            if (statusValue === 'LOCKED') {
                // Server commanded lock
                if (!LockManager.isLocked()) {
                    var lockReason = (statusData && statusData.lastViolationReason) || 'Teacher Remote Lock';
                    LockManager.lock(lockReason);
                }
            } else if (statusValue === 'ACTIVE' || statusValue === 'AWAITING_FULLSCREEN') {
                // Teacher signalled unlock
                // IMPLEMENTATION FIX: Check both LockManager and Poison Pill state
                var isLocked = LockManager.isLocked() || isPoisonPillActive();

                if (isLocked) {
                    console.log('[Firebase] Unlock signal received - checking server for AWAITING_FULLSCREEN');
                    // FIX: Explicitly call checkProctorState immediately
                    // This bypasses the polling delay and handles the 'resume' flow
                    checkProctorState();
                } else {
                    console.log('[Firebase] Unlock signal received but not locally locked - ignoring');
                }
            } else if (statusValue === 'DISCONNECTED') {
                // Student was disconnected - this should trigger reconnection logic
                console.log('[Firebase] Detected DISCONNECTED state - will recover on reconnect');
            }
        }

        function reportFirebaseViolation(reason, pollId) {
            // P0-4 FIX: Store lock reason in sessionStorage
            if (reason) {
                sessionStorage.setItem('lock_reason', reason);
            }

            // Extract pollId from available sources if not provided
            var activePollId = pollId ||
                (currentPollState && currentPollState.pollId) ||
                (secureLobbyContext && secureLobbyContext.pollId) ||
                window.currentPollId;

            // FALLBACK: Check sessionStorage
            if (!activePollId) {
                try {
                    activePollId = sessionStorage.getItem('veritas_active_poll_id');
                } catch (e) { /* Storage may be unavailable */ }
            }

            if (firebaseRef) {
                // schema-fix: Update the OBJECT, do not overwrite with string 'LOCKED'.
                // Using update() to preserve other fields like name, email, lockVersion.
                firebaseRef.update({
                    status: 'LOCKED',
                    lastViolationReason: reason,
                    lastViolationAt: firebase.database.ServerValue.TIMESTAMP
                }).catch(function (err) {
                    console.error('[Firebase] Failed to report violation lock:', err);
                });

                // P0-3 FIX: Store violation reason in separate RTDB node for teacher visibility
                if (reason && activePollId && (window.studentKey || studentKey)) {
                    var sKey = window.studentKey || studentKey;
                    var violationsRef = firebaseDb.ref('sessions/' + activePollId + '/violations/' + sKey);
                    violationsRef.push({ // Use push for history
                        reason: reason,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                }
            } else if (firebaseDb && activePollId && (window.studentKey || studentKey)) {
                // Lazy-init ref if missing (e.g. strict mode violation before full init)
                var sKey = window.studentKey || studentKey;
                var path = 'sessions/' + activePollId + '/students/' + sKey;
                firebaseRef = firebaseDb.ref(path);
                // Retry update
                reportFirebaseViolation(reason, activePollId);
            } else {
                console.log('[Firebase] RTDB Ref not ready - relying on Cloud Function for violation report');
            }

            updateDebugHud('LOCKED', null, activePollId);
        }

        // ================================
        // UNIFIED ACTIVITY MONITOR
        // ================================
        var ActivityMonitor = (function () {
            var instance;

            function create() {
                var lastInteraction = Date.now();
                var currentQuestionStart = Date.now();
                var isCalculatorActive = false;

                function markInteraction() {
                    lastInteraction = Date.now();
                }

                function setQuestionStart(timestamp) {
                    currentQuestionStart = timestamp || Date.now();
                }

                function setCalculatorState(active) {
                    isCalculatorActive = !!active;
                }

                function getTelemetry() {
                    var now = Date.now();
                    var idleMs = now - lastInteraction;
                    var status = idleMs > 30000 ? 'IDLE' : (isCalculatorActive ? 'CALCULATOR' : 'ACTIVE');
                    return {
                        status: status,
                        lastInteraction: lastInteraction,
                        currentQuestionStart: currentQuestionStart,
                        timeOnQuestion: Math.max(0, now - currentQuestionStart),
                        usingCalculator: isCalculatorActive
                    };
                }

                function attachListeners() {
                    ['click', 'mousemove', 'keydown', 'touchstart'].forEach(function (evt) {
                        document.addEventListener(evt, markInteraction, { passive: true });
                    });
                    var calcFrame = document.getElementById('calc-iframe');
                    if (calcFrame) {
                        calcFrame.addEventListener('focus', function () { setCalculatorState(true); markInteraction(); });
                        calcFrame.addEventListener('blur', function () { setCalculatorState(false); });
                    }
                }

                attachListeners();

                return {
                    markInteraction: markInteraction,
                    setQuestionStart: setQuestionStart,
                    setCalculatorState: setCalculatorState,
                    getTelemetry: getTelemetry
                };
            }

            return {
                getInstance: function () {
                    if (!instance) {
                        instance = create();
                    }
                    return instance;
                }
            };
        })();

        // Resilience Guard: Wrap external dependency initializations in try-catch
        var secureCountdownController = null;
        var secureSessionHeartbeat = null;
        var secureFullscreenManager = null;

        try {
            if (window.SecureAssessmentShared) {
                secureCountdownController = window.SecureAssessmentShared.createCountdown({
                    onTick: function (seconds) {
                        updateSecureTimerDisplay(seconds);
                    },
                    onExpire: function () {
                        handleSecureTimeExpiry();
                    }
                });
                secureSessionHeartbeat = window.SecureAssessmentShared.createHeartbeat({
                    intervalMs: 3500,
                    onBeat: function () {
                        pollForIndividualSessionState();
                    }
                });
                secureFullscreenManager = window.SecureAssessmentShared.createFullscreenManager(document, {
                    onChange: handleSecureFullscreenChange
                });
            } else {
                console.error('[Proctor] SecureAssessmentShared dependency is missing. Secure features will be disabled.');
            }
        } catch (e) {
            console.error('[Proctor] Failed to initialize SecureAssessmentShared modules:', e);
        }

        // Local session state guards (prevent UI rewind)
        var lastSubmittedQuestionIndex = null;
        var pendingMetacogQuestionIndex = null;
        var metacogSubmittedFor = null;

        if (timerVisibilityToggle) {
            timerVisibilityToggle.addEventListener('click', function () {
                timerHidden = !timerHidden;
                applyTimerVisibility();
            });
        }

        applyTimerVisibility();
        var secureSessionActive = false;
        var secureQuestionState = null;
        var secureSelectedOptionIndex = null;
        var secureCurrentQuestionKey = null;
        var secureSubmitting = false;
        var secureTimeExpired = false;
        var securePollInFlight = false;
        var secureMetacognitionEnabled = false;
        var securePendingAnswerText = null;

        // =============================================================================
        // SOVEREIGN STATE MANAGEMENT (Novel Approach)
        // =============================================================================

        var ViewManager = {
            views: [
                'entry-screen',
                'secure-lobby',
                'status-container',
                'pre-live-card',
                'student-container',
                'question-container',
                'individual-timed-session',
                'student-loader'
            ],
            show: function (viewId) {
                var self = this;

                // Special handling: 'student-container' wraps 'question-container', 'pre-live-card', etc.
                // If showing a child of student-container, we must also show student-container
                var isStudentContent = ['question-container', 'pre-live-card', 'status-container'].indexOf(viewId) !== -1;

                this.views.forEach(function (id) {
                    var el = document.getElementById(id);
                    if (!el) return;

                    if (id === viewId) {
                        el.style.display = 'block';
                        el.classList.remove('hidden');
                    } else if (id === 'student-container' && isStudentContent) {
                        // Ensure parent container is visible
                        el.style.display = 'block';
                        el.classList.remove('hidden');
                    } else {
                        el.style.display = 'none';
                        el.classList.add('hidden');
                    }
                });
                console.log('[ViewManager] Active View:', viewId);
            }
        };

        // Global Error Trapping
        window.onerror = function (msg, url, line, col, error) {
            var debugContent = document.getElementById('debug-content');
            if (debugContent) {
                var timestamp = new Date().toLocaleTimeString();
                debugContent.innerHTML += `\n[${timestamp}] ERROR: ${msg}\nLine: ${line}`;

                // Auto-show debug overlay on critical errors if safe
                var overlay = document.getElementById('debug-overlay');
                if (overlay && msg.indexOf('ScriptError') === -1) { // Ignore common script interruptions
                    overlay.classList.remove('hidden');
                }
            }
            return false;
        };

        var LockManager = {
            isLocked: function () {
                try {
                    return sessionStorage.getItem('veritas_lock_active') === 'true';
                } catch (e) { return false; }
            },
            lock: function (reason) {
                console.warn('[LockManager] LOCKING:', reason);
                try {
                    sessionStorage.setItem('veritas_lock_active', 'true');
                    sessionStorage.setItem('lock_reason', reason || 'unknown');
                } catch (e) { }

                this.renderLockScreen(reason);

                // FIX: Report violation with proper error handling and retry logic
                // Use robust pollId resolution with sessionStorage fallback
                var activePollId = (typeof currentPollState !== 'undefined' && currentPollState && currentPollState.pollId) ||
                    (typeof secureLobbyContext !== 'undefined' && secureLobbyContext && secureLobbyContext.pollId) ||
                    (typeof secureQuestionState !== 'undefined' && secureQuestionState && secureQuestionState.pollId) ||
                    window.currentPollId;

                // CRITICAL FALLBACK: Check sessionStorage for pollId
                if (!activePollId) {
                    try {
                        activePollId = sessionStorage.getItem('veritas_active_poll_id');
                    } catch (e) { /* Storage may be unavailable */ }
                }

                if (!activePollId) {
                    console.error('[LockManager] CRITICAL: No pollId available for violation report!');
                    return;
                }

                // Update Firebase immediately for instant teacher feedback
                if (typeof reportFirebaseViolation === 'function') {
                    reportFirebaseViolation(reason, activePollId);
                }

                // CRITICAL FIX: Get fallback email for robust student identification
                // This ensures violations are attributed correctly even if SESSION_TOKEN is lost
                var fallbackEmail = window.STUDENT_EMAIL || '';
                if (!fallbackEmail) {
                    try {
                        fallbackEmail = sessionStorage.getItem('veritas_student_email') || '';
                    } catch (e) { /* Storage may be unavailable */ }
                }

                // No longer calling GAS reportStudentViolation as Firebase RTDB write (above)
                // is the new authoritative source and triggers teacher visibility.
                console.log('[LockManager] Violation reported via Firebase path');
            },
            unlock: function () {
                console.log('[LockManager] UNLOCKING');
                try {
                    sessionStorage.removeItem('veritas_lock_active');
                    sessionStorage.removeItem('lock_reason');
                } catch (e) { }
                hideLockEnforcementUI();
            },
            renderLockScreen: function (reason) {
                // Use the new Hybrid UI - pass reason to showLockEnforcementUI
                showLockEnforcementUI(reason);
            }
        };

        // =============================================================================
        // ZERO TOLERANCE PROCTORING - Helper Functions
        // =============================================================================

        /**
         * Determines if proctoring should be enabled for the session
         * Returns true if sessionType === 'SECURE_ASSESSMENT' OR metadata.liveProctoring === true
         * @param {Object} metadata - Session metadata containing sessionType and liveProctoring flag
         * @returns {boolean} True if proctoring should be enabled
         */
        function shouldEnableProctoring(metadata) {
            if (!metadata) return false;
            // Check for secure assessment
            var sessionType = (metadata.sessionType || '').toString().toUpperCase();
            if (sessionType === 'SECURE_ASSESSMENT' || sessionType === 'SECURE') {
                return true;
            }
            // Check for live proctoring enabled on Live Poll
            if (metadata.liveProctoring === true) {
                return true;
            }
            return false;
        }

        /**
         * AGGRESSIVE LOCKING - Zero Tolerance Implementation
         * Immediately locks the session with no grace period, no warnings.
         * - Hides question UI
         * - Shows red "LOCKED" overlay
         * - Persists lock to sessionStorage to prevent refresh bypass ("Poison Pill")
         * - Sends priority violation report to server
         * @param {string} reason - The violation reason (e.g., 'exit-fullscreen', 'tab-blur')
         */
        function lockSession(reason) {
            console.log('[Proctor] LOCK SESSION triggered:', reason);

            // IMMEDIATELY block all interaction
            isInteractionBlocked = true;
            violationLogged = true;

            // POISON PILL: Persist lock state to sessionStorage to prevent refresh bypass
            // This key MUST be checked at the top of startPolling() and updateStudentView()
            // The ONLY way to clear this is when server sends unlock_granted: true
            try {
                sessionStorage.setItem('veritas_lock_active', 'true');
                sessionStorage.setItem('is_locally_locked', 'true');
                sessionStorage.setItem('lock_reason', reason || 'violation');
                sessionStorage.setItem('lock_timestamp', Date.now().toString());
            } catch (e) {
                console.warn('[Proctor] Could not persist lock to sessionStorage:', e);
            }

            // Hide question UI - prevent seeing answers during lock
            if (secureOptionsList) {
                secureOptionsList.style.visibility = 'hidden';
            }
            if (secureQuestionText) {
                secureQuestionText.style.visibility = 'hidden';
            }
            if (secureQuestionImage) {
                secureQuestionImage.style.visibility = 'hidden';
            }

            // Show lock overlay with professional messaging
            showLockEnforcementUI();

            // Send priority violation report to server
            var activePollId = (currentPollState && currentPollState.pollId) ||
                (secureLobbyContext && secureLobbyContext.pollId) ||
                (secureQuestionState && secureQuestionState.pollId);

            // CRITICAL FIX: Get fallback email for robust student identification
            var fallbackEmail = window.STUDENT_EMAIL || '';
            try { fallbackEmail = sessionStorage.getItem('veritas_student_email') || ''; } catch (e) { }


            if (activePollId) {
                const reportViolation = firebase.functions().httpsCallable('reportStudentViolation');
                reportViolation({
                    pollId: activePollId,
                    studentEmail: fallbackEmail,
                    reason: reason || 'session-locked'
                })
                    .then(function (result) {
                        console.log('[Proctor] Lock violation reported to Firebase:', result.data);
                        if (result.data && result.data.success) {
                            currentLockVersion = result.data.lockVersion;
                        }
                        // Start/Ensure Firebase listener is active
                        initProctorListener(activePollId, fallbackEmail);
                    })
                    .catch(function (error) {
                        console.error('[Proctor] Failed to report violation to Firebase:', error);
                        initProctorListener(activePollId, fallbackEmail);
                    });
            }
        }

        /**
         * Check if session was locked before (e.g., page refresh bypass attempt)
         * Called on page load to restore lock state
         * POISON PILL: Uses veritas_lock_active which can ONLY be cleared by server unlock_granted
         */
        function checkForPersistedLock() {
            try {
                // PRIMARY CHECK: veritas_lock_active is the "Poison Pill" key
                var poisonPillActive = sessionStorage.getItem('veritas_lock_active');
                var isLocked = sessionStorage.getItem('is_locally_locked');

                if (poisonPillActive === 'true' || isLocked === 'true') {
                    var lockReason = sessionStorage.getItem('lock_reason') || 'previous-violation';
                    console.log('[Proctor] POISON PILL ACTIVE - Restoring lock state from sessionStorage:', lockReason);
                    isInteractionBlocked = true;
                    violationLogged = true;
                    showLockEnforcementUI();
                    // Start proctor polling to wait for server unlock
                    startProctorPolling();
                    return true;
                }
            } catch (e) {
                console.warn('[Proctor] Could not check sessionStorage for lock:', e);
            }
            return false;
        }

        /**
         * Clear the persisted lock state (called ONLY when server sends unlock_granted: true)
         * This is the ONLY "antidote" to the Poison Pill
         */
        function clearPersistedLock() {
            try {
                console.log('[Proctor] ANTIDOTE - Clearing Poison Pill lock state');
                sessionStorage.removeItem('veritas_lock_active');
                sessionStorage.removeItem('is_locally_locked');
                sessionStorage.removeItem('lock_reason');
                sessionStorage.removeItem('lock_timestamp');
            } catch (e) {
                console.warn('[Proctor] Could not clear lock from sessionStorage:', e);
            }
        }

        /**
    * POISON PILL CHECK - Uses both sessionStorage and localStorage for maximum persistence
    */
        function isPoisonPillActive() {
            try {
                return sessionStorage.getItem('veritas_lock_active') === 'true';
            } catch (e) {
                return false;
            }
        }

        /**
         * Set the persistent lock state
         */
        function setPoisonPill(active) {
            try {
                if (active) {
                    sessionStorage.setItem('veritas_lock_active', 'true');
                } else {
                    sessionStorage.removeItem('veritas_lock_active');
                }
            } catch (e) {
                console.error('Failed to set poison pill', e);
            }
        }

        // =============================================================================
        // STORE-AND-FORWARD DATA LAYER - AnswerQueue
        // =============================================================================

        /**
         * AnswerQueue - Guarantees exam integrity by storing answers locally before sync
         * Uses localStorage for persistence across network failures
         * Implements optimistic UI with background sync
         */
        var AnswerQueue = (function () {
            var QUEUE_PREFIX = 'veritas_queue_';
            var SYNC_INTERVAL = 2000; // 2 seconds
            var syncIntervalId = null;
            var isSyncing = false;

            /**
             * Get the localStorage key for the current session
             */
            function getQueueKey(sessionId) {
                return QUEUE_PREFIX + (sessionId || 'default');
            }

            /**
             * Read the queue from localStorage
             */
            function readQueue(sessionId) {
                try {
                    var key = getQueueKey(sessionId);
                    var raw = localStorage.getItem(key);
                    if (raw) {
                        return JSON.parse(raw);
                    }
                } catch (e) {
                    console.error('[AnswerQueue] Failed to read queue:', e);
                }
                return [];
            }

            /**
             * Write the queue to localStorage
             */
            function writeQueue(sessionId, queue) {
                try {
                    var key = getQueueKey(sessionId);
                    localStorage.setItem(key, JSON.stringify(queue));
                } catch (e) {
                    console.error('[AnswerQueue] Failed to write queue:', e);
                }
            }

            /**
             * Push an answer to the queue
             * @param {Object} payload - Answer payload (pollId, sessionId, questionIndex, answer, confidenceLevel)
             */
            function push(payload) {
                if (!payload || !payload.sessionId) {
                    console.warn('[AnswerQueue] Cannot push without sessionId');
                    return;
                }
                var queue = readQueue(payload.sessionId);
                // Add metadata for tracking
                payload.queuedAt = Date.now();
                payload.syncAttempts = 0;
                queue.push(payload);
                writeQueue(payload.sessionId, queue);
                console.log('[AnswerQueue] Answer queued:', payload.actualQuestionIndex);
            }

            /**
             * Get pending items count
             */
            function getPendingCount(sessionId) {
                return readQueue(sessionId).length;
            }

            /**
             * Process and sync queued answers to server
             * Called periodically by sync loop
             */
            function syncToServer(sessionId, onSuccess, onError) {
                if (isSyncing) {
                    console.log('[AnswerQueue] Sync already in progress, skipping');
                    return;
                }

                var queue = readQueue(sessionId);
                if (queue.length === 0) {
                    return;
                }

                isSyncing = true;
                var item = queue[0]; // Process first item (FIFO)
                item.syncAttempts = (item.syncAttempts || 0) + 1;

                console.log('[AnswerQueue] Syncing answer:', item.actualQuestionIndex, 'attempt:', item.syncAttempts);

                // FIXED: Write directly to Firebase
                var email = window.STUDENT_EMAIL || sessionStorage.getItem('veritas_student_email');
                var emailKey = email ? email.replace(/[.$#[\]]/g, '_') : 'unknown';

                firebase.database().ref('answers/' + item.pollId + '/' + emailKey).set({
                    answer: item.answer,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    questionIndex: item.actualQuestionIndex,
                    confidence: item.confidenceLevel,
                    pollId: item.pollId,
                    sessionId: item.sessionId
                }).then(function () {
                    if (onSuccess) onSuccess({ success: true }, item);
                }).catch(function (err) {
                    if (onError) onError(err, item);
                });
            }

            /**
             * Start the background sync loop
             */
            function startSyncLoop(sessionId, onSuccess, onError) {
                if (syncIntervalId) {
                    console.log('[AnswerQueue] Sync loop already running');
                    return;
                }
                console.log('[AnswerQueue] Starting sync loop for session:', sessionId);
                syncIntervalId = setInterval(function () {
                    syncToServer(sessionId, onSuccess, onError);
                }, SYNC_INTERVAL);
            }

            /**
             * Stop the sync loop
             */
            function stopSyncLoop() {
                if (syncIntervalId) {
                    clearInterval(syncIntervalId);
                    syncIntervalId = null;
                    console.log('[AnswerQueue] Sync loop stopped');
                }
            }

            /**
             * Clear the queue for a session (e.g., when session ends)
             */
            function clear(sessionId) {
                try {
                    var key = getQueueKey(sessionId);
                    localStorage.removeItem(key);
                    console.log('[AnswerQueue] Queue cleared for session:', sessionId);
                } catch (e) {
                    console.error('[AnswerQueue] Failed to clear queue:', e);
                }
            }

            // Public API
            return {
                push: push,
                getPendingCount: getPendingCount,
                syncToServer: syncToServer,
                startSyncLoop: startSyncLoop,
                stopSyncLoop: stopSyncLoop,
                clear: clear,
                readQueue: readQueue
            };
        })();

        function getModeName() {
            return secureSessionActive ? 'Assessment' : 'Poll';
        }

        function getModeNameLowerCase() {
            return secureSessionActive ? 'assessment' : 'poll';
        }

        function getFullModeName() {
            return secureSessionActive ? 'Secure Assessment' : 'Live Poll';
        }

        function setSecureChromeState(isActive) {
            if (studentModeLabel) {
                studentModeLabel.textContent = isActive ? 'Secure Assessment' : 'Live Poll';
            }
            if (secureTopbarTimer) {
                secureTopbarTimer.classList.toggle('hidden', !isActive);
                // Defensive: Ensure timer is visible and has initial content
                if (isActive && secureCountdownEl) {
                    secureCountdownEl.textContent = lastTimerDisplay || '00:00';
                }
            }
        }

        function formatTime(seconds) {
            var minutes = Math.floor(seconds / 60);
            var remainingSeconds = seconds % 60;
            return ('0' + minutes).slice(-2) + ':' + ('0' + remainingSeconds).slice(-2);
        }

        function updateQuestionProgress(currentIndex, totalQuestions) {
            if (!questionProgressEl) return;
            var parsedIndex = typeof currentIndex === 'number' ? currentIndex : parseInt(currentIndex, 10);
            var parsedTotal = typeof totalQuestions === 'number' ? totalQuestions : parseInt(totalQuestions, 10);

            // Fix: Handle '?' and ensure 1-based indexing
            var safeIndex = isNaN(parsedIndex) ? 0 : Math.max(0, parsedIndex);
            var safeTotal = isNaN(parsedTotal) || parsedTotal <= 0 ? '?' : Math.max(1, parsedTotal);

            questionProgressEl.textContent = 'QUESTION ' + (safeIndex + 1) + ' OF ' + safeTotal;

            // Ensure visibility
            questionProgressEl.classList.remove('hidden');
        }

        function deriveSecureQuestionKey(state) {
            if (!state || !state.question) {
                return null;
            }
            if (state.question.id) {
                return state.question.id;
            }
            if (state.question.questionId) {
                return state.question.questionId;
            }
            if (typeof state.actualQuestionIndex === 'number') {
                return (state.pollId || 'poll') + ':' + state.actualQuestionIndex;
            }
            return (state.pollId || 'poll') + ':' + (state.progressIndex || 0);
        }

        function toggleSecureLayout(active) {
            if (!bodyEl) return;
            bodyEl.classList.toggle('secure-mode-active', !!active);
        }

        function hideExitControls() {
            if (!secureExitControls) return;
            secureExitControls.classList.add('hidden');
        }

        function showExitControls(label, description) {
            if (!secureExitControls) return;
            secureExitControls.classList.remove('hidden');
            if (secureExitLabel) {
                secureExitLabel.textContent = label || 'Exit Session';
            }
            if (secureExitDescription) {
                secureExitDescription.textContent = description || 'Exit fullscreen and close this tab when you are finished.';
            }
        }

        function setSecureConnectionIndicatorVisible(visible) {
            if (!secureConnectionIndicator) return;
            if (visible) {
                secureConnectionIndicator.classList.remove('hidden');
            } else {
                secureConnectionIndicator.classList.add('hidden');
            }
        }

        function syncSecureOptionSelection() {
            if (!secureOptionsList) return;
            var buttons = secureOptionsList.querySelectorAll('button.secure-answer-option');
            buttons.forEach(function (btn) {
                var btnIndex = parseInt(btn.dataset.optionIndex, 10);
                var selected = btnIndex === secureSelectedOptionIndex;
                btn.classList.toggle('answer-option-selected', selected);
                btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
        }

        function showIndividualTimedView(state) {
            // FIX TASK B: LOCK GUARD - If locked, do not show question view
            // This prevents lock bypass via view updates or server state changes
            if (LockManager.isLocked()) {
                console.log('[Proctor] showIndividualTimedView BLOCKED - Lock active');
                LockManager.renderLockScreen(sessionStorage.getItem('lock_reason'));
                return; // HALT RENDER - SECURITY BLOCK
            }

            // FIX: Force hide ALL other screens to prevent "Start Screen Leak" cheating risk
            hideSecureLobby();
            if (studentLoader) studentLoader.style.display = 'none';
            if (entryScreen) entryScreen.style.display = 'none';
            if (secureLobbyCard) secureLobbyCard.style.display = 'none';
            studentContainer.style.display = 'block';
            questionContainer.style.display = 'none';
            statusContainer.style.display = 'none';
            if (preLiveCard) preLiveCard.style.display = 'none';
            if (secureFocusContainer) secureFocusContainer.style.display = 'block';

            // FIX: SCROLL LOCK - Prevent scrolling to any leaked content
            document.body.style.overflow = 'hidden';

            toggleSecureLayout(true);
            if (!secureSessionActive) {
                secureSessionActive = true;
                secureSessionHeartbeat.start(true);
            }
            setSecureChromeState(true);

            // Sync calculator visibility based on server state
            syncCalculatorVisibility(state.calculatorEnabled);

            // FIX: Explicitly show timer container - defensive check
            if (secureTopbarTimer) {
                secureTopbarTimer.classList.remove('hidden');
            }

            hideSecureOverlay();
            setSecureConnectionIndicatorVisible(true);
            attachProctorVisibilityListeners();
            secureQuestionState = state;

            // CRITICAL: Persist pollId for violation reporting (secure question path)
            if (state && state.pollId) {
                window.currentPollId = state.pollId;
                try {
                    sessionStorage.setItem('veritas_active_poll_id', state.pollId);
                } catch (e) { /* Storage may be unavailable */ }
            }

            if (entryScreen) entryScreen.style.display = 'none';
            if (secureLobbyCard) secureLobbyCard.style.display = 'none';
            var nextQuestionKey = deriveSecureQuestionKey(state);
            var isNewQuestion = secureCurrentQuestionKey !== nextQuestionKey;
            secureCurrentQuestionKey = nextQuestionKey;
            if (isNewQuestion) {
                secureSelectedOptionIndex = null;
                securePendingAnswerText = null;
                secureMetacognitionEnabled = false;
                hideSecureConfidencePrompt();
                ActivityMonitor.getInstance().setQuestionStart(Date.now());
            }
            secureSubmitting = false;
            secureTimeExpired = false;
            disableSecureOptions(false);

            // FIX: More robust question progress with debug logging
            if (questionProgressEl) {
                var progressIdx = typeof state.progressIndex === 'number'
                    ? state.progressIndex
                    : (typeof state.currentQuestionIndex === 'number' ? state.currentQuestionIndex : 0);
                var totalCount = typeof state.totalQuestions === 'number'
                    ? state.totalQuestions
                    : (state.question && state.question.options ? state.question.options.length : 1);
                console.log('[Secure] Question progress:', { progressIdx: progressIdx, totalCount: totalCount, state: state });
                questionProgressEl.textContent = 'QUESTION ' + (progressIdx + 1) + ' OF ' + totalCount;
            } else {
                console.warn('[Secure] questionProgressEl not found');
            }

            renderSecureQuestion(state);
            startSecureCountdown(state.timeRemainingSeconds || 0);
            updateSecureConnectionIndicators(state);
        }

        function renderSecureQuestion(state) {
            if (!state) return;

            // FIX TASK B: LOCK GUARD - If locked, do not render question content
            // This prevents lock bypass via question navigation or view refresh
            if (LockManager.isLocked()) {
                console.log('[Proctor] renderSecureQuestion BLOCKED - Lock active');
                LockManager.renderLockScreen(sessionStorage.getItem('lock_reason'));
                return; // HALT RENDER - SECURITY BLOCK
            }

            // Capture metacognition setting for this question
            secureMetacognitionEnabled = !!(state.question && state.question.metacognitionEnabled);
            var progressValue = typeof state.progressIndex === 'number'
                ? state.progressIndex
                : (typeof state.currentQuestionIndex === 'number' ? state.currentQuestionIndex : 0);
            var totalValue = typeof state.totalQuestions === 'number' ? state.totalQuestions : (state.question && state.question.options ? state.question.options.length : 0);
            if (secureProgressLabel) {
                secureProgressLabel.textContent = 'Question ' + (progressValue + 1) + ' of ' + totalValue;
            }
            updateQuestionProgress(progressValue, totalValue);
            if (secureQuestionText) {
                // Render HTML if available, otherwise text
                var html = state.question.html || state.question.questionText || '';
                secureQuestionText.innerHTML = renderRichText(html);
                secureQuestionText.className = 'ql-editor'; // Apply Quill styling
                secureQuestionText.style.padding = '0'; // Reset padding as ql-editor has its own
            }
            if (secureQuestionSubline) {
                secureQuestionSubline.classList.add('hidden');
                secureQuestionSubline.textContent = '';
            }
            if (secureQuestionImage) {
                if (state.question.questionImageURL) {
                    secureQuestionImage.src = state.question.questionImageURL;
                    secureQuestionImage.style.display = 'block';
                } else {
                    secureQuestionImage.style.display = 'none';
                }
            }
            var secureHasImage = !!state.question.questionImageURL;
            if (secureQuestionLayout) {
                secureQuestionLayout.classList.toggle('no-image', !secureHasImage);
            }
            if (secureQuestionVisual) {
                secureQuestionVisual.style.display = secureHasImage ? 'flex' : 'none';
            }
            if (secureOptionsList) {
                secureOptionsList.innerHTML = '';
                var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                var options = Array.isArray(state.question.options) ? state.question.options : [];
                options.forEach(function (option, index) {
                    secureOptionsList.appendChild(buildSecureOption(option, index, letters.charAt(index) || '#'));
                });
                syncSecureOptionSelection();
            }
            updateSecureSubmitState();
        }

        function buildSecureOption(option, index, letter) {
            // Check for REVEAL state from global or state context
            // Helper to find correctness
            var isCorrect = option.isCorrect === true;
            var isRevealed = (secureQuestionState && secureQuestionState.sessionStatus === 'REVEAL') ||
                (secureQuestionState && secureQuestionState.question && secureQuestionState.question.resultsVisibility === 'REVEALED');

            var li = document.createElement('li');
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'answer-option secure-answer-option relative w-full text-left';

            // REVEAL LOGIC: Highlight correct answer
            if (isRevealed) {
                button.disabled = true; // Disable interaction
                if (isCorrect) {
                    button.classList.add('ring-2', 'ring-green-500', 'bg-green-50', 'dark:bg-green-900/20');
                } else {
                    button.classList.add('opacity-75');
                }
            }

            button.dataset.optionIndex = index;
            button.setAttribute('aria-pressed', 'false');
            var displayText = (option && option.text) ? option.text.toString() : '';
            // Rich Text Handling
            var displayHtml = (option && option.html) ? renderRichText(option.html) : escapeHtml(displayText).replace(/\n/g, '<br>');

            var content = '';
            if (option && option.imageURL) {
                content += '<img src="' + escapeHtml(option.imageURL) + '" alt="Answer ' + letter + '" class="option-image" referrerpolicy="no-referrer">';
            }
            content += '<div class="option-leading">';
            content += '<div class="letter-badge" aria-hidden="true">' + letter + '</div>';
            content += '<div class="option-body">';
            content += '<div class="option-text-wrapper">';

            content += '<div class="option-text ql-editor" style="padding:0;">' + displayHtml + '</div>';

            // Show checkmark if revealed and correct
            if (isRevealed && isCorrect) {
                content += '<span class="material-symbols-outlined text-green-600 ml-2">check_circle</span>';
            }

            content += '<span class="result-ribbon"></span>';
            content += '<span class="sr-only secure-selection-announcement"></span>';
            content += '</div>';
            content += '<span class="percentage-bubble"></span>';
            content += '</div>';
            content += '</div>';
            content += '<span class="result-indicator" aria-hidden="true"></span>';
            button.innerHTML = content;
            button.addEventListener('click', function (event) {
                if (event && event.target && event.target.closest('.option-image')) {
                    return;
                }
                // Don't allow selecting if revealed
                if (!isRevealed) {
                    handleSecureOptionSelect(index);
                }
            });
            li.appendChild(button);
            return li;
        }

        function handleSecureOptionSelect(index) {
            if (!secureOptionsList) return;
            secureSelectedOptionIndex = index;
            syncSecureOptionSelection();
            updateSecureSubmitState();
        }

        function updateSecureSubmitState() {
            if (!secureSubmitBtn) return;
            var hasState = !!secureQuestionState;
            var disabled = !hasState || secureSubmitting || secureTimeExpired;
            secureSubmitBtn.disabled = disabled;
            secureSubmitBtn.classList.toggle('opacity-60', disabled);
            if (secureSubmitLabel && hasState && !secureSubmitting) {
                var onLastQuestion = secureQuestionState.progressIndex >= secureQuestionState.totalQuestions - 1;
                secureSubmitLabel.textContent = onLastQuestion ? 'Submit Exam' : 'Submit & Next';
            }
            if (secureSubmitHint) {
                if (!hasState) {
                    secureSubmitHint.textContent = '';
                } else if (typeof secureSelectedOptionIndex === 'number') {
                    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    var letter = letters.charAt(secureSelectedOptionIndex) || '#';
                    secureSubmitHint.textContent = 'Selected ' + letter + '. Submit when ready.';
                } else {
                    secureSubmitHint.textContent = 'No answer selected — submitting will record this as blank.';
                }
            }
        }

        function setSecureSubmitLoading(isLoading) {
            secureSubmitting = isLoading;
            if (!secureSubmitBtn) return;
            secureSubmitBtn.disabled = isLoading;
            secureSubmitBtn.classList.toggle('opacity-60', isLoading);
            if (secureSubmitLabel && isLoading) {
                secureSubmitLabel.textContent = 'Saving...';
            }
            if (!isLoading) {
                updateSecureSubmitState();
            }
        }

        function disableSecureOptions(disabled) {
            if (!secureOptionsList) return;
            secureOptionsList.querySelectorAll('button.secure-answer-option').forEach(function (btn) {
                btn.disabled = disabled;
                btn.classList.toggle('answer-option-disabled', disabled);
            });
        }

        function submitIndividualAnswer(state, answerText, answerId, isAutoSubmit) {
            if (!state || secureSubmitting) return;

            // Check if metacognition is enabled for this question
            // Auto-submits (timeout, forced submission) bypass the confidence prompt
            if (secureMetacognitionEnabled && !isAutoSubmit) {
                console.log('Metacognition enabled - showing confidence prompt');
                showSecureConfidencePrompt(answerText, answerId);
                return; // Don't submit yet, wait for confidence selection
            }

            // No metacognition or auto-submit, submit directly with null confidence
            submitIndividualAnswerWithConfidence(state, answerText, answerId, null);
        }

        function submitIndividualAnswerWithConfidence(state, answerText, answerId, confidenceLevel, retryCount) {
            retryCount = retryCount || 0;
            var maxRetries = 3;

            if (!state || secureSubmitting) return;
            setSecureSubmitLoading(true);
            disableSecureOptions(true);
            var answerDetails = {
                pollId: state.pollId,
                sessionId: state.sessionId,
                actualQuestionIndex: state.actualQuestionIndex,
                answer: answerText || '',
                answerId: answerId || null,
                confidenceLevel: confidenceLevel
            };

            var telemetry = ActivityMonitor.getInstance().getTelemetry();

            // FAST PATH: Write to Firebase first (Optimistic UI)
            submitAnswerToFirebase(
                answerDetails.pollId,
                answerDetails.actualQuestionIndex,
                answerDetails.answer,
                answerDetails.answerId,
                answerDetails.confidenceLevel,
                null, // let function derive email
                telemetry // Pass telemetry data
            ).then(function (fbResult) {
                if (fbResult && fbResult.success) {
                    console.log('Firebase write success, proceeding with optimistic UI update');

                    // Optimistic Success: Clear local state and show loading next
                    try { localStorage.removeItem('secure_pending_answer'); } catch (e) { }

                    setSecureSubmitLoading(false);
                    disableSecureOptions(false);
                    hideSecureConfidencePrompt();

                    secureSelectedOptionIndex = null;
                    secureQuestionState = null;
                    secureCurrentQuestionKey = null;

                    if (secureQuestionText) {
                        secureQuestionText.innerHTML = '<div style="display: flex; align-items: center; gap: 12px; padding: 20px 0;"><div style="width: 24px; height: 24px; border: 3px solid rgba(18, 56, 93, 0.2); border-top-color: #12385d; border-radius: 50%; animation: veritas-spin 0.7s linear infinite;"></div><span style="color: #4b5563; font-size: 1.1rem;">Answer Saved. Loading next...</span></div>';
                    }
                    if (secureQuestionImage) secureQuestionImage.style.display = 'none';
                    if (secureOptionsList) secureOptionsList.innerHTML = '';

                    // Firebase write was successful, the Cloud Function processes it.
                    // No need for a redundant google.script.run sync.
                    console.log('[Firebase] Submission finalized. Polling for next state.');
                    setTimeout(function () { pollForIndividualSessionState(); }, 50);
                } else {
                    console.warn('[Firebase] Write failed. Saving to local backup for manual recovery.');
                    try {
                        localStorage.setItem('secure_pending_answer', JSON.stringify(answerDetails));
                    } catch (e) {
                        console.error('Failed to backup answer', e);
                    }
                    setSecureSubmitLoading(false);
                    disableSecureOptions(false);
                    hideSecureConfidencePrompt();
                    handleError('Submission failed. Your answer is backed up locally. Please check your connection and try again.');
                }
            });
        }



        function stopSecureCountdown() {
            secureCountdownController.stop();
        }

        function applyTimerVisibility() {
            if (!secureCountdownEl || !secureTopbarTimer) return;
            secureCountdownEl.textContent = timerHidden ? '••:••' : lastTimerDisplay;
            secureTopbarTimer.classList.toggle('timer-hidden', timerHidden);
            if (timerVisibilityToggle) {
                timerVisibilityToggle.setAttribute('aria-pressed', timerHidden ? 'true' : 'false');
                timerVisibilityToggle.setAttribute('aria-label', timerHidden ? 'Show timer' : 'Hide timer');
                var icon = timerVisibilityToggle.querySelector('.material-symbols-outlined');
                if (icon) {
                    icon.textContent = timerHidden ? 'visibility_off' : 'visibility';
                }
            }
        }

        function updateSecureTimerDisplay(seconds) {
            if (!secureCountdownEl || !secureTopbarTimer) return;
            var safeSeconds = Math.max(0, seconds);
            lastTimerDisplay = formatTime(safeSeconds);
            secureTopbarTimer.classList.remove('alert-warning', 'alert-danger');
            var ratio = secureCountdownTotal > 0 ? Math.max(0, Math.min(1, safeSeconds / secureCountdownTotal)) : 1;
            if (ratio <= 0.1) {
                secureTopbarTimer.classList.add('alert-danger');
            } else if (ratio <= 0.25) {
                secureTopbarTimer.classList.add('alert-warning');
            }
            applyTimerVisibility();
        }

        function startSecureCountdown(timeRemainingSeconds) {
            var remaining = Math.max(0, Math.floor(timeRemainingSeconds || 0));
            secureCountdownTotal = remaining || secureCountdownTotal;
            lastTimerDisplay = formatTime(remaining);
            applyTimerVisibility();
            secureCountdownController.start(remaining);
        }

        function handleSecureTimeExpiry() {
            if (secureTimeExpired) return;
            secureTimeExpired = true;
            showSecureOverlay('TIME_UP', "Time's up!", 'Hold tight while we finalize your work.');
            autoSubmitSecureAnswer(false);
            scheduleSecureWindowClose(4000);
        }

        function showSecureConfidencePrompt(answerText, answerId) {
            if (!secureConfidencePrompt) return;

            securePendingAnswerText = answerText;
            // Store pending answer ID globally so we can submit it later
            // We use a new variable for this scope
            secureConfidencePrompt.dataset.pendingAnswerId = answerId || '';

            // Hide question content, show confidence prompt
            if (secureQuestionText) secureQuestionText.style.display = 'none';
            if (secureQuestionImage) secureQuestionImage.style.display = 'none';
            if (secureOptionsList) secureOptionsList.style.display = 'none';
            if (secureSubmitBtn) secureSubmitBtn.style.display = 'none';

            secureConfidencePrompt.style.display = 'block';
            secureConfidencePrompt.classList.remove('hidden');

            // Attach confidence button handlers
            var confidenceBtns = secureConfidencePrompt.querySelectorAll('.confidence-btn');
            confidenceBtns.forEach(function (btn) {
                btn.onclick = function () {
                    var confidenceLevel = btn.getAttribute('data-confidence');
                    handleSecureConfidenceSelection(confidenceLevel);
                };
            });
        }

        function hideSecureConfidencePrompt() {
            if (!secureConfidencePrompt) return;
            secureConfidencePrompt.style.display = 'none';
            secureConfidencePrompt.classList.add('hidden');

            // Restore question display
            if (secureQuestionText) secureQuestionText.style.display = 'block';
            if (secureOptionsList) secureOptionsList.style.display = 'block';
            if (secureSubmitBtn) secureSubmitBtn.style.display = 'block';
        }

        function handleSecureConfidenceSelection(confidenceLevel) {
            // Allow empty strings (blank answers), only reject null/undefined
            if (securePendingAnswerText == null || !secureQuestionState) return;

            hideSecureConfidencePrompt();

            var answerId = secureConfidencePrompt.dataset.pendingAnswerId || null;

            // Submit answer with confidence
            submitIndividualAnswerWithConfidence(
                secureQuestionState,
                securePendingAnswerText,
                answerId,
                confidenceLevel
            );

            // Clear pending state
            securePendingAnswerText = null;
            secureConfidencePrompt.dataset.pendingAnswerId = '';
        }

        function autoSubmitSecureAnswer(forceBlank) {
            if (!secureQuestionState || secureSubmitting) return;
            var answerText = '';
            var answerId = null;
            if (!forceBlank && typeof secureSelectedOptionIndex === 'number') {
                var option = (secureQuestionState.question.options || [])[secureSelectedOptionIndex];
                if (option) {
                    answerText = option.text || '';
                    answerId = option.id;
                }
            }
            // Pass true for isAutoSubmit to bypass confidence prompt on timeout
            submitIndividualAnswer(secureQuestionState, answerText, answerId, true);
        }

        function attemptSecureWindowClose() {
            try {
                if (document && document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen().catch(function (err) {
                        console.warn('Error exiting fullscreen:', err);
                    });
                }
            } catch (err) {
                console.warn('Unable to exit fullscreen', err);
            }

            if (typeof window !== 'undefined' && typeof window.close === 'function') {
                window.close();
            }
        }

        function clearSecureCloseTimer() {
            if (secureCloseTimer) {
                clearTimeout(secureCloseTimer);
                secureCloseTimer = null;
            }
        }

        function scheduleSecureWindowClose(delayMs) {
            if (secureCloseTimer) return;
            var timeout = Math.max(500, Number(delayMs) || 2500);
            secureCloseTimer = setTimeout(function () {
                secureCloseTimer = null;
                attemptSecureWindowClose();
            }, timeout);
        }

        function exitSecureSessionNow() {
            clearSecureCloseTimer();
            attemptSecureWindowClose();
        }

        function finalizeSecureSession(statusType, message, subtext) {
            stopSecureCountdown();
            setSecureConnectionIndicatorVisible(false);
            if (secureSessionActive) {
                secureSessionHeartbeat.stop();
                secureSessionActive = false;
            }
            setSecureChromeState(false);
            secureQuestionState = null;
            secureCurrentQuestionKey = null;
            secureSelectedOptionIndex = null;
            secureSubmitting = false;
            // Hide calculator when session ends
            if (typeof hideCalculatorOnSessionEnd === 'function') {
                hideCalculatorOnSessionEnd();
            }
            showSecureOverlay(statusType, message, subtext);
            scheduleSecureWindowClose(2500);
        }

        function showSecureOverlay(type, message, subtext) {
            var icon = 'lock';
            var iconClass = 'text-red-300';
            var messageClass = 'text-white text-2xl font-semibold';
            var subClass = 'text-white/80 text-base mt-4';
            var showExitAction = type === 'COMPLETED' || type === 'ENDED';
            var exitLabel = type === 'ENDED' ? 'Exit Session' : 'Exit Secure Session';
            var exitDescription = 'Use the button below to leave fullscreen and close the secure window when dismissed.';
            if (type === 'COMPLETED') {
                icon = 'task_alt';
                iconClass = 'text-green-300';
                messageClass = 'text-green-200 text-2xl font-semibold';
            } else if (type === 'TIME_UP') {
                icon = 'hourglass_bottom';
                showExitAction = false;
            } else if (type === 'ENDED') {
                icon = 'info';
            } else if (type === 'LOCKED') {
                // FIX TASK C: High-contrast styling for lock overlay (no pale pink-on-white)
                icon = 'lock';
                iconClass = 'text-red-600';
                messageClass = 'text-gray-900 text-2xl font-bold';
                subClass = 'text-gray-800 text-base mt-4 whitespace-pre-line';
                showExitAction = false;
            }
            showStatusPanel({
                icon: icon,
                iconClass: iconClass,
                message: message || '',
                messageClass: messageClass,
                subtext: subtext || '',
                subClass: subClass,
                showExitAction: showExitAction,
                exitActionLabel: exitLabel,
                exitActionDescription: exitDescription,
                showResume: false,
                lockScroll: true
            });
        }

        function hideSecureOverlay() {
            if (document && document.body) {
                document.body.classList.remove('secure-overlay-active');
            }
            if (statusContainer && !isInteractionBlocked) {
                statusContainer.style.display = 'none';
            }
            if (statusSubMessage) {
                statusSubMessage.style.display = 'none';
                statusSubMessage.textContent = '';
            }
        }

        function showSecureLockout(message, subtext) {
            stopSecureCountdown();
            setSecureConnectionIndicatorVisible(true);
            if (secureFocusContainer) {
                secureFocusContainer.style.display = 'block';
            }
            disableSecureOptions(true);
            showSecureOverlay('LOCKED', message || 'Assessment Paused', subtext || 'Fullscreen exit detected. Please wait for your instructor to re-admit you.');
            // Hide calculator when locked
            if (typeof hideCalculatorOnSessionEnd === 'function') {
                hideCalculatorOnSessionEnd();
            }
        }

        function updateSecureConnectionIndicators(state) {
            if (!state || !secureConnectionDot) return;
            var health = (state.connectionHealth || '').toUpperCase();
            var dotClasses = ['bg-emerald-400', 'bg-amber-400', 'bg-red-500'];
            dotClasses.forEach(function (cls) { secureConnectionDot.classList.remove(cls); });
            var label = 'Synced';
            var warningText = '';
            if (health === 'RED') {
                secureConnectionDot.classList.add('bg-red-500');
                label = 'Connection issue';
                warningText = 'We are reconnecting and saving your work...';
            } else if (health === 'YELLOW') {
                secureConnectionDot.classList.add('bg-amber-400');
                label = 'Reconnecting';
                warningText = 'Syncing your progress...';
            } else {
                secureConnectionDot.classList.add('bg-emerald-400');
                label = 'Synced';
            }
            var lagSeconds = state.heartbeatLagMs ? Math.max(0, Math.round(state.heartbeatLagMs / 1000)) : 0;
            if (secureConnectionStatus) {
                var srLabel = label;
                if (lagSeconds > 0) {
                    srLabel += ' • ' + lagSeconds + ' second lag';
                }
                secureConnectionStatus.textContent = srLabel;
            }
            if (secureConnectionWarning) {
                if (warningText) {
                    secureConnectionWarning.textContent = warningText;
                    secureConnectionWarning.classList.remove('hidden');
                } else {
                    secureConnectionWarning.textContent = '';
                    secureConnectionWarning.classList.add('hidden');
                }
            }
        }

        function pollForIndividualSessionState() {
            // POISON PILL CHECK: If lock is active, immediately show lock UI and return
            if (isPoisonPillActive()) {
                console.log('[Proctor] POISON PILL ACTIVE in pollForIndividualSessionState - blocking');
                isInteractionBlocked = true;
                showLockEnforcementUI();
                return;
            }

            if (securePollInFlight) return;
            securePollInFlight = true;
            var telemetry = ActivityMonitor.getInstance().getTelemetry();
            // FIXED: Fetch state from Firebase directly
            var email = window.STUDENT_EMAIL || sessionStorage.getItem('veritas_student_email');
            var emailKey = email ? email.replace(/[.$#[\]]/g, '_') : 'unknown';
            var pollId = activePollId; // Assuming activePollId is available in scope

            Promise.all([
                firebase.database().ref('sessions/' + pollId + '/live_session').once('value'),
                firebase.database().ref('sessions/' + pollId + '/students/' + emailKey).once('value')
            ]).then(function (snaps) {
                securePollInFlight = false;
                if (studentLoader) studentLoader.style.display = 'none';

                var sessionData = sessionSnap.val() || { status: 'CLOSED' };
                var studentData = studentSnap.val();

                // schema-fix: Handle both string (legacy) and object (new)
                var sStatus = 'ACTIVE';
                var sReason = '';
                var sLocked = false;

                if (studentData) {
                    if (typeof studentData === 'object') {
                        sStatus = studentData.status || 'ACTIVE';
                        sReason = studentData.lastViolationReason || '';
                        sLocked = sStatus === 'LOCKED';
                    } else {
                        sStatus = studentData; // Legacy string
                        sLocked = sStatus === 'LOCKED';
                    }
                }

                // Map to legacy state object
                var state = {
                    status: sStatus, // ACTIVE, LOCKED, etc.
                    sessionStatus: sessionData.status,
                    locked: sLocked,
                    message: sReason,
                    lockReason: sReason,
                    completed: sStatus === 'FINISHED',
                    completed: sStatus === 'FINISHED', // Logic dup, but harmless
                    question: sessionData // Simplified map
                };

                // Dispatch to UI handlers
                if (state.sessionStatus === 'PRE_LIVE' || !state.sessionStatus) {
                    showSecureLobby({ status: 'LOBBY', pollName: 'Wait for teacher...' });
                    return;
                }
                if (state.status === 'LOBBY') {
                    showSecureLobby(state);
                    return;
                }
                hideSecureLobby();

                var lockReason = (state.lockReason || '').toString().toUpperCase();
                var lockMessage = (state.message || '').toString().toLowerCase();
                var isTerminalLock = state.locked === true || lockReason === 'FORCED_SUBMIT' || lockReason === 'TIME_EXPIRED' || lockMessage.indexOf('ended') >= 0 || lockMessage.indexOf('submitted') >= 0;

                if (state.completed || studentData.status === 'FINISHED') {
                    updateSecureConnectionIndicators(state);
                    finalizeSecureSession('COMPLETED', 'Assessment Submitted', 'Your responses have been secured.');
                } else if (sessionData.status === 'ENDED') {
                    updateSecureConnectionIndicators(state);
                    finalizeSecureSession('ENDED', 'Session Concluded', 'The session has ended.');
                } else if (isTerminalLock) {
                    finalizeSecureSession('ENDED', state.message || 'Assessment Finalized', 'Your responses have been secured.');
                } else if (state.status === 'LOCKED') {
                    if (secureFocusContainer) secureFocusContainer.style.display = 'block';
                    showSecureLockout(state.message || 'Locked', 'Teacher intervention required.');
                } else if (state.status === 'ACTIVE' || !state.status) {
                    // Pass necessary data for view
                    state.question = sessionData; // Pass session metadata as question context
                    state.timeLimitMinutes = sessionData.metadata ? sessionData.metadata.timeLimitMinutes : 60;
                    showIndividualTimedView(state);
                }
            }).catch(function (error) {
                securePollInFlight = false;
                handleError(error);
            });

        }

        if (secureSubmitBtn) {
            secureSubmitBtn.addEventListener('click', function () {
                if (!secureQuestionState || secureSubmitting) return;
                var answerText = '';
                if (typeof secureSelectedOptionIndex === 'number') {
                    var option = (secureQuestionState.question.options || [])[secureSelectedOptionIndex];
                    if (option && typeof option.text === 'string') {
                        answerText = option.text;
                    }
                }
                submitIndividualAnswer(secureQuestionState, answerText);
            });
        }

        // Add click handler to secure assessment question image for zoom
        if (secureQuestionImage) {
            secureQuestionImage.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                if (window.expandImage) {
                    window.expandImage(this);
                }
            });
        }

        console.log('Student poll script initializing...');

        // Check for pending answer backup on initialization
        try {
            var backup = localStorage.getItem('secure_pending_answer');
            if (backup) {
                var answerDetails = JSON.parse(backup);
                // Use a slight delay to ensure UI is ready
                setTimeout(function () {
                    if (confirm('Veritas found an unsaved answer from a previous session. Would you like to retry submitting it?')) {
                        // Create a dummy state to pass to submit
                        var dummyState = {
                            pollId: answerDetails.pollId,
                            sessionId: answerDetails.sessionId,
                            actualQuestionIndex: answerDetails.actualQuestionIndex,
                            question: {} // Dummy question object
                        };

                        // Manually trigger submission with recovered data
                        submitIndividualAnswerWithConfidence(
                            dummyState,
                            answerDetails.answer,
                            answerDetails.confidenceLevel
                        );
                    } else {
                        localStorage.removeItem('secure_pending_answer');
                    }
                }, 1000);
            }
        } catch (e) {
            console.error('Failed to check backup', e);
        }

        var studentLoader = document.getElementById('student-loader');
        var preLiveCard = document.getElementById('pre-live-card');
        var statusContainer = document.getElementById('status-container');
        var statusMessage = document.getElementById('status-message');
        var questionContainer = document.getElementById('question-container');
        var optionsList = document.getElementById('options-list');
        var questionTextEl = document.getElementById('question-text');
        var questionImageEl = document.getElementById('question-image');
        var questionSublineEl = document.getElementById('question-subline');
        var noResponsesMessageEl = document.getElementById('no-responses-message');
        var entryScreen = document.getElementById('entry-screen');
        var startSessionBtn = document.getElementById('start-session-btn');
        var studentContainer = document.getElementById('student-container');

        // --- EARLY BIND: "Begin Poll" Button ---
        if (startSessionBtn) {
            console.log('Attaching onclick handler to start session button (Early Bind)');
            startSessionBtn.onclick = function () {
                console.log('!!! BEGIN SESSION BUTTON CLICKED !!!');

                // FIX: Mark session as started - this gate prevents auto-bypass of entry screen
                studentSessionStarted = true;

                if (entryScreen) entryScreen.style.display = 'none';
                if (studentContainer) studentContainer.style.display = 'block';
                isInteractionBlocked = false;
                isTeacherBlocked = false;
                violationLogged = false;
                fullscreenEnteredOnce = false;

                var resumeControls = document.getElementById('resume-controls');
                if (resumeControls) {
                    resumeControls.style.display = 'none';
                }

                try {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(function (e) {
                            console.warn('Fullscreen denied or failed (benign):', e);
                        });
                    }
                } catch (e) {
                    console.warn('Fullscreen execution error:', e);
                }

                hideConnectivityBanner();
                startPolling(true);
            };
        }
        // Simple image zoom function (same approach as teacher panel)
        window.expandImage = function (imgElement) {
            var imgSrc = imgElement.src;
            var modalHtml = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;" onclick="this.remove()">';
            modalHtml += '<img src="' + imgSrc + '" style="max-width:90%;max-height:90%;"/>';
            modalHtml += '</div>';
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        };

        // Add click handler to question image
        if (questionImageEl) {
            questionImageEl.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                window.expandImage(this);
            });
        }

        // Event delegation for dynamically created option images
        document.addEventListener('click', function (e) {
            if (e.target.classList.contains('option-image')) {
                e.stopPropagation();
                e.preventDefault();
                window.expandImage(e.target);
            }
        });
        var preLivePrimary = document.getElementById('pre-live-primary');
        var preLiveSubline = document.getElementById('pre-live-subline');
        var preLiveReconnectLine = document.getElementById('pre-live-reconnect-line');

        var resumeSessionBtn = document.getElementById('resume-session-btn');
        var secureExitControls = document.getElementById('secure-exit-controls');
        var secureExitDescription = document.getElementById('secure-exit-description');
        var secureExitButton = document.getElementById('secure-exit-btn');
        var secureExitLabel = document.getElementById('secure-exit-label');
        var statusSubMessage = document.getElementById('status-submessage');
        var connectivityBanner = document.getElementById('connectivity-banner');
        var connectivityIcon = document.getElementById('connectivity-icon');
        var connectivityMessage = document.getElementById('connectivity-message');
        var connectivitySubMessage = document.getElementById('connectivity-submessage');

        var currentPollState = {};
        var lastUnlockedState = null;
        var pollTimerId = null;
        var defaultPollInterval = 1500;
        var maxPollInterval = 8000;
        var pollFailureCount = 0;
        var proctorPollInterval = null;
        var isInteractionBlocked = false;
        var isTeacherBlocked = false;
        var currentLockVersion = 0;
        var hasAnsweredCurrent = false;
        var violationLogged = false;
        var violationDebounceTimer = null;
        var fullscreenEnteredOnce = false; // Track if fullscreen has been entered to prevent false violations
        var pendingSubmission = false;
        var currentQuestionKey = null;
        var pendingAnswerText = null; // Store answer while waiting for confidence
        var currentMetacognitionEnabled = false; // Track if current question has metacognition
        var lastStateVersion = null;
        var lastSuccessfulPollAt = 0;
        var pollInFlight = false;
        var recoveringFromOutage = false;
        var connectivityHideTimer = null;
        var lastAdvisedInterval = defaultPollInterval;

        // --- PROCTORING SAFEGUARDS ---
        var secureSessionActive = false; // Must be TRUE for lock logic to engage
        var isEnteringFullscreen = false; // Grace period flag
        // -----------------------------

        // --- ENTRY GATE: Prevent auto-bypass of entry screen ---
        // Student must explicitly click "Begin Poll" to enter the session
        var studentSessionStarted = false;

        var optionBaseClass = 'answer-option relative w-full text-left';
        var optionSelectedClass = optionBaseClass + ' answer-option-selected';
        var optionDisabledClass = optionBaseClass + ' answer-option-disabled';
        var SECURE_RULES_FALLBACK = [
            'Stay in fullscreen for the entire assessment',
            'No tab or app switching is allowed',
            'Mission Control monitors your progress in real time'
        ];
        var secureLobbyCard = document.getElementById('secure-lobby');
        var secureLobbyTitle = document.getElementById('secure-lobby-title');
        var secureLobbySummary = document.getElementById('secure-lobby-summary');
        var secureLobbyTime = document.getElementById('secure-lobby-time');
        var secureLobbyQuestions = document.getElementById('secure-lobby-questions');
        var secureWindowMessage = document.getElementById('secure-window-message');
        var secureAccessCodeGroup = document.getElementById('secure-access-code-group');
        var secureAccessCodeInput = document.getElementById('secure-access-code');
        var secureAccessCodeError = document.getElementById('secure-access-code-error');
        var secureBeginBtn = document.getElementById('secure-begin-btn');
        var secureBeginLabel = document.getElementById('secure-begin-label');
        var secureRulesList = document.getElementById('secure-rules-list');
        var secureLobbyContext = null;
        var secureWindowAutoReloaded = false;
        var blurListenerAttached = false;
        var liveSessionActive = false;

        function handleViolation(reason) {
            try {
                sessionStorage.setItem('veritas_lock_active', 'true');
                sessionStorage.setItem('lock_reason', reason || 'violation');
            } catch (e) { }
            LockManager.lock(reason || 'proctoring_violation');
            if (typeof reportViolationDebounced === 'function') {
                reportViolationDebounced(reason);
            }
        }

        function triggerSecurityViolation(reason) {
            handleViolation(reason);
        }

        /**
         * UNIFIED PROCTORING HANDLER
         * Handles blur, fullscreen exit, and tab switching.
         * Flow: 1. Check Calculator (Safe Harbor) -> 2. Set Lock Flag -> 3. Report Violation -> 4. Show Lock UI
         */
        function handlePotentialViolation(reason) {
            // 1. SAFE HARBOR CHECK (Critical)
            // If the student is clicking inside the TI-84 Calculator iframe,
            // the window 'blurs', but this is NOT a violation. Return immediately.
            if (document.activeElement && document.activeElement.id === 'calc-iframe') {
                return;
            }

            // 2. THE LOCK (Poison Pill)
            // Persist the lock state so a refresh won't fix it.
            sessionStorage.setItem('veritas_lock_active', 'true');

            // 3. THE REPORT
            // Send telemetry to the server (if ID exists)
            if (typeof reportViolation === 'function') {
                reportViolation(reason);
            } else if (typeof reportViolationDebounced === 'function') {
                reportViolationDebounced(reason);
            }

            // 4. SHOW LOCK UI
            showLockEnforcementUI(reason);
        }

        // ROBUST VIOLATION REPORTING WITH FAILSAFE POLL ID LOOKUP
        function reportViolation(reason) {
            // ROBUST ID CHECK: Check Global -> Data Object -> Storage
            var pid = window.currentPollId ||
                (window.pollData && window.pollData.pollId) ||
                sessionStorage.getItem('veritas_active_poll_id');

            if (!pid) {
                console.error('[Proctor] CRITICAL: Attempted to report violation but Poll ID is missing. Retrying in 1s...');
                // Retry once if ID is missing (race condition fix)
                setTimeout(function () { reportViolation(reason); }, 1000);
                return;
            }

            console.warn('[Proctor] Reporting violation:', reason, 'for Poll:', pid);

            // FIREBASE: Instant Lock (Fail-safe)
            try {
                if (typeof reportFirebaseViolation === 'function') {
                    reportFirebaseViolation(reason, pid);
                }
            } catch (e) {
                console.warn('[Proctor] Firebase reporting failed:', e);
            }

            // CRITICAL FIX: Get fallback email for robust student identification
            var fallbackEmail = window.STUDENT_EMAIL || '';
            if (!fallbackEmail) {
                try { fallbackEmail = sessionStorage.getItem('veritas_student_email') || ''; } catch (e) { }
            }

            // FIX: Use the correct API with token - logStudentViolation was broken (ignored params)
            // FIXED: Use Cloud Function
            var reportStudentViolation = firebaseFunctions.httpsCallable('reportStudentViolation');
            reportStudentViolation({
                pollId: pid,
                studentEmail: fallbackEmail,
                reason: reason
            }).then(function (result) {
                console.log('[Proctor] Violation logged:', result.data);
                if (result.data && result.data.lockVersion !== undefined) {
                    currentLockVersion = result.data.lockVersion;
                }
            }).catch(function (error) {
                console.error('[Proctor] Violation report failed:', error);
            });
        }

        function reportViolationDebounced(reason) {
            // FIX: Immediately block interaction to prevent submissions during debounce
            if (!isInteractionBlocked && !violationLogged && secureSessionActive) {
                console.log('[Proctor] Violation detected:', reason, '- blocking interaction immediately');
                isInteractionBlocked = true;
                showLockEnforcementUI();

                // FIREBASE: Instant Lock
                reportFirebaseViolation(reason);
            }

            if (violationDebounceTimer) {
                clearTimeout(violationDebounceTimer);
            }
            // FIX: Reduce debounce from 300ms to 100ms for faster blocking
            violationDebounceTimer = setTimeout(function () {
                if (violationLogged) {
                    return;
                }

                // ROBUST POLL ID RESOLUTION: Check all sources to avoid silent failures
                var activePollId = (currentPollState && currentPollState.pollId) ||
                    (secureLobbyContext && secureLobbyContext.pollId) ||
                    window.currentPollId;

                // FALLBACK: Check sessionStorage if all in-memory sources failed
                if (!activePollId) {
                    try {
                        activePollId = sessionStorage.getItem('veritas_active_poll_id');
                    } catch (e) { /* Storage may be unavailable */ }
                }

                if (!activePollId) {
                    console.error('[Proctor] CRITICAL: Cannot report violation - no poll ID found in any source');
                    // Still show lock UI even without server report
                    showLockEnforcementUI();
                    return;
                }

                violationLogged = true;
                isInteractionBlocked = true;
                console.log('[Proctor] Reporting violation to server:', reason, 'pollId:', activePollId);

                // FIREBASE: Ensure locked state is set with pollId for teacher visibility
                reportFirebaseViolation(reason, activePollId);

                // CRITICAL FIX: Get fallback email for robust student identification
                var fallbackEmail = window.STUDENT_EMAIL || '';
                if (!fallbackEmail) {
                    try { fallbackEmail = sessionStorage.getItem('veritas_student_email') || ''; } catch (e) { }
                }

                showLockEnforcementUI();
                // google.script.run legacy cleanup removed to prevent ReferenceError
                var reportStudentViolation = firebaseFunctions.httpsCallable('reportStudentViolation');
                reportStudentViolation({
                    pollId: activePollId,
                    studentEmail: fallbackEmail,
                    reason: reason
                }).then(function (result) {
                    var response = result.data || result;
                    console.log('[Proctor] Violation reported:', response);
                    if (response.success) {
                        currentLockVersion = response.lockVersion;
                        showLockEnforcementUI();
                        startProctorPolling();
                    }
                }).catch(function (error) {
                    console.error('[Proctor] Violation report failed:', error);
                    showLockEnforcementUI();
                });
            }, 100);
        }

        function attachProctorVisibilityListeners() {
            if (blurListenerAttached) { return; }
            blurListenerAttached = true;

            // ZERO TOLERANCE: Immediate lock on window blur
            window.addEventListener('blur', function () {
                if (!secureSessionActive || isEnteringFullscreen || isInteractionBlocked || isTeacherBlocked) return;

                // NO-OP if not strictly in a "LIVE" or "SECURE" act.
                // If we are in LOBBY or PRE_LIVE, do not lock.
                if (currentPollState && (currentPollState.status === 'LOBBY' || currentPollState.status === 'PRE_LIVE' || currentPollState.sessionPhase === 'LOBBY')) return;

                // EXTRA GUARD: If Lobby is actually visible on screen, do NOT lock
                if (secureLobbyCard && secureLobbyCard.style.display !== 'none') {
                    console.log('[Proctor] Blur ignored - Lobby is visible');
                    return;
                }

                violationLogged = true;
                handlePotentialViolation('tab_switch');
            });

            // ZERO TOLERANCE: Immediate lock on tab visibility change
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    if (!secureSessionActive || isEnteringFullscreen || isInteractionBlocked || isTeacherBlocked) return;

                    if (currentPollState && (currentPollState.status === 'LOBBY' || currentPollState.status === 'PRE_LIVE' || currentPollState.sessionPhase === 'LOBBY')) return;

                    // EXTRA GUARD: If Lobby is actually visible on screen, do NOT lock
                    if (secureLobbyCard && secureLobbyCard.style.display !== 'none') {
                        console.log('[Proctor] visibilitychange ignored - Lobby is visible');
                        return;
                    }

                    violationLogged = true;
                    handlePotentialViolation('tab_hidden');
                }
            });
        }

        var VeritasModal = null;
        var veritasModalReady = new Promise(function (resolve) {
            function initializeModal() {
                VeritasModal = window.VeritasModal || createVeritasModal();
                window.VeritasModal = VeritasModal;
                resolve(VeritasModal);
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeModal, { once: true });
            } else {
                initializeModal();
            }
        });

        function withVeritasModal(callback) {
            return veritasModalReady.then(function (controller) {
                return callback(controller);
            });
        }

        function veritasAlert(message, options) {
            return withVeritasModal(function (modal) {
                return modal.alert(Object.assign({ message: message }, options || {}));
            });
        }

        function veritasConfirm(message, options) {
            return withVeritasModal(function (modal) {
                return modal.confirm(Object.assign({ message: message }, options || {}));
            });
        }

        function veritasPrompt(message, options) {
            return withVeritasModal(function (modal) {
                return modal.prompt(Object.assign({ message: message }, options || {}));
            });
        }

        function describeSecureTimeLimit(minutes) {
            if (!minutes || minutes <= 0) {
                return 'Untimed';
            }
            if (minutes >= 60) {
                var hours = Math.floor(minutes / 60);
                var remainder = minutes % 60;
                if (remainder === 0) {
                    return hours + (hours === 1 ? ' hour' : ' hours');
                }
                return hours + ' hr ' + remainder + ' min';
            }
            return minutes + ' min';
        }

        function describeSecureQuestionCount(count) {
            if (typeof count !== 'number' || count <= 0) {
                return '—';
            }
            return count + (count === 1 ? ' Question' : ' Questions');
        }

        function renderSecureRules(rules) {
            if (!secureRulesList) return;
            secureRulesList.innerHTML = '';
            var appliedRules = Array.isArray(rules) && rules.length ? rules : SECURE_RULES_FALLBACK;
            appliedRules.forEach(function (rule) {
                var li = document.createElement('li');
                var icon = document.createElement('span');
                icon.className = 'material-symbols-outlined text-base text-veritas-navy mt-0.5';
                icon.textContent = 'shield_person';
                var text = document.createElement('span');
                text.textContent = rule;
                li.appendChild(icon);
                li.appendChild(text);
                secureRulesList.appendChild(li);
            });
        }

        function setSecureAccessError(message) {
            if (!secureAccessCodeError) return;
            if (message) {
                secureAccessCodeError.textContent = message;
                secureAccessCodeError.classList.remove('hidden');
            } else {
                secureAccessCodeError.textContent = '';
                secureAccessCodeError.classList.add('hidden');
            }
        }

        function computeSecureBeginLabel(windowStatus) {
            if (windowStatus === 'NOT_YET_OPEN') {
                return 'Opens Soon';
            }
            if (windowStatus === 'PAST_DUE') {
                return 'Window Closed';
            }
            return 'Begin Assessment';
        }

        function isSecureWindowBlocked(status) {
            return status === 'NOT_YET_OPEN' || status === 'PAST_DUE';
        }

        function updateSecureBeginButton() {
            if (!secureBeginBtn) return;
            var windowStatus = secureLobbyContext ? secureLobbyContext.windowStatus : 'OPEN';
            var label = computeSecureBeginLabel(windowStatus);
            var blocked = isSecureWindowBlocked(windowStatus);
            var loading = secureBeginBtn.dataset.loading === '1';
            if (secureLobbyContext) {
                secureLobbyContext.beginLabel = label;
            }
            secureBeginBtn.disabled = blocked || loading;
            secureBeginBtn.classList.toggle('opacity-60', blocked || loading);
            if (secureBeginLabel && !loading) {
                secureBeginLabel.textContent = label;
            }
        }

        function setSecureBeginLoading(isLoading) {
            if (!secureBeginBtn) return;
            secureBeginBtn.dataset.loading = isLoading ? '1' : '0';
            if (isLoading) {
                secureBeginBtn.disabled = true;
                secureBeginBtn.classList.add('opacity-60');
                if (secureBeginLabel) {
                    secureBeginLabel.textContent = 'Preparing...';
                }
            } else {
                secureBeginBtn.classList.remove('opacity-60');
                updateSecureBeginButton();
            }
        }

        function hideSecureLobby() {
            if (secureLobbyCard) {
                secureLobbyCard.style.display = 'none';
            }
            secureLobbyContext = null;
            setSecureAccessError('');
        }

        function shouldAutoReloadForSecureWindow(previousStatus, nextStatus) {
            if (!previousStatus || !nextStatus) {
                return false;
            }
            var wasBlocked = isSecureWindowBlocked(previousStatus);
            var isBlockedNow = isSecureWindowBlocked(nextStatus);
            return wasBlocked && !isBlockedNow;
        }

        function triggerSecureWindowReload() {
            if (secureWindowAutoReloaded) {
                return;
            }
            secureWindowAutoReloaded = true;
            if (secureBeginBtn) {
                secureBeginBtn.disabled = true;
                secureBeginBtn.classList.add('opacity-60');
            }
            if (secureBeginLabel) {
                secureBeginLabel.textContent = 'Refreshing...';
            }
            setTimeout(function () {
                window.location.reload();
            }, 750);
        }

        function showSecureLobby(state) {
            var previousContext = secureLobbyContext;
            var previousLobbyKey = previousContext && previousContext.lobbyKey
                ? previousContext.lobbyKey
                : (previousContext ? (previousContext.pollId + '|' + previousContext.sessionId) : null);
            var nextLobbyKey = (state.pollId || 'poll') + '|' + (state.sessionId || '');
            var isNewLobbyContext = previousLobbyKey !== nextLobbyKey;
            var previousWindowStatus = previousContext ? previousContext.windowStatus : null;
            setSecureConnectionIndicatorVisible(false);
            setSecureChromeState(true);

            secureLobbyContext = {
                pollId: state.pollId,
                sessionId: state.sessionId,
                requiresAccessCode: !!state.requiresAccessCode,
                windowStatus: (state.availability && state.availability.windowStatus) || state.windowStatus || 'OPEN',
                lobbyKey: nextLobbyKey
            };

            // CRITICAL: Persist pollId for violation reporting (secure session path)
            if (state.pollId) {
                window.currentPollId = state.pollId;
                try {
                    sessionStorage.setItem('veritas_active_poll_id', state.pollId);
                } catch (e) { /* Storage may be unavailable */ }
            }

            if (shouldAutoReloadForSecureWindow(previousWindowStatus, secureLobbyContext.windowStatus)) {
                triggerSecureWindowReload();
                return;
            }

            if (entryScreen) entryScreen.style.display = 'none';
            if (studentContainer) studentContainer.style.display = 'block';
            if (studentLoader) studentLoader.style.display = 'none';
            if (preLiveCard) preLiveCard.style.display = 'none';
            if (statusContainer) statusContainer.style.display = 'none';
            if (questionContainer) questionContainer.style.display = 'none';
            // Explicitly hide secure assessment canvas until we begin
            if (secureFocusContainer) secureFocusContainer.style.display = 'none';
            secureSessionActive = false; // DEACTIVATE proctoring when in lobby
            toggleSecureLayout(false);
            if (questionProgressEl) {
                questionProgressEl.textContent = 'STANDBY';
            }
            if (secureLobbyCard) secureLobbyCard.style.display = 'block';

            if (secureLobbyTitle) {
                secureLobbyTitle.textContent = state.pollName || 'Secure Assessment';
            }
            if (secureLobbySummary) {
                if (state.className) {
                    secureLobbySummary.textContent = 'Class: ' + state.className;
                    secureLobbySummary.style.display = 'block';
                    secureLobbySummary.classList.remove('hidden');
                } else {
                    secureLobbySummary.textContent = '';
                    secureLobbySummary.style.display = 'none';
                    secureLobbySummary.classList.add('hidden');
                }
            }
            if (secureLobbyTime) {
                secureLobbyTime.textContent = describeSecureTimeLimit(state.timeLimitMinutes);
            }
            if (secureLobbyQuestions) {
                secureLobbyQuestions.textContent = describeSecureQuestionCount(state.questionCount);
            }

            var availability = state.availability || {};
            var availabilityMessage = availability.message || 'Available now';
            if (availability.blockingMessage) {
                availabilityMessage += ' • ' + availability.blockingMessage;
            }
            if (secureWindowMessage) {
                secureWindowMessage.textContent = availabilityMessage;
            }

            if (secureAccessCodeGroup) {
                secureAccessCodeGroup.style.display = secureLobbyContext.requiresAccessCode ? 'block' : 'none';
                secureAccessCodeGroup.classList.toggle('hidden', !secureLobbyContext.requiresAccessCode);
            }
            if (secureAccessCodeInput && isNewLobbyContext) {
                secureAccessCodeInput.value = '';
            }
            if (isNewLobbyContext) {
                setSecureAccessError('');
            }
            renderSecureRules(state.proctoringRules);
            updateSecureBeginButton();
        }

        function requestFullscreenForSecureAssessment() {
            if (!secureFullscreenManager) {
                return Promise.resolve();
            }
            if (secureFullscreenManager.isFullscreen()) {
                return Promise.resolve();
            }
            return secureFullscreenManager.request().catch(function () {
                return Promise.resolve();
            });
        }

        function handleSecureFullscreenChange(event) {
            // ZERO TOLERANCE PROCTORING - Active for ALL sessions (live polls and secure assessments)
            console.log('[Proctor] Fullscreen change event:', {
                isFullscreen: event.isFullscreen,
                hidden: event.hidden,
                secureSessionActive: secureSessionActive,
                liveSessionActive: liveSessionActive,
                fullscreenEnteredOnce: fullscreenEnteredOnce,
                isInteractionBlocked: isInteractionBlocked,
                violationLogged: violationLogged
            });

            // FIX: Check for entering fullscreen FIRST before checking for tab blur
            // This prevents false positives when entering fullscreen triggers a hidden event
            if (event.isFullscreen) {
                console.log('[Proctor] Fullscreen entered');
                fullscreenEnteredOnce = true;
                return;
            }

            // Check for tab blur/switch (visibility hidden) - IMMEDIATE LOCK
            // Only check this if we're NOT entering fullscreen
            if (event.hidden && !isInteractionBlocked && !violationLogged) {
                console.log('[Proctor] ZERO TOLERANCE: Tab blur detected - IMMEDIATE LOCK');
                triggerSecurityViolation('tab-blur');
                return;
            }

            // Check for exiting fullscreen after having entered - IMMEDIATE LOCK
            // No grace periods. No warnings. Zero tolerance.
            if ((fullscreenEnteredOnce || secureSessionActive || liveSessionActive) && !isInteractionBlocked && !violationLogged) {
                console.log('[Proctor] ZERO TOLERANCE: Fullscreen exit detected - IMMEDIATE LOCK');
                triggerSecurityViolation('exit-fullscreen');
            }
        }

        function handleSecureBeginClick() {
            if (!secureLobbyContext || !secureBeginBtn || secureBeginBtn.disabled) {
                return;
            }
            setSecureAccessError('');
            var providedCode = secureAccessCodeInput ? secureAccessCodeInput.value.trim() : '';
            if (secureLobbyContext.requiresAccessCode && !providedCode) {
                setSecureAccessError('Access code is required.');
                if (secureAccessCodeInput) {
                    secureAccessCodeInput.focus();
                }
                return;
            }

            requestFullscreenForSecureAssessment()
                .then(function () {
                    setSecureBeginLoading(true);
                    isEnteringFullscreen = true; // START GRACE PERIOD

                    // Allow 3 seconds for browser transition chaos to settle
                    setTimeout(function () { isEnteringFullscreen = false; }, 3000);

                    // Double check fullscreen state
                    if (!secureFullscreenManager.isFullscreen()) {
                        throw new Error('Fullscreen failed');
                    }

                    // Immediately mark as active to allow polling, but grace period protects against blur
                    secureSessionActive = true;

                    // FIXED: Client-side Access Code Check & Initialization
                    var pollId = secureLobbyContext.pollId;
                    var email = window.STUDENT_EMAIL || sessionStorage.getItem('veritas_student_email');

                    if (!email) {
                        setSecureBeginLoading(false);
                        veritasAlert('Student identity not found. Please refresh.', { title: 'Error' });
                        return;
                    }

                    // Fetch poll metadata for access code
                    firebase.database().ref('polls/' + pollId).once('value')
                        .then(function (snap) {
                            var poll = snap.val();
                            if (!poll) throw new Error('Poll not found');

                            var serverCode = (poll.accessCode) ? poll.accessCode : '';

                            // Simple check
                            if (serverCode && serverCode !== providedCode) {
                                throw new Error('Invalid access code.');
                            }

                            // Initialize student session
                            var emailKey = email.replace(/[.$#[\]]/g, '_');
                            return firebase.database().ref('sessions/' + pollId + '/students/' + emailKey).update({
                                status: 'ACTIVE',
                                startedAt: firebase.database.ServerValue.TIMESTAMP,
                                email: email,
                                name: window.STUDENT_NAME || email.split('@')[0]
                            });
                        })
                        .then(function () {
                            setSecureBeginLoading(false);
                            // Success!
                            hideAllViews();
                            entryScreen.style.display = 'none';
                            secureLobbyContext = null;
                            startPolling(true);
                        })
                        .catch(function (error) {
                            setSecureBeginLoading(false);
                            isEnteringFullscreen = false;
                            secureSessionActive = false;
                            var message = error.message || 'Unable to begin assessment.';
                            if (/access code/i.test(message)) {
                                setSecureAccessError(message);
                                if (secureAccessCodeInput) {
                                    secureAccessCodeInput.focus();
                                }
                            } else {
                                veritasAlert(message, { title: 'Secure Assessment' });
                            }
                        });
                })
                .catch(function (err) {
                    console.warn('Fullscreen request was rejected', err);
                    veritasAlert('Fullscreen permission is required to begin the assessment.', { title: 'Secure Assessment' });
                });
        }

        function ensureVeritasModalRoot() {
            var existing = document.getElementById('veritas-modal-root');
            if (existing) {
                return existing;
            }

            var root = document.createElement('div');
            root.id = 'veritas-modal-root';
            root.className = 'veritas-modal-root';
            root.setAttribute('aria-hidden', 'true');
            root.innerHTML = '' +
                '<div class="veritas-modal-backdrop"></div>' +
                '<div class="veritas-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="veritas-modal-title" aria-describedby="veritas-modal-message">' +
                '<div class="veritas-modal-header">' +
                '<h2 id="veritas-modal-title">Notice</h2>' +
                '</div>' +
                '<div class="veritas-modal-body">' +
                '<p id="veritas-modal-message"></p>' +
                '<div id="veritas-modal-subtext" class="veritas-modal-subtext"></div>' +
                '<div id="veritas-modal-input" class="veritas-modal-input" style="display: none;">' +
                '<label for="veritas-modal-input-field" class="sr-only">Input</label>' +
                '<input id="veritas-modal-input-field" type="text" autocomplete="off" />' +
                '</div>' +
                '<div class="veritas-modal-actions">' +
                '<button type="button" class="veritas-modal-button secondary" data-action="cancel">Cancel</button>' +
                '<button type="button" class="veritas-modal-button primary" data-action="confirm">' +
                '<span class="veritas-modal-spinner" aria-hidden="true"></span>' +
                '<span>Confirm</span>' +
                '</button>' +
                '</div>' +
                '</div>';

            (document.body || document.documentElement).appendChild(root);
            return root;
        }

        function createVeritasModal() {
            var root = ensureVeritasModalRoot();

            var dialog = root.querySelector('.veritas-modal-dialog');
            var titleEl = root.querySelector('#veritas-modal-title');
            var messageEl = root.querySelector('#veritas-modal-message');
            var subtextEl = root.querySelector('#veritas-modal-subtext');
            var inputWrap = root.querySelector('#veritas-modal-input');
            var inputField = root.querySelector('#veritas-modal-input-field');
            var confirmBtn = root.querySelector('[data-action="confirm"]');
            var cancelBtn = root.querySelector('[data-action="cancel"]');
            var confirmLabel = confirmBtn.querySelector('span:not(.veritas-modal-spinner)');
            var active = false;
            var currentConfig = null;
            var resolveFn = null;
            var previousFocus = null;
            var allowEscape = true;
            var hiddenNodes = [];

            function toggleBackground(state) {
                var siblings = [].slice.call(document.body.children);
                if (state) {
                    hiddenNodes = [];
                    siblings.forEach(function (node) {
                        if (node === root) return;
                        hiddenNodes.push({
                            node: node,
                            ariaHidden: node.getAttribute('aria-hidden'),
                            inert: ('inert' in node) ? node.inert : null
                        });
                        node.setAttribute('aria-hidden', 'true');
                        if ('inert' in node) {
                            node.inert = true;
                        }
                    });
                } else {
                    hiddenNodes.forEach(function (record) {
                        if (record.ariaHidden === null) {
                            record.node.removeAttribute('aria-hidden');
                        } else {
                            record.node.setAttribute('aria-hidden', record.ariaHidden);
                        }
                        if ('inert' in record.node) {
                            if (record.inert !== null) {
                                record.node.inert = record.inert;
                            } else {
                                record.node.inert = false;
                            }
                        }
                    });
                    hiddenNodes = [];
                }
            }

            function setPending(state) {
                if (state) {
                    confirmBtn.classList.add('loading');
                    confirmBtn.setAttribute('disabled', 'disabled');
                    if (cancelBtn.style.display !== 'none') {
                        cancelBtn.setAttribute('disabled', 'disabled');
                    }
                } else {
                    confirmBtn.classList.remove('loading');
                    confirmBtn.removeAttribute('disabled');
                    cancelBtn.removeAttribute('disabled');
                }
            }

            function getFocusable() {
                var selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
                var nodes = [].slice.call(dialog.querySelectorAll(selectors));
                return nodes.filter(function (node) {
                    return !node.hasAttribute('disabled') && node.offsetParent !== null;
                });
            }

            function focusFirst() {
                var focusable = getFocusable();
                if (focusable.length > 0) {
                    focusable[0].focus();
                } else {
                    dialog.focus();
                }
            }

            function trapKey(event) {
                if (!active) return;
                if (event.key === 'Escape') {
                    if (!allowEscape) return;
                    event.preventDefault();
                    handleCancel();
                } else if (event.key === 'Tab') {
                    var focusable = getFocusable();
                    if (focusable.length === 0) {
                        event.preventDefault();
                        return;
                    }
                    var index = focusable.indexOf(document.activeElement);
                    if (event.shiftKey) {
                        if (index <= 0) {
                            focusable[focusable.length - 1].focus();
                            event.preventDefault();
                        }
                    } else {
                        if (index === focusable.length - 1) {
                            focusable[0].focus();
                            event.preventDefault();
                        }
                    }
                } else if (event.key === 'Enter' && currentConfig && currentConfig.mode === 'prompt') {
                    if (document.activeElement === inputField) {
                        event.preventDefault();
                        handleConfirm();
                    }
                }
            }

            function enforceFocus(event) {
                if (!active) return;
                if (!dialog.contains(event.target)) {
                    event.stopPropagation();
                    focusFirst();
                }
            }

            function closeModal(result) {
                active = false;
                root.classList.remove('is-active');
                root.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('veritas-modal-open');
                root.removeEventListener('keydown', trapKey, true);
                document.removeEventListener('focus', enforceFocus, true);
                toggleBackground(false);
                setPending(false);
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    setTimeout(function () { previousFocus.focus(); }, 0);
                }
                if (resolveFn) {
                    resolveFn(result);
                }
                currentConfig = null;
                resolveFn = null;
            }

            function handleConfirm() {
                if (!active) return;
                setPending(true);
                var mode = currentConfig ? currentConfig.mode : 'alert';
                var result;
                if (mode === 'prompt') {
                    result = inputField.value;
                } else if (mode === 'confirm') {
                    result = true;
                }
                closeModal(result);
            }

            function handleCancel() {
                if (!active) return;
                var mode = currentConfig ? currentConfig.mode : 'alert';
                if (mode === 'alert') {
                    closeModal(undefined);
                    return;
                }
                if (mode === 'confirm') {
                    closeModal(false);
                } else if (mode === 'prompt') {
                    closeModal(null);
                }
            }

            function openModal(mode, options) {
                options = options || {};
                currentConfig = Object.assign({}, options, { mode: mode });
                allowEscape = options.allowEscape !== false;
                titleEl.textContent = options.title || (mode === 'confirm' ? 'Please Confirm' : (mode === 'prompt' ? 'Enter Response' : 'Notice'));

                // SECURITY DOCUMENTATION: Trust Boundary for options.html
                // The options.html parameter accepts raw HTML and uses innerHTML (XSS risk).
                // This is INTERNAL-ONLY and must NEVER receive user-controlled data.
                // All callers of openModal() in this codebase use app-controlled strings only.
                // If adding new calls with dynamic content, use options.message (textContent) instead,
                // or sanitize user data with escapeHtml() before passing to options.html.
                if (options.html) {
                    messageEl.innerHTML = options.html;  // INTERNAL ONLY - never pass user data
                } else {
                    messageEl.textContent = options.message || '';
                }
                if (options.subtext) {
                    subtextEl.style.display = 'block';
                    subtextEl.textContent = options.subtext;
                } else {
                    subtextEl.style.display = 'none';
                    subtextEl.textContent = '';
                }
                if (mode === 'prompt') {
                    inputWrap.style.display = 'flex';
                    inputField.value = options.defaultValue || '';
                    if (options.placeholder) {
                        inputField.placeholder = options.placeholder;
                    } else {
                        inputField.removeAttribute('placeholder');
                    }
                } else {
                    inputWrap.style.display = 'none';
                    inputField.value = '';
                    inputField.removeAttribute('placeholder');
                }
                confirmLabel.textContent = options.confirmText || (mode === 'confirm' ? 'Confirm' : (mode === 'prompt' ? 'Submit' : 'OK'));
                if (options.destructive) {
                    confirmBtn.classList.add('destructive');
                } else {
                    confirmBtn.classList.remove('destructive');
                }
                cancelBtn.style.display = mode === 'alert' ? 'none' : 'inline-flex';
                cancelBtn.textContent = options.cancelText || 'Cancel';
                setPending(false);
                previousFocus = document.activeElement;
                root.classList.add('is-active');
                root.setAttribute('aria-hidden', 'false');
                document.body.classList.add('veritas-modal-open');
                toggleBackground(true);
                active = true;
                root.addEventListener('keydown', trapKey, true);
                document.addEventListener('focus', enforceFocus, true);

                return new Promise(function (resolve) {
                    resolveFn = resolve;
                    setTimeout(function () {
                        if (mode === 'prompt') {
                            inputField.focus();
                            inputField.select();
                        } else if (mode === 'confirm' && options.focusCancel) {
                            cancelBtn.focus();
                        } else {
                            confirmBtn.focus();
                        }
                    }, 0);
                });
            }

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            root.addEventListener('click', function (event) {
                if (event.target === root || event.target.classList.contains('veritas-modal-backdrop')) {
                    if (!currentConfig || currentConfig.allowBackdropClose === false) {
                        return;
                    }
                    handleCancel();
                }
            });

            return {
                alert: function (options) {
                    return openModal('alert', options).then(function () { return; });
                },
                confirm: function (options) {
                    return openModal('confirm', options).then(function (result) { return result !== false; });
                },
                prompt: function (options) {
                    return openModal('prompt', options).then(function (result) { return result; });
                }
            };
        }
        var currentOptionLayout = [];

        var connectivityThemes = {
            connecting: ['border-amber-300', 'bg-amber-50', 'text-amber-800', 'dark:border-amber-500', 'dark:bg-amber-900/20', 'dark:text-amber-100'],
            offline: ['border-red-300', 'bg-red-50', 'text-red-800', 'dark:border-red-600', 'dark:bg-red-900/20', 'dark:text-red-200'],
            recovered: ['border-green-300', 'bg-green-50', 'text-green-800', 'dark:border-green-600', 'dark:bg-green-900/20', 'dark:text-green-100']
        };
        var allConnectivityClasses = connectivityThemes.connecting.concat(connectivityThemes.offline, connectivityThemes.recovered);

        function isPreLiveVisible() {
            return preLiveCard && preLiveCard.style.display !== 'none';
        }

        function setPreLiveReconnectMessage(text) {
            // Disabled for student view - students don't need to see sync notifications
            return;
        }

        function applyConnectivityTheme(theme) {
            if (!connectivityBanner) return;
            for (var i = 0; i < allConnectivityClasses.length; i++) {
                connectivityBanner.classList.remove(allConnectivityClasses[i]);
            }
            var themeClasses = connectivityThemes[theme] || connectivityThemes.connecting;
            for (var j = 0; j < themeClasses.length; j++) {
                connectivityBanner.classList.add(themeClasses[j]);
            }
        }

        function showConnectivityState(state, options) {
            // Disabled for student view - students don't need to see sync notifications
            // Background sync continues to work normally
            return;
        }

        function hideConnectivityBanner() {
            if (!connectivityBanner) return;
            clearTimeout(connectivityHideTimer);
            connectivityBanner.classList.add('hidden');
            if (connectivitySubMessage) {
                connectivitySubMessage.textContent = '';
                connectivitySubMessage.classList.remove('opacity-0');
            }
            setPreLiveReconnectMessage('');
        }

        function stopPolling() {
            if (pollTimerId) {
                clearTimeout(pollTimerId);
                pollTimerId = null;
            }
            pollInFlight = false;
        }

        function scheduleNextPoll(delay) {
            if (isInteractionBlocked) return;
            stopPolling();
            var boundedDelay = Math.min(maxPollInterval, Math.max(1000, delay));
            var jitter = Math.random() * 0.15 * boundedDelay;
            pollTimerId = setTimeout(function () {
                pollTimerId = null;
                pollForStatus();
            }, boundedDelay + jitter);
        }

        function startPolling(immediate) {
            // Guard: Check for persisted lock
            if (sessionStorage.getItem('veritas_lock_active') === 'true') {
                if (typeof showLockEnforcementUI === 'function') {
                    showLockEnforcementUI();
                }
                return;
            }

            // POISON PILL CHECK: If lock is active, immediately show lock UI and return
            if (isPoisonPillActive()) {
                console.log('[Proctor] POISON PILL ACTIVE in startPolling - blocking resume');
                isInteractionBlocked = true;
                showLockEnforcementUI();
                startProctorPolling();
                return;
            }

            pollFailureCount = 0;
            recoveringFromOutage = false;
            if (immediate) {
                stopPolling();
                pollForStatus(true);
            } else {
                scheduleNextPoll(defaultPollInterval);
            }
        }

        function handlePostPollSuccess(data, hadFailures) {
            if (typeof data.stateVersion === 'number') {
                lastStateVersion = data.stateVersion;
            }
            if (typeof data.advisedPollIntervalMs === 'number') {
                lastAdvisedInterval = data.advisedPollIntervalMs;
            } else {
                lastAdvisedInterval = defaultPollInterval;
            }

            if (hadFailures || data.connectionHealth === 'RECOVERED_AFTER_OUTAGE') {
                showConnectivityState('recovered', {
                    message: 'Back on track - synced with your teacher.',
                    icon: 'cloud_done',
                    autoHide: 2400
                });
            } else if (data.connectionHealth === 'RECOVERING') {
                hideConnectivityBanner();
                if (isPreLiveVisible()) {
                    setPreLiveReconnectMessage('Syncing back up — we will take off in a moment.');
                }
            } else if (!recoveringFromOutage && !hadFailures) {
                hideConnectivityBanner();
            }

            updateStudentView(data);
            var delay = Math.max(500, Math.min(maxPollInterval, lastAdvisedInterval));
            scheduleNextPoll(delay);
        }

        function handlePollingFailure(error) {
            var messageText = (error && error.message) ? error.message : (typeof error === 'string' ? error : '');
            if (messageText && /Authentication|not enrolled|Invalid link/i.test(messageText)) {
                stopPolling();
                handleError(error);
                return;
            }

            recoveringFromOutage = true;
            var backoffMultiplier = Math.pow(1.6, Math.max(1, pollFailureCount));
            var retryDelay = Math.min(maxPollInterval, Math.round((lastAdvisedInterval || defaultPollInterval) * backoffMultiplier));
            var seconds = Math.max(1, Math.round(retryDelay / 1000));

            var online = typeof navigator !== 'undefined' ? navigator.onLine : true;
            showConnectivityState(online ? 'connecting' : 'offline', {
                message: online ? 'Syncing with teacher...' : 'Connection lost. Don\'t panic - we are saving your work locally and will reconnect automatically.',
                icon: online ? 'sync_problem' : 'signal_wifi_off',
                submessage: online ? ('Retrying in ' + seconds + 's...') : '',
                preLiveMessage: online ? 'Syncing with teacher...' : 'Connection lost. We are saving your work locally and will reconnect automatically.'
            });

            scheduleNextPoll(retryDelay);
        }

        function showWaitingForNextPhase(message) {
            // Ensure parent container is visible
            if (studentContainer) {
                studentContainer.style.display = 'block';
                studentContainer.classList.remove('hidden');
            }
            // Hide question, show status
            if (questionContainer) questionContainer.style.display = 'none';
            if (statusContainer) {
                statusContainer.style.display = 'block';
                statusContainer.classList.remove('hidden');

                // Inject SVG Checkmark
                var iconEl = statusContainer.querySelector('.material-symbols-outlined');
                if (iconEl) {
                    // Replace icon with animated SVG
                    // Note: We're hacking the icon container to show our SVG
                    var checkHtml = `
                    <svg class="w-24 h-24 mx-auto mb-6 text-veritas-navy" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle class="animate-draw-check" cx="26" cy="26" r="25" stroke="currentColor" stroke-width="2"/>
                        <path class="animate-draw-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke="currentColor" stroke-width="2" style="animation-delay: 0.2s"/>
                    </svg>
                    `;
                    // Temporarily replace the icon element styling or content
                    // Ideally we should have a cleaner way, but let's replace the content and remove classes that might conflict
                    iconEl.innerHTML = checkHtml;
                    iconEl.className = 'block mb-4'; // Reset material-symbols classes
                    iconEl.textContent = ''; // Remove text content
                    // Actually, replace the whole element to be safe
                    var newDiv = document.createElement('div');
                    newDiv.innerHTML = checkHtml;
                    iconEl.replaceWith(newDiv);
                    // Add a hook to restore it later? 
                    // renderStatusMessage handles restoration by resetting innerHTML/className
                }
            }
            if (statusMessage) {
                statusMessage.textContent = message || 'Answer Saved';
                statusMessage.className = 'text-veritas-navy text-3xl font-bold tracking-tight animate-fade-in';
            }
            if (statusSubMessage) {
                statusSubMessage.textContent = "Response Recorded. Eyes on the board for results.";
                statusSubMessage.style.display = 'block';
                statusSubMessage.className = 'text-slate-500 font-medium mt-2 animate-fade-in';
            }
            // Hide any resume controls
            var resumeControls = document.getElementById('resume-controls');
            if (resumeControls) {
                resumeControls.style.display = 'none';
            }
        }

        function pollForStatus() {
            if (isInteractionBlocked || pollInFlight) return;

            // Safety Guard: properties may not be ready if init failed
            if (!firebase || !firebase.apps || !firebase.apps.length) {
                console.warn('[Polling] Firebase not initialized yet, skipping poll');
                return;
            }

            pollInFlight = true;
            var context = {
                lastStateVersion: lastStateVersion,
                lastSuccessAt: lastSuccessfulPollAt,
                failureCount: pollFailureCount,
                advisedInterval: lastAdvisedInterval,
                telemetry: ActivityMonitor.getInstance().getTelemetry()
            };

            var pollId = window.currentPollId || sessionStorage.getItem('veritas_active_poll_id');
            if (!pollId) {
                console.warn('[Polling] No active poll ID found, skipping');
                pollInFlight = false;
                return;
            }

            // FIXED: Fetch from Firebase
            firebase.database().ref('sessions/' + pollId + '/live_session').once('value')
                .then(function (snapshot) {
                    pollInFlight = false;
                    var data = snapshot.val();
                    pollFailureCount = 0;
                    recoveringFromOutage = false;
                    lastSuccessfulPollAt = Date.now();
                    // Assume data structure matches or is adaptable
                    handlePostPollSuccess(data || {}, false);
                })
                .catch(function (error) {
                    pollInFlight = false;
                    pollFailureCount += 1;
                    console.error('Polling error', error);
                    handlePollingFailure(error);
                });
        }

        function isSessionActive() {
            // Refined: Check if the actual assessment/quiz view is visible
            var isFocusVisible = secureFocusContainer && secureFocusContainer.style.display !== 'none';
            var isQuestionVisible = questionContainer && questionContainer.style.display !== 'none';
            return (isFocusVisible || isQuestionVisible) && !LockManager.isLocked();
        }

        window.addEventListener('offline', function () {
            if (!isSessionActive()) return;
            recoveringFromOutage = true;
            showConnectivityState('offline', {
                message: 'Connection lost. Don\'t panic - we are saving your work locally and will reconnect automatically.',
                icon: 'signal_wifi_off'
            });
        });

        window.addEventListener('online', function () {
            if (!isSessionActive()) return;
            showConnectivityState('connecting', {
                message: 'Reconnected. Syncing with teacher...',
                icon: 'sync',
                submessage: 'Syncing now...'
            });
            startPolling(true);
            // Re-assert session active state if recovering and session is truly active
            if (isSessionActive() && !isInteractionBlocked) {
                // Determine if we should really set secureSessionActive
                // This prevents lobby-to-online transition bugs
                var isFocusVisible = secureFocusContainer && secureFocusContainer.style.display !== 'none';
                if (isFocusVisible) {
                    secureSessionActive = true;
                }
            }
        });

        if (resumeSessionBtn) {
            resumeSessionBtn.onclick = function () {
                console.log('Resume button clicked - attempting fullscreen');
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen()
                        .then(function () {
                            console.log('Fullscreen entered - confirming with server');
                            // Call studentConfirmFullscreen with the current lockVersion
                            // Call confirmFullscreen Cloud Function
                            var confirmFullscreenFn = firebase.functions().httpsCallable('confirmFullscreen');
                            confirmFullscreenFn({
                                pollId: CURRENT_POLL_ID || (ACTIVE_SESSION && ACTIVE_SESSION.pollId),
                                studentEmail: STUDENT_INFO.id || STUDENT_INFO.email,
                                lockVersion: currentLockVersion
                            })
                                .then(function (result) {
                                    if (result.data && result.data.success) {
                                        console.log('[Proctor] Server confirmed unlock via fullscreen confirmation - Firebase listener will handle state change.');
                                    } else {
                                        console.error('Failed to confirm fullscreen:', result.data?.reason);
                                        statusMessage.textContent = 'Failed to resume. Please try again.';
                                    }
                                })
                                .catch(function (error) {
                                    console.error('Error confirming fullscreen:', error);
                                    statusMessage.textContent = 'Error resuming session.';
                                });
                        })
                        .catch(function (e) {
                            console.warn('Fullscreen denied on resume:', e);
                            statusMessage.textContent = 'Fullscreen is required. Please allow fullscreen and try again.';
                        });
                }
            };
        }

        if (secureExitButton) {
            secureExitButton.addEventListener('click', function () {
                exitSecureSessionNow();
            });
        }

        // Redundant binding removed (moved to early init section for robustness)

        var proctorListenerRef = null;

        function initProctorListener(pollId, email) {
            if (proctorListenerRef) return;
            var emailKey = (typeof generateStudentKey === 'function') ? generateStudentKey(email) : email.replace(/[.$#[\]]/g, '_');
            var statusRef = firebase.database().ref('sessions/' + pollId + '/students/' + emailKey);
            proctorListenerRef = statusRef;

            console.log('[Proctor] Initializing Firebase listener for status updates');

            statusRef.on('value', function (snapshot) {
                var data = snapshot.val();
                if (!data) return;

                console.log('[Proctor] Status Update Received:', data.status, { version: data.lockVersion });

                if (data.status === 'AWAITING_FULLSCREEN') {
                    currentLockVersion = data.lockVersion;
                    showResumePrompt();
                } else if (data.status === 'LOCKED' && data.lockVersion !== currentLockVersion) {
                    currentLockVersion = data.lockVersion;
                    showLockEnforcementUI();
                } else if (data.status === 'BLOCKED') {
                    isTeacherBlocked = true;
                    currentLockVersion = data.lockVersion || currentLockVersion;
                    showTeacherBlockedMessage();
                } else if (data.status === 'ACTIVE' && (isInteractionBlocked || violationLogged)) {
                    // This handles the explicit unlock/unblock case
                    console.log('[Proctor] Status changed to ACTIVE - clearing local lock');
                    clearPersistedLock();
                    isInteractionBlocked = false;
                    isTeacherBlocked = false;
                    violationLogged = false;
                    fullscreenEnteredOnce = false;
                    hideConnectivityBanner();
                    secureSessionActive = true;
                    // Resume normal polling if it was stopped
                    startPolling(true);
                }
            });
        }

        function startProctorPolling() {
            // FIREBASE MIGRATION: Polling is deprecated in favor of on('value') listener
            var activePollId = (currentPollState && currentPollState.pollId) ||
                (secureLobbyContext && secureLobbyContext.pollId) ||
                (secureQuestionState && secureQuestionState.pollId);
            var email = window.STUDENT_EMAIL || (STUDENT_DATA && STUDENT_DATA.email);
            if (activePollId && email) {
                initProctorListener(activePollId, email);
            }
        }


        function hideAllViews() {
            // ENHANCED VIEW MUTEX: Use both display property and hidden class for robustness
            ['entry-screen', 'secure-lobby', 'status-container', 'pre-live-card', 'student-container', 'question-container', 'individual-timed-session'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) {
                    el.style.display = 'none';
                    el.classList.add('hidden'); // Tailwind hidden utility
                }
            });
            // Ensure body overflow logic is reset unless locked
            if (!isInteractionBlocked) {
                document.body.style.overflow = '';
            }
        }

        function showView(elementId) {
            hideAllViews();
            var el = document.getElementById(elementId);
            if (el) {
                el.style.display = 'block';
                el.classList.remove('hidden');
            }
            // Also ensure parent container is visible if needed
            if (elementId !== 'entry-screen' && studentContainer) {
                studentContainer.style.display = 'block';
                studentContainer.classList.remove('hidden');
            }
        }

        function syncCalculatorVisibility(enabled) {
            var fab = document.getElementById('calc-fab');
            var win = document.getElementById('calc-window');
            if (enabled === true || enabled === 'true') {
                if (fab) fab.style.display = 'flex';
            } else {
                if (fab) fab.style.display = 'none';
                if (win) {
                    win.classList.remove('active');
                    win.style.display = 'none';
                }
            }
        }

        // =============================================================================
        // MAIN VIEW CONTROLLER (Sovereign Implementation)
        // =============================================================================

        function updateStudentView(data) {
            data = data || {};

            // CRITICAL FIX: Persist pollId globally and to sessionStorage for violation reporting
            if (data.pollId) {
                window.currentPollId = data.pollId;
                sessionStorage.setItem('veritas_active_poll_id', data.pollId);
            }

            // STATE REHYDRATION: Cache poll state for refresh immunity
            if (data.pollId && data.status) {
                cachePollState(data);
            }

            console.log('[ViewManager] Update View State:', data);

            // --- EARLY CHECKS BEFORE HIDING VIEWS (prevents white screen) ---

            var currentIndex = typeof data.questionIndex === 'number' ? data.questionIndex : null;

            // Normalize results visibility early for deterministic guards
            var resultsVisibility = data.resultsVisibility || (data.status === 'RESULTS_REVEALED' ? 'REVEALED' : null);

            // 1. POISON PILL CHECK - Do NOT hide views if student is locked
            var poisonPillActive = false;
            try {
                poisonPillActive = sessionStorage.getItem('veritas_lock_active') === 'true';
            } catch (e) { poisonPillActive = false; }

            if (poisonPillActive) {
                if (data && data.unlock_granted === true) {
                    clearPersistedLock();
                    poisonPillActive = false;
                    if (typeof hideLockEnforcementUI === 'function') { hideLockEnforcementUI(); }
                } else {
                    // Show lock screen WITHOUT hiding other views first
                    if (typeof showLockEnforcementUI === 'function') {
                        showLockEnforcementUI();
                    }
                    isInteractionBlocked = true;
                    startProctorPolling();
                    return;
                }
            }

            // 2. SOVEREIGN LOCK CHECK - Before hiding views
            if (LockManager.isLocked()) {
                if (data.unlockApproved === true) {
                    console.log('[LockManager] Server approved unlock - Clearing Poison Pill');
                    LockManager.unlock();
                } else {
                    console.warn('[LockManager] Local Lock Active - Blocking View Update');
                    var reason = sessionStorage.getItem('lock_reason');
                    LockManager.renderLockScreen(reason);
                    return; // HALT RENDER - SECURITY BLOCK
                }
            } else if (data.isLocked || data.status === 'LOCKED') {
                // Server commanded lock
                LockManager.lock(data.lockReason || 'Server Command');
                return;
            }

            // 3. PAUSED STATE CHECK - Show "Eyes on Teacher" overlay
            var pausedOverlay = document.getElementById('paused-overlay');
            if (data.status === 'PAUSED') {
                console.log('[ViewManager] Session PAUSED - showing Eyes on Teacher overlay');
                if (pausedOverlay) {
                    pausedOverlay.classList.remove('hidden');
                    pausedOverlay.style.display = 'flex';
                }
                isInteractionBlocked = true;
                // Keep connection alive but block inputs - do not return, let views stay rendered behind overlay
            } else {
                // Auto-hide paused overlay when status changes back
                if (pausedOverlay && pausedOverlay.style.display !== 'none') {
                    console.log('[ViewManager] Session resumed - hiding PAUSED overlay');
                    pausedOverlay.classList.add('hidden');
                    pausedOverlay.style.display = 'none';
                    isInteractionBlocked = false;
                }
            }

            // 4. SUBMISSION GUARD - If already submitted, show waiting screen immediately (no flash)
            // Maintain submission guardrails so polling cannot rewind UI
            if (data.hasSubmitted === true && currentIndex !== null) {
                lastSubmittedQuestionIndex = currentIndex;
            }

            // If we've already submitted for this question, never re-render the prompt unless in reveal phase
            if (currentIndex !== null && lastSubmittedQuestionIndex === currentIndex && data.status === 'LIVE' && resultsVisibility !== 'REVEALED') {
                // Don't hide views - just ensure status container is visible
                if (questionContainer) questionContainer.style.display = 'none';
                showWaitingForNextPhase('Answer Saved. Waiting for next question...');
                return;
            }

            // --- NOW SAFE TO HIDE VIEWS AND TRANSITION ---

            hideAllViews();

            // STRICT VIEW MUTEX: prevent ghost/double screens
            ['entry-screen', 'secure-lobby', 'student-container'].forEach(function (viewId) {
                var viewEl = document.getElementById(viewId);
                if (viewEl) {
                    viewEl.style.display = 'none';
                    viewEl.classList.add('hidden');
                }
            });

            // FIREBASE INIT CHECK (Lazy)
            if (!firebaseRef && data.pollId && data.studentEmail) {
                // Now async, but that's fine, it will init in background
                initFirebaseSidecar(data.pollId, data.studentEmail);
            }

            // RESULTS / REVEAL HANDLING
            if (data.resultsVisibility === 'REVEALED' || data.status === 'RESULTS_REVEALED') {
                var normalizedStatus = data.status || 'RESULTS_REVEALED';
                data.status = normalizedStatus;
                renderResultsStage(data);
                return;
            }
            if (data.status === 'RESULTS_HOLD') {
                showWaitingForNextPhase('Results Pending Analysis');
                return;
            }

            // 3. Calculator Sync
            var calcEnabled = data.calculatorEnabled === true;
            if (window.syncCalculatorVisibility) {
                window.syncCalculatorVisibility(calcEnabled);
            }

            // 4. Session Status Handling
            if (data.status === 'CLOSED' || data.sessionPhase === 'ENDED') {
                if (window.hideCalculatorOnSessionEnd) window.hideCalculatorOnSessionEnd();
                ViewManager.show('status-container');
                renderStatusMessage('Session Concluded', 'The live session has ended. Thanks for participating!');
                return;
            }

            if (!data.sessionType && !data.pollId) {
                if (entryScreen) {
                    entryScreen.style.display = 'block';
                    entryScreen.classList.remove('hidden');
                }
                ViewManager.show('entry-screen');
                return;
            }

            // Animation for question transition
            var isNewQuestion = lastQuestionIndex !== currentIndex && currentIndex !== null;
            if (isNewQuestion) {
                lastQuestionIndex = currentIndex;
                var sContainer = document.getElementById('student-container');
                if (sContainer) {
                    sContainer.classList.remove('motion-slide-in-right');
                    void sContainer.offsetWidth; // Force reflow
                    sContainer.classList.add('motion-slide-in-right');
                }
            }

            if (studentContainer) {
                studentContainer.style.display = 'block';
                studentContainer.classList.remove('hidden');
            }

            // 5. Route to specific view handlers
            var isSecure = (data.sessionType === 'SECURE_ASSESSMENT' || data.sessionType === 'SECURE');

            if (isSecure) {
                // Secure Logic
                if (data.status === 'LOBBY' || data.sessionPhase === 'LOBBY') {
                    var lobbyView = document.getElementById('secure-lobby');
                    if (lobbyView) {
                        lobbyView.style.display = 'block';
                        lobbyView.classList.remove('hidden');
                    }
                    ViewManager.show('secure-lobby');
                    renderSecureLobby(data);
                } else {
                    ViewManager.show('individual-timed-session');
                    showIndividualTimedView(data);
                }
            } else {
                // Live Poll Logic (Legacy)

                // FIX: ENTRY GATE - Require student to click "Begin Poll" before showing content
                // This prevents Firebase listener from auto-bypassing the entry screen
                if (!studentSessionStarted) {
                    console.log('[ViewManager] Blocking Live Poll render - student has not clicked Begin Poll');
                    // Show entry screen and wait for user interaction
                    if (entryScreen) {
                        entryScreen.style.display = 'block';
                        entryScreen.classList.remove('hidden');
                    }
                    ViewManager.show('entry-screen');
                    return; // Stop here until student clicks Begin Poll
                }

                if (data.sessionPhase === 'LOBBY') {
                    ViewManager.show('pre-live-card');
                    updatePreLiveCard(data);
                } else {
                    ViewManager.show('question-container');

                    // Legacy UI updates
                    if (data.status === 'PRE_LIVE') {
                        liveSessionActive = false;
                        hasAnsweredCurrent = false;
                        pendingSubmission = false;
                        currentQuestionKey = null;
                        toggleSecureLayout(false);
                        if (questionProgressEl) questionProgressEl.textContent = 'QUESTION 1 OF ?';
                        ViewManager.show('pre-live-card'); // Redundant but safe
                    } else {
                        if (pendingMetacogQuestionIndex === currentIndex && metacogSubmittedFor !== currentIndex) {
                            showConfidenceQuestion(data.pollId, currentIndex);
                            return;
                        }

                        if (data.hasSubmitted === true && currentIndex !== null) {
                            showWaitingForNextPhase('Answer Saved. Waiting for next question...');
                            return;
                        }
                        renderQuestion(data);
                    }
                }
            }

            // Resume controls logic (legacy cleanup)
            var resumeControls = document.getElementById('resume-controls');
            if (resumeControls) resumeControls.style.display = 'none';
        }

        // =============================================================================
        // LIVE POLL QUESTION RENDERER (FIX: Was undefined, causing blank question view)
        // =============================================================================
        function renderQuestion(data) {
            // FIX TASK B: LOCK GUARD - If locked, do not render question content
            // This prevents lock bypass via question rendering in Live Poll mode
            if (LockManager.isLocked()) {
                console.log('[Proctor] renderQuestion BLOCKED - Lock active');
                LockManager.renderLockScreen(sessionStorage.getItem('lock_reason'));
                return; // HALT RENDER - SECURITY BLOCK
            }

            // Defensive guard: if critical elements are missing, show error
            if (!questionContainer || !optionsList || !questionTextEl) {
                console.error('[renderQuestion] Critical DOM elements missing');
                var errorOverlay = document.getElementById('render-error-overlay');
                if (!errorOverlay) {
                    errorOverlay = document.createElement('div');
                    errorOverlay.id = 'render-error-overlay';
                    errorOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:sans-serif;';
                    errorOverlay.innerHTML = '<h2 style="font-size:24px;margin-bottom:16px;">Unable to Load Question</h2><p style="max-width:400px;text-align:center;">Critical UI elements are missing. Please refresh the page or contact your teacher.</p>';
                    document.body.appendChild(errorOverlay);
                }
                return;
            }

            currentPollState = data;
            console.log('[renderQuestion] Rendering Live Poll question:', data);

            // Derive question key for change detection
            var resetTimestamp = (data.metadata && data.metadata.resetAt) ? data.metadata.resetAt : '';
            var newQuestionKey = data.pollId + ':' + data.questionIndex + ':' + resetTimestamp;

            // Check if question has changed
            var questionChanged = (currentQuestionKey !== newQuestionKey);
            if (questionChanged) {
                console.log('[renderQuestion] Question changed from', currentQuestionKey, 'to', newQuestionKey);
                currentQuestionKey = newQuestionKey;
                hasAnsweredCurrent = !!data.hasSubmitted;
                pendingSubmission = false;
                currentOptionLayout = [];
                liveSessionActive = true;
                pendingMetacogQuestionIndex = null;
                metacogSubmittedFor = null;

                // Initialize activity tracker for this question
                activityTracker.init(data.pollId, data.sessionId || '', data.questionIndex);
            }

            // Update metacognition setting for this question
            currentMetacognitionEnabled = !!data.metacognitionEnabled;

            // Update question progress (fixes "QUESTION --" display)
            updateQuestionProgress(data.questionIndex, data.totalQuestions);

            // Show question container, hide status
            questionContainer.style.display = 'block';
            if (statusContainer) statusContainer.style.display = 'none';

            // Set question text with fallback and visibility check
            if (questionTextEl) {
                var qText = data.questionText || data.text || data.stem || '';
                if (!qText && data.options && data.options.length > 0) {
                    // Fallback: If options exist but text is missing, show loading
                    qText = '<span class="animate-pulse text-gray-500 italic">Loading question...</span>';
                    console.error('[renderQuestion] Missing question text. Full data:', JSON.stringify(data, null, 2));
                    console.warn('[renderQuestion] Question text is missing, showing loader');
                    // Force immediate full poll to resolve this
                    if (typeof startPolling === 'function') startPolling(true);
                } else if (!qText) {
                    console.error('[renderQuestion] No question text and no options. Full data:', JSON.stringify(data, null, 2));
                    qText = "[Question Text Missing]";
                }

                // Use innerHTML instead of textContent to support the spinner span, via renderRichText
                questionTextEl.innerHTML = renderRichText(qText);
                // Trigger math render
                triggerMathRender();
                questionTextEl.style.display = 'block'; // Force visibility
                questionTextEl.classList.remove('hidden');
            }

            // Handle question image
            var hasQuestionImage = !!data.questionImageURL;
            if (questionImageEl) {
                if (hasQuestionImage) {
                    questionImageEl.src = data.questionImageURL;
                    questionImageEl.style.display = 'block';
                } else {
                    questionImageEl.style.display = 'none';
                }
            }
            if (questionLayout) {
                questionLayout.classList.toggle('no-image', !hasQuestionImage);
            }
            if (questionVisual) {
                questionVisual.style.display = hasQuestionImage ? 'flex' : 'none';
            }

            // Hide subline (used for results stage)
            if (questionSublineEl) {
                questionSublineEl.classList.add('hidden');
                questionSublineEl.textContent = '';
            }
            if (noResponsesMessageEl) {
                noResponsesMessageEl.classList.add('hidden');
                noResponsesMessageEl.textContent = '';
            }

            // Clear results decorations (removes blur, ribbon, review-mode class, etc.)
            resetResultDecorations();

            // Render options only if question changed or options empty
            if (questionChanged || optionsList.children.length === 0) {
                var options = data.options || [];
                var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

                // Apply shuffle if enabled (and question just changed)
                if (questionChanged && data.shuffleOptions) {
                    options = shuffle(options.slice());
                }

                optionsList.innerHTML = '';
                currentOptionLayout = [];

                options.forEach(function (option, index) {
                    var normalized = {
                        text: (typeof option === 'string') ? option : (option.text || ''),
                        imageURL: (typeof option === 'object') ? (option.imageURL || option.imageUrl || '') : '',
                        id: (typeof option === 'object') ? (option.id || null) : null
                    };
                    var letter = letters[index] || (index + 1).toString();
                    var btn = createOptionButton(normalized, letter, data.pollId, data.questionIndex, index);

                    // Disable if already answered
                    if (hasAnsweredCurrent) {
                        btn.disabled = true;
                        btn.classList.add('answer-option-disabled');
                    }

                    var listItem = document.createElement('li');
                    listItem.appendChild(btn);
                    optionsList.appendChild(listItem);

                    currentOptionLayout.push({
                        text: normalized.text,
                        imageURL: normalized.imageURL
                    });
                });

                // Restore cross-out state from sessionStorage after options rendered
                restoreCrossOutState(data.pollId, data.questionIndex);
            } else if (hasAnsweredCurrent) {
                // Student has already answered - show waiting screen instead of question
                showWaitingForNextPhase('Answer Saved. Waiting for next question...');
                return;
            }

            // CRITICAL: Trigger Math Render after ALL content (question + options) is injected
            triggerMathRender();
        }

        function submitAnswer(pollId, questionIndex, answerText, answerId) {
            console.log('=== SUBMIT ANSWER CALLED ===');
            console.log('currentMetacognitionEnabled:', currentMetacognitionEnabled);
            console.log('answerText:', answerText);

            if (isInteractionBlocked) {
                return;
            }
            if (hasAnsweredCurrent) {
                return;
            }

            var buttons = optionsList.querySelectorAll('button');
            for (var i = 0; i < buttons.length; i++) {
                buttons[i].disabled = true;
                if (buttons[i].dataset.answerText === answerText) {
                    buttons[i].className = optionSelectedClass;
                } else {
                    buttons[i].className = optionDisabledClass;
                }
            }

            // Check if metacognition is enabled for this question
            if (currentMetacognitionEnabled) {
                console.log('Metacognition is enabled - showing confidence question');
                pendingAnswerText = answerText;
                // Store ID temporarily in the container
                if (statusContainer) statusContainer.dataset.pendingAnswerId = answerId || '';

                questionContainer.style.display = 'none';
                showConfidenceQuestion(pollId, questionIndex);
            } else {
                console.log('Metacognition is NOT enabled - submitting answer directly');
                hasAnsweredCurrent = true;
                pendingSubmission = true;
                // Show immediate feedback while waiting for server response
                statusContainer.style.display = 'block';
                questionContainer.style.display = 'none';
                if (statusMessage) {
                    statusMessage.textContent = "Submitting answer...";
                    statusMessage.className = 'text-veritas-navy text-2xl font-bold';
                }
                if (statusSubMessage) {
                    statusSubMessage.textContent = 'Please wait while we confirm your submission.';
                    statusSubMessage.style.display = 'block';
                    statusSubMessage.className = 'text-slate-500 text-sm mt-2 animate-pulse';
                }
                submitAnswerToServer(pollId, questionIndex, answerText, answerId, null);
            }
        }

        function showConfidenceQuestion(pollId, questionIndex) {
            statusContainer.style.display = 'block';
            questionContainer.style.display = 'none';

            pendingMetacogQuestionIndex = questionIndex;

            statusMessage.textContent = 'How confident are you in your answer?';
            statusMessage.className = 'text-gray-800 text-xl font-semibold mb-4';

            if (statusSubMessage) {
                statusSubMessage.innerHTML = '<div class="confidence-selector mt-6 flex flex-col gap-3">' +
                    '<button class="confidence-btn h-14 px-6 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-gray-900 border-2 border-red-500/40 hover:border-red-500/60 transition-all font-semibold text-lg" data-confidence="guessing">' +
                    '<span class="mr-2">🤔</span> Guessing' +
                    '</button>' +
                    '<button class="confidence-btn h-14 px-6 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-gray-900 border-2 border-yellow-500/40 hover:border-yellow-500/60 transition-all font-semibold text-lg" data-confidence="somewhat-sure">' +
                    '<span class="mr-2">🤷</span> Somewhat Sure' +
                    '</button>' +
                    '<button class="confidence-btn h-14 px-6 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-gray-900 border-2 border-blue-500/40 hover:border-blue-500/60 transition-all font-semibold text-lg" data-confidence="very-sure">' +
                    '<span class="mr-2">👍</span> Very Sure' +
                    '</button>' +
                    '<button class="confidence-btn h-14 px-6 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-gray-900 border-2 border-green-500/40 hover:border-green-500/60 transition-all font-semibold text-lg" data-confidence="certain">' +
                    '<span class="mr-2">💯</span> Absolutely Certain' +
                    '</button>' +
                    '</div>';
                statusSubMessage.style.display = 'block';
                statusSubMessage.className = 'text-gray-700 text-base mt-4';

                var confidenceBtns = statusSubMessage.querySelectorAll('.confidence-btn');
                for (var i = 0; i < confidenceBtns.length; i++) {
                    confidenceBtns[i].addEventListener('click', function (event) {
                        event.preventDefault();
                        var confidence = this.dataset.confidence;
                        var answerId = statusContainer ? statusContainer.dataset.pendingAnswerId : null;
                        submitAnswerWithConfidence(pollId, questionIndex, pendingAnswerText, answerId, confidence);
                    });
                }
            }
        }

        if (secureBeginBtn) {
            secureBeginBtn.addEventListener('click', handleSecureBeginClick);
        }

        if (secureAccessCodeInput) {
            secureAccessCodeInput.addEventListener('input', function () {
                setSecureAccessError('');
            });
        }

        function submitAnswerWithConfidence(pollId, questionIndex, answerText, answerId, confidence) {
            // Track answer submission
            activityTracker.recordAnswerSubmitted(answerText, confidence);

            hasAnsweredCurrent = true;
            pendingSubmission = true;
            metacogSubmittedFor = questionIndex;
            pendingMetacogQuestionIndex = null;
            statusMessage.textContent = 'Transmitting your response...';
            statusMessage.className = 'text-gray-900 text-2xl font-semibold';
            if (statusSubMessage) {
                statusSubMessage.innerHTML = '';
                statusSubMessage.style.display = 'none';
            }
            submitAnswerToServer(pollId, questionIndex, answerText, answerId, confidence);
        }

        function submitAnswerToServer(pollId, questionIndex, answerText, answerId, confidence) {
            // =================================================================
            // OPTIMISTIC UI: Show success state IMMEDIATELY before writes complete
            // This follows the "Zero-Latency" dual-write pattern for instant feedback
            // =================================================================

            // INSTANT UI TRANSITION: Don't wait for promise
            pendingAnswerText = null;
            showWaitingForNextPhase('Answer Saved. Waiting for next question...');
            console.log('[Optimistic UI] Showing success state immediately');

            // DUAL-WRITE (Fire and forget with error handling)
            submitAnswerToFirebase(pollId, questionIndex, answerText, answerId, confidence)
                .then(function (firebaseResult) {
                    if (firebaseResult && firebaseResult.success) {
                        console.log('[Firebase] Dual-write confirmed successful');
                    } else {
                        // Silent retry or log - UI is already in success state
                        console.warn('[Firebase] Dual-write may have failed, but UI already transitioned');
                    }
                })
                .catch(function (error) {
                    // Log error but don't revert UI - the answer may still be saved
                    console.error('[Firebase] Dual-write error:', error);
                });
        } function handleLivePollError(error) {
            hasAnsweredCurrent = false;
            pendingSubmission = false;
            pendingAnswerText = null;
            statusMessage.textContent = error || 'We hit a hiccup. Try again?';
            statusMessage.className = 'text-red-700 text-2xl font-semibold';
            if (statusSubMessage) {
                statusSubMessage.style.display = 'none';
                statusSubMessage.textContent = '';
            }
            setTimeout(function () {
                if (!isInteractionBlocked) {
                    questionContainer.style.display = 'block';
                    statusContainer.style.display = 'none';
                    var buttons = optionsList.querySelectorAll('button');
                    for (var i = 0; i < buttons.length; i++) {
                        buttons[i].disabled = false;
                        buttons[i].className = optionBaseClass;
                    }
                }
            }, 2000);
        }

        function shuffle(array) {
            var arr = array.slice();
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
            }
            return arr;
        }

        function createOptionButton(option, letter, pollId, questionIndex, optionIndex) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = optionBaseClass;
            btn.dataset.answerText = option.text || '';
            btn.dataset.optionIndex = optionIndex;

            var displayText = (option.text || '').trim();

            var content = '';
            if (option.imageURL) {
                content += '<img src="' + escapeHtml(option.imageURL) + '" alt="Answer ' + letter + '" class="option-image" referrerpolicy="no-referrer">';
            }
            content += '<div class="option-leading">';
            content += '<div class="letter-badge" aria-hidden="true">' + letter + '</div>';
            content += '<div class="option-body">';
            content += '<div class="option-text-wrapper">';
            if (displayText) {
                // Use renderRichText to support formatting and math in options
                // Note: renderRichText returns a div with .ql-editor class
                // We wrap it in a container that preserves the class .option-text for styling
                content += '<div class="option-text">';
                content += renderRichText(displayText);
                content += '</div>';
            }
            content += '<span class="sr-only result-announcement"></span>';
            content += '</div>';
            content += '</div>';
            content += '</div>';

            // New Review Mode Elements
            content += '<div class="result-metadata">';
            content += '<div class="percentage-flag" style="display:none"></div>';
            content += '<div class="result-icon-marker"></div>';
            content += '</div>';
            content += '<div class="result-badges"></div>';

            // Cross-Out Toggle Button
            content += '<button type="button" class="cross-out-toggle" aria-label="Cross out this answer" title="Click to eliminate this option">';
            content += '<span class="material-symbols-outlined">visibility_off</span>';
            content += '</button>';

            btn.innerHTML = content;

            // Cross-Out Toggle Handler
            var crossOutToggle = btn.querySelector('.cross-out-toggle');
            if (crossOutToggle) {
                crossOutToggle.addEventListener('click', function (event) {
                    event.stopPropagation(); // CRITICAL: Don't trigger answer submission
                    event.preventDefault();

                    var isCrossedOut = btn.classList.toggle('crossed-out');

                    // Update icon
                    var icon = crossOutToggle.querySelector('.material-symbols-outlined');
                    if (icon) {
                        icon.textContent = isCrossedOut ? 'visibility' : 'visibility_off';
                    }
                    crossOutToggle.setAttribute('aria-label', isCrossedOut ? 'Restore this answer' : 'Cross out this answer');
                    crossOutToggle.setAttribute('title', isCrossedOut ? 'Click to restore this option' : 'Click to eliminate this option');

                    // Persist to sessionStorage
                    saveCrossOutState(pollId, questionIndex);
                });
            }

            btn.addEventListener('click', function (event) {
                // Prevent submission if clicking cross-out toggle
                if (event && event.target && event.target.closest('.cross-out-toggle')) {
                    return;
                }

                // Prevent submission if clicking an image (e.g. for zoom)
                // Robust check for any image element within the click target chain
                if (event && event.target && (event.target.closest('.option-image') || event.target.closest('img'))) {
                    console.log('[Interaction] Image clicked - ignoring submission to allow zoom');
                    return;
                }

                // Prevent submission if option is crossed out
                if (btn.classList.contains('crossed-out')) {
                    console.log('[Interaction] Crossed-out option clicked - ignoring');
                    return;
                }

                // Track option click
                var idx = Array.from(btn.parentElement.parentElement.children).indexOf(btn.parentElement);
                activityTracker.recordOptionClick(idx, option.text);

                submitAnswer(pollId, questionIndex, option.text, option.id);
            });

            return btn;
        }

        // =============================================================================
        // CROSS-OUT PERSISTENCE HELPERS
        // =============================================================================

        function getCrossOutStorageKey(pollId, questionIndex) {
            return 'vlp_crossout_' + pollId + '_' + questionIndex;
        }

        function saveCrossOutState(pollId, questionIndex) {
            try {
                var crossedOutIndices = [];
                var buttons = optionsList ? optionsList.querySelectorAll('button.answer-option') : [];
                buttons.forEach(function (btn, index) {
                    if (btn.classList.contains('crossed-out')) {
                        crossedOutIndices.push(index);
                    }
                });
                var key = getCrossOutStorageKey(pollId, questionIndex);
                sessionStorage.setItem(key, JSON.stringify(crossedOutIndices));
                console.log('[CrossOut] Saved state:', crossedOutIndices, 'for key:', key);
            } catch (e) {
                console.warn('[CrossOut] Failed to save state:', e);
            }
        }

        function restoreCrossOutState(pollId, questionIndex) {
            try {
                var key = getCrossOutStorageKey(pollId, questionIndex);
                var stored = sessionStorage.getItem(key);
                if (!stored) return;

                var crossedOutIndices = JSON.parse(stored);
                if (!Array.isArray(crossedOutIndices)) return;

                var buttons = optionsList ? optionsList.querySelectorAll('button.answer-option') : [];
                crossedOutIndices.forEach(function (index) {
                    if (buttons[index]) {
                        buttons[index].classList.add('crossed-out');
                        var toggle = buttons[index].querySelector('.cross-out-toggle');
                        if (toggle) {
                            var icon = toggle.querySelector('.material-symbols-outlined');
                            if (icon) icon.textContent = 'visibility';
                            toggle.setAttribute('aria-label', 'Restore this answer');
                            toggle.setAttribute('title', 'Click to restore this option');
                        }
                    }
                });
                console.log('[CrossOut] Restored state:', crossedOutIndices, 'for key:', key);
            } catch (e) {
                console.warn('[CrossOut] Failed to restore state:', e);
            }
        }

        function resetResultDecorations() {
            if (questionContainer) {
                questionContainer.classList.remove('results-stage', 'showing-results', 'review-mode');
                // Remove ribbon if exists
                var ribbon = questionContainer.querySelector('.review-ribbon-strip');
                if (ribbon) ribbon.remove();
            }
            // Disable privacy blur
            var flashlight = document.getElementById('flashlight-overlay');
            if (flashlight) flashlight.style.display = 'none';
            if (questionContainer) {
                questionContainer.classList.remove('privacy-active');
            }

            if (questionSublineEl) {
                questionSublineEl.classList.add('hidden');
                questionSublineEl.textContent = '';
            }
            if (noResponsesMessageEl) {
                noResponsesMessageEl.classList.add('hidden');
                noResponsesMessageEl.textContent = '';
            }
            if (!optionsList) return;
            var buttons = optionsList.querySelectorAll('button');
            buttons.forEach(function (btn) {
                btn.disabled = false;
                btn.className = optionBaseClass;
                btn.classList.remove('result-readonly', 'result-correct', 'result-incorrect', 'result-your-choice', 'result-neutral');

                // Clear new elements
                var flag = btn.querySelector('.percentage-flag');
                if (flag) { flag.style.display = 'none'; flag.textContent = ''; }

                var marker = btn.querySelector('.result-icon-marker');
                if (marker) marker.textContent = '';

                var badges = btn.querySelector('.result-badges');
                if (badges) badges.innerHTML = '';
            });
        }

        function ensureOptionsRenderedForResults(data) {
            if (!optionsList) return;
            if (optionsList.children.length > 0) {
                return;
            }

            var baseOptions = currentOptionLayout.length > 0 ? currentOptionLayout : (data.options || []);
            var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
            optionsList.innerHTML = '';
            currentOptionLayout = [];

            baseOptions.forEach(function (option, index) {
                var normalized = {
                    text: option.text || option,
                    imageURL: option.imageURL || option.imageUrl || ''
                };
                var letter = letters[index] || (index + 1).toString();
                var btn = createOptionButton(normalized, letter, data.pollId, data.questionIndex, index);
                btn.disabled = true;
                btn.classList.add('result-readonly');
                var listItem = document.createElement('li');
                listItem.appendChild(btn);
                optionsList.appendChild(listItem);
                currentOptionLayout.push({
                    text: normalized.text || '',
                    imageURL: normalized.imageURL || ''
                });
            });
        }

        function decorateOptionsForResults(data) {
            if (!optionsList) return;
            var totalResponses = typeof data.totalResponses === 'number' ? data.totalResponses : 0;
            var percentages = data.resultPercentages || {};
            var buttons = optionsList.querySelectorAll('button');

            buttons.forEach(function (btn) {
                var answerText = btn.dataset.answerText || '';
                btn.disabled = true;
                btn.className = optionBaseClass + ' result-readonly';
                btn.classList.remove('result-correct', 'result-incorrect', 'result-your-choice');

                var srOnly = btn.querySelector('.result-announcement');
                if (srOnly) srOnly.textContent = '';

                if (data.status !== 'RESULTS_REVEALED') {
                    return;
                }

                var percentage = typeof percentages[answerText] === 'number' ? percentages[answerText] : 0;

                // Update Flag
                var flag = btn.querySelector('.percentage-flag');
                if (flag) {
                    flag.style.display = 'block';
                    // Always show flag for every option as per "Percentages as Flags" requirement
                    if (totalResponses > 0 || percentage > 0) {
                        flag.textContent = percentage + '%';
                    } else {
                        flag.textContent = '0%';
                    }
                }

                var isCorrect = data.correctAnswer && answerText === data.correctAnswer;
                var hasStudentAnswer = data.studentAnswer !== undefined && data.studentAnswer !== null && data.studentAnswer !== '';
                var isStudentChoice = hasStudentAnswer && answerText === data.studentAnswer;
                var studentIsCorrect = (data.studentIsCorrect === null || data.studentIsCorrect === undefined)
                    ? null
                    : !!data.studentIsCorrect;

                // State Classes
                if (isCorrect) {
                    btn.classList.add('result-correct');
                } else if (isStudentChoice && (studentIsCorrect === false || !isCorrect)) {
                    btn.classList.add('result-incorrect');
                } else {
                    // Neutral/Unselected options
                    btn.classList.add('result-neutral');
                }

                // Markers (Check/X)
                var marker = btn.querySelector('.result-icon-marker');
                if (marker) {
                    if (isCorrect) {
                        marker.textContent = 'check_circle'; // Green Check
                        marker.parentElement.parentElement.classList.add('result-correct'); // reinforce parent
                    } else if (isStudentChoice && (studentIsCorrect === false || !isCorrect)) {
                        marker.textContent = 'cancel'; // Red X
                        marker.parentElement.parentElement.classList.add('result-incorrect');
                    } else {
                        marker.textContent = ''; // No icon for others
                    }
                }

                // Badges
                var badgesContainer = btn.querySelector('.result-badges');
                if (badgesContainer) {
                    badgesContainer.innerHTML = '';
                    if (isStudentChoice) {
                        var badge = document.createElement('span');
                        badge.className = 'badge-pill badge-your-choice';
                        badge.textContent = 'Your Choice';
                        badgesContainer.appendChild(badge);
                    }
                    if (isCorrect) {
                        var badge = document.createElement('span');
                        badge.className = 'badge-pill badge-correct';
                        badge.textContent = 'Correct';
                        badgesContainer.appendChild(badge);
                    }
                }

                // SR Announcement
                if (srOnly) {
                    var srParts = [];
                    if (isCorrect) srParts.push('Correct answer');
                    if (isStudentChoice) srParts.push('Your selection');
                    srParts.push(percentage + '% of class selected this choice');
                    srOnly.textContent = srParts.join('. ') + '.';
                }
            });
        }

        // Flashlight / Privacy Blur Logic
        // Handled via CSS classes (.review-mode triggers .privacy-blur on container)
        // No JS needed for flashlight effect anymore.


        function renderResultsStage(data) {
            currentPollState = data;
            var resetTimestamp = (data.metadata && data.metadata.resetAt) ? data.metadata.resetAt : '';
            currentQuestionKey = data.pollId + ':' + data.questionIndex + ':' + resetTimestamp;
            hasAnsweredCurrent = !!data.hasSubmitted;

            // Ensure parent container is visible for results display
            if (studentContainer) {
                studentContainer.style.display = 'block';
                studentContainer.classList.remove('hidden');
            }

            questionContainer.style.display = 'block';
            questionContainer.classList.remove('hidden');
            statusContainer.style.display = 'none';

            var qNum = (data.questionIndex || 0) + 1;
            var qTotal = data.totalQuestions || '?';
            updateQuestionProgress(data.questionIndex, data.totalQuestions);
            if (questionTextEl) {
                questionTextEl.textContent = data.questionText || '';
            }
            var hasQuestionImage = !!data.questionImageURL;
            if (questionImageEl) {
                if (hasQuestionImage) {
                    questionImageEl.src = data.questionImageURL;
                    questionImageEl.style.display = 'block';
                } else {
                    questionImageEl.style.display = 'none';
                }
            }
            if (questionLayout) {
                questionLayout.classList.toggle('no-image', !hasQuestionImage);
            }
            if (questionVisual) {
                questionVisual.style.display = hasQuestionImage ? 'flex' : 'none';
            }

            // Remove old styling text
            if (questionSublineEl) {
                questionSublineEl.classList.add('hidden'); // Removed "Shown after responses closed."
            }

            if (data.status === 'RESULTS_REVEALED' && noResponsesMessageEl) {
                if ((data.totalResponses || 0) === 0) {
                    noResponsesMessageEl.textContent = 'No responses recorded for this question.';
                    noResponsesMessageEl.classList.remove('hidden');
                } else {
                    noResponsesMessageEl.classList.add('hidden');
                    noResponsesMessageEl.textContent = '';
                }
            } else if (noResponsesMessageEl) {
                noResponsesMessageEl.classList.add('hidden');
                noResponsesMessageEl.textContent = '';
            }

            ensureOptionsRenderedForResults(data);

            questionContainer.classList.add('results-stage', 'review-mode');

            // Add Review Ribbon
            if (!questionContainer.querySelector('.review-ribbon-strip')) {
                var ribbon = document.createElement('div');
                ribbon.className = 'review-ribbon-strip animate-fade-in';
                ribbon.textContent = 'REVIEW';
                questionContainer.appendChild(ribbon);
            }

            // Enable Privacy Blur Mode
            var flashlight = document.getElementById('flashlight-overlay');
            if (flashlight) {
                flashlight.style.display = 'none'; // Ensure old overlay is hidden
                // Set initial position to center or last known
                flashlight.style.setProperty('--x', (window.innerWidth / 2) + 'px');
                flashlight.style.setProperty('--y', (window.innerHeight / 2) + 'px');
            }
            if (questionContainer) {
                questionContainer.classList.add('privacy-active');
            }

            questionContainer.classList.remove('showing-results');
            if (data.status === 'RESULTS_REVEALED') {
                requestAnimationFrame(function () {
                    questionContainer.classList.add('showing-results');
                });
            }

            decorateOptionsForResults(data);
        }

        function escapeHtml(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function showStatusPanel(options) {
            options = options || {};
            hideConnectivityBanner();
            hideSecureLobby();
            if (studentContainer) studentContainer.style.display = 'block';
            if (entryScreen) entryScreen.style.display = 'none';
            if (questionContainer) questionContainer.style.display = 'none';
            if (secureFocusContainer) secureFocusContainer.style.display = 'none';
            if (studentLoader) studentLoader.style.display = 'none';
            if (statusContainer) statusContainer.style.display = 'block';

            // Theme Handling
            var isDark = options.theme === 'dark';
            var statusCard = statusContainer ? statusContainer.querySelector('.status-card') : null;

            if (isDark) {
                // Apply Premium Glass Dark Theme
                if (statusContainer) {
                    statusContainer.className = 'fixed inset-0 z-[9000] flex items-center justify-center p-6 transition-all duration-700 backdrop-blur-3xl bg-slate-950/40 select-none';
                    statusContainer.style.display = 'flex';
                }
                if (statusCard) {
                    statusCard.className = 'status-card relative w-full max-w-xl mx-auto p-12 overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col items-center text-center motion-slide-up';
                    // Extra layer for better glass effect
                    statusCard.style.backdropFilter = 'blur(20px)';
                    statusCard.style.webkitBackdropFilter = 'blur(20px)';
                }
                // Hide the Student Header if in full overlay mode
                var header = document.querySelector('.student-header');
                if (header) header.style.display = 'none';
            } else {
                // Light/Default Theme
                if (statusContainer) {
                    statusContainer.className = 'text-center py-12 animate-fade-in block';
                    statusContainer.style.display = 'block';
                }
                if (statusCard) {
                    statusCard.className = 'status-card bg-white rounded-2xl border border-gray-200 p-8 sm:p-12 shadow-2xl max-w-3xl mx-auto';
                    statusCard.style.backdropFilter = 'none';
                    statusCard.style.webkitBackdropFilter = 'none';
                }
                var header = document.querySelector('.student-header');
                if (header) header.style.display = ''; // Restore
            }

            if (statusMessage) {
                statusMessage.textContent = options.message || '';
                statusMessage.className = options.messageClass || (isDark ? 'text-white text-4xl font-bold tracking-tight mb-2 drop-shadow-sm' : 'text-gray-900 text-2xl font-semibold');
            }
            if (statusSubMessage) {
                if (options.subtext) {
                    statusSubMessage.style.display = 'block';
                    statusSubMessage.textContent = options.subtext;
                    statusSubMessage.className = options.subClass || (isDark ? 'text-slate-300 text-xl mt-4 max-w-lg mx-auto leading-relaxed' : 'text-gray-700 text-lg mt-4');
                } else {
                    statusSubMessage.style.display = 'none';
                    statusSubMessage.textContent = '';
                }
            }
            var iconEl = statusContainer ? statusContainer.querySelector('.material-symbols-outlined') : null;
            if (iconEl) {
                iconEl.textContent = options.icon || 'info';
                if (isDark) {
                    // Modern icon accent
                    iconEl.className = 'material-symbols-outlined text-8xl mb-10 select-none ' + (options.iconClass || 'text-emerald-400');
                    iconEl.style.textShadow = '0 0 30px rgba(52, 211, 153, 0.4)';
                } else {
                    iconEl.className = 'material-symbols-outlined text-6xl mb-4 inline-block ' + (options.iconClass || 'text-veritas-navy');
                    iconEl.style.textShadow = 'none';
                }
            }
            if (resumeControls) {
                resumeControls.style.display = options.showResume ? 'block' : 'none';
                if (isDark && options.showResume) {
                    var btn = document.getElementById('resume-session-btn');
                    if (btn) {
                        btn.className = 'mx-auto mt-8 flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-white text-slate-900 text-xl font-bold hover:bg-slate-50 transition-all duration-300 hover:scale-105 shadow-[0_20px_40px_-10px_rgba(255,255,255,0.2)] active:scale-95';
                    }
                }
            }
            if (secureExitControls) {
                if (options.showExitAction) {
                    secureExitControls.classList.remove('hidden');
                    if (secureExitDescription) {
                        secureExitDescription.textContent = options.exitActionDescription || 'Click below to exit fullscreen and close the secure window.';
                        if (isDark) secureExitDescription.className = 'text-slate-400 text-sm mt-12 mb-4 max-w-sm mx-auto';
                    }
                    if (secureExitBtn) {
                        if (isDark) {
                            secureExitBtn.className = 'mx-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-base font-medium hover:bg-white/10 transition-all duration-300 hover:text-white';
                        }
                    }
                    if (secureExitLabel) {
                        secureExitLabel.textContent = options.exitActionLabel || 'Exit Secure Session';
                    }
                } else {
                    secureExitControls.classList.add('hidden');
                }
            }
            if (document && document.body) {
                if (options.lockScroll) {
                    document.body.classList.add('secure-overlay-active');
                } else {
                    document.body.classList.remove('secure-overlay-active');
                }
            }
        }

        function showLockedMessage(message, subMessage) {
            console.log('Showing locked message');
            stopPolling();
            recoveringFromOutage = false;
            // Professional lock message with science-themed copy
            showStatusPanel({
                icon: 'lock',
                iconClass: 'text-red-600',
                message: message || 'Assessment Paused',
                messageClass: 'text-gray-900 text-2xl font-bold',
                subtext: subMessage || 'Proctoring protocol triggered. Your teacher can see this and will grant re-entry.',
                subClass: 'text-gray-800 text-base mt-4 whitespace-pre-line',
                showResume: false,
                lockScroll: true
            });
            isTeacherBlocked = false;
        }

        /**
         * VERITAS UI CONFIGURATION
         * Theme: "Clear Protocol + Calm Guide" (Hybrid)
         * Tone: Warm but Precise. Human but Authoritative.
         */
        const UX_COPY = {
            // VIOLATION
            LOCKED: {
                title: "Assessment Paused",
                icon: "fullscreen_exit",
                body: "Fullscreen exit detected. Please wait for your instructor to re-admit you.",
                footer: "Your work has been saved. Stay on this screen.",
                badge: "PAUSED",
                statusLight: "CONNECTION ACTIVE"
            },
            // LOBBY
            PRE_LIVE: {
                title: "Checked In",
                icon: "how_to_reg",
                body: "Connected. Waiting for your teacher to start the session."
            },
            // SUBMITTED
            RESPONSE_SUBMITTED: {
                title: "Answer Saved",
                icon: "check_circle",
                body: "Response recorded. Waiting for next question..."
            },
            // REVEAL
            WAITING_FOR_REVEAL: {
                title: "Answers Locked",
                icon: "lock",
                body: "Responses are sealed. Your teacher will reveal results shortly."
            },
            // TRANSITION
            BETWEEN_QUESTIONS: {
                title: "Next Question Loading",
                icon: "hourglass_top",
                body: "Preparing the next question..."
            },
            // PAUSED (Teacher paused session)
            PAUSED: {
                title: "Eyes on Teacher",
                icon: "visibility",
                body: "The session is paused. Please look up and wait for instructions."
            }
        };

        // --- AMBER LOCK SCREEN RENDERER ---
        function showLockEnforcementUI(reason) {
            var container = document.getElementById('lock-overlay');
            if (!container) return;

            // Reset opacity to ensure visibility (cleanup from old trap code)
            document.body.style.opacity = '1';
            container.style.display = 'flex';

            // SECURITY FIX: Escape reason to prevent XSS (even though currently app-controlled)
            // This protects against future refactoring where user-controlled data might flow here
            var safeReason = reason ? escapeHtml(reason) : UX_COPY.LOCKED.body;

            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full w-full max-w-2xl mx-auto p-8 animate-fade-in text-center">

                    <div class="h-20 w-20 bg-amber-900/20 rounded-full flex items-center justify-center mb-6 border-2 border-amber-700">
                        <span class="material-symbols-outlined text-4xl text-amber-400">
                            ${UX_COPY.LOCKED.icon}
                        </span>
                    </div>

                    <h1 class="text-3xl font-bold text-white mb-2 tracking-tight">
                        ${UX_COPY.LOCKED.title}
                    </h1>

                    <div class="w-full bg-amber-900/10 border-l-4 border-amber-500 p-5 my-6 text-left rounded-r-md">
                        <p class="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">
                            ${UX_COPY.LOCKED.badge}
                        </p>
                        <p class="text-lg text-gray-100">
                            ${safeReason}
                        </p>
                    </div>

                    <p class="text-base text-gray-400">
                        ${UX_COPY.LOCKED.footer}
                    </p>

                    <div class="mt-8 flex items-center gap-2 text-xs text-gray-500 font-medium">
                        <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>${UX_COPY.LOCKED.statusLight}</span>
                    </div>
                </div>
            `;
        }

        /**
         * Hide the lock enforcement overlay
         */
        function hideLockEnforcementUI() {
            var container = document.getElementById('lock-overlay');
            if (container) {
                container.style.display = 'none';
                container.innerHTML = '';
            }
            // Reset body opacity in case it was hidden by snipping trap
            document.body.style.opacity = '1';
        }

        /**
         * Render a status message in the status container
         * Used for session ended, waiting states, etc.
         */
        function renderStatusMessage(title, message, options) {
            options = options || {};
            var icon = options.icon || 'check_circle';
            var iconClass = options.iconClass || 'text-veritas-navy';

            if (statusContainer) {
                statusContainer.style.display = 'block';
            }
            if (questionContainer) {
                questionContainer.style.display = 'none';
            }
            if (statusMessage) {
                statusMessage.textContent = title || 'Status';
                statusMessage.className = 'text-gray-900 text-2xl font-semibold';
            }
            if (statusSubMessage) {
                statusSubMessage.textContent = message || '';
                statusSubMessage.style.display = message ? 'block' : 'none';
                statusSubMessage.className = 'text-gray-700 text-lg mt-4';
            }

            // Update the icon
            // Update the icon
            var statusCard = statusContainer ? statusContainer.querySelector('.status-card') : null;
            if (statusCard) {
                // Check if we need to restore the original icon span (if it was replaced by SVG)
                var iconContainer = statusCard.querySelector('.material-symbols-outlined') || statusCard.querySelector('div:first-child');

                // If we found a container but it's not the span we expect, or if we need to reset it
                if (!iconContainer || iconContainer.tagName !== 'SPAN' || !iconContainer.classList.contains('material-symbols-outlined')) {
                    // Recreate the standard icon span
                    var newIconSpan = document.createElement('span');
                    newIconSpan.className = 'material-symbols-outlined text-6xl mb-4 inline-block ' + iconClass;
                    newIconSpan.textContent = icon;

                    if (iconContainer) {
                        iconContainer.replaceWith(newIconSpan);
                    } else {
                        // Should be first child
                        statusCard.insertBefore(newIconSpan, statusCard.firstChild);
                    }
                } else {
                    // It's the standard span, just update it
                    iconContainer.textContent = icon;
                    iconContainer.className = 'material-symbols-outlined text-6xl mb-4 inline-block ' + iconClass;
                }
            }

            // Hide resume controls
            var resumeControls = document.getElementById('resume-controls');
            if (resumeControls) {
                resumeControls.style.display = 'none';
            }

            // Show secure exit if session ended
            var secureExitControls = document.getElementById('secure-exit-controls');
            if (secureExitControls && options.showExit) {
                secureExitControls.classList.remove('hidden');
            }
        }

        /**
         * Show transition loading overlay with optional message
         */
        function showTransitionOverlay(message) {
            var overlay = document.getElementById('transition-overlay');


            // Upgrade overlay content dynamically if it's the old simple version
            if (overlay && !overlay.querySelector('.animate-pulse-ring')) {
                overlay.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8">
                        <div class="relative w-20 h-20 mb-6 flex items-center justify-center">
                            <div class="absolute inset-0 rounded-full bg-veritas-navy/10 animate-pulse-ring"></div>
                            <div class="absolute inset-0 rounded-full bg-veritas-navy/5 animate-pulse-ring" style="animation-delay: 0.5s;"></div>
                            <div class="relative w-12 h-12 rounded-full bg-veritas-navy flex items-center justify-center shadow-lg transform transition-transform duration-500 hover:rotate-180">
                                <span class="material-symbols-outlined text-2xl text-white">sync</span>
                            </div>
                        </div>
                        <p id="transition-message" class="text-veritas-navy text-lg font-bold tracking-wide animate-text-shimmer">Loading...</p>
                        <p class="text-slate-400 text-xs font-medium mt-2 uppercase tracking-widest">Please Wait</p>
                    </div>
                `;
            }

            var msgEl = document.getElementById('transition-message');
            if (overlay) {
                overlay.style.display = 'flex';
                requestAnimationFrame(function () {
                    overlay.style.opacity = '1';
                });
            }
            if (msgEl) {
                var loadPhrases = [
                    "Connecting to Session...", "Syncing with Teacher...", "Loading Question...",
                    "Establishing Connection...", "Preparing Content..."
                ];
                msgEl.textContent = message || loadPhrases[Math.floor(Math.random() * loadPhrases.length)];
            }
        }

        /**
         * Hide transition loading overlay
         */
        function hideTransitionOverlay() {
            var overlay = document.getElementById('transition-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(function () {
                    overlay.style.display = 'none';
                }, 200);
            }
        }

        function showTeacherBlockedMessage() {
            console.log('Showing teacher block message');
            stopPolling();
            isInteractionBlocked = true;
            isTeacherBlocked = true;
            showStatusPanel({
                icon: 'pause_circle',
                iconClass: 'text-amber-600',
                message: 'Session Paused',
                messageClass: 'text-gray-900 text-xl font-semibold',
                subtext: 'Your teacher has temporarily frozen responses. Hold position.',
                subClass: 'text-gray-700 text-base mt-4',
                showResume: false,
                lockScroll: true
            });
        }

        function showResumePrompt() {
            console.log('Showing resume prompt');
            stopPolling();

            // CRITICAL FIX: Explicitly hide the lock overlay so the Resume prompt is visible
            hideLockEnforcementUI();

            var modeName = getFullModeName();
            var resumeLabel = document.getElementById('resume-session-label');
            if (resumeLabel) {
                resumeLabel.textContent = 'Resume ' + modeName;
            }
            showStatusPanel({
                theme: 'dark',
                icon: 'fullscreen',
                // iconClass: 'text-emerald-400', // Default is fine (emerald-400 set in function for dark mode)
                message: 'Cleared for Re-Entry',
                // messageClass: 'text-white text-3xl font-bold tracking-tight', // Default is fine
                subtext: 'Click below to return to fullscreen and rejoin the session.',
                // subClass: 'text-gray-300 text-lg mt-4', // Default is fine
                showResume: true,
                lockScroll: true
            });
        }

        function handleError(error) {
            console.error('Error:', error);

            // Extract clean error message
            var errorMsg = (error.message || error) || 'Unknown error';
            var errorString = String(errorMsg);

            // Remove "Error: " prefix if present to avoid duplication
            if (typeof errorMsg === 'string' && errorMsg.indexOf('Error: ') === 0) {
                errorMsg = errorMsg.substring(7);
            }

            // Handle generic network errors
            if (errorString.includes('NetworkError') || errorString.includes('HTTP 0') || errorString.includes('Connection failure')) {
                errorMsg = 'Network connection interrupted. Please check your internet connection and try again.';
            }

            showStatusPanel({
                icon: 'error',
                iconClass: 'text-veritas-navy',
                message: 'An error occurred: ' + errorMsg,
                messageClass: 'text-gray-900 text-2xl font-bold',
                showResume: false,
                lockScroll: false
            });
            if (resumeControls) resumeControls.style.display = 'none';
        }

        // =========================================================================
        // TI-84 CALCULATOR WIDGET MODULE
        // =========================================================================

        var calcFab = document.getElementById('calc-fab');
        var calcWindow = document.getElementById('calc-window');
        var calcHeader = document.getElementById('calc-header');
        var calcClose = document.getElementById('calc-close');
        var calcIframe = document.getElementById('calc-iframe');
        var calcLoader = document.getElementById('calc-loader');
        var calcIframeLoaded = false;
        var calcWindowOpen = false;

        /**
         * Sync calculator FAB visibility based on server state
         * @param {boolean} isEnabled - Whether calculator is enabled for this session
         */
        function syncCalculatorVisibility(isEnabled) {
            if (!calcFab) return;

            if (isEnabled) {
                calcFab.classList.remove('hidden');
            } else {
                calcFab.classList.add('hidden');
                // Force close calculator window if disabled mid-exam
                if (calcWindow) {
                    calcWindow.classList.add('hidden');
                    calcWindowOpen = false;
                }
            }
        }

        /**
         * Open calculator window and lazy-load iframe
         */
        function openCalculator() {
            if (!calcWindow || !calcIframe) return;

            calcWindow.classList.remove('hidden');
            calcWindowOpen = true;

            // Lazy load iframe on first open
            if (!calcIframeLoaded && calcIframe.dataset.src) {
                calcIframe.src = calcIframe.dataset.src;
                calcIframeLoaded = true;

                calcIframe.addEventListener('load', function () {
                    if (calcLoader) {
                        calcLoader.style.display = 'none';
                    }
                    console.log('[Calculator] TI-84 iframe loaded');
                }, { once: true });
            }
        }

        /**
         * Close calculator window
         */
        function closeCalculator() {
            if (!calcWindow) return;
            calcWindow.classList.add('hidden');
            calcWindowOpen = false;
        }

        // FAB click handler
        if (calcFab) {
            calcFab.addEventListener('click', function () {
                if (calcWindowOpen) {
                    closeCalculator();
                } else {
                    openCalculator();
                }
            });
        }

        // Close button handler
        if (calcClose) {
            calcClose.addEventListener('click', function (e) {
                e.stopPropagation();
                closeCalculator();
            });
        }

        // =========================================================================
        // DRAGGABLE WINDOW LOGIC (Robust Mouse + Touch Support)
        // =========================================================================

        // =========================================================================
        // ROBUST DRAG & DROP (Sovereign Shield Implementation)
        // =========================================================================

        function initCalculatorDrag() {
            var header = document.getElementById('calc-header');
            var win = document.getElementById('calc-window');
            var iframe = document.getElementById('calc-iframe');

            if (!header || !win) return;

            // Create Drag Shield (Lazy init)
            var shieldId = 'veritas-drag-shield';
            var shield = document.getElementById(shieldId);
            if (!shield) {
                shield = document.createElement('div');
                shield.id = shieldId;
                shield.style.position = 'fixed';
                shield.style.top = '0';
                shield.style.left = '0';
                shield.style.width = '100vw';
                shield.style.height = '100vh';
                shield.style.zIndex = '2147483647'; // Max z-index
                shield.style.cursor = 'move';
                shield.style.display = 'none';
                shield.style.background = 'transparent'; // Invisible
                document.body.appendChild(shield);
            }

            var isDragging = false;
            var startX, startY, initialLeft, initialTop;

            function onDragStart(e) {
                if (e.target.closest('#calc-close')) return;

                isDragging = true;

                // Show Shield to capture all mouse events (prevents iframe theft)
                shield.style.display = 'block';

                var clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
                var clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;

                startX = clientX;
                startY = clientY;

                var rect = win.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                // Clear transform, switch to static top/left for reliability
                win.style.transform = 'none';
                win.style.left = initialLeft + 'px';
                win.style.top = initialTop + 'px';
                win.style.right = 'auto';
                win.style.bottom = 'auto';

                if (e.cancelable && !e.target.tagName.match(/INPUT|TEXTAREA|SELECT|BUTTON/i)) {
                    e.preventDefault();
                }
            }

            function onDragMove(e) {
                if (!isDragging) return;

                // Prevent scrolling on touch
                if (e.cancelable) e.preventDefault();

                var clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
                var clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;

                var deltaX = clientX - startX;
                var deltaY = clientY - startY;

                var newLeft = initialLeft + deltaX;
                var newTop = initialTop + deltaY;

                // Bounds Checking
                var maxW = window.innerWidth - win.offsetWidth;
                var maxH = window.innerHeight - win.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxW));
                newTop = Math.max(0, Math.min(newTop, maxH));

                win.style.left = newLeft + 'px';
                win.style.top = newTop + 'px';
            }

            function onDragEnd() {
                isDragging = false;
                shield.style.display = 'none';
            }

            // Attach start listeners to header
            header.style.cursor = 'move';
            // Remove old listeners if any (by cloning? No, just add new ones, browser handles)
            // But to be clean, let's assume this runs once.
            header.addEventListener('mousedown', onDragStart);
            header.addEventListener('touchstart', onDragStart, { passive: false });

            // Attach move/end listeners to SHIELD (Sovereign Capture)
            // This is the key: The events happen on the shield, not the window/document
            shield.addEventListener('mousemove', onDragMove);
            shield.addEventListener('touchmove', onDragMove, { passive: false });

            shield.addEventListener('mouseup', onDragEnd);
            shield.addEventListener('touchend', onDragEnd);
            shield.addEventListener('mouseleave', onDragEnd);
        }

        // Initialize Drag
        function initVisuals() {
            // 1. Fix Question Header Initialization
            var qProgress = document.getElementById('question-progress');
            if (qProgress) {
                // Hide initially until a real question index is received
                qProgress.classList.add('hidden');
                qProgress.textContent = 'WAITING TO START';
            }

            // 2. Ghost Screen / Duplicate Logo Killer
            // The screenshot shows a duplicate "Veritas Live Polls" logo at the bottom.
            // This detects and removes duplicate entry screens or rogue H1s.
            var entryScreens = document.querySelectorAll('#entry-screen');
            if (entryScreens.length > 1) {
                console.warn('[VisualFix] Found ' + entryScreens.length + ' entry-screens. Removing duplicates.');
                for (var i = 1; i < entryScreens.length; i++) {
                    entryScreens[i].remove();
                }
            } else {
                // Fallback: If ID is missing on duplicates, check H1s
                var brands = document.querySelectorAll('h1');
                if (brands.length > 1) {
                    console.warn('[VisualFix] Found duplicate H1 elements. Cleaning up.');
                    for (var j = 1; j < brands.length; j++) {
                        // Traverse up to find the container to remove
                        var wrapper = brands[j].closest('.flex.items-center.gap-4'); // The logo container class
                        if (wrapper) wrapper.remove();
                        else brands[j].remove();
                    }
                }
            }
        }

        // FIX: Helper function to find an active poll for the student's class
        // Uses polls-first approach since anonymous users can read polls but not sessions root
        function findActivePollForClass(className) {
            return new Promise(function (resolve, reject) {
                if (!className) {
                    console.warn('[findActivePollForClass] No className provided');
                    resolve(null);
                    return;
                }

                var db = firebase.database();
                console.log('[findActivePollForClass] Searching for active polls in class:', className);

                // Step 1: Query polls for this class (anonymous users can read polls)
                db.ref('polls').orderByChild('className').equalTo(className).once('value')
                    .then(function (pollsSnap) {
                        var polls = pollsSnap.val() || {};
                        var pollIds = Object.keys(polls);
                        console.log('[findActivePollForClass] Found', pollIds.length, 'polls for class');

                        if (pollIds.length === 0) {
                            resolve(null);
                            return;
                        }

                        // Step 2: Check each poll's live_session status
                        var checkPromises = pollIds.map(function (pollId) {
                            return db.ref('sessions/' + pollId + '/live_session').once('value')
                                .then(function (sessionSnap) {
                                    var session = sessionSnap.val();
                                    if (session && session.status && session.status !== 'ENDED' && session.status !== 'PRE_LIVE') {
                                        console.log('[findActivePollForClass] Active session found:', pollId, 'status:', session.status);
                                        return pollId;
                                    }
                                    return null;
                                })
                                .catch(function (err) {
                                    console.warn('[findActivePollForClass] Could not check session for poll', pollId, err.message);
                                    return null;
                                });
                        });

                        return Promise.all(checkPromises);
                    })
                    .then(function (results) {
                        if (!results) {
                            resolve(null);
                            return;
                        }
                        // Find first non-null result (active poll)
                        var activeId = results.find(function (id) { return id !== null; });
                        if (activeId) {
                            console.log('[findActivePollForClass] Returning active poll:', activeId);
                        } else {
                            console.log('[findActivePollForClass] No active polls found for class:', className);
                        }
                        resolve(activeId || null);
                    })
                    .catch(function (err) {
                        console.error('[findActivePollForClass] Query error:', err);
                        reject(err);
                    });
            });
        }

        function startApp() {
            // PHASE 4: EARLY STATE REHYDRATION
            // Attempt to render cached state immediately to prevent white flash
            var rehydrated = attemptEarlyRehydration();
            if (rehydrated) {
                console.log('[App] State rehydrated from cache - continuing with fresh fetch');
            }

            initCalculatorDrag();
            initVisuals();

            // FIX: Start Firebase Connection
            var pollId = window.currentPollId || sessionStorage.getItem('veritas_active_poll_id');
            var email = window.STUDENT_EMAIL || sessionStorage.getItem('veritas_student_email');

            if (pollId && email) {
                console.log('[App] Starting Firebase Sidecar for poll:', pollId);
                initFirebaseSidecar(pollId, email);
            } else {
                console.warn('[App] Cannot start sidecar - missing pollId or email');
            }
        }

        function initAuth() {
            // CLIENT-SIDE AUTH CHECK
            // 1. Check for Token in URL
            var urlParams = new URLSearchParams(window.location.search);
            var token = urlParams.get('token');
            var pollId = urlParams.get('pollId');

            if (pollId) {
                window.currentPollId = pollId;
                sessionStorage.setItem('veritas_active_poll_id', pollId);
            }

            if (token) {
                console.log('[Auth] Token found in URL:', token);

                // IMMEDIATE: Hide login overlay to prevent flash/blocking
                // We'll show it again if validation fails
                var loginOverlay = document.getElementById('login-overlay');
                if (loginOverlay) loginOverlay.style.display = 'none';
                // Also ensure main container is hidden until ready
                var appContainer = document.getElementById('student-container');
                if (appContainer) appContainer.style.display = 'none';

                // Initialize Firebase if needed
                if (!firebase.apps.length && FIREBASE_CONFIG) {
                    firebase.initializeApp(FIREBASE_CONFIG);
                }

                // Authenticate Anonymously to satisfy security rules
                firebase.auth().signInAnonymously()
                    .then(function () {
                        console.log('[Auth] Signed in anonymously');
                        // Verify Token in RTDB
                        return firebase.database().ref('tokens/' + token).once('value');
                    })
                    .then(function (snapshot) {
                        var data = snapshot.val();
                        if (data && data.email) {
                            console.log('[Auth] Token verified. Student:', data.email, 'Class:', data.className);
                            window.STUDENT_EMAIL = data.email;
                            window.SESSION_TOKEN = token;
                            window.STUDENT_CLASS = data.className;

                            // Persist
                            try {
                                sessionStorage.setItem('veritas_student_email', data.email);
                                sessionStorage.setItem('veritas_session_token', token);
                                if (data.className) sessionStorage.setItem('veritas_student_class', data.className);
                            } catch (e) { }

                            // Ensure overlay is hidden
                            if (window.LoginManager) LoginManager.hide();
                            var loginOverlay = document.getElementById('login-overlay');
                            if (loginOverlay) loginOverlay.style.display = 'none';

                            // Show App
                            var appContainer = document.getElementById('student-container');
                            if (appContainer) appContainer.style.display = 'block';

                            // FIX: If no pollId in URL, find active poll for this class
                            if (!window.currentPollId) {
                                console.log('[Auth] No pollId in URL, searching for active session...');
                                findActivePollForClass(data.className).then(function (foundPollId) {
                                    if (foundPollId) {
                                        console.log('[Auth] Found active poll:', foundPollId);
                                        window.currentPollId = foundPollId;
                                        sessionStorage.setItem('veritas_active_poll_id', foundPollId);
                                    } else {
                                        console.warn('[Auth] No active poll found for class:', data.className);
                                    }
                                    startApp();
                                }).catch(function (err) {
                                    console.error('[Auth] Error finding active poll:', err);
                                    startApp(); // Start anyway, will show waiting screen
                                });
                            } else {
                                startApp();
                            }
                        } else {
                            throw new Error('Invalid or expired link.');
                        }
                    })
                    .catch(function (error) {
                        console.error('[Auth] Token validation failed:', error);
                        if (error.code === 'auth/admin-restricted-operation') {
                            alert('Configuration Error: Anonymous Authentication is disabled in Firebase Console. Please enable it in Authentication > Sign-in method.');
                        } else {
                            alert('Invalid link: ' + error.message);
                        }
                        // Fallback to login screen
                        showLoginScreen();
                    });

            } else if (!window.STUDENT_EMAIL) {
                // P1: Check sessionStorage for persisted identity
                var persistedEmail = sessionStorage.getItem('veritas_student_email');
                if (persistedEmail) {
                    console.log('[Auth] Found persisted student email in sessionStorage:', persistedEmail);
                    window.STUDENT_EMAIL = persistedEmail;
                    startApp();
                } else {
                    // No token, no injected email, no persistence -> Show Login
                    console.log('[Auth] No identity found. Initiating Login Flow.');
                    showLoginScreen();
                }
            } else {
                // Already authenticated (injected)
                console.log('[Auth] Authenticated via injection:', window.STUDENT_EMAIL);

                // CRITICAL FIX: Ensure Firebase Auth is active even for injected sessions
                // This satisfies database rules that require auth != null
                if (firebase.auth && !firebase.auth().currentUser) {
                    console.log('[Auth] ensuring anonymous auth for injected session...');
                    firebase.auth().signInAnonymously().catch(function (e) {
                        console.warn('[Auth] Background anon sign-in warning:', e);
                    });
                }

                startApp();
            }
        }

        function showLoginScreen() {
            // Show overlay by adding class (CSS handles visibility)
            document.body.classList.add('auth-required');

            // Hide main content to prevent flash
            var appContainer = document.getElementById('student-container');
            var entryScreen = document.getElementById('entry-screen');
            if (appContainer) appContainer.style.display = 'none';
            if (entryScreen) entryScreen.style.display = 'none';

            if (window.LoginManager) {
                // Update UI for Student Context
                var subtitle = document.querySelector('.login-subtitle');
                if (subtitle) subtitle.textContent = 'Student Access';

                LoginManager.init(function (user) {
                    // On Success - Persist email for reload cycle
                    console.log('[Auth] Student Login successful:', user.email);
                    try {
                        sessionStorage.setItem('veritas_student_email', user.email);
                    } catch (e) { }

                    console.log('[Auth] Reloading to initialize session.');
                    setTimeout(function () { window.location.reload(); }, 500);
                });
                LoginManager.show();
            } else {
                console.error('LoginManager not loaded!');
                alert('Authentication system missing. Please contact support.');
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initAuth);
        } else {
            initAuth();
        }

        // Handle calculator visibility when session ends or locks
        function hideCalculatorOnSessionEnd() {
            var calcFab = document.getElementById('calc-fab');
            var calcWindow = document.getElementById('calc-window');
            if (calcFab) calcFab.style.display = 'none';
            if (calcWindow) {
                calcWindow.classList.add('hidden');
                calcWindow.classList.remove('active');
                calcWindow.style.display = 'none';
                calcWindowOpen = false;
            }
        }

        // Expose function for session state changes
        window.syncCalculatorVisibility = syncCalculatorVisibility;
        window.hideCalculatorOnSessionEnd = hideCalculatorOnSessionEnd;
        window.updateStudentView = updateStudentView;
        window.LockManager = LockManager;
        window.ViewManager = ViewManager;

    })();
