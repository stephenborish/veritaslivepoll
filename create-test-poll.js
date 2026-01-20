/**
 * Script to create a test poll with valid question data
 * This helps verify that the live poll visibility fixes work correctly
 *
 * Usage:
 *   node create-test-poll.js
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable, OR
 *   - Place serviceAccountKey.json in project root, OR
 *   - Run `firebase login` and use emulator
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Try to initialize Firebase Admin with available credentials
let db;
try {
  // Option 1: Check for service account key file
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://classroomproctor-default-rtdb.firebaseio.com"
    });
    console.log('✓ Initialized with service account key');
  }
  // Option 2: Use environment variable
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      databaseURL: "https://classroomproctor-default-rtdb.firebaseio.com"
    });
    console.log('✓ Initialized with GOOGLE_APPLICATION_CREDENTIALS');
  }
  // Option 3: Use default credentials (for Cloud environments)
  else {
    admin.initializeApp({
      databaseURL: "https://classroomproctor-default-rtdb.firebaseio.com"
    });
    console.log('✓ Initialized with default credentials');
  }

  db = admin.database();
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:');
  console.error(error.message);
  console.error('\nPlease ensure you have valid Firebase credentials.');
  console.error('You can:');
  console.error('1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
  console.error('2. Place serviceAccountKey.json in project root');
  console.error('3. Or manually import test-poll-data.json through Firebase Console');
  process.exit(1);
}

async function createTestPoll() {
  const pollId = Date.now().toString();

  const testPoll = {
    pollId: pollId,
    pollName: "Claude Test Poll - Live Poll Visibility",
    className: "AP Biology", // Using existing class from your system
    questions: [
      {
        questionText: "Which phase of the cell cycle is most analogous to the process of urban planning and infrastructure development in a rapidly growing city?",
        options: [
          "G1 phase - during this growth phase, the cell increases in size and synthesizes necessary proteins, similar to how a city expands its infrastructure to support growth",
          "M phase - the division of a cell into two daughter cells is similar to how a city might split into multiple municipalities as it grows",
          "G2 phase - the final preparations for mitosis in this phase resemble the last-minute adjustments made before implementing a city's expansion plan"
        ],
        correctAnswer: 0, // First option is correct
        questionImageURL: ""
      },
      {
        questionText: "What is the primary function of mitochondria in eukaryotic cells?",
        options: [
          "Protein synthesis",
          "Energy production through cellular respiration",
          "DNA replication",
          "Waste removal"
        ],
        correctAnswer: 1, // Second option is correct
        questionImageURL: ""
      },
      {
        questionText: "Which of the following best describes osmosis?",
        options: [
          "Movement of water across a semipermeable membrane from high to low concentration",
          "Active transport of ions against concentration gradient",
          "Diffusion of gases through cell membrane"
        ],
        correctAnswer: 0,
        questionImageURL: ""
      }
    ],
    questionCount: 3,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    sessionType: "LIVE_POLL",
    timeLimitMinutes: 0,
    accessCode: "",
    availableFrom: "",
    dueBy: "",
    secureSettings: {},
    missionControlState: ""
  };

  console.log('Creating test poll with ID:', pollId);
  console.log('Poll structure:');
  console.log(JSON.stringify(testPoll, null, 2));

  try {
    await db.ref(`polls/${pollId}`).set(testPoll);
    console.log('\n✅ Test poll created successfully!');
    console.log('\nPoll Details:');
    console.log('- Poll ID:', pollId);
    console.log('- Poll Name:', testPoll.pollName);
    console.log('- Class:', testPoll.className);
    console.log('- Number of Questions:', testPoll.questions.length);
    console.log('\nTo use this poll:');
    console.log('1. Refresh your teacher dashboard');
    console.log('2. Select "Claude Test Poll - Live Poll Visibility" from the dropdown');
    console.log('3. Click "Start Session"');
    console.log('4. Students should now see the questions properly');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test poll:', error);
    process.exit(1);
  }
}

createTestPoll();
