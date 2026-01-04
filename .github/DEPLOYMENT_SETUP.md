# GitHub Actions Firebase Deployment Setup

This repository uses GitHub Actions to automatically deploy to Firebase.

## Setup Instructions

### 1. Add Firebase Service Account to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `FIREBASE_SERVICE_ACCOUNT`
5. Value: Paste the **entire contents** of your Firebase service account JSON file

Your JSON file should look like this:
```json
{
  "type": "service_account",
  "project_id": "classroomproctor",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-xxxxx@classroomproctor.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### 2. Deployment Triggers

The workflows are configured to deploy in these scenarios:

#### **Automatic Deployment (on push to main)**
- File: `.github/workflows/firebase-deploy.yml`
- Triggers: When code is pushed to the `main` branch
- Deploys: Hosting, Functions, Firestore rules, Storage rules

#### **Manual Deployment**
- Go to **Actions** tab in GitHub
- Select "Deploy to Firebase" workflow
- Click "Run workflow"
- Choose environment (production/staging)
- Click "Run workflow" button

#### **Pull Request Previews**
- File: `.github/workflows/firebase-hosting-pull-request.yml`
- Triggers: When a PR is opened
- Creates a preview deployment with unique URL
- Automatically comments the preview URL on the PR

#### **Hosting-only Deployment (on merge)**
- File: `.github/workflows/firebase-hosting-merge.yml`
- Triggers: When PR is merged to main
- Deploys: Hosting only (faster for frontend-only changes)

### 3. Verify Setup

After adding the secret:

1. Make a small change to any file
2. Commit and push to `main`:
   ```bash
   git add .
   git commit -m "test: Trigger GitHub Actions deployment"
   git push origin main
   ```
3. Go to **Actions** tab in GitHub
4. Watch the deployment progress
5. Check the deployment at: https://classroomproctor.web.app

### 4. Security Notes

- ✅ Service account JSON is stored securely in GitHub Secrets (encrypted)
- ✅ Secret is never exposed in logs
- ✅ Temporary files are cleaned up after deployment
- ✅ Only repository collaborators can trigger deployments

### 5. Troubleshooting

**Deployment fails with "Permission denied"**
- Verify the service account has these roles in Firebase Console:
  - Firebase Admin
  - Cloud Functions Developer
  - Storage Admin

**Secret not found**
- Double-check the secret name is exactly: `FIREBASE_SERVICE_ACCOUNT`
- Ensure the JSON is valid (use a JSON validator)

**Functions deployment fails**
- Check `functions/package.json` dependencies
- Ensure Node.js version matches (20.x)

### 6. Manual Deployment (Fallback)

If GitHub Actions fails, you can always deploy manually:

```bash
# Using service account
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
firebase deploy --project classroomproctor

# Or using CI token
firebase deploy --token "$FIREBASE_TOKEN"
```

## Workflow Files

- `.github/workflows/firebase-deploy.yml` - Main deployment workflow
- `.github/workflows/firebase-hosting-merge.yml` - Hosting-only on merge
- `.github/workflows/firebase-hosting-pull-request.yml` - PR preview deployments
