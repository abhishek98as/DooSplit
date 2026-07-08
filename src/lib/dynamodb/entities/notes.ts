import {
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK } from "../keys";
import type { DdbNote } from "../types";
import { queryAll } from "../helpers";

// ── List ──────────────────────────────────────────────────────────────────────

export async function listNotesForUser(userId: string): Promise<DdbNote[]> {
  return queryAll<DdbNote>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": PK.user(userId),
      ":skPrefix": "NOTE#",
    },
  });
}

// ── Get ───────────────────────────────────────────────────────────────────────

export async function getNoteById(userId: string, noteId: string): Promise<DdbNote | null> {
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: {
        PK: PK.user(userId),
        SK: `NOTE#${noteId}`,
      },
    })
  );
  return (res.Item as DdbNote) ?? null;
}

// ── Put ───────────────────────────────────────────────────────────────────────

export async function putNote(note: Omit<DdbNote, "PK" | "SK" | "entityType"> & { id: string; userId: string }): Promise<void> {
  const item: DdbNote = {
    PK: PK.user(note.userId),
    SK: `NOTE#${note.id}`,
    entityType: "note",
    ...note,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({
      TableName: TABLE,
      Key: {
        PK: PK.user(userId),
        SK: `NOTE#${noteId}`,
      },
    })
  );
}
