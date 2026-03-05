---
name: Firebase Migration Plan
overview: Complete migration from Supabase (PostgreSQL) to Firebase (Firestore + Auth + Storage + Real-time) with focus on improving performance and eliminating 504 timeout errors. Includes Firebase SDK integration for account monitoring and quota management.
todos:
  - id: firebase-sdk-setup
    content: Set up Firebase account management utilities and test connection
    status: completed
  - id: firestore-adapter
    content: Create Firestore data adapter to replace Supabase queries
    status: completed
  - id: auth-migration
    content: Replace NextAuth/Supabase Auth with Firebase Authentication
    status: completed
  - id: storage-migration
    content: Migrate from Supabase Storage to Firebase Storage
    status: completed
  - id: api-routes-update
    content: Update all API routes to use Firebase instead of Supabase
    status: completed
  - id: offline-store-update
    content: Update offline store and IndexedDB to work with Firebase
    status: completed
  - id: remove-supabase
    content: Remove Supabase dependencies, files, and configuration
    status: completed
  - id: firestore-indexes
    content: Create Firestore composite indexes for performance
    status: completed
  - id: testing-deployment
    content: Test Firebase connection, deploy to Vercel, and monitor performance
    status: completed
isProject: false
---

# Firebase Migration Plan: Supabase to Firebase

## Overview

Migrate DooSplit from Supabase (PostgreSQL + Auth) to Firebase (Firestore + Auth + Storage + Real-time) to resolve 504 timeout errors and improve performance. This is a **complete platform migration** targeting a fresh start (no production data preservation required).

## Current Architecture

```mermaid
graph LR
    Client[Next.js Client]
    API[API Routes]
    NextAuth[NextAuth JWT]
    Supabase[(Supabase Postgres)]
    SupaAuth[Supabase Auth]
    Firebase[Firebase Analytics]
    
    Client --> API
    API --> NextAuth
    API --> Supabase
    Client --> SupaAuth
    Client --> Firebase
    
    NextAuth --> Supabase
    SupaAuth --> Supabase
```



## Target Architecture

```mermaid
graph LR
    Client[Next.js Client]
    API[API Routes]
    FirebaseAuth[Firebase Auth]
    Firestore[(Cloud Firestore)]
    FirebaseStorage[Firebase Storage]
    Analytics[Firebase Analytics]
    
    Client --> API
    Client --> FirebaseAuth
    API --> FirebaseAuth
    API --> Firestore
    Client --> Firestore
    Client --> FirebaseStorage
    Client --> Analytics
    
    FirebaseAuth -.JWT.-> API
```



## Phase 1: Firebase SDK Setup and Account Verification

### 1.1 Install Firebase Dependencies

Already installed in `[package.json](package.json)`:

- `firebase@^12.9.0` (Client SDK)
- `firebase-admin@^13.6.1` (Admin SDK)

### 1.2 Create Firebase Account Management Utility

**New file:** `src/lib/firebase-account.ts`

```typescript
import { adminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export async function getFirebaseAccountDetails() {
  if (!adminApp) {
    throw new Error('Firebase Admin not initialized');
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const db = getFirestore(adminApp);
  const auth = getAuth(adminApp);

  // Get quota and usage info
  const stats = {
    project: {
      id: projectId,
      displayName: 'DooSplit',
    },
    firestore: {
      plan: 'Spark (Free)',
      limits: {
        storage: '1 GiB',
        reads: '50,000/day',
        writes: '20,000/day',
        deletes: '20,000/day',
        bandwidth: '10 GiB/month'
      }
    },
    auth: {
      // Count existing users
      usersCount: await auth.listUsers(1).then(result => result.users.length)
    }
  };

  return stats;
}
```

### 1.3 Create API Endpoint for Account Info

