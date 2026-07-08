import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId } from "@/lib/ids";
import { listNotesForUser, putNote } from "@/lib/dynamodb/entities/notes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const ddbNotes = await listNotesForUser(auth.user.id);
    const notes = ddbNotes.map((n) => ({
      ...n,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      items: n.items?.map((i) => ({ ...i, id: i.id })) || [],
    }));
    notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return NextResponse.json({ notes });
  } catch (error: any) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) return auth.response as NextResponse;

    const body = await request.json().catch(() => ({}));
    const { title, text, type, items, color, pinned, archived, trashed, reminder } = body;
    const noteId = newAppId();
    const now = new Date().toISOString();

    const newNote = {
      id: noteId, userId: auth.user.id,
      title: String(title || "").trim(),
      text: String(text || "").trim(),
      type: (type === "text" ? "text" : "list") as "text" | "list",
      items: Array.isArray(items) ? items.map((i: any) => ({
        id: i.id || newAppId(), text: String(i.text || ""), done: Boolean(i.done),
        createdAt: i.createdAt || now, updatedAt: i.updatedAt || now,
      })) : [],
      color: String(color || ""), pinned: Boolean(pinned),
      archived: Boolean(archived), trashed: Boolean(trashed),
      reminder: reminder || null, created_at: now, updated_at: now,
    };

    await putNote(newNote);
    return NextResponse.json({ note: newNote }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
