import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { adminAuth, initError as firebaseInitError } from "@/lib/firebase-admin";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

export async function GET() {
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
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
  ];

  let envPassed = true;
  for (const variable of requiredVars) {
    const value = process.env[variable];
    const present = !!value && value.length > 0;
    envTest.checks[variable] = {
      present,
      required: true,
      preview: present ? `${value!.substring(0, 8)}...` : "NOT SET",
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

  const supabaseTest: Record<string, any> = {
    name: "Supabase Connection",
  };
  try {
    const start = Date.now();
    const supabase = requireSupabaseAdmin();
    const { count, error } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });
    if (error) {
      throw error;
    }
    supabaseTest.passed = true;
    supabaseTest.connectionTimeMs = Date.now() - start;
    supabaseTest.userCount = count || 0;
  } catch (error: any) {
    supabaseTest.passed = false;
    supabaseTest.error = error.message;
    allPassed = false;
  }
  results.tests.supabase = supabaseTest;

  const firebaseTest: Record<string, any> = {
    name: "Firebase Admin SDK",
    initialized: !!adminAuth,
    initError: firebaseInitError,
  };
  firebaseTest.passed = !!adminAuth || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!firebaseTest.passed) {
    firebaseTest.hint =
      "Google sign-in requires FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY";
  }
  results.tests.firebaseAdmin = firebaseTest;

  const nextAuthTest: Record<string, any> = {
    name: "NextAuth Configuration",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "NOT SET",
    hasSecret: !!process.env.NEXTAUTH_SECRET,
    secretLength: process.env.NEXTAUTH_SECRET?.length || 0,
  };
  nextAuthTest.passed = !!process.env.NEXTAUTH_URL && !!process.env.NEXTAUTH_SECRET;
  if (!nextAuthTest.passed) {
    allPassed = false;
  }
  results.tests.nextAuth = nextAuthTest;

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
    const email = String(body?.email || "").toLowerCase().trim();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("users")
      .select("id,email,name,role,is_active,password")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    if (user.is_active === false) {
      return NextResponse.json(
        { ok: false, error: "Account is deactivated" },
        { status: 403 }
      );
    }
    if (!user.password) {
      return NextResponse.json(
        { ok: false, error: "No password set for this account" },
        { status: 400 }
      );
    }

    const match = await bcrypt.compare(password, String(user.password));
    return NextResponse.json(
      {
        ok: match,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.is_active,
        },
      },
      { status: match ? 200 : 401 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Service test failed" },
      { status: 500 }
    );
  }
}