**New file:** `src/app/api/firebase/account/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getFirebaseAccountDetails } from '@/lib/firebase-account';

export async function GET() {
  try {
    const details = await getFirebaseAccountDetails();
    return NextResponse.json(details);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

## Phase 2: Database Schema Migration (Firestore)

### 2.1 Firestore Data Model Design

Firestore uses NoSQL document-based storage. Current Postgres schema needs restructuring:

**Collections Structure:**

```
users/
  {userId}/
    - email, name, phone, profile_picture
    - default_currency, timezone, language
    - is_active, created_at, updated_at
    
friendships/
  {friendshipId}/
    - user_id, friend_id, status
    - requested_by, created_at, updated_at
    
groups/
  {groupId}/
    - name, description, image, type, currency
    - created_by, is_active, created_at
    - members: Map<userId, { role, joined_at }>
    
expenses/
  {expenseId}/
    - amount, description, category, date
    - currency, created_by, group_id
    - images[], notes
    - participants: Map<userId, { paid_amount, owed_amount, is_settled }>
    
settlements/
  {settlementId}/
    - from_user_id, to_user_id, amount
    - currency, method, date, screenshot
    
notifications/
  {notificationId}/
    - user_id, type, message, data
    - is_read, created_at
```

### 2.2 Create Firestore Data Access Layer

**New file:** `src/lib/data/firestore-adapter.ts`

This will replace `[src/lib/data/supabase-adapter.ts](src/lib/data/supabase-adapter.ts)` with equivalent Firestore queries:

```typescript
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import type { FriendsPayload, GroupsPayload, ExpensesPayload } from './types';

const db = getFirestore(adminApp!);

export async function getFriends(input: { userId: string }): Promise<FriendsPayload> {
  const friendshipsSnap = await db
    .collection('friendships')
    .where('user_id', '==', input.userId)
    .where('status', '==', 'accepted')
    .get();

  const friends = await Promise.all(
    friendshipsSnap.docs.map(async (doc) => {
      const data = doc.data();
      const friendDoc = await db.collection('users').doc(data.friend_id).get();
      const friendData = friendDoc.data();
      
      return {
        id: doc.id,
        friend: {
          _id: friendDoc.id,
          name: friendData?.name,
          email: friendData?.email,
          profilePicture: friendData?.profile_picture,
        },
        balance: 0, // Calculate from expenses
        friendshipDate: data.created_at,
      };
    })
  );

  return { friends };
}

// Similar functions for getGroups, getExpenses, etc.
```

### 2.3 Update Data Repository Configuration

Modify `[src/lib/data/config.ts](src/lib/data/config.ts)`:

```typescript
export type DataBackendMode = "firestore" | "supabase";

export function getDataBackendMode(): DataBackendMode {
  return process.env.DATA_BACKEND === "supabase" ? "supabase" : "firestore";
}

export function isFirestoreMode(): boolean {
  return getDataBackendMode() === "firestore";
}
```

Update `[src/lib/data/index.ts](src/lib/data/index.ts)`:

```typescript
import { getDataBackendMode } from "./config";
import { supabaseReadRepository } from "./supabase-adapter";
import { firestoreReadRepository } from "./firestore-adapter";

export const dataRepository = 
  getDataBackendMode() === "firestore" 
    ? firestoreReadRepository 
    : supabaseReadRepository;
```

## Phase 3: Authentication Migration

### 3.1 Remove NextAuth and Supabase Auth

Current auth files to update/remove:

- `[src/lib/auth.ts](src/lib/auth.ts)` - Remove NextAuth config
- `[src/lib/auth/server-session.ts](src/lib/auth/server-session.ts)` - Replace with Firebase
- `[src/lib/auth/client-session.ts](src/lib/auth/client-session.ts)` - Replace with Firebase
- `[src/app/api/auth/[...nextauth]/route.ts](src/app/api/auth/[...nextauth]/route.ts)` - Remove

### 3.2 Create Firebase Auth Session Manager

**Update:** `src/lib/auth/firebase-session.ts`

```typescript
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '@/lib/firebase-admin';
import type { NextRequest } from 'next/server';

