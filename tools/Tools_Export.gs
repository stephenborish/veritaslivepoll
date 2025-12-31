/**
 * VERITAS DATA EXPORT TOOL
 * ------------------------
 * Instructions:
 * 1. Open your legacy Veritas Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Create a new file named 'Tools_Export.gs'.
 * 4. Paste this code entirely.
 * 5. Run the function 'exportDataToJson'.
 * 6. Check your Google Drive root folder for 'veritas_full_export.json'.
 * 7. Download that file and upload it to the new Teacher Dashboard.
 */

function exportDataToJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fileId = ss.getId();
  
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    sourceSheetId: fileId,
    polls: [],
    rosters: [],
    history: [] // Optional: if you want to migrate session history
  };
  
  // 1. EXPORT POLLS
  // Assumes 'Poll Library' sheet exists
  const pollSheet = ss.getSheetByName('Poll Library');
  if (pollSheet) {
    const data = pollSheet.getDataRange().getValues();
    // Skip header
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // Schema: [ID, Name, Class, JSON_Questions, Metadata, ...]
        // Adjust indices based on your actual sheet layout. 
        // Based on previous code analysis:
        // Col 0: ID, Col 1: Name, Col 2: Questions (JSON), Col 3: Class, Col 4: Metadata (JSON)
        
        try {
            const pollId = row[0].toString();
            const pollName = row[1].toString();
            const questionsJson = row[2].toString();
            const className = row[3].toString();
            const metadataJson = row[4] ? row[4].toString() : '{}';
            
            if (pollId && questionsJson) {
                exportPayload.polls.push({
                    pollId: pollId,
                    pollName: pollName,
                    className: className,
                    questions: JSON.parse(questionsJson),
                    metadata: JSON.parse(metadataJson)
                });
            }
        } catch (e) {
            console.error('Error parsing poll row ' + (i+1), e);
        }
    }
  }
  
  // 2. EXPORT ROSTERS
  // Assumes 'Rosters' sheet exists with [ClassName, StudentEmail, StudentName]
  const rosterSheet = ss.getSheetByName('Rosters');
  if (rosterSheet) {
      const data = rosterSheet.getDataRange().getValues();
      const rostersMap = {};
      
      // Skip header
      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const className = row[0].toString();
          const email = row[1].toString();
          const name = row[2].toString();
          
          if (className && email) {
              if (!rostersMap[className]) {
                  rostersMap[className] = [];
              }
              rostersMap[className].push({
                  email: email,
                  name: name
              });
          }
      }
      
      // Convert map to array
      for (const [cls, students] of Object.entries(rostersMap)) {
          exportPayload.rosters.push({
              className: cls,
              students: students
          });
      }
  }
  
  // 3. WRITE TO DRIVE
  const fileName = 'veritas_full_export.json';
  const fileContent = JSON.stringify(exportPayload, null, 2);
  const file = DriveApp.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
  
  SpreadsheetApp.getUi().alert('✅ Export Complete!\n\nFile created in Drive: ' + fileName + '\n\nPlease download this file and upload it to the Teacher Dashboard.');
}
