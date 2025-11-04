# Image Upload System - Test Script and Verification

This document outlines how to test and verify that the image upload system meets all acceptance criteria.

---

## Prerequisites

1. **Drive Folder**: Verify folder `1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi` exists and is accessible
2. **Sharing**: Confirm folder is set to "Anyone with link can view"
3. **Deployment**: Deploy the updated code to your Google Apps Script project

---

## Test Cases

### ✅ Test 1: Immediate Image Upload in Poll Creator

**What to test**: Images upload to Drive immediately when selected (not on save)

**Steps**:
1. Open teacher dashboard
2. Click "Create New Poll"
3. Enter poll name and select a class
4. Click "Upload Image" for the question
5. Select an image file (JPEG/PNG < 5MB)

**Expected Results**:
- ✓ "Uploading image..." spinner appears immediately
- ✓ After ~1-2 seconds, image preview displays
- ✓ Preview shows the actual image from Drive URL (not base64)
- ✓ Poll is marked as "dirty" (unsaved changes indicator)
- ✓ Console shows: `Image uploaded successfully` with file ID

**Verification**:
```javascript
// Open browser console while testing
// You should see output like:
// Image uploaded successfully {fileName: "test.jpg", fileId: "1ABC...", size: 245678}
```

---

### ✅ Test 2: Answer Choice Image Upload

**What to test**: Answer images upload immediately and display correctly

**Steps**:
1. In poll creator, add an answer choice
2. Click the image icon for that answer
3. Select an image file

**Expected Results**:
- ✓ "Uploading..." spinner appears for that specific answer
- ✓ Image preview appears below the answer text field
- ✓ "Remove" button appears next to the image
- ✓ Image displays from Drive URL with referrerpolicy="no-referrer"

---

### ✅ Test 3: Save Poll with Images

**What to test**: Poll saves successfully with Drive URLs (no re-upload)

**Steps**:
1. Create a poll with:
   - Question text
   - Question image (already uploaded from Test 1)
   - 2+ answer choices with text
   - At least one answer with an image
2. Mark correct answer
3. Click "Publish Poll"

**Expected Results**:
- ✓ Save completes successfully
- ✓ Success alert shows correct question count
- ✓ No additional upload progress (images already uploaded)
- ✓ Poll appears in polls list
- ✓ Network tab shows no large base64 payloads in the save request

**Data Verification**:
```javascript
// In Apps Script editor, check Polls sheet:
// QuestionDataJSON column should contain:
{
  "questionText": "Your question",
  "questionImageURL": "https://drive.google.com/uc?id=1ABC...",
  "options": [
    {"text": "Answer A", "imageURL": "https://drive.google.com/uc?id=1DEF..."},
    {"text": "Answer B", "imageURL": null}
  ],
  "correctAnswer": "Answer A"
}
// Note: questionImageURL is the canonical field (not questionImage)
```

---

### ✅ Test 4: Re-Open Poll for Editing (Authoring Acceptance)

**What to test**: Previously saved images display in editor preview

**Steps**:
1. From polls list, click "Edit" on a poll with images
2. Navigate through questions in the editor

**Expected Results**:
- ✓ Poll name and class pre-filled correctly
- ✓ Question images display as previews (from Drive URLs)
- ✓ Answer images display as previews
- ✓ "Remove Image" buttons appear for all images
- ✓ Images load from Drive (check Network tab - URLs should be drive.google.com/uc?id=...)
- ✓ No base64 data in preview images
- ✓ Browser console shows no errors

**Cache-Busting Verification**:
```javascript
// Inspect image element in browser DevTools:
// <img src="https://drive.google.com/uc?id=1ABC..." referrerpolicy="no-referrer">
// Note: No cache-busting parameter in editor preview (only in live view)
```

---

### ✅ Test 5: Teacher Live View (Live Display Acceptance)

**What to test**: Images display in teacher's live view with cache-busting

**Steps**:
1. Select a poll with images
2. Click "Start Poll"
3. Observe the live view question display
4. Click "Next" to advance to next question (if poll has multiple questions)

