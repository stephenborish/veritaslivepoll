(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAv0bCe5KIuQx_sou8toBy5DG2PYaB_pBM",
    authDomain: "classroomproctor.firebaseapp.com",
    databaseURL: "https://classroomproctor-default-rtdb.firebaseio.com",
    projectId: "classroomproctor",
    storageBucket: "classroomproctor.firebasestorage.app",
    messagingSenderId: "600627073908",
    appId: "1:600627073908:web:935970f5849b28f6ad5221"
  };

  const state = {
    app: null,
    db: null,
    functions: null,
    auth: null,
    currentUser: null,
    classes: {},
    polls: {},
    sessions: {},
    sessionListeners: {},
    selectedOption: null,
    studentContext: null,
  };

  function log(targetId, message) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const entry = document.createElement('p');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el.prepend(entry);
  }

  function toast(kind, message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function ensureFirebase() {
    if (!state.app) {
      state.app = firebase.initializeApp(firebaseConfig);
      state.db = firebase.database();
      state.functions = firebase.functions();
      state.auth = firebase.auth();
    }
    return state;
  }

  function emailKey(email) {
    return (email || '').toLowerCase().replace(/[.$#\\[\\]/]/g, '_');
  }

  async function refreshHealth() {
    ensureFirebase();
    const healthGrid = document.getElementById('service-health');
    const liveStatus = document.getElementById('live-status');
    if (healthGrid) healthGrid.textContent = '';
    const items = [];
    try {
      await state.db.ref('.info/connected').once('value');
      items.push({ label: 'Realtime DB', ok: true });
    } catch (e) {
      items.push({ label: 'Realtime DB', ok: false, detail: e.message });
    }

    try {
      await state.functions.httpsCallable('verifyTeacher')({});
      items.push({ label: 'Functions', ok: true });
    } catch (e) {
      items.push({ label: 'Functions', ok: false, detail: e.message });
    }

    if (healthGrid) {
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = `health ${item.ok ? 'ok' : 'warn'}`;
        div.innerHTML = `<strong>${item.label}</strong><br><small>${item.ok ? 'online' : 'error'}</small>`;
        healthGrid.appendChild(div);
      });
    }
    if (liveStatus) {
      const allOk = items.every(i => i.ok);
      liveStatus.textContent = allOk ? 'Connected to Firebase' : 'Issues reaching backend (see tiles)';
    }
  }

  // -------------------- TEACHER UI --------------------
  async function loadClasses() {
    ensureFirebase();
    const meta = document.getElementById('roster-meta');
    const select = document.getElementById('poll-class');
    const list = document.getElementById('class-list');
    if (list) list.textContent = '';
    if (select) select.innerHTML = '';

    const manageRoster = state.functions.httpsCallable('manageRoster');
    const res = await manageRoster({ action: 'GET_DATA' });
    const classes = res.data.rosters || {};
    state.classes = classes;

    const entries = Object.keys(classes).sort();
    if (meta) meta.textContent = `${entries.length} classes`;

    entries.forEach(name => {
      if (select) {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        select.appendChild(opt);
      }
      if (list) {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `<div><strong>${name}</strong><br><small>${(classes[name] || []).length} students</small></div>`;
        list.appendChild(item);
      }
    });
  }

  async function saveClass(evt) {
    evt.preventDefault();
    ensureFirebase();
    const name = document.getElementById('class-name').value.trim();
    const studentsRaw = document.getElementById('student-list').value.trim();
    if (!name) return toast('error', 'Class name required');

    const students = (studentsRaw ? studentsRaw.split(/\n+/) : [])
      .map(row => row.trim())
      .filter(Boolean)
      .map(row => {
        const match = row.match(/(.+)<(.+)>/);
        if (match) return { name: match[1].trim(), email: match[2].trim() };
        return { name: row.split('@')[0] || row, email: row };
      });

    const manageRoster = state.functions.httpsCallable('manageRoster');
    await manageRoster({ action: 'SAVE', className: name, students });
    toast('success', `Saved roster for ${name}`);
    log('app-log', `Roster saved (${name})`);
    document.getElementById('class-form').reset();
    await loadClasses();
  }

  async function loadPolls() {
    ensureFirebase();
    const table = document.getElementById('poll-table');
    if (!table) return;
    table.textContent = '';

    const snap = await state.db.ref('polls').once('value');
    const polls = snap.val() || {};
    state.polls = polls;

    const entries = Object.values(polls).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const meta = document.getElementById('poll-meta');
    if (meta) meta.textContent = `${entries.length} polls`;

    const tbl = document.createElement('table');
    tbl.innerHTML = `<thead><tr><th>Poll</th><th>Class</th><th>Questions</th><th>Actions</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    entries.forEach(poll => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${poll.pollName || 'Untitled'}<br><small>${poll.pollId}</small></td>
        <td>${poll.className || '—'}</td>
        <td>${poll.questionCount || (poll.questions ? poll.questions.length : 0)}</td>
        <td>
          <button class="btn secondary" data-action="start" data-poll="${poll.pollId}">Start</button>
          <button class="btn ghost" data-action="next" data-poll="${poll.pollId}">Next</button>
          <button class="btn ghost" data-action="finalize" data-poll="${poll.pollId}">Finalize</button>
        </td>`;
      tbody.appendChild(row);
    });
    tbl.appendChild(tbody);
    table.appendChild(tbl);
  }

  async function createPoll(evt) {
    evt.preventDefault();
    ensureFirebase();
    const pollName = document.getElementById('poll-name').value.trim();
    const className = document.getElementById('poll-class').value;
    const question = document.getElementById('poll-question').value.trim();
    const optionsRaw = document.getElementById('poll-options').value.trim();
    const answer = document.getElementById('poll-answer').value.trim().toUpperCase();
    if (!pollName || !className || !question) return toast('error', 'Missing poll fields');

    const options = (optionsRaw ? optionsRaw.split(/\n+/) : []).filter(Boolean).map((text, idx) => ({ text, label: String.fromCharCode(65 + idx) }));
    const correctAnswer = answer || (options[0] ? options[0].label : null);

    const createPollFn = state.functions.httpsCallable('createPoll');
    const payload = {
      pollName,
      className,
      questions: [{ questionText: question, options, correctAnswer }],
      metadata: { sessionType: 'LIVE_POLL' }
    };
    const res = await createPollFn(payload);
    toast('success', `Poll created (${res.data.pollId})`);
    log('app-log', `Poll created ${res.data.pollId}`);
    document.getElementById('poll-form').reset();
    await loadPolls();
    await loadSessions();
  }

  async function startSession(pollId, nextIndex) {
    ensureFirebase();
    const fn = state.functions.httpsCallable('setLiveSessionState');
    const questionIndex = typeof nextIndex === 'number' ? nextIndex : 0;
    const status = 'OPEN';
    await fn({ pollId, status, questionIndex });
    toast('success', `Session updated (Q${questionIndex + 1})`);
    log('app-log', `setLiveSessionState -> ${pollId} (Q${questionIndex})`);
  }

  async function finalizeSession(pollId) {
    ensureFirebase();
    const fn = state.functions.httpsCallable('finalizeSession');
    await fn({ pollId });
    toast('success', `Session finalized for ${pollId}`);
    log('app-log', `finalizeSession -> ${pollId}`);
  }

  function attachPollActions() {
    const table = document.getElementById('poll-table');
    if (!table) return;
    table.addEventListener('click', async (evt) => {
      const action = evt.target?.dataset?.action;
      const pollId = evt.target?.dataset?.poll;
      if (!action || !pollId) return;
      if (action === 'start') return startSession(pollId, 0).then(loadSessions);
      if (action === 'next') {
        const current = state.sessions[pollId]?.questionIndex || 0;
        return startSession(pollId, current + 1).then(loadSessions);
      }
      if (action === 'finalize') return finalizeSession(pollId).then(loadSessions);
    });
  }

  async function loadSessions() {
    ensureFirebase();
    const table = document.getElementById('session-table');
    if (!table) return;
    table.textContent = '';

    const sessions = {};
    const polls = state.polls || {};
    await Promise.all(Object.keys(polls).map(async (pollId) => {
      const snap = await state.db.ref(`sessions/${pollId}/live_session`).once('value');
      sessions[pollId] = snap.val() || null;
    }));
    state.sessions = sessions;

    const entries = Object.keys(sessions).map(id => ({ pollId: id, session: sessions[id], poll: polls[id] })).filter(e => e.session);
    const meta = document.getElementById('session-meta');
    if (meta) meta.textContent = `${entries.length} live sessions`;

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'No active sessions yet.';
      table.appendChild(empty);
      return;
    }

    const tbl = document.createElement('table');
    tbl.innerHTML = `<thead><tr><th>Poll</th><th>Status</th><th>Question</th><th>Updated</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    entries.forEach(item => {
      const { pollId, session, poll } = item;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${poll?.pollName || 'Untitled'}<br><small>${pollId}</small></td>
        <td>${session.status || '—'}</td>
        <td>${(session.questionIndex ?? 0) + 1}</td>
        <td>${session.timestamp ? new Date(session.timestamp).toLocaleTimeString() : '—'}</td>`;
      tbody.appendChild(row);
    });
    tbl.appendChild(tbody);
    table.appendChild(tbl);
  }

  function wireTeacherUI() {
    const root = document.getElementById('teacher-root');
    if (!root) return;
    ensureFirebase();

    document.getElementById('class-form').addEventListener('submit', saveClass);
    document.getElementById('poll-form').addEventListener('submit', createPoll);
    document.getElementById('action-refresh').addEventListener('click', () => {
      refreshHealth();
      loadClasses();
      loadPolls().then(loadSessions);
    });
    document.getElementById('action-new-class').addEventListener('click', () => {
      document.getElementById('class-name').focus();
    });
    document.getElementById('action-new-poll').addEventListener('click', () => {
      document.getElementById('poll-name').focus();
    });

    attachPollActions();
    refreshHealth();
    loadClasses();
    loadPolls().then(loadSessions);
  }

  // -------------------- AUTH --------------------
  function wireAuth() {
    ensureFirebase();
    const signin = document.getElementById('signin-btn');
    const signout = document.getElementById('signout-btn');
    const status = document.getElementById('auth-status');

    if (signin) {
      signin.addEventListener('click', async () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        await state.auth.signInWithPopup(provider);
      });
    }
    if (signout) {
      signout.addEventListener('click', () => state.auth.signOut());
    }

    state.auth.onAuthStateChanged((user) => {
      state.currentUser = user;
      if (status) status.textContent = user ? `Signed in as ${user.email}` : 'Anonymous session';
      if (signin) signin.classList.toggle('hidden', !!user);
      if (signout) signout.classList.toggle('hidden', !user);
      if (!user) toast('error', 'You are not signed in. Some functions may be blocked.');
      if (user) toast('success', 'Signed in');
    });
  }

  // -------------------- STUDENT UI --------------------
  function renderQuestion(stateSnap) {
    const card = document.getElementById('question-card');
    if (!card) return;
    if (!stateSnap) {
      card.hidden = false;
      document.getElementById('question-status').textContent = 'Waiting for teacher…';
      document.getElementById('question-title').textContent = 'No question loaded';
      document.getElementById('option-list').textContent = '';
      document.getElementById('submit-answer').disabled = true;
      return;
    }

    card.hidden = false;
    document.getElementById('question-status').textContent = stateSnap.status || 'OPEN';
    document.getElementById('question-title').textContent = stateSnap.questionText || 'Question';
    document.getElementById('question-number').textContent = `Q${(stateSnap.questionIndex ?? 0) + 1}`;

    const optionsWrap = document.getElementById('option-list');
    optionsWrap.textContent = '';
    (stateSnap.options || []).forEach((opt, idx) => {
      const div = document.createElement('div');
      div.className = 'option';
      div.dataset.value = opt.value || opt.text || String.fromCharCode(65 + idx);
      div.innerHTML = `<strong>${String.fromCharCode(65 + idx)}</strong> – ${opt.text || opt}`;
      div.addEventListener('click', () => {
        state.selectedOption = div.dataset.value;
        optionsWrap.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        document.getElementById('submit-answer').disabled = false;
      });
      optionsWrap.appendChild(div);
    });
    document.getElementById('submit-answer').disabled = true;
  }

  async function submitStudentAnswer() {
    const ctx = state.studentContext;
    if (!ctx || !state.selectedOption) return;
    ensureFirebase();
    const payload = {
      answer: state.selectedOption,
      questionIndex: ctx.currentQuestionIndex,
      email: ctx.email,
      name: ctx.name,
      submittedAt: firebase.database.ServerValue.TIMESTAMP
    };
    await state.db.ref(`answers/${ctx.pollId}/${ctx.key}`).set(payload);
    await state.db.ref(`sessions/${ctx.pollId}/students/${ctx.key}`).update({ status: 'FINISHED', name: ctx.name, email: ctx.email });
    toast('success', 'Answer submitted');
    log('student-log', `Submitted ${state.selectedOption}`);
    document.getElementById('submit-answer').disabled = true;
  }

  function wireStudentUI() {
    const root = document.getElementById('student-root');
    if (!root) return;
    ensureFirebase();

    const joinForm = document.getElementById('join-form');
    joinForm.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const pollId = document.getElementById('join-poll').value.trim();
      const email = document.getElementById('join-email').value.trim();
      const name = document.getElementById('join-name').value.trim();
      if (!pollId || !email) return toast('error', 'Poll ID and email required');

      const key = emailKey(email);
      state.studentContext = { pollId, email, name, key, currentQuestionIndex: 0 };
      await state.db.ref(`sessions/${pollId}/students/${key}`).update({ status: 'ACTIVE', email, name });

      log('student-log', `Joined poll ${pollId}`);
      toast('success', `Listening to ${pollId}`);

      if (state.sessionListeners.student) {
        state.sessionListeners.student.off();
      }
      const ref = state.db.ref(`sessions/${pollId}/live_session`);
      state.sessionListeners.student = ref;
      ref.on('value', (snap) => {
        const data = snap.val();
        if (data && typeof data.questionIndex === 'number') {
          state.studentContext.currentQuestionIndex = data.questionIndex;
        }
        renderQuestion(data);
      });
    });

    document.getElementById('submit-answer').addEventListener('click', submitStudentAnswer);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureFirebase();
    wireAuth();
    wireTeacherUI();
    wireStudentUI();
  });
})();
