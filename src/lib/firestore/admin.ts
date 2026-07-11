// DynamoDB-only — Firebase Auth + smart Firestore→DynamoDB proxy
export { getFirebaseAuth as getAdminAuth } from "@/lib/firebase-admin";

// ── DynamoDB-backed Firestore compatibility proxy ──────────────────────────
// Maps common Firestore patterns to DynamoDB so existing API routes work.

function createDdbDoc(data: any, id: string) {
  return {
    id,
    exists: data !== null && data !== undefined,
    data: () => ({ id, ...(data || {}) }),
    ref: { id },
  };
}

function createDdbQueryResult(docs: Array<{ id: string; data: () => any }>) {
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (fn: (d: any) => void) => docs.forEach(fn),
  };
}

async function handleUsersCollection(op: string, id?: string, _filters?: any[]) {
  const { getUserById, getUserByEmail, getUsersByIds } = await import("@/lib/dynamodb/entities/users");
  if (op === "doc" && id) {
    const user = await getUserById(id);
    return createDdbDoc(user, id);
  }
  if (op === "where") {
    // user lookup by email
    if (_filters?.some((f: any) => f.field === "email_normalized" || f.field === "email")) {
      const emailFilter = _filters?.find((f: any) => f.field === "email_normalized" || f.field === "email");
      if (emailFilter) {
        const user = await getUserByEmail(emailFilter.value);
        return user ? createDdbQueryResult([createDdbDoc(user, user.id)]) : createDdbQueryResult([]);
      }
    }
  }
  return createDdbQueryResult([]);
}

async function handleNotificationsCollection(op: string, _filters?: any[]) {
  const { queryNotificationsForUser, countUnreadNotifications } = await import("@/lib/dynamodb/entities/notifications");
  const userId = _filters?.find((f: any) => f.field === "user_id")?.value;
  if (userId) {
    const unreadOnly = _filters?.some((f: any) => f.field === "is_read" && f.value === false);
    const { items } = await queryNotificationsForUser(userId, 50, undefined, unreadOnly);
    return createDdbQueryResult(items.map((n: any) => createDdbDoc({
      user_id: n.user_id, type: n.type, message: n.message,
      title: n.title, is_read: n.is_read, related_id: n.related_id,
      created_at: n.created_at, updated_at: n.updated_at,
    }, n.id)));
  }
  // For mark-all-read batch
  if (op === "batch") return null;
  return createDdbQueryResult([]);
}

async function handleFriendshipsCollection(op: string, _filters?: any[]) {
  const { listFriendshipsForUser } = await import("@/lib/dynamodb/entities/friendships");
  const userId = _filters?.find((f: any) => f.field === "user_id")?.value;
  if (userId) {
    const friends = await listFriendshipsForUser(userId);
    return createDdbQueryResult(friends.map((f: any) => createDdbDoc({
      user_id: f.user_id, friend_id: f.friend_id, status: f.status,
      requested_by: f.requested_by, created_at: f.created_at,
    }, f.id)));
  }
  return createDdbQueryResult([]);
}

async function handleGroupsCollection(op: string, _filters?: any[], id?: string) {
  const { getGroupById, listGroupsForUser } = await import("@/lib/dynamodb/entities/groups");
  if (op === "doc" && id) {
    const group = await getGroupById(id);
    return createDdbDoc(group, id);
  }
  if (op === "where" && _filters) {
    const createdBy = _filters.find((f: any) => f.field === "created_by")?.value;
    if (createdBy) {
      const groups = await listGroupsForUser(createdBy);
      return createDdbQueryResult(groups.map((g: any) => createDdbDoc({
        name: g.name, created_by: g.created_by, currency: g.currency,
        is_active: g.is_active, member_count: g.member_count, created_at: g.created_at,
      }, g.id)));
    }
  }
  return createDdbQueryResult([]);
}

async function handleGroupMembersCollection(_filters?: any[]) {
  const { listGroupMembers } = await import("@/lib/dynamodb/entities/groups");
  const groupId = _filters?.find((f: any) => f.field === "group_id")?.value;
  if (groupId) {
    const members = await listGroupMembers(groupId);
    return createDdbQueryResult(members.map((m: any) => createDdbDoc({
      group_id: m.group_id, user_id: m.user_id, role: m.role, status: m.status,
    }, m.user_id)));
  }
  return createDdbQueryResult([]);
}

