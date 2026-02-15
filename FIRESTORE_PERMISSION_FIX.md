# Fix Firebase Service Account Permissions for Firestore

## Problem
The Firebase connection test is failing with "5 NOT_FOUND" error, indicating the service account doesn't have permission to access Firestore.

## Solution: Grant Firestore Permissions to Service Account

### Step 1: Go to Google Cloud Console IAM
1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project: **doosplit**
3. Navigate to **IAM & Admin > IAM**

### Step 2: Find the Service Account
Look for the service account with email:
```
firebase-adminsdk-fbsvc@doosplit.iam.gserviceaccount.com
```

### Step 3: Grant Firestore Permissions
1. Click the **Edit** (pencil) icon next to the service account
2. Click **Add Another Role**
3. Search for and select: **Cloud Datastore Owner**
4. Click **Save**

### Step 4: Wait and Test
1. Wait 2-3 minutes for permissions to propagate
2. Test the connection:
```bash
npm run test:firebase
```

## Alternative: Check Firebase Console
If you prefer to use Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings > Service Accounts**
4. Click **Manage service account permissions**
5. This will redirect to Google Cloud Console IAM

## What the Cloud Datastore Owner Role Provides
- Full read/write access to Firestore
- Create, read, update, delete documents
- Manage indexes
- Import/export data

## Expected Result
After granting permissions, the test should return:
```json
{
  "ok": true,
  "firestore": "write-read-delete success",
  "auth": "listUsers success",
  "sampleUsersReturned": 0
}
```

## If Still Failing
If you still get errors after granting permissions:

1. **Check Database Region**: Make sure you're connecting to the correct Firestore region
2. **Verify Database Name**: Confirm the database name is "(default)"
3. **Check Security Rules**: Firestore security rules might be blocking access
4. **Wait Longer**: IAM changes can take up to 10 minutes to propagate

## Security Rules Reminder
Since you created Firestore in "test mode", it allows all reads/writes. In production, you'll want to set up proper security rules based on authentication.