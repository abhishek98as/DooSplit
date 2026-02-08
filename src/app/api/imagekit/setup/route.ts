import { NextResponse } from "next/server";
import { initializeFolders, getImageStats } from "@/lib/imagekit-service";

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('🚀 Starting ImageKit setup...');

    // Initialize folders
    await initializeFolders();

    // Get stats to verify setup
    const stats = await getImageStats();

    return NextResponse.json({
      success: true,
      message: 'ImageKit setup completed successfully',
      stats: stats,
    });

  } catch (error: any) {
    console.error('❌ ImageKit setup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to setup ImageKit',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get current stats
    const stats = await getImageStats();

    return NextResponse.json({
      success: true,
      stats: stats,
    });

  } catch (error: any) {
    console.error('❌ Error getting ImageKit stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get stats',
      },
      { status: 500 }
    );
  }
}