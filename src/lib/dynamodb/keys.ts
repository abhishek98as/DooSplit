/**
 * DynamoDB key builders for DooSplit single-table design.
 *
 * Partition Key (PK) + Sort Key (SK) uniquely identify every item.
 * GSI1 / GSI2 provide secondary access patterns.
 *
 * Dates/timestamps in sort keys use ISO-8601 so lexicographic order
 * equals chronological order; pair with ScanIndexForward: false for
 * newest-first results.
 */

// ── Partition Key builders ────────────────────────────────────────────────────

export const PK = {
  user:       (id: string) => `USER#${id}`,
  group:      (id: string) => `GROUP#${id}`,
  expense:    (id: string) => `EXPENSE#${id}`,
  settlement: (id: string) => `SETTLEMENT#${id}`,
  reminder:   (id: string) => `REMINDER#${id}`,
  invite:     (id: string) => `INVITE#${id}`,
  token:      (token: string) => `TOKEN#${token}`,
  recurring:  (id: string) => `RECURRING#${id}`,
  feedback:   (id: string) => `FEEDBACK#${id}`,
} as const;

// ── Sort Key builders ─────────────────────────────────────────────────────────

export const SK = {
  profile:         "PROFILE",
  meta:            "META",
  tokenInvite:     "INVITE",

  friend:          (friendId: string) => `FRIEND#${friendId}`,
  member:          (userId: string)   => `MEMBER#${userId}`,
  part:            (userId: string)   => `PART#${userId}`,
  comment:         (ts: string, id: string)  => `COMMENT#${ts}#${id}`,
  alloc:           (expenseId: string)       => `ALLOC#${expenseId}`,
  run:             (runDate: string, id: string) => `RUN#${runDate}#${id}`,
  nudge:           (nudgeId: string) => `NUDGE#${nudgeId}`,

  /** User-scoped feed items — sorted newest-first when queried with ScanIndexForward=false */
  expense:         (date: string, id: string)     => `EXPENSE#${date}#${id}`,
  settlement:      (date: string, id: string)     => `SETTLEMENT#${date}#${id}`,
  notification:    (ts: string, id: string)       => `NOTIF#${ts}#${id}`,
  activity:        (ts: string, id: string)       => `ACTIVITY#${ts}#${id}`,
} as const;

// ── GSI1 Partition Key builders ───────────────────────────────────────────────

export const GSI1PK = {
  email:          (email: string)    => `EMAIL#${email.toLowerCase()}`,
  member:         (userId: string)   => `MEMBER#${userId}`,
  friendOf:       (userId: string)   => `FRIENDOF#${userId}`,
  expOwner:       (userId: string)   => `EOWNER#${userId}`,
  expPart:        (userId: string)   => `EPART#${userId}`,
  settlFrom:      (userId: string)   => `SFROM#${userId}`,
  settlTo:        (userId: string)   => `STO#${userId}`,
  settlGroup:     (groupId: string)  => `SGROUP#${groupId}`,
  reminderTo:     (userId: string)   => `RPTO#${userId}`,
  reminderFrom:   (userId: string)   => `RPFROM#${userId}`,
  recurOwner:     (userId: string)   => `RCOWNER#${userId}`,
  due:            (dateStr: string)  => `DUE#${dateStr}`,
  inviteOwner:    (userId: string)   => `INVOWNER#${userId}`,
  inviteEmail:    (email: string)    => `INVEMAIL#${email.toLowerCase()}`,
  feedbackCat:    (cat: string)      => `FEEDCAT#${cat}`,
} as const;

// ── GSI1 Sort Key builders ────────────────────────────────────────────────────

export const GSI1SK = {
  user:       (id: string) => `USER#${id}`,
  group:      (id: string) => `GROUP#${id}`,
  expense:    (date: string, id: string) => `EXPENSE#${date}#${id}`,
  settlement: (date: string, id: string) => `SETTLEMENT#${date}#${id}`,
  reminder:   (status: string, ts: string, id: string) => `${status}#${ts}#${id}`,
  recurring:  (id: string) => `RECURRING#${id}`,
  invite:     (ts: string, id: string)   => `${ts}#${id}`,
  feedback:   (upvotes: number, id: string) =>
                `${String(upvotes).padStart(10, "0")}#${id}`,
} as const;

// ── GSI2 Partition Key builders ───────────────────────────────────────────────

export const GSI2PK = {
  settlGroup:   (groupId: string)  => `SGROUP2#${groupId}`,
  reminderFrom: (userId: string)   => `RPFROM2#${userId}`,
  inviteEmail:  (email: string)    => `INVEMAIL2#${email.toLowerCase()}`,
  due:          (dateStr: string)  => `DUE2#${dateStr}`,
  /** Dummy friends created by a user */
  dummyOf:      (userId: string)   => `DUMMYOF#${userId}`,
} as const;

export const GSI2SK = {
  settlement: (date: string, id: string) => `SETTLEMENT#${date}#${id}`,
  reminder:   (status: string, ts: string, id: string) => `${status}#${ts}#${id}`,
  invite:     (status: string, ts: string, id: string) => `${status}#${ts}#${id}`,
  recurring:  (id: string) => `RECURRING#${id}`,
  dummy:      (nameNormalized: string, userId: string) => `${nameNormalized}#${userId}`,
} as const;

// ── GSI3 Partition / Sort Key builders (sparse, multi-entity) ─────────────────

export const GSI3PK = {
  /** All users — query with begins_with(GSI3SK, namePrefix) */
  name: () => "NAME",
  /** Payment reminders by status — e.g. REMSTATUS#sent */
  reminderStatus: (status: string) => `REMSTATUS#${status}`,
  /** Friendship lookup by friendship id */
  friendshipId: (id: string) => `FID#${id}`,
} as const;

export const GSI3SK = {
  userName: (nameNormalized: string, userId: string) =>
    `${nameNormalized}#${userId}`,
  reminder: (ts: string, id: string) => `${ts}#${id}`,
  friendship: (userId: string) => `USER#${userId}`,
} as const;

// ── Helper ────────────────────────────────────────────────────────────────────

/** Normalise any date value to a sortable ISO-8601 string (no colons/dots so it
 *  is safe as a sort-key segment).  Example: "2026-05-27T14-30-00-000Z" */
export function toSortableTs(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().replace(/[:.]/g, "-");
}
