import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

    const { image, mimeType } = await request.json();
    if (!image || !mimeType) {
      return NextResponse.json(
        { error: "Missing required fields: 'image' (base64) and 'mimeType'." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const promptText = `
      You are an expert OCR receipt scanner.
      Analyze the attached receipt image or PDF and extract the following details in a JSON format matching this schema:
      {
        "title": "Merchant/Store name or description of purchase",
        "amount": total cost as a number,
        "category": "The best matching category from: food, entertainment, travel, utilities, shopping, services, housing, other",
        "date": "YYYY-MM-DD format (if found, otherwise today's date)",
        "items": [
          { "name": "Item description", "amount": item price as a number }
        ]
      }
      Return ONLY valid, clean JSON. Do not include markdown codeblocks, triple backticks, or any leading/trailing explanations.
    `;

    const cleanBase64 = image.replace(/^data:.*?;base64,/, "");

    const filePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([promptText, filePart]);
    const responseText = result.response.text().trim();

    // Sometimes Gemini wraps JSON in codeblocks, strip them if present
    const jsonString = responseText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const parsedData = JSON.parse(jsonString);

    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("[ai/scan] Error processing receipt:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process receipt with AI." },
      { status: 500 }
    );
  }
}
