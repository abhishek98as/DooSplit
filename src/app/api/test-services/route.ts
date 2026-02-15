import { NextRequest, NextResponse } from "next/server";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { getAdminDb } from "@/lib/firestore/admin";
import { getServerAppUser } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    tests: {},
  };

  let allPassed = true;

  const envTest: Record<string, any> = {
    name: "Environment Variables",
    checks: {},
  };

  const requiredVars = [
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
  ];

  let envPassed = true;
  for (const variable of requiredVars) {
    const value = process.env[variable];
    const present = Boolean(value && value.length > 0);
    envTest.checks[variable] = {
      present,
      required: true,
    };
    if (!present) {
      envPassed = false;
    }
  }
  envTest.passed = envPassed;
  if (!envPassed) {
    allPassed = false;
  }
  results.tests.envVars = envTest;

  const firebaseAdminTest: Record<string, any> = {
    name: "Firebase Admin SDK",
    initialized: Boolean(adminAuth),
    initError: firebaseInitError,
  };
  firebaseAdminTest.passed = Boolean(adminAuth);
  if (!firebaseAdminTest.passed) {
    allPassed = false;
  }
  results.tests.firebaseAdmin = firebaseAdminTest;

  const firestoreTest: Record<string, any> = {
    name: "Firestore Connection",
  };
  try {
    const start = Date.now();
    const db = getAdminDb();
    const snapshot = await db.collection("users").limit(1).get();
    firestoreTest.passed = true;
    firestoreTest.connectionTimeMs = Date.now() - start;
    firestoreTest.sampleCount = snapshot.size;
  } catch (error: any) {
    firestoreTest.passed = false;
    firestoreTest.error = error.message;
    allPassed = false;
  }
  results.tests.firestore = firestoreTest;

  const sessionTest: Record<string, any> = {
    name: "Session Validation",
  };
  try {
    const user = await getServerAppUser(request);
    sessionTest.passed = Boolean(user?.id);
    sessionTest.authenticated = Boolean(user?.id);
    if (!sessionTest.passed) {
      sessionTest.note = "No active Firebase session cookie or bearer token";
    }
  } catch (error: any) {
    sessionTest.passed = false;
    sessionTest.error = error.message;
  }
  results.tests.session = sessionTest;

  const testNames = Object.keys(results.tests);
  const passedCount = testNames.filter((name) => results.tests[name].passed).length;
  const failedCount = testNames.filter((name) => !results.tests[name].passed).length;

  results.summary = {
    total: testNames.length,
    passed: passedCount,
    failed: failedCount,
    allPassed,
    failedTests: testNames.filter((name) => !results.tests[name].passed),
  };
  results.status = allPassed ? "ALL SERVICES HEALTHY" : "ISSUES DETECTED";

  return NextResponse.json(results, { status: allPassed ? 200 : 503 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const idToken = String(body?.idToken || "");

    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: "idToken is required" },
        { status: 400 }
      );
    }

    if (!adminAuth) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin is not initialized" },
        { status: 503 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    return NextResponse.json({
      ok: true,
      firebase: {
        uid: decoded.uid,
        email: decoded.email || null,
        emailVerified: Boolean(decoded.email_verified),
      },
      profile: userDoc.exists ? userDoc.data() : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Service test failed" },
      { status: 500 }
    );
  }
}
