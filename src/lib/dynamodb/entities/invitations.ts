import {
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1, GSI2 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, toSortableTs } from "../keys";
import type { DdbInvitation, DdbTokenLookup } from "../types";
import { ttlFromDate, queryAll } from "../helpers";

// ── Put invitation + token lookup ──────────────────────────────────────────────

export async function putInvitation(
  inv: Omit<DdbInvitation, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK" | "ttl">
): Promise<void> {
  const ts = toSortableTs(inv.created_at);
  const item: DdbInvitation = {
    PK: PK.invite(inv.id),
    SK: SK.meta,
    entityType: "invitation",
    GSI1PK: GSI1PK.inviteOwner(inv.invited_by),
    GSI1SK: GSI1SK.invite(ts, inv.id),
    GSI2PK: GSI2PK.inviteEmail(inv.email_normalized),
    GSI2SK: GSI2SK.invite(inv.status, ts, inv.id),
    ttl: ttlFromDate(inv.expires_at),
    ...inv,
  };

  const tokenLookup: DdbTokenLookup = {
    PK: PK.token(inv.token),
    SK: SK.tokenInvite,
    entityType: "token_lookup",
    invite_id: inv.id,
    expires_at: inv.expires_at,
    ttl: ttlFromDate(inv.expires_at),
  };

  const { TransactWriteCommand } = await import("@aws-sdk/lib-dynamodb");
  await getDynamoDB().send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLE, Item: item } },
        { Put: { TableName: TABLE, Item: tokenLookup } },
      ],
    })
  );
}

// ── Get ───────────────────────────────────────────────────────────────────────

export async function getInvitationById(id: string): Promise<DdbInvitation | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.invite(id), SK: SK.meta } })
  );
  return (res.Item as DdbInvitation) ?? null;
}

export async function getInvitationByToken(token: string): Promise<DdbInvitation | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.token(token), SK: SK.tokenInvite } })
  );
  const lookup = res.Item as DdbTokenLookup | undefined;
  if (!lookup) return null;
  return getInvitationById(lookup.invite_id);
}

// ── List by owner ─────────────────────────────────────────────────────────────

export async function listInvitationsByOwner(invitedBy: string): Promise<DdbInvitation[]> {
  return queryAll<DdbInvitation>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI1PK.inviteOwner(invitedBy) },
    ScanIndexForward: false,
  });
}

// ── List by email ─────────────────────────────────────────────────────────────

export async function listInvitationsByEmail(email: string): Promise<DdbInvitation[]> {
  return queryAll<DdbInvitation>({
    TableName: TABLE,
    IndexName: GSI2,
    KeyConditionExpression: "GSI2PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI2PK.inviteEmail(email) },
    ScanIndexForward: false,
  });
}

// ── Update status ─────────────────────────────────────────────────────────────

export async function updateInvitationStatus(
  id: string,
  status: string,
  updatedAt: string,
  extras?: { accepted_by?: string; accepted_at?: string }
): Promise<void> {
  let updateExpr = "SET #st = :status, updated_at = :ua";
  const vals: Record<string, unknown> = { ":status": status, ":ua": updatedAt };
  if (extras?.accepted_by) {
    updateExpr += ", accepted_by = :ab";
    vals[":ab"] = extras.accepted_by;
  }
  if (extras?.accepted_at) {
    updateExpr += ", accepted_at = :aa";
    vals[":aa"] = extras.accepted_at;
  }
  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.invite(id), SK: SK.meta },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: vals,
    })
  );
}