**Expected Results**:
- ✓ Question image displays correctly in live view
- ✓ Image element has `referrerpolicy="no-referrer"`
- ✓ Image URL includes cache-busting: `?q=0` (for question 0)
- ✓ When advancing to next question, URL updates to `?q=1`
- ✓ No stale image rendering when switching questions
- ✓ If question has no image, image container is hidden

**Cache-Busting Verification**:
```javascript
// Inspect live-question-image element:
// For Question 1: <img src="https://drive.google.com/uc?id=1ABC...?q=0">
// For Question 2: <img src="https://drive.google.com/uc?id=1DEF...?q=1">
// Note: The ?q=N is added dynamically, NOT stored in database
```

---

### ✅ Test 6: Student View (Student Display Acceptance)

**What to test**: Students see images without authentication

**Steps**:
1. Start a poll with images
2. Send student link to a student (or open in incognito/private window)
3. Student clicks the link
4. Observe question display when poll is active

**Expected Results**:
- ✓ Question image displays correctly
- ✓ Answer choice images display correctly
- ✓ Images load successfully in incognito mode (no Google login required)
- ✓ Image element has `referrerpolicy="no-referrer"`
- ✓ All images are publicly viewable (ANYONE_WITH_LINK permission)

**Network Verification**:
```javascript
// In student's browser Network tab:
// Request to: https://drive.google.com/uc?id=1ABC...
// Response: 200 OK (image loads successfully)
// No authentication required
```

---

### ✅ Test 7: Multiple Question Navigation

**What to test**: Images update reliably when advancing questions

**Steps**:
1. Create a poll with 3+ questions, each with different images
2. Start the poll
3. Advance through questions using "Next" button
4. Observe both teacher and student views

**Expected Results**:
- ✓ Teacher view updates to show correct image for each question
- ✓ Student view updates to show correct image for each question
- ✓ Cache-busting parameter increments (?q=0, ?q=1, ?q=2)
- ✓ No image "flickering" or displaying previous question's image
- ✓ Images load quickly (already in Drive cache)

---

### ✅ Test 8: Backward Compatibility (Legacy Polls)

**What to test**: Older polls with `questionImage` field still work

**Steps**:
1. Manually edit Polls sheet (or keep an old poll from before this update)
2. Change QuestionDataJSON to use legacy field:
   ```json
   {
     "questionText": "Old question",
     "questionImage": "https://drive.google.com/uc?id=1XYZ...",
     "options": [
       {"text": "A", "image": "https://drive.google.com/uc?id=1ZZZ..."}
     ]
   }
   ```
3. Edit the poll in the editor
4. Start the poll live

**Expected Results**:
- ✓ Poll editor displays images correctly (mapped from questionImage → questionImageURL)
- ✓ Live view displays images correctly
- ✓ Student view displays images correctly
- ✓ Server-side normalization converts legacy fields automatically
- ✓ Console shows: "Mapping legacy field questionImage to questionImageURL"

---

### ✅ Test 9: Drive Folder Verification

**What to test**: All uploads go to the correct folder with correct permissions

**Steps**:
1. Upload several images through the poll creator
2. Open Drive folder: https://drive.google.com/drive/folders/1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi
3. Check folder contents

**Expected Results**:
- ✓ All uploaded images appear in this folder
- ✓ No duplicate folders created (always uses hardcoded ID)
- ✓ Each file has "Anyone with link can view" permission
- ✓ File names match uploaded file names
- ✓ Files are images (JPEG, PNG, GIF, WEBP)

**Script Properties Verification**:
```javascript
// In Apps Script editor > Project Settings > Script Properties:
// DRIVE_FOLDER_ID should be: 1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi
```

---

### ✅ Test 10: Error Handling

**What to test**: Proper error messages for invalid uploads

**Steps**:
1. Try uploading a file > 5MB
2. Try uploading a non-image file (PDF, TXT)
3. Try uploading while offline
4. Try saving poll while an image is still uploading

**Expected Results**:
- ✓ File > 5MB: Alert "File exceeds 5MB limit"
- ✓ Non-image: Alert "File must be an image"
- ✓ Offline: Alert "Image upload failed: [network error]"
- ✓ Uploading in progress: Alert "Question X image is still uploading. Please wait..."
- ✓ Poll does NOT save if uploads in progress
- ✓ Failed uploads clear the image field (no broken state)

