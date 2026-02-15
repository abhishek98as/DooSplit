import { NextResponse } from "next/server";
import { getFirebaseAccountDetails } from "@/lib/firebase-account";

export async function GET() {
  try {
    const details = await getFirebaseAccountDetails();
    return NextResponse.json(details);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load Firebase account details" },
      { status: 500 }
    );
  }
}
