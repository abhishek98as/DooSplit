# DooSplit

Expense sharing app built with Next.js and Firebase.

## Runtime Stack
- Next.js 15 + React 19
- Firebase Auth (client SDK)
- Firebase Admin (session cookies, server auth checks)
- Firestore (normalized collections)
- Firebase Storage (primary image provider)
- ImageKit (secondary image provider)

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

FIREBASE_PROJECT_ID=
FIREBASE_DATABASE_ID=(default)
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
# or FIREBASE_SERVICE_ACCOUNT_KEY as JSON string

FIREBASE_STORAGE_BUCKET=
FIREBASE_SESSION_COOKIE_NAME=firebase-session
FIREBASE_SESSION_MAX_AGE_SECONDS=1209600

DATA_BACKEND=firestore
IMAGE_STORAGE_PROVIDER=firebase
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
- Default managed image provider: Firebase Storage.
- Secondary provider: ImageKit.
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