export async function getServerFirebaseUser(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return null;
  }

  try {
    const auth = getAuth(adminApp!);
    const decodedToken = await auth.verifyIdToken(token);
    
    return {
      id: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    };
  } catch (error) {
    console.error('Firebase auth error:', error);
    return null;
  }
}
```

### 3.3 Update Client-side Auth

**Update:** `[src/lib/firebase.ts](src/lib/firebase.ts)`

Add client-side session management:

```typescript
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export async function getFirebaseIdToken(): Promise<string | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) return null;
  
  return await user.getIdToken();
}

// Update authFetch equivalent
export async function firebaseAuthFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getFirebaseIdToken();
  const headers = new Headers(init.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
```

### 3.4 Update Login/Register Pages

**Update:** `src/app/auth/login/page.tsx` and `src/app/auth/register/page.tsx`

Replace Supabase/NextAuth calls with Firebase Auth:

```typescript
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// Login
await signInWithEmailAndPassword(auth, email, password);

// Register
await createUserWithEmailAndPassword(auth, email, password);
```

## Phase 4: Storage Migration

### 4.1 Replace Supabase Storage with Firebase Storage

**Update:** Create `src/lib/storage/firebase-storage.ts` to replace `src/lib/storage/supabase-storage.ts`

```typescript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '@/lib/firebase';

const storage = getStorage(app);

export async function uploadExpenseImage(
  userId: string,
  expenseId: string,
  file: File
): Promise<string> {
  const storageRef = ref(storage, `expenses/${userId}/${expenseId}/${file.name}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}
```

### 4.2 Update Image Upload Components

Update all components that use Supabase Storage to use Firebase Storage.

## Phase 5: Real-time Features (Optional Enhancement)

### 5.1 Add Firestore Real-time Listeners

Example for real-time expense updates:

```typescript
import { onSnapshot, collection } from 'firebase/firestore';

function subscribeToExpenses(userId: string, callback: (expenses: any[]) => void) {
  const db = getFirestore();
  
  return onSnapshot(
    collection(db, 'expenses'),
    { where: ['participants', 'array-contains', userId] },
    (snapshot) => {
      const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(expenses);
    }
  );
}
```

## Phase 6: Environment Configuration

### 6.1 Update Environment Variables

**Remove from `.env.local` and `.env.production`:**

```bash
# Remove Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
```

**Keep Firebase (already configured):**

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDbbpQJ5Gp2hFWY1ul5qKqGxRagzHo7hlw
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=doosplit.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=doosplit
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=doosplit.firebasestorage.app
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@doosplit.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

**Add new:**

```bash
DATA_BACKEND=firestore
```

### 6.2 Update Next.js API Routes

Update all API routes in `src/app/api/` to use Firebase:

- `[src/app/api/friends/route.ts](src/app/api/friends/route.ts)`
- `[src/app/api/groups/route.ts](src/app/api/groups/route.ts)`
- `[src/app/api/expenses/route.ts](src/app/api/expenses/route.ts)`
- `[src/app/api/settlements/route.ts](src/app/api/settlements/route.ts)`

Replace:

```typescript
import { requireUser } from '@/lib/auth/require-user';
import { supabaseReadRepository } from '@/lib/data/supabase-adapter';
```

With:

```typescript
import { getServerFirebaseUser } from '@/lib/auth/firebase-session';
import { firestoreReadRepository } from '@/lib/data/firestore-adapter';
```

## Phase 7: Offline Store and IndexedDB

### 7.1 Update Offline Store

**Update:** `[src/lib/offline-store.ts](src/lib/offline-store.ts)`

Replace `authFetch` with `firebaseAuthFetch`:

```typescript
import { firebaseAuthFetch, getFirebaseIdToken } from '@/lib/firebase';

// Update getFriends cache key to include Firebase user ID
async getFriends(): Promise<FriendRecord[]> {
  const token = await getFirebaseIdToken();
  const userId = token ? parseJwt(token).uid : 'anon';
  const cacheKey = `friends_${userId}`;
  // ... rest of implementation
}
```

## Phase 8: Remove Supabase Dependencies

### 8.1 Uninstall Supabase Packages

```bash
npm uninstall @supabase/supabase-js supabase
```

### 8.2 Delete Supabase Files

- `supabase/` directory (all migrations)
- `src/lib/supabase/` directory
- `src/lib/data/supabase-adapter.ts`
- `src/lib/storage/supabase-storage.ts`
- `scripts/validate-supabase-config.js`
- `scripts/seed-supabase.js`

### 8.3 Update package.json Scripts

Remove:

```json
"validate:supabase": "node scripts/validate-supabase-config.js",
"seed:supabase": "node scripts/seed-supabase.js"
```

Add:

```json
"seed:firebase": "node scripts/seed-firebase.js"
```

## Phase 9: Performance Optimization

### 9.1 Firestore Indexes

Create composite indexes for common queries:

**firestore.indexes.json:**

```json
{
  "indexes": [
    {
      "collectionGroup": "expenses",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "created_by", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "friendships",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "user_id", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 9.2 Implement Batch Reads

Replace N+1 queries with batch reads:

```typescript
// Instead of individual gets, use batch
const userRefs = friendIds.map(id => db.collection('users').doc(id));
const userDocs = await db.getAll(...userRefs);
```

### 9.3 Enable Firestore Cache

```typescript
import { enableIndexedDbPersistence } from 'firebase/firestore';

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('Browser doesn\'t support persistence');
  }
});
```

## Phase 10: Testing and Deployment

### 10.1 Create Firebase Test Script

**New file:** `scripts/test-firebase-connection.js`

```javascript
const admin = require('firebase-admin');

