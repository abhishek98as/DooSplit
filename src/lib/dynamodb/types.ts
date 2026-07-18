/** TypeScript shapes for every DynamoDB item in the doosplit table */

export interface DdbBase {
  PK: string;
  SK: string;
  entityType: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  ttl?: number; // Unix epoch seconds — DynamoDB TTL attribute
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface DdbUser extends DdbBase {
  entityType: "user";
  id: string;
  email: string;
  email_normalized: string;
  name: string;
  name_normalized: string;
  display_name?: string;
  photo_url?: string;
  phone_number?: string;
  default_currency?: string;
  is_active: boolean;
  is_dummy?: boolean;
  merged_into?: string;
  firebase_uid?: string;
  preferences?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Friendships ───────────────────────────────────────────────────────────────

export interface DdbFriendship extends DdbBase {
  entityType: "friendship";
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  requested_by: string;
  created_at: string;
  updated_at: string;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export interface DdbGroup extends DdbBase {
  entityType: "group";
  id: string;
  name: string;
  description?: string;
  created_by: string;
  currency: string;
  is_active: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface DdbGroupMember extends DdbBase {
  entityType: "group_member";
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  status: string;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export interface DdbExpense extends DdbBase {
  entityType: "expense";
  id: string;
  group_id?: string;
  created_by: string;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  date: string;
  time?: string;
  receipt_images?: string[];
  notes?: string;
  split_type: string;
  is_deleted: boolean;
  is_settled: boolean;
  payment_status?: string;
  payment_status_updated_at?: string;
  payment_status_updated_by?: string;
  edit_history?: any[];
  recurring_template_id?: string;
  recurring_run_id?: string;
  recurrence_occurrence_date?: string;
  created_at: string;
  updated_at: string;
}

export interface DdbExpenseParticipant extends DdbBase {
  entityType: "expense_participant";
  expense_id: string;
  user_id: string;
  amount_owed: number;
  amount_paid: number;
  split_type?: string;
  is_excluded: boolean;
  is_settled: boolean;
  // Denormalised from parent expense (enables balance queries without join)
  expense_date: string;
  expense_group_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DdbExpenseComment extends DdbBase {
  entityType: "expense_comment";
  id: string;
  expense_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/** Fan-out record stored under USER#userId / EXPENSE#{date}#{id}.
 *  Contains enough data to render the expense list without a join. */
export interface DdbExpenseFeed extends DdbBase {
  entityType: "expense_feed";
  expense_id: string;
  user_id: string;
  amount_owed: number;
  amount_paid: number;
  is_settled: boolean;
  is_excluded: boolean;
  // Expense fields
  group_id?: string;
  created_by: string;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  date: string;
  split_type: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** Fan-out record stored under GROUP#groupId / EXPENSE#{date}#{id} */
export interface DdbGroupExpenseFeed extends DdbBase {
  entityType: "group_expense_feed";
  expense_id: string;
  group_id: string;
  created_by: string;
  description: string;
  amount: number;
  currency: string;
  category?: string;
  date: string;
  split_type: string;
  is_deleted: boolean;
  is_settled: boolean;
  created_at: string;
  updated_at: string;
}

// ── Settlements ───────────────────────────────────────────────────────────────

export interface DdbSettlement extends DdbBase {
  entityType: "settlement";
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  group_id?: string;
  notes?: string;
  date: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface DdbSettlementAllocation extends DdbBase {
  entityType: "settlement_allocation";
  settlement_id: string;
  expense_id: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

/** Fan-out settlement record under USER#userId / SETTLEMENT#{date}#{id} */
export interface DdbSettlementFeed extends DdbBase {
  entityType: "settlement_feed";
  settlement_id: string;
  user_id: string;
  direction: "sent" | "received";
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  group_id?: string;
  notes?: string;
  date: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface DdbNotification extends DdbBase {
  entityType: "notification";
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_id?: string;
  related_type?: string;
  actor_id?: string;
  actor_name?: string;
  created_at: string;
}

// ── Activities ────────────────────────────────────────────────────────────────

export interface DdbActivityLog extends DdbBase {
  entityType: "activity_log";
  id: string;
  userId: string;
  type: string;
  description: string;
  relatedId?: string;
  relatedType?: string;
  actorId?: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Payment Reminders ─────────────────────────────────────────────────────────

export interface DdbReminder extends DdbBase {
  entityType: "payment_reminder";
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  expense_id?: string;
  notes?: string;
  status: string;
  last_push_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Invitations ───────────────────────────────────────────────────────────────

export interface DdbInvitation extends DdbBase {
  entityType: "invitation";
  id: string;
  invited_by: string;
  email: string;
  email_normalized: string;
  name?: string;
  token: string;
  status: string;
  expires_at: string;
  group_id?: string;
  group_name?: string;
  accepted_by?: string;
  accepted_at?: string;
  created_at: string;
  updated_at: string;
}

/** Reverse lookup: TOKEN#<token> / INVITE → invite_id */
export interface DdbTokenLookup extends DdbBase {
  entityType: "token_lookup";
  invite_id: string;
  expires_at: string;
}

// ── Recurring Expenses ────────────────────────────────────────────────────────

export interface DdbRecurringTemplate extends DdbBase {
  entityType: "recurring_template";
  id: string;
  owner_id: string;
  participant_ids: string[];
  description: string;
  amount: number;
  currency: string;
  category?: string;
  split_type: string;
  group_id?: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  start_date: string;
  end_date?: string;
  next_run_date: string;
  is_active: boolean;
  last_run_date?: string;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface DdbRecurringRun extends DdbBase {
  entityType: "recurring_run";
  id: string;
  template_id: string;
  owner_id: string;
  expense_id?: string;
  run_date: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  created_at: string;
}

// ── User Nudge State ──────────────────────────────────────────────────────────

export interface DdbUserNudgeState extends DdbBase {
  entityType: "user_nudge";
  user_id: string;
  nudge_id: string;
  state: Record<string, unknown>;
  last_nudge_at?: string;
  nudge_count: number;
  created_at: string;
  updated_at: string;
}

// ── Feature Feedback ──────────────────────────────────────────────────────────

export interface DdbFeedback extends DdbBase {
  entityType: "feedback";
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  upvotes: number;
  downvotes: number;
  tags?: string[];
  created_by?: string;
  created_at: string;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface DdbNote extends DdbBase {
  entityType: "note";
  id: string;
  userId: string;
  title: string;
  text?: string;
  type: "text" | "list";
  items: Array<{
    id: string;
    text: string;
    done: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  color: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  reminder?: string | null;
  created_at: string;
  updated_at: string;
}
