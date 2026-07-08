import "server-only";
import { User, Group } from "./models";

/**
 * Fetch multiple users by their string _id values.
 * Replaces Firestore chunked `where("id", "in", [...])` with Mongoose `$in`.
 */
export async function getUsersByIds(userIds: string[]): Promise<Map<string, any>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const users = await User.find({ _id: { $in: unique } }).lean();
  const map = new Map<string, any>();
  for (const u of users) {
    map.set(u._id, u);
  }
  return map;
}

/**
 * Fetch multiple groups by their string _id values.
 */
export async function getGroupsByIds(groupIds: string[]): Promise<Map<string, any>> {
  const unique = [...new Set(groupIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const groups = await Group.find({ _id: { $in: unique } }).lean();
  const map = new Map<string, any>();
  for (const g of groups) {
    map.set(g._id, g);
  }
  return map;
}

/**
 * Map a MongoDB user document → the shape expected by API response formatters.
 */
export function mapUser(row: any) {
  if (!row) return null;
  return {
    _id: row._id,
    name: row.name,
    email: row.email,
    profilePicture: row.profile_picture || null,
    isDummy: row.is_dummy || false,
  };
}

/**
 * Map a MongoDB group document → the shape expected by API response formatters.
 */
export function mapGroup(row: any) {
  if (!row) return null;
  return {
    _id: row._id,
    name: row.name,
    image: row.image || null,
  };
}
