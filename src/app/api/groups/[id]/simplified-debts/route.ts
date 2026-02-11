import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import { getGroupSimplifiedDebts } from "@/lib/balanceCalculator";
import GroupMember from "@/models/GroupMember";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";
import {
  CACHE_TTL,
  buildUserScopedCacheKey,
  getOrSetCacheJson,
} from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET /api/groups/[id]/simplified-debts - Get simplified debts for a group
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      groupId: id,
      userId,
    }).lean();

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 403 }
      );
    }

    const cacheKey = buildUserScopedCacheKey(
      "groups",
      session.user.id,
      `debts:${id}`
    );

    const payload = await getOrSetCacheJson(cacheKey, CACHE_TTL.friends, async () => {
      const simplifiedDebts = await getGroupSimplifiedDebts(id);
      return {
        ...simplifiedDebts,
        message:
          simplifiedDebts.savings > 0
            ? `Optimized ${simplifiedDebts.originalCount} transactions to ${simplifiedDebts.optimizedCount}, saving ${simplifiedDebts.savings} transaction${simplifiedDebts.savings !== 1 ? "s" : ""}!`
            : "Already optimized!",
      };
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    console.error("Get simplified debts error:", error);
    return NextResponse.json(
      { error: "Failed to calculate simplified debts" },
      { status: 500 }
    );
  }
}
