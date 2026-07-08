import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getMongoDb } from "@/lib/mongodb/client";
import { Note } from "@/lib/mongodb/models";
import { newAppId } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    await getMongoDb();

    const notes = await Note.find({ userId: auth.user.id }).sort({ updatedAt: -1 }).lean();
    
    // Normalize _id to id for client convenience
    const formattedNotes = notes.map((n: any) => ({
      ...n,
      id: n._id,
      _id: undefined,
      items: n.items?.map((i: any) => ({
        ...i,
        id: i.id || i._id,
      })) || [],
    }));

    return NextResponse.json({ notes: formattedNotes });
  } catch (error: any) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    await getMongoDb();

    const body = await request.json().catch(() => ({}));
    const { title, text, type, items, color, pinned, archived, trashed, reminder } = body;

    const noteId = newAppId();
    const note = await Note.create({
      _id: noteId,
      userId: auth.user.id,
      title: String(title || "").trim(),
      text: String(text || "").trim(),
      type: type === "text" ? "text" : "list",
      items: Array.isArray(items) ? items.map((i: any) => ({
        id: i.id || newAppId(),
        text: String(i.text || ""),
        done: Boolean(i.done),
        createdAt: i.createdAt ? new Date(i.createdAt) : new Date(),
        updatedAt: i.updatedAt ? new Date(i.updatedAt) : new Date(),
      })) : [],
      color: String(color || ""),
      pinned: Boolean(pinned),
      archived: Boolean(archived),
      trashed: Boolean(trashed),
      reminder: reminder ? new Date(reminder) : null,
    });

    const formattedNote = {
      ...note.toObject(),
      id: note._id,
      _id: undefined,
    };

    return NextResponse.json({ note: formattedNote }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