const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function testFirebase() {
  const db = admin.firestore();
  
  // Test write
  await db.collection('test').doc('connection').set({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    message: 'Connection test successful'
  });
  
  // Test read
  const doc = await db.collection('test').doc('connection').get();
  console.log('✅ Firebase connected:', doc.data());
  
  // Get project info
  console.log('📊 Project ID:', admin.app().options.projectId);
  
  process.exit(0);
}

testFirebase().catch(console.error);
```

### 10.2 Update Vercel Configuration

**Update:** `[vercel.json](vercel.json)`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["bom1"],
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 10
    }
  },
  "env": {
    "DATA_BACKEND": "firestore"
  }
}
```

### 10.3 Deployment Checklist

1. Test Firebase connection: `node scripts/test-firebase-connection.js`
2. Verify environment variables in Vercel
3. Deploy to Vercel: `vercel --prod`
4. Test all API endpoints
5. Monitor Firestore usage in Firebase Console

## Expected Performance Improvements

- **Latency**: Firestore queries < 100ms vs Supabase 504 timeouts
- **Scalability**: Auto-scaling with no connection pool limits
- **Real-time**: Built-in real-time updates without polling
- **Offline**: Better offline support with Firestore cache
- **Cost**: Free tier supports 50K reads/day (vs Supabase connection issues)

## Migration Risks and Mitigation


| Risk                    | Mitigation                                       |
| ----------------------- | ------------------------------------------------ |
| Data loss               | Fresh start accepted; no data migration needed   |
| Authentication downtime | Test thoroughly in dev before production         |
| Query performance       | Create proper Firestore indexes upfront          |
| API rate limits         | Monitor Firebase Console; implement caching      |
| Learning curve          | Follow Firebase documentation and best practices |


## Post-Migration Monitoring

Add Firebase monitoring dashboard:

**New file:** `src/app/admin/firebase-monitor/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function FirebaseMonitor() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/firebase/account')
      .then(r => r.json())
      .then(setStats);
  }, []);

  return (
    <div>
      <h1>Firebase Account Status</h1>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </div>
  );
}
```

