# Image Proxy Setup Guide

## What Changed

The app now serves images through a proxy endpoint instead of using direct Drive links. This fixes the broken image issue where images weren't displaying for teachers and students.

---

## Why This Approach

Direct Drive URLs (`https://drive.google.com/uc?id=...`) are unreliable because:
- They break with Drive ACL/sharing changes
- They don't render consistently across browsers
- They require complex authentication handling
- They often show Drive UI chrome instead of raw images

The **proxy endpoint** approach:
- ✅ Streams image bytes directly through your web app
- ✅ Works without Google authentication
- ✅ Consistent rendering across all browsers
- ✅ No Drive ACL issues
- ✅ 5-minute caching reduces server load
- ✅ Security validation ensures only allowed files are served

---

## How It Works

### 1. Image Upload Flow
```
Teacher uploads image
    ↓
uploadImageToDrive() saves to Drive
    ↓
Returns fileId (not URL)
    ↓
Client stores questionImageFileId or imageFileId
```

### 2. Image Display Flow
```
Render poll question
    ↓
normalizeQuestionObject_() generates proxy URL
    ↓
URL = https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?fn=image&id=FILE_ID
    ↓
Browser requests proxy endpoint
    ↓
serveImage_() validates file & streams bytes
    ↓
Image displays in browser
```

---

## Setup Instructions

### Step 1: Deploy the Updated Code

1. Copy the updated files to your Apps Script project:
   - `Code.gs`
   - `TeacherView.html`
   - `StudentView.html`

2. Save all changes (Ctrl+S / Cmd+S)

### Step 2: Deploy as Web App

1. In Apps Script editor, click **Deploy** > **New deployment**
2. Select **Web app**
3. Configure:
   - **Description**: "Image Proxy v1" (or any description)
   - **Execute as**: Me (your account)
   - **Who has access**: Anyone
4. Click **Deploy**
5. **IMPORTANT**: Copy the deployment URL shown

### Step 3: Set Web App URL in Script Properties

The proxy needs to know its own URL to generate image links.

**Option A: Automatic (Recommended)**
The system will auto-detect the URL on first run. No action needed.

**Option B: Manual (More Reliable)**
1. In Apps Script editor, go to **Project Settings** (gear icon)
2. Scroll to **Script Properties**
3. Click **Add script property**
4. Enter:
   - **Property**: `WEB_APP_URL`
   - **Value**: Your deployment URL (e.g., `https://script.google.com/macros/s/ABC123.../exec`)
5. Click **Save**

---

## Data Model Changes

### Before (Drive URLs)
```json
{
  "questionImageURL": "https://drive.google.com/uc?id=123",
  "options": [
    {"text": "A", "imageURL": "https://drive.google.com/uc?id=456"}
  ]
}
```

### After (File IDs + Proxy URLs)
```json
{
  "questionImageFileId": "123",
  "questionImageURL": "https://script.google.com/.../exec?fn=image&id=123",
  "options": [
    {"text": "A", "imageFileId": "456", "imageURL": "https://script.google.com/.../exec?fn=image&id=456"}
  ]
}
```

**Note**: Both fields are kept for backward compatibility. Old polls with only `questionImageURL` will still work.

---

## Testing the Proxy

### Test 1: Upload New Image
1. Create a new poll
2. Upload a question image
3. Verify preview shows in editor
4. Save poll
5. Re-open poll - image should display

### Test 2: Live View
1. Start a poll with images
2. Teacher should see question image
3. Student (in incognito mode) should see question image
4. Both should load without errors

### Test 3: Direct Proxy Access
Open in browser:
```
https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?fn=image&id=VALID_FILE_ID
```

Should display the image. If file not in allowed folder, shows "Forbidden".

### Test 4: Check Network Tab
In browser DevTools > Network:
- Look for requests to `/exec?fn=image&id=...`
- Response should be 200 OK
- Content-Type should be `image/png` or `image/jpeg`
- Cache-Control should be `public, max-age=300`

---

## Security Features

### File Validation
The proxy validates each request:
```javascript
// Only serves files from this specific folder
const ALLOWED_FOLDER_ID = '1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi';

// Checks parent folder before serving
if (file.getParents().hasNext()) {
  const parent = file.getParents().next();
  if (parent.getId() !== ALLOWED_FOLDER_ID) {
    return "Forbidden";
  }
}
```

This prevents unauthorized access to other Drive files.

---

## Performance & Caching

### Client-Side Caching
Browser automatically caches images for 5 minutes:
```http
Cache-Control: public, max-age=300
```

### Server-Side
- ContentService streams bytes efficiently
- No base64 encoding overhead
- MIME type auto-detected from file

### Cache Busting
Live view adds query parameter to force refresh:
```javascript
imageUrl + "?q=" + questionIndex
// Example: .../exec?fn=image&id=123&q=0
```

This ensures fresh images when switching questions.

---

## Troubleshooting

### Images Not Displaying

**Check 1: Deployment**
- Verify web app is deployed with "Execute as: Me" and "Access: Anyone"
- Verify you copied the correct deployment URL

**Check 2: Script Properties**
```javascript
// In Apps Script editor > Executions tab, check logs:
Logger.log('WEB_APP_URL:', getWebAppUrl_());
```

**Check 3: File Permissions**
- Verify uploads go to folder `1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi`
- Check Drive folder exists and you have access

**Check 4: Browser Console**
- Open DevTools > Console
- Look for error messages
- Check Network tab for failed requests

### Error: "Missing id parameter"
Image URL is malformed. Check that fileId is being stored and retrieved correctly.

### Error: "Forbidden"
File is not in the allowed folder. Re-upload the image through the app.

### Error: "File not found"
FileId is invalid or file was deleted from Drive. Re-upload the image.

---

## Migration from Old System

### Existing Polls
Old polls with `questionImageURL` (Drive URLs) will continue to work:
- normalizeQuestionObject_() checks for fileId first
- Falls back to URL if fileId not present
- No re-saving required

### New Polls
All new uploads automatically use the proxy system:
- Stores fileId instead of URL
- Generates proxy URL at render time
- Backward compatible fields still included

---

## Key Files Modified

### Code.gs
- `serveImage_(e)` - NEW proxy endpoint
- `getWebAppUrl_()` - NEW helper to get base URL
- `uploadImageToDrive()` - Returns fileId instead of URL
- `normalizeQuestionObject_()` - Generates proxy URLs from fileIds

### TeacherView.html
- Upload handlers store fileId
- `generateProxyUrl()` - NEW client-side helper
- `getImagePreviewUrl()` - Updated to handle fileIds
- `savePoll()` - Sends fileIds in payload
- Added onerror handler to images

### StudentView.html
- Added onerror handler to question image
- No other changes needed (uses same proxy URLs)

---

## Summary

✅ **Problem Solved**: Images now display reliably
✅ **Security**: File validation prevents unauthorized access
✅ **Performance**: 5-minute caching reduces load
✅ **Compatibility**: Old polls still work
✅ **Simple**: One-time deployment setup

**Next Steps**:
1. Deploy the updated code
2. Set WEB_APP_URL in script properties (optional but recommended)
3. Test uploading a new image
4. Verify it displays in teacher and student views
5. Done!
