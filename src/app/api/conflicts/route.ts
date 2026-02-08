import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ConflictResolver } from "@/lib/conflict-resolver";

export const dynamic = 'force-dynamic';

// GET /api/conflicts - List all conflicts for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

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