---

## Data Integrity Checks

### Check 1: Inspect Polls Sheet

```
Open Google Sheets > Polls sheet
Check QuestionDataJSON column for a saved poll:

Expected structure:
{
  "questionText": "...",
  "questionImageURL": "https://drive.google.com/uc?id=...",  // CANONICAL FIELD
  "questionImage": "https://drive.google.com/uc?id=...",     // BACKWARD COMPAT (same value)
  "options": [
    {"text": "...", "imageURL": "...", "image": "..."},     // imageURL is CANONICAL
    {"text": "...", "imageURL": null, "image": null}
  ],
  "correctAnswer": "...",
  "timerSeconds": 60
}

✓ No base64 data URIs (data:image/...)
✓ Only https://drive.google.com/uc?id=... URLs
✓ questionImageURL is populated (canonical)
✓ options[].imageURL is populated (canonical)
```

### Check 2: Server Logs

```
In Apps Script editor > Executions tab:

Look for successful executions:
✓ "Image uploaded successfully" with fileId
✓ "Updated DRIVE_FOLDER_ID to hardcoded value"
✓ No errors in uploadImageToDrive
✓ No "Cannot access Drive folder" errors
```

### Check 3: Network Traffic

```
In browser DevTools > Network tab while testing:

When uploading image:
✓ google.script.run call to uploadImageToDrive
✓ Response: {"success": true, "url": "https://drive.google.com/uc?id=..."}

When loading images:
✓ Requests to drive.google.com/uc?id=...
✓ Response: 200 OK with image data
✓ No CORS errors
✓ No authentication redirects
```

---

## Success Criteria Summary

| Criterion | Test | Status |
|-----------|------|--------|
| 1. Authoring: After upload, preview shows Drive URL | Test 1, 2, 4 | ✅ |
| 2. Teacher live view: Images display with cache-busting | Test 5, 7 | ✅ |
| 3. Student devices: Images display without login | Test 6 | ✅ |
| 4. Permissions: Public "anyone with link - view" | Test 9 | ✅ |
| 5. Data shape: questionImageURL & imageURL canonical | Test 3, Check 1 | ✅ |
| 6. No regressions: Legacy polls work | Test 8 | ✅ |

---

## Troubleshooting

### Issue: Images not uploading

**Check**:
1. Drive folder exists: https://drive.google.com/drive/folders/1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi
2. Script has Drive API scope enabled (check appsscript.json)
3. Browser console for JavaScript errors
4. Apps Script execution logs for server errors

### Issue: Students can't see images

**Check**:
1. Drive folder sharing is "Anyone with link can view"
2. Individual file sharing (should inherit from folder)
3. Image URLs use `/uc?id=` format (not `/open?id=`)
4. Student browser allows images (not blocking 3rd party content)

### Issue: Stale images when switching questions

**Check**:
1. Cache-busting parameter is being added (?q=N)
2. questionIndex is incrementing correctly
3. updateLiveView function is being called on question change
4. Browser is not aggressively caching

### Issue: Upload fails with "Cannot access Drive folder"

**Check**:
1. Folder ID is correct: `1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi`
2. Apps Script project has permission to access Drive
3. Folder is not in trash
4. Folder owner hasn't revoked script access

---

## Final Verification Checklist

Before marking complete, verify:

- [ ] Uploaded image in poll creator - appeared in preview
- [ ] Saved poll - no re-upload, success message correct
- [ ] Re-opened poll - images displayed from Drive
- [ ] Started live poll - teacher saw image with cache-busting
- [ ] Student viewed poll - saw image without login
- [ ] Advanced to next question - image updated reliably
- [ ] Checked Polls sheet - data uses canonical fields
- [ ] Verified Drive folder - all uploads present with public sharing
- [ ] Tested error cases - appropriate error messages
- [ ] Tested legacy poll - still works with old field names

---

## Notes

- All images are uploaded immediately on selection (not on save)
- Cache-busting (?q=N) is only added to DOM, never stored
- Canonical fields: `questionImageURL` and `imageURL`
- Legacy fields: `questionImage` and `image` (mapped on read)
- Drive folder ID is hardcoded, never searched by name
- Public sharing set on every folder access (idempotent)
