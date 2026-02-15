import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { ConflictResolver } from "@/lib/conflict-resolver";

export const dynamic = 'force-dynamic';

// POST /api/conflicts/[id]/resolve - Resolve a specific conflict
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const userId = auth.user.id;
    const body = await request.json();
    const { resolution } = body;

    if (!resolution || !['server-wins', 'client-wins', 'merge'].includes(resolution)) {
      return NextResponse.json(
        { error: "Invalid resolution type" },
        { status: 400 }
      );
    }

    // Resolve the conflict
    const success = await ConflictResolver.resolveConflict(id, resolution as any, userId);

    if (success) {
      return NextResponse.json({
        message: "Conflict resolved successfully"
      });
    } else {
      return NextResponse.json(
        { error: "Failed to resolve conflict" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Resolve conflict error:", error);
    return NextResponse.json(
      { error: "Failed to resolve conflict" },
      { status: 500 }
    );
  }
}
