
/* ========================================
   DATA MIGRATION UTILITIES
   ======================================== */
var migrationPayload = null;

function openMigrationModal() {
    // Reset state
    migrationPayload = null;
    document.getElementById('migration-file-input').value = '';
    document.getElementById('migration-file-info').classList.add('hidden');
    document.getElementById('migration-progress-container').classList.add('hidden');
    document.getElementById('start-migration-btn').disabled = true;
    document.getElementById('migration-modal').classList.remove('hidden');
}

function handleMigrationFileSelect(input) {
    var file = input.files[0];
    if (!file) return;

    document.getElementById('migration-filename').textContent = file.name;
    document.getElementById('migration-file-info').classList.remove('hidden');

    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            migrationPayload = JSON.parse(e.target.result);
            console.log('[Migration] Payload loaded:', migrationPayload);

            var pCount = (migrationPayload.polls || []).length;
            var rCount = (migrationPayload.rosters || []).length;

            logMigration('File loaded successfully.');
            logMigration(`Found ${pCount} polls and ${rCount} class rosters.`);

            document.getElementById('start-migration-btn').disabled = false;
        } catch (err) {
            console.error('[Migration] Parse error:', err);
            alert('Invalid JSON file.');
            input.value = '';
        }
    };
    reader.readAsText(file);
}

function logMigration(msg) {
    var log = document.getElementById('migration-log');
    var entry = document.createElement('div');
    entry.textContent = `> ${msg}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

async function startMigration() {
    if (!migrationPayload) return;

    var btn = document.getElementById('start-migration-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Importing...';

    document.getElementById('migration-progress-container').classList.remove('hidden');

    var polls = migrationPayload.polls || [];
    var rosters = migrationPayload.rosters || [];
    var totalItems = polls.length + rosters.length;
    var processed = 0;

    var updateProgress = () => {
        processed++;
        var pct = Math.round((processed / totalItems) * 100) + '%';
        document.getElementById('migration-progress-bar').style.width = pct;
        document.getElementById('migration-percent').textContent = pct;
    };

    // 1. IMPORT POLLS
    logMigration('--- STARTING POLL IMPORT ---');

    // Use concurrency control (batch of 3)
    for (let i = 0; i < polls.length; i += 3) {
        const batch = polls.slice(i, i + 3);
        await Promise.all(batch.map(async (poll) => {
            try {
                // Use Cloud Function to create/migrate
                // We strip the ID and let Firebase generate a new one, 
                // OR use the existing ID if we want to "Restore".
                // Since we want to safeguard structure, we use createPoll.

                var createPollFn = firebase.functions().httpsCallable('createPoll');
                await createPollFn({
                    pollName: poll.pollName,
                    className: poll.className,
                    questions: poll.questions,
                    metadata: poll.metadata
                });
                logMigration(`Computed: ${poll.pollName}`);
            } catch (err) {
                console.error(err);
                logMigration(`ERROR importing ${poll.pollName}: ${err.message}`);
            } finally {
                updateProgress();
            }
        }));
    }

    // 2. IMPORT ROSTERS
    logMigration('--- STARTING ROSTER IMPORT ---');
    for (let i = 0; i < rosters.length; i++) {
        var roster = rosters[i];
        try {
            logMigration(`Importing class: ${roster.className}`);
            // Direct DB write for rosters is supported by our rules for Teachers
            // Roster structure: rosters/{className} = [ {email, name}, ... ]
            await firebase.database().ref('rosters/' + roster.className).set(roster.students);
        } catch (err) {
            console.error(err);
            logMigration(`ERROR importing roster ${roster.className}: ${err.message}`);
        } finally {
            updateProgress();
        }
    }

    logMigration('--- MIGRATION COMPLETE ---');
    btn.innerHTML = '<span class="material-symbols-outlined">check</span> Done';

    // Refresh local data
    await loadInitialData();

    showToast('success', 'Migration Complete', `Successfully imported ${polls.length} polls and ${rosters.length} rosters.`);
    setTimeout(() => {
        document.getElementById('migration-modal').classList.add('hidden');
        // Reset UI
        btn.innerHTML = 'Start Import';
    }, 3000);
}

// Expose
window.openMigrationModal = openMigrationModal;
window.handleMigrationFileSelect = handleMigrationFileSelect;
window.startMigration = startMigration;
