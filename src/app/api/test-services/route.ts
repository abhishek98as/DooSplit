import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { seedAdminUser } from "@/lib/seedAdmin";

export const dynamic = "force-dynamic";

/**
 * Comprehensive service test endpoint
 * Tests MongoDB, Firebase Admin, Admin User, and Auth flow
 * 
 * GET /api/test-services - Run all tests
 * POST /api/test-services - Test login with credentials
 */
export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    tests: {},
  };

  let allPassed = true;

  // ═══════════════════════════════════════════
  // TEST 1: Environment Variables
  // ═══════════════════════════════════════════
  const envTest: Record<string, any> = {
    name: "Environment Variables",
    checks: {},
  };

  const requiredVars = [
    "MONGODB_URI",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
  ];

  const optionalVars = [
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_SERVICE_ACCOUNT_KEY",
  ];

  let envPassed = true;
  for (const v of requiredVars) {
    const val = process.env[v];
    const present = !!val && val.length > 0;
    envTest.checks[v] = {
      present,
      required: true,
      preview: present ? `${val!.substring(0, 8)}...` : "NOT SET",
    };
    if (!present) envPassed = false;
  }

  for (const v of optionalVars) {
    const val = process.env[v];
    const present = !!val && val.length > 0;
    envTest.checks[v] = {
      present,
      required: false,
      preview: present ? `${val!.substring(0, 8)}...` : "NOT SET",
    };
  }

  envTest.passed = envPassed;
  if (!envPassed) allPassed = false;
  results.tests.envVars = envTest;

  // Add admin credentials info
  results.tests.envVars.checks.ADMIN_CREDENTIALS = {
    present: true,
    required: false,
    preview: "Hardcoded (abhishek98as@gmail.com)",
    note: "Admin credentials are hardcoded in seedAdmin.ts"
  };

  // ═══════════════════════════════════════════
  // TEST 2: MongoDB Connection
  // ═══════════════════════════════════════════
  const mongoTest: Record<string, any> = {
    name: "MongoDB Connection",
  };

  try {
    const startTime = Date.now();
    const mongoose = await dbConnect();
    const elapsed = Date.now() - startTime;

    mongoTest.passed = true;
    mongoTest.connectionTimeMs = elapsed;
    mongoTest.readyState = mongoose.connection.readyState;
    mongoTest.readyStateText = ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown";
    mongoTest.host = mongoose.connection.host;
    mongoTest.dbName = mongoose.connection.db?.databaseName;

    // Test a simple query
    try {
      const userCount = await User.countDocuments();
      mongoTest.userCount = userCount;
      mongoTest.queryWorks = true;
    } catch (queryErr: any) {
      mongoTest.queryWorks = false;
      mongoTest.queryError = queryErr.message;
    }
  } catch (error: any) {
    mongoTest.passed = false;
    mongoTest.error = error.message;
    mongoTest.code = error.code;
    allPassed = false;
  }

  results.tests.mongodb = mongoTest;

  // ═══════════════════════════════════════════
  // TEST 3: Firebase Admin SDK
  // ═══════════════════════════════════════════
  const firebaseTest: Record<string, any> = {
    name: "Firebase Admin SDK",
    initialized: !!adminAuth,
    initError: firebaseInitError,
  };

  if (adminAuth) {
    firebaseTest.passed = true;
    firebaseTest.canVerifyTokens = true;
  } else {
    firebaseTest.passed = false;
    firebaseTest.canVerifyTokens = false;
    firebaseTest.hint = "Google sign-in requires FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY";
    // Don't fail overall - Google login is optional if email/password works
  }

  results.tests.firebaseAdmin = firebaseTest;

  // ═══════════════════════════════════════════
  // TEST 4: Admin User in Database
  // ═══════════════════════════════════════════
  const adminTest: Record<string, any> = {
    name: "Admin User",
  };

  try {
    // Hardcoded admin credentials
    const adminEmail = "abhishek98as@gmail.com";
    const adminPassword = "Abhi@1357#";

    // Try to seed the admin user
    await seedAdminUser();

    const adminUser = await User.findOne({
      email: adminEmail.toLowerCase(),
    }).select("+password");

    if (adminUser) {
      adminTest.passed = true;
      adminTest.email = adminUser.email;
      adminTest.role = adminUser.role;
      adminTest.isActive = adminUser.isActive;
      adminTest.hasPassword = !!adminUser.password;
      adminTest.passwordHash = adminUser.password
        ? `${adminUser.password.substring(0, 10)}...`
        : "MISSING";
      adminTest.createdAt = adminUser.createdAt;

      // Verify admin password matches hardcoded value
      if (adminUser.password) {
        const passwordMatch = await bcrypt.compare(
          adminPassword,
          adminUser.password
        );
        adminTest.passwordMatches = passwordMatch;
        if (!passwordMatch) {
          adminTest.hint = "Admin password doesn't match hardcoded value - will be updated on next seed.";
        }
      }
    } else {
      adminTest.passed = false;
      adminTest.error = `Admin user ${adminEmail} not found in database after seed attempt`;
    }
  } catch (error: any) {
    adminTest.passed = false;
    adminTest.error = error.message;
  }

  if (!adminTest.passed) allPassed = false;
  results.tests.adminUser = adminTest;

  // ═══════════════════════════════════════════
  // TEST 5: Auth Flow Simulation
  // ═══════════════════════════════════════════
  const authTest: Record<string, any> = {
    name: "Auth Flow (Credentials)",
  };

  try {
    // Hardcoded admin credentials for testing
    const adminEmail = "abhishek98as@gmail.com";
    const adminPassword = "Abhi@1357#";
      // Simulate the exact same flow as the credentials provider
      const user = await User.findOne({
        email: adminEmail.toLowerCase(),
      }).select("+password");

      if (!user) {
        authTest.passed = false;
        authTest.step = "findUser";
        authTest.error = "User not found in database";
      } else if (!user.password) {
        authTest.passed = false;
        authTest.step = "checkPassword";
        authTest.error = "User has no password field";
      } else {
        const isValid = await bcrypt.compare(adminPassword, user.password);
        if (!isValid) {
          authTest.passed = false;
          authTest.step = "comparePassword";
          authTest.error = "Password does not match";
          authTest.hint = "The admin user in the database has a different password than the hardcoded value";
        } else {
          authTest.passed = true;
          authTest.message = "Login simulation successful";
          authTest.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
          };
        }
      }
    } catch (error: any) {
      authTest.passed = false;
      authTest.error = error.message;
    }

  if (!authTest.passed) allPassed = false;
  results.tests.authFlow = authTest;

  // ═══════════════════════════════════════════
  // TEST 6: NextAuth Configuration
  // ═══════════════════════════════════════════
  const nextAuthTest: Record<string, any> = {
    name: "NextAuth Configuration",
  };

  nextAuthTest.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "NOT SET";
  nextAuthTest.hasSecret = !!process.env.NEXTAUTH_SECRET;
  nextAuthTest.secretLength = process.env.NEXTAUTH_SECRET?.length || 0;
  nextAuthTest.passed = !!process.env.NEXTAUTH_URL && !!process.env.NEXTAUTH_SECRET;

  if (!nextAuthTest.passed) allPassed = false;
  results.tests.nextAuth = nextAuthTest;

  // ═══════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════
  const testNames = Object.keys(results.tests);
  const passedCount = testNames.filter((t) => results.tests[t].passed).length;
  const failedCount = testNames.filter((t) => !results.tests[t].passed).length;

  results.summary = {
    total: testNames.length,
    passed: passedCount,
    failed: failedCount,
    allPassed,
    failedTests: testNames.filter((t) => !results.tests[t].passed),
  };

  results.status = allPassed ? "ALL SERVICES HEALTHY" : "ISSUES DETECTED";

  return NextResponse.json(results, {
    status: allPassed ? 200 : 503,
  });
}
