import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { ConflictResolver } from "@/lib/conflict-resolver";

export const dynamic = 'force-dynamic';

// GET /api/conflicts - List all conflicts for the user
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const userId = auth.user.id;

    // Get conflicts from conflict resolver
    const conflicts = await ConflictResolver.getUserConflicts(userId);

    return NextResponse.json({
      conflicts,
      count: conflicts.length
    });
  } catch (error: any) {
    console.error("Get conflicts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conflicts" },
      { status: 500 }
    );
  }
}
