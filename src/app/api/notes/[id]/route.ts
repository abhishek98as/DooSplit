import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getMongoDb } from "@/lib/mongodb/client";
import { Note } from "@/lib/mongodb/models";
import { newAppId } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    await getMongoDb();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { title, text, type, items, color, pinned, archived, trashed, reminder } = body;

    const note = await Note.findOneAndUpdate(
      { _id: id, userId: auth.user.id },
      {
        $set: {
          title: title !== undefined ? String(title).trim() : undefined,
          text: text !== undefined ? String(text).trim() : undefined,
          type: type !== undefined ? (type === "text" ? "text" : "list") : undefined,
          items: Array.isArray(items) ? items.map((i: any) => ({
            id: i.id || newAppId(),
            text: String(i.text || ""),
            done: Boolean(i.done),
            createdAt: i.createdAt ? new Date(i.createdAt) : new Date(),
            updatedAt: i.updatedAt ? new Date(i.updatedAt) : new Date(),
          })) : undefined,
          color: color !== undefined ? String(color) : undefined,
          pinned: pinned !== undefined ? Boolean(pinned) : undefined,
          archived: archived !== undefined ? Boolean(archived) : undefined,
          trashed: trashed !== undefined ? Boolean(trashed) : undefined,
          reminder: reminder !== undefined ? (reminder ? new Date(reminder) : null) : undefined,
        },
      },
      { new: true }
    );

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const formattedNote = {
      ...note.toObject(),
      id: note._id,
      _id: undefined,
    };

    return NextResponse.json({ note: formattedNote });
  } catch (error: any) {
    console.error("Failed to update note:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    await getMongoDb();

    const { id } = await params;
    const note = await Note.findOneAndDelete({ _id: id, userId: auth.user.id });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
