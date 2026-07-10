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

    const { note, action, customPrompt } = await request.json();
    if (!note || !action) {
      return NextResponse.json(
        { error: "Missing required fields: 'note' and 'action'." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let systemInstructions = "";
    if (action === "summarize") {
      systemInstructions = "Summarize this note content. Keep it concise, professional, and clear.";
    } else if (action === "checklist") {
      systemInstructions = "Convert this note content into a clean checklist/to-do list of actionable items.";
    } else if (action === "grammar") {
      systemInstructions = "Fix any spelling, punctuation, and grammatical mistakes in the note content. Keep the layout clean and polished.";
    } else if (action === "custom") {
      systemInstructions = `Modify the note content according to these instructions: "${customPrompt || "Improve the writing"}"`;
    }

    const promptText = `
      You are an expert AI assistant inside a notes keeping app.
      Your task is to take the user's note details and apply the following instructions: "${systemInstructions}".

      Current Note Title: "${note.title || ""}"
      Current Note Type: "${note.type || "text"}"
      Current Note Text: "${note.text || ""}"
      Current Note Checklist Items: ${JSON.stringify(note.items || [])}

      You must return the revised note as a JSON object matching this schema:
      {
        "title": "A short, fitting title for the note (revision is optional)",
        "type": "either 'text' or 'list'",
        "text": "The revised note text (only if type is 'text')",
        "items": [
          { "id": "keep existing id if updating or generate random string", "text": "checklist item text", "done": false }
        ]
      }

      Return ONLY valid, clean JSON. Do not include markdown codeblocks, triple backticks, or extra text.
    `;

    const result = await model.generateContent(promptText);
    const responseText = result.response.text().trim();

    const jsonString = responseText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const parsedData = JSON.parse(jsonString);

    return NextResponse.json({ data: parsedData });
  } catch (error: any) {
    console.error("[ai/notes] Error helper notes:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process note with AI." },
      { status: 500 }
    );
  }
}
