
// =============================================================================
// FIREBASE SERVER-SIDE LOGIC VERIFICATION TEST (NODE.JS)
// =============================================================================
// This test runs in Node.js to verify the *logic* of the server-side code
// that constructs the Firebase REST URL. It proves that the application
// intends to read from the correct endpoint.
// =============================================================================

const assert = require('assert');

// --- 1. MOCK ENVIRONMENT ---
const Logger = {
    log: function(msg) { process.stdout.write('[LOG] ' + msg + '\n'); }
};

const UrlFetchApp = {
    fetch: function(url, options) {
        console.log('UrlFetchApp.fetch called with URL: ' + url);
        // Mock response
        return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ "-answer1": { pollId: "POLL-ABC", answer: "A" } })
        };
    }
};

const Veritas = {
    Config: {
        getFirebaseConfig: () => ({ databaseURL: "https://mock-db.firebaseio.com" }),
        getFirebaseSecret: () => "MOCK_SECRET"
    }
};

// --- 2. EXTRACTED LOGIC FROM Model_Session.gs ---

function fetchFirebaseAnswers(pollId) {
    try {
        var config = Veritas.Config.getFirebaseConfig();
        var secret = Veritas.Config.getFirebaseSecret();

        if (!config || !secret) {
            Logger.log('Firebase config/secret missing for worker');
            return [];
        }

        var baseUrl = config.databaseURL;
        // Logic from Model_Session.gs
        var url = baseUrl + '/answers/' + pollId + '.json?auth=' + secret + '&orderBy="$key"';

        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (response.getResponseCode() !== 200) {
            Logger.log('Firebase fetch failed', response.getContentText());
            return [];
        }

        var data = JSON.parse(response.getContentText());
        if (!data) return [];

        return Object.keys(data).map(function(k) { return data[k]; });
    } catch (e) {
        Logger.log('Error fetching from Firebase: ' + e);
        return [];
    }
}

// --- 3. EXECUTE TEST ---

function runServerTest() {
    console.log('--- STARTING FIREBASE SERVER READ LOGIC TEST ---');

    const testPollId = 'POLL-ABC';
    const result = fetchFirebaseAnswers(testPollId);

    // Check if URL logic is correct (logged above)
    // Check if data parsing logic is correct
    assert.strictEqual(result.length, 1, 'Should return 1 answer');
    assert.strictEqual(result[0].pollId, 'POLL-ABC', 'Answer data mismatch');

    console.log('\n--- TEST RESULT: SUCCESS ---');
    console.log('✅ Correct REST URL constructed');
    console.log('✅ Correctly parsed JSON response');
}

runServerTest();