async function handleExpensesCollection(_filters?: any[]) {
  const { queryUserExpenseFeed } = await import("@/lib/dynamodb/entities/expenses");
  const userId = _filters?.find((f: any) => f.field === "created_by")?.value;
  if (userId) {
    const expenses = await queryUserExpenseFeed(userId);
    return createDdbQueryResult(expenses.map((e: any) => createDdbDoc({
      description: e.description, amount: e.amount, currency: e.currency,
      category: e.category, date: e.date, created_by: e.created_by,
      group_id: e.group_id, split_type: e.split_type, is_settled: e.is_settled,
      created_at: e.created_at, updated_at: e.updated_at,
    }, e.expense_id || e.id)));
  }
  return createDdbQueryResult([]);
}

async function handleInvitationsCollection(op: string, _filters?: any[], id?: string) {
  const { getInvitationById, listInvitationsByOwner, getInvitationByToken } = await import("@/lib/dynamodb/entities/invitations");
  if (op === "doc" && id) {
    const inv = await getInvitationById(id);
    return createDdbDoc(inv, id);
  }
  if (op === "where" && _filters) {
    const tokenFilter = _filters.find((f: any) => f.field === "token");
    if (tokenFilter) {
      const inv = await getInvitationByToken(tokenFilter.value);
      return inv ? createDdbQueryResult([createDdbDoc(inv, inv.id)]) : createDdbQueryResult([]);
    }
    const ownerFilter = _filters.find((f: any) => f.field === "invited_by");
    if (ownerFilter) {
      const invs = await listInvitationsByOwner(ownerFilter.value);
      return createDdbQueryResult(invs.map((inv: any) => createDdbDoc(inv, inv.id)));
    }
  }
  return createDdbQueryResult([]);
}

async function handleActivitiesCollection(_filters?: any[]) {
  const { queryActivitiesForUser } = await import("@/lib/dynamodb/entities/activities");
  const userId = _filters?.find((f: any) => f.field === "userId")?.value;
  if (userId) {
    const activities = await queryActivitiesForUser(userId, 50);
    return createDdbQueryResult(activities.map((a: any) => createDdbDoc({
      userId: a.userId, type: a.type, description: a.description,
      relatedId: a.relatedId, actorId: a.actorId, actorName: a.actorName,
      createdAt: a.createdAt, metadata: a.metadata,
    }, a.id)));
  }
  return createDdbQueryResult([]);
}

async function handleSettlementsCollection(_filters?: any[]) {
  const { listSettlementsForUser } = await import("@/lib/dynamodb/entities/settlements");
  const fromUser = _filters?.find((f: any) => f.field === "from_user_id")?.value;
  const toUser = _filters?.find((f: any) => f.field === "to_user_id")?.value;
  const userId = fromUser || toUser;
  if (userId) {
    const settlements = await listSettlementsForUser(userId);
    return createDdbQueryResult(settlements.map((s: any) => createDdbDoc({
      from_user_id: s.from_user_id, to_user_id: s.to_user_id,
      amount: s.amount, currency: s.currency, group_id: s.group_id,
      date: s.date, notes: s.notes, created_at: s.created_at,
    }, s.id)));
  }
  return createDdbQueryResult([]);
}

// ── Main proxy ──────────────────────────────────────────────────────────────

type FilterClause = { field: string; op: string; value: any };

function makeQueryHandler(collectionName: string, filters: FilterClause[]) {
  const handler: ProxyHandler<any> = {
    get(_t, prop: string) {
      if (prop === "where") {
        return (field: string, op: string, value: any) =>
          makeQueryHandler(collectionName, [...filters, { field, op, value }]);
      }
      if (prop === "orderBy") return () => makeQueryHandler(collectionName, filters);
      if (prop === "limit") return () => makeQueryHandler(collectionName, filters);
      if (prop === "get") {
        return async () => {
          switch (collectionName) {
            case "users": return handleUsersCollection("where", undefined, filters);
            case "notifications": return handleNotificationsCollection("where", filters);
            case "friendships": return handleFriendshipsCollection("where", filters);
            case "groups": return handleGroupsCollection("where", filters);
            case "group_members": return handleGroupMembersCollection(filters);
            case "expenses": return handleExpensesCollection(filters);
            case "expense_participants": return handleExpensesCollection(filters);
            case "invitations": return handleInvitationsCollection("where", filters);
            case "activity_logs": return handleActivitiesCollection(filters);
            case "settlements": return handleSettlementsCollection(filters);
            default: return createDdbQueryResult([]);
          }
        };
      }
      return undefined;
    }
  };
  return new Proxy({ _name: collectionName, _filters: filters }, handler);
}

