import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { deleteManagedImage, getManagedImageByReferenceId } from "@/lib/storage/image-storage";
import { ImageType } from "@/lib/storage/image-types";
import { getExpenseById, getExpenseParticipant } from "@/lib/dynamodb/entities/expenses";
import { getGroupMember } from "@/lib/dynamodb/entities/groups";

export const dynamic = "force-dynamic";

type ManagedImageLike = {
  type: string;
  entityId: string;
};

function normalizeImageType(type: string): string {
  const t = String(type || "").toLowerCase();
  if (t === "expense_receipt") return ImageType.EXPENSE;
  return t;
}

/**
 * Who may view/delete an image:
 * - user_profile: any authenticated user may view; only owner may delete
 * - expense / expense_receipt: creator, participant, or group member
 * - general: only the entityId user (uploader convention)
 */
async function canAccessImage(
  userId: string,
  image: ManagedImageLike,
  action: "read" | "write"
): Promise<boolean> {
  const type = normalizeImageType(image.type);
  const entityId = String(image.entityId || "");

  if (type === ImageType.USER_PROFILE) {
    if (action === "write") return entityId === userId;
    return true; // authenticated viewers may load avatars
  }

  if (type === ImageType.EXPENSE) {
    if (!entityId) return false;
    const expense = await getExpenseById(entityId);
    if (!expense || expense.is_deleted) return false;
    if (String(expense.created_by || "") === userId) return true;

    const participant = await getExpenseParticipant(entityId, userId);
    if (participant) return true;

    const groupId = String(expense.group_id || "");
    if (groupId) {
      const membership = await getGroupMember(groupId, userId);
      if (membership) return true;
    }
    return false;
  }

  // general / unknown — entityId must be the requesting user
  return entityId === userId;
}

// GET /api/images/[referenceId] - Get image details (auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ referenceId: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const { referenceId } = await params;
    const image = await getManagedImageByReferenceId(referenceId);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const allowed = await canAccessImage(auth.user.id, image, "read");
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ image });
  } catch (error: unknown) {
    console.error("Get image error:", error);
    return NextResponse.json({ error: "Failed to get image" }, { status: 500 });
  }
}

// DELETE /api/images/[referenceId] - Delete image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ referenceId: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const { referenceId } = await params;
    const image = await getManagedImageByReferenceId(referenceId);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const allowed = await canAccessImage(auth.user.id, image, "write");
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const success = await deleteManagedImage(referenceId);
    if (success) {
      return NextResponse.json({
        success: true,
        message: "Image deleted successfully",
      });
    }

    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  } catch (error: unknown) {
    console.error("Delete image error:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
