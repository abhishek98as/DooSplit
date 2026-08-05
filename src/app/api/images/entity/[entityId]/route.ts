import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { ImageType } from "@/lib/storage/image-types";
import { getManagedImagesForEntity } from "@/lib/storage/image-storage";
import { getExpenseById, getExpenseParticipant } from "@/lib/dynamodb/entities/expenses";
import { getGroupMember } from "@/lib/dynamodb/entities/groups";

export const dynamic = "force-dynamic";

async function canAccessExpenseImages(userId: string, expenseId: string): Promise<boolean> {
  const expense = await getExpenseById(expenseId);
  if (!expense || expense.is_deleted) return false;
  if (String(expense.created_by || "") === userId) return true;

  const participant = await getExpenseParticipant(expenseId, userId);
  if (participant) return true;

  const groupId = String(expense.group_id || "");
  if (groupId) {
    const membership = await getGroupMember(groupId, userId);
    if (membership) return true;
  }
  return false;
}

// GET /api/images/entity/[entityId]?type=user_profile|expense|general
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const { entityId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as ImageType;

    if (type && !Object.values(ImageType).includes(type)) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
    }

    if (type === ImageType.USER_PROFILE && entityId !== auth.user.id) {
      return NextResponse.json(
        { error: "Cannot access another user's profile images" },
        { status: 403 }
      );
    }

    if (type === ImageType.EXPENSE) {
      const allowed = await canAccessExpenseImages(auth.user.id, entityId);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if ((!type || type === ImageType.GENERAL) && entityId !== auth.user.id) {
      // general images are scoped to the uploader entityId
      if (type === ImageType.GENERAL) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const images = await getManagedImagesForEntity(entityId, type);

    return NextResponse.json({
      images,
      count: images.length,
    });
  } catch (error: unknown) {
    console.error("Get entity images error:", error);
    return NextResponse.json({ error: "Failed to get images" }, { status: 500 });
  }
}
