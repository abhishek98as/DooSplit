import { getAdminDb } from "./admin";
import { COLLECTIONS } from "./collections";
import { chunkedInQuery, snapshotToRow, toIsoDate } from "./query";
import { newAppId } from "@/lib/ids";

export async function getUsersByIds(userIds: string[]) {
  const db = getAdminDb();
  const users = await chunkedInQuery(userIds, async (chunk) => {
    const snapshot = await db
      .collection(COLLECTIONS.users)
      .where("id", "in", chunk)
      .get();
    return snapshot.docs.map(snapshotToRow);
  });
  return new Map(users.map((u: any) => [u.id, u]));
}

export async function getGroupsByIds(groupIds: string[]) {
  const db = getAdminDb();
  const groups = await chunkedInQuery(groupIds, async (chunk) => {
    const snapshot = await db
      .collection(COLLECTIONS.groups)
      .where("id", "in", chunk)
      .get();
    return snapshot.docs.map(snapshotToRow);
  });
  return new Map(groups.map((g: any) => [g.id, g]));
}

export function mapFirestoreUser(row: any) {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    email: row.email,
    profilePicture: row.profile_picture || null,
    isDummy: row.is_dummy || false,
  };
}

export function mapFirestoreGroup(row: any) {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    image: row.image || null,
  };
}

export { newAppId };