import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE } from "../tables";
import { PK, SK } from "../keys";
import type { DdbNoteShare, NotePermissions, NoteShareStatus } from "../types";
import { chunk, queryAll } from "../helpers";

export const DEFAULT_SHARE_PERMISSIONS: NotePermissions = {
  canCreate: true,
  canRead: true,
  canUpdate: false,
  canDelete: false,
};

export const FULL_NOTE_PERMISSIONS: NotePermissions = {
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
};

function shareItem(params: {
  id: string;
  noteId: string;
  ownerId: string;
  userId: string;
  status: NoteShareStatus;
  permissions: NotePermissions;
  invitedByName?: string;
  noteTitle?: string;
  created_at: string;
  updated_at: string;
}): { canonical: DdbNoteShare; mirror: DdbNoteShare } {
  const base = {
    entityType: "note_share" as const,
    id: params.id,
    noteId: params.noteId,
    ownerId: params.ownerId,
    userId: params.userId,
    status: params.status,
    permissions: params.permissions,
    invitedByName: params.invitedByName,
    noteTitle: params.noteTitle,
    created_at: params.created_at,
    updated_at: params.updated_at,
  };
  return {
    canonical: {
      ...base,
      PK: PK.note(params.noteId),
      SK: SK.noteShare(params.userId),
    },
    mirror: {
      ...base,
      PK: PK.user(params.userId),
      SK: SK.noteAccess(params.noteId),
    },
  };
}

export async function getNoteShare(
  noteId: string,
  userId: string
): Promise<DdbNoteShare | null> {
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: PK.note(noteId), SK: SK.noteShare(userId) },
    })
  );
  return (res.Item as DdbNoteShare) ?? null;
}

export async function getNoteAccessForUser(
  userId: string,
  noteId: string
): Promise<DdbNoteShare | null> {
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: SK.noteAccess(noteId) },
    })
  );
  return (res.Item as DdbNoteShare) ?? null;
}

export async function listSharesForNote(noteId: string): Promise<DdbNoteShare[]> {
  return queryAll<DdbNoteShare>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": PK.note(noteId),
      ":skPrefix": "SHARE#",
    },
  });
}

export async function listNoteAccessForUser(userId: string): Promise<DdbNoteShare[]> {
  return queryAll<DdbNoteShare>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": PK.user(userId),
      ":skPrefix": "NOTE_ACCESS#",
    },
  });
}

export async function putNoteShare(params: {
  id: string;
  noteId: string;
  ownerId: string;
  userId: string;
  status: NoteShareStatus;
  permissions: NotePermissions;
  invitedByName?: string;
  noteTitle?: string;
  created_at: string;
  updated_at: string;
}): Promise<DdbNoteShare> {
  const { canonical, mirror } = shareItem(params);
  const client = getDynamoDB();
  await Promise.all([
    client.send(new PutCommand({ TableName: TABLE, Item: canonical })),
    client.send(new PutCommand({ TableName: TABLE, Item: mirror })),
  ]);
  return canonical;
}

export async function deleteNoteShare(noteId: string, userId: string): Promise<void> {
  const client = getDynamoDB();
  await Promise.all([
    client.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: PK.note(noteId), SK: SK.noteShare(userId) },
      })
    ),
    client.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { PK: PK.user(userId), SK: SK.noteAccess(noteId) },
      })
    ),
  ]);
}

/** Remove all share rows for a note (canonical + collaborator mirrors). */
export async function deleteAllSharesForNote(noteId: string): Promise<void> {
  const shares = await listSharesForNote(noteId);
  if (shares.length === 0) return;

  const deletes = shares.flatMap((s) => [
    { DeleteRequest: { Key: { PK: PK.note(noteId), SK: SK.noteShare(s.userId) } } },
    { DeleteRequest: { Key: { PK: PK.user(s.userId), SK: SK.noteAccess(noteId) } } },
  ]);

  const client = getDynamoDB();
  for (const batch of chunk(deletes, 25)) {
    await client.send(
      new BatchWriteCommand({
        RequestItems: { [TABLE]: batch },
      })
    );
  }
}