export function getAdminDb(): any {
  const handler: ProxyHandler<any> = {
    get(_target, prop: string) {
      if (prop === "collection") {
        return (name: string) => ({
          doc: (id: string) => ({
            get: async () => {
              switch (name) {
                case "users": return handleUsersCollection("doc", id);
                case "groups": return handleGroupsCollection("doc", undefined, id);
                case "invitations": return handleInvitationsCollection("doc", undefined, id);
                default: return createDdbDoc(null, id);
              }
            },
            set: async (data: any, _opts?: any) => {
              try {
                const now = new Date().toISOString();
                switch (name) {
                  case "expenses": {
                    const { putExpenseMeta } = await import("@/lib/dynamodb/entities/expenses");
                    await putExpenseMeta({ id, ...data, updated_at: now });
                    return;
                  }
                  case "expense_participants": {
                    const { putExpenseParticipant } = await import("@/lib/dynamodb/entities/expenses");
                    await putExpenseParticipant({ id, ...data });
                    return;
                  }
                  case "users": {
                    const { putUser } = await import("@/lib/dynamodb/entities/users");
                    await putUser({ id, ...data, updated_at: now });
                    return;
                  }
                  case "groups": {
                    const { putGroup } = await import("@/lib/dynamodb/entities/groups");
                    await putGroup({ id, ...data, updated_at: now });
                    return;
                  }
                  case "group_members": {
                    const { putGroupMember } = await import("@/lib/dynamodb/entities/groups");
                    await putGroupMember({ id, ...data });
                    return;
                  }
                  case "invitations": {
                    const { putInvitation } = await import("@/lib/dynamodb/entities/invitations");
                    await putInvitation({ id, ...data, updated_at: now });
                    return;
                  }
                  case "settlements": {
                    const { putSettlement } = await import("@/lib/dynamodb/entities/settlements");
                    await putSettlement({ id, ...data, updated_at: now });
                    return;
                  }
                  case "friendships": {
                    const { putFriendship } = await import("@/lib/dynamodb/entities/friendships");
                    await putFriendship({ id, ...data });
                    return;
                  }
                }
              } catch (e) { console.error(`[proxy] set ${name}/${id}:`, e); }
            },
            update: async (data: any) => {
              try {
                const now = new Date().toISOString();
                switch (name) {
                  case "expenses": {
                    const { putExpenseMeta, getExpenseById } = await import("@/lib/dynamodb/entities/expenses");
                    const existing = await getExpenseById(id);
                    if (existing) await putExpenseMeta({ ...existing, ...data, updated_at: now });
                    return;
                  }
                  case "invitations": {
                    const { putInvitation, getInvitationById } = await import("@/lib/dynamodb/entities/invitations");
                    const existing = await getInvitationById(id);
                    if (existing) await putInvitation({ ...existing, ...data, updated_at: now });
                    return;
                  }
                  case "users": {
                    const { putUser, getUserById } = await import("@/lib/dynamodb/entities/users");
                    const existing = await getUserById(id);
                    if (existing) await putUser({ ...existing, ...data, updated_at: now });
                    return;
                  }
                }
              } catch (e) { console.error(`[proxy] update ${name}/${id}:`, e); }
            },
            delete: async () => {
              try {
                const now = new Date().toISOString();
                switch (name) {
                  case "expenses": {
                    const { updateExpense } = await import("@/lib/dynamodb/entities/expenses");
                    await updateExpense(id, { is_deleted: true, updated_at: now });
                    return;
                  }
                  case "invitations": {
                    const { updateInvitationStatus } = await import("@/lib/dynamodb/entities/invitations");
                    await updateInvitationStatus(id, "cancelled");
                    return;
                  }
                  case "friendships": {
                    const { putFriendship } = await import("@/lib/dynamodb/entities/friendships");
                    await putFriendship({ id, status: "removed", updated_at: now } as any);
                    return;
                  }
                }
              } catch (e) { console.error(`[proxy] delete ${name}/${id}:`, e); }
            },
            ref: { id, path: `${name}/${id}` },
          }),
          where: (field: string, op: string, value: any) =>
            makeQueryHandler(name, [{ field, op, value }]),
          orderBy: () => makeQueryHandler(name, []),
          limit: () => makeQueryHandler(name, []),
          get: async () => createDdbQueryResult([]),
        });
      }
      if (prop === "batch") {
        return () => ({
          set: (..._args: any[]) => ({} as any),
          commit: async () => {},
          delete: (..._args: any[]) => ({} as any),
          update: (..._args: any[]) => ({} as any),
        });
      }
      return undefined;
    }
  };
  return new Proxy({}, handler);
}

export function getAdminStorage(): never {
  throw new Error("Firebase Storage has been removed.");
}

export const FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  delete: () => null,
  arrayUnion: (..._args: any[]) => [],
  arrayRemove: (..._args: any[]) => [],
  increment: (_n: number) => 0,
} as any;

export const Timestamp = {
  now: () => new Date(),
  fromDate: (d: Date) => d,
};
