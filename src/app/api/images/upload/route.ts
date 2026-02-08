import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadImage, ImageType, UploadOptions, VALIDATION } from "@/lib/imagekit-service";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as ImageType;
    const entityId = formData.get('entityId') as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!type || !Object.values(ImageType).includes(type)) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
    }

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed"
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > VALIDATION.MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File size exceeds maximum allowed size of ${VALIDATION.MAX_FILE_SIZE / (1024 * 1024)}MB`
      }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prepare upload options
    const uploadOptions: UploadOptions = {
      type,
      entityId,
      maxSize: VALIDATION.MAX_FILE_SIZE,
      allowedFormats: [...VALIDATION.ALLOWED_FORMATS],
    };

    // For user profile images, ensure user can only upload their own
    if (type === ImageType.USER_PROFILE && entityId !== session.user.id) {
      return NextResponse.json({ error: "Cannot upload profile image for another user" }, { status: 403 });
    }

    // Upload image
    const imageRef = await uploadImage(buffer, file.name, uploadOptions);

    return NextResponse.json({
      success: true,
      image: imageRef,
      message: "Image uploaded successfully"
    });

  } catch (error: any) {
    console.error("Image upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload image" },
      { status: 500 }
    );
  }
}