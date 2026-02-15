import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { deleteManagedImage, getManagedImageByReferenceId } from "@/lib/storage/image-storage";

export const dynamic = 'force-dynamic';

// GET /api/images/[referenceId] - Get image details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ referenceId: string }> }
) {
  try {
    const { referenceId } = await params;

    const image = await getManagedImageByReferenceId(referenceId);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    return NextResponse.json({ image });

  } catch (error: any) {
    console.error("Get image error:", error);
    return NextResponse.json(
      { error: "Failed to get image" },
      { status: 500 }
    );
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

    // Get image details first to check ownership
    const image = await getManagedImageByReferenceId(referenceId);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Check if user owns this image (for user profiles and expenses)
    if (image.type === 'user_profile' && image.entityId !== auth.user.id) {
      return NextResponse.json({ error: "Cannot delete another user's profile image" }, { status: 403 });
    }

    // For expense images, check if user has permission (would need to check expense ownership)
    // This is a simplified check - in production, you'd verify expense ownership
    if (image.type === 'expense') {
      // TODO: Add expense ownership verification
    }

    const success = await deleteManagedImage(referenceId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Image deleted successfully"
      });
    } else {
      return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Delete image error:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
