# DooSplit

Expense sharing app built with Next.js and Firebase.

## Runtime Stack
- Next.js 15 + React 19
- Firebase Auth (client SDK)
- Firebase Admin (session cookies, server auth checks)
- Firestore (normalized collections)
- Firebase Storage (image uploads)
- Firebase App Check (API abuse protection)
- Firebase Cloud Messaging (web push notifications)
- Firebase Performance Monitoring (web traces)
- Cloud Functions for Firebase (scheduled jobs + webhooks)

## Firebase Collections
- `users`
- `friendships`
- `groups`
- `group_members`
- `expenses`
- `expense_participants`
- `settlements`
- `notifications`
- `invitations`
- `payment_reminders`

## Quick Start
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Required Environment Variables
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_ID=(default)
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=
NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING=false

FIREBASE_PROJECT_ID=
FIREBASE_DATABASE_ID=(default)
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
# or FIREBASE_SERVICE_ACCOUNT_KEY as JSON string

FIREBASE_STORAGE_BUCKET=
FIREBASE_SESSION_COOKIE_NAME=firebase-session
FIREBASE_SESSION_MAX_AGE_SECONDS=1209600
FIREBASE_APP_CHECK_ENFORCE=false
WEBHOOK_SECRET=

DATA_BACKEND=firestore
```

## Phase 1 Firebase Features
- App Check verification is integrated in server auth guards (`requireUser`, `getServerFirebaseUser`) and client API requests (`X-Firebase-AppCheck`).
- FCM token sync is integrated with `/api/notifications/subscribe`; push sends run from API routes and Cloud Functions.
- Web performance tracing covers startup, API latency, and route render traces.
- Cloud Functions in `functions/` include reminder schedules, nightly balance snapshot jobs, invite cleanup, and payment webhook handling.

## Deploy Cloud Functions
```bash
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only functions
```

## Auth Flow
- Client signs in with Firebase Auth.
- Client sends ID token to `POST /api/auth/session`.
- Server sets HTTP-only Firebase session cookie.
- Client calls `POST /api/auth/bootstrap` to create/sync `users/{uid}` and process invite bootstrap logic.
- Server routes use Firebase-backed `requireUser`.

## Realtime
- Client subscribes with Firestore `onSnapshot` listeners for:
  - `notifications` scoped to current `uid`
  - `friendships` where current `uid` is requester or recipient

## Storage
- Managed image provider: Firebase Storage.
- Image API paths are unchanged:
  - `POST /api/images/upload`
  - `GET /api/images/[referenceId]`
  - `GET /api/images/entity/[entityId]`
  - `DELETE /api/images/[referenceId]`

## Scripts
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:firebase
npm run seed:firebase
```

## Firebase Ops Files
- Firestore indexes: `firestore.indexes.json`
- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`
- Connectivity test: `scripts/test-firebase-connection.js`
