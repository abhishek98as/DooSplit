import crypto from "crypto";

function hashValue(input: string, length = 24): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, length);
}

export function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function normalizeName(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function friendshipDocId(userId: string, friendId: string): string {
  return `fr_${hashValue(`${String(userId)}:${String(friendId)}`)}`;
}

export function friendshipPairKey(leftId: string, rightId: string): string {
  const [a, b] = [String(leftId || ""), String(rightId || "")].sort();
  return `${a}:${b}`;
}

export function groupMemberDocId(groupId: string, userId: string): string {
  return `gm_${hashValue(`${String(groupId)}:${String(userId)}`)}`;
}

export function invitationDocId(invitedBy: string, emailNormalized: string): string {
  return `inv_${hashValue(`${String(invitedBy)}:${normalizeEmail(emailNormalized)}`)}`;
}

