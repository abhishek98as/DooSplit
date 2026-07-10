import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const { description } = await request.json();
    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: "Missing required field: 'description'." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const promptText = `
      Predict the single best matching expense category for this description: "${description}"
      Choose from: food, entertainment, travel, utilities, shopping, services, housing, other
      Return ONLY the category name in lowercase. Do not include punctuation, spaces, or any other characters.
    `;

    const result = await model.generateContent(promptText);
    const category = result.response.text().trim().toLowerCase();

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error("[ai/suggest] Error suggesting category:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to suggest category with AI." },
      { status: 500 }
    );
  }
}
