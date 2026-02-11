import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ImageType } from "@/lib/imagekit-service";
import { getManagedImagesForEntity } from "@/lib/storage/image-storage";

export const dynamic = 'force-dynamic';

// GET /api/images/entity/[entityId]?type=user_profile|expense|general
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { entityId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ImageType;

    // Validate type if provided
    if (type && !Object.values(ImageType).includes(type)) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
    }

    // For privacy, users can only see their own profile images
    if (type === ImageType.USER_PROFILE && entityId !== session.user.id) {
      return NextResponse.json({ error: "Cannot access another user's profile images" }, { status: 403 });
    }

    // For expense images, you might want to check if the user has access to that expense
    // This would require checking expense membership/ownership in your database

    const images = await getManagedImagesForEntity(entityId, type);

    return NextResponse.json({
      images,
      count: images.length
    });

  } catch (error: any) {
    console.error("Get entity images error:", error);
    return NextResponse.json(
      { error: "Failed to get images" },
      { status: 500 }
    );
  }
}
