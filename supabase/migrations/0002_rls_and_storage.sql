-- ============================================
-- SUPABASE POST-MIGRATION SETUP (IDEMPOTENT)
-- ============================================
-- Run after 0001_core.sql
-- This migration is intentionally re-runnable.
-- ============================================

begin;

-- --------------------------------------------
-- JWT helper functions
-- --------------------------------------------
-- Supports NextAuth bridge tokens and native Supabase tokens:
-- - user_id
-- - sub
-- - user_metadata.id

create or replace function public.app_user_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt()->>'user_id', ''),
    nullif(auth.jwt()->>'sub', ''),
    nullif(auth.jwt()->'user_metadata'->>'id', ''),
    nullif(auth.uid()::text, '')
  );
$$;

create or replace function public.app_role()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt()->>'role', ''), '');
$$;

-- --------------------------------------------
-- Ensure RLS is enabled
-- --------------------------------------------

alter table public.users enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.settlements enable row level security;
alter table public.notifications enable row level security;
alter table public.invitations enable row level security;
alter table public.payment_reminders enable row level security;
alter table public.migration_logs enable row level security;

-- --------------------------------------------
-- Drop existing policies (safe for reruns)
-- --------------------------------------------

drop policy if exists "Users can read own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Service role can insert users" on public.users;

drop policy if exists "Users can read own friendships" on public.friendships;
drop policy if exists "Users can create friendships" on public.friendships;
drop policy if exists "Users can update own friendships" on public.friendships;

drop policy if exists "Users can read groups they belong to" on public.groups;
drop policy if exists "Users can create groups" on public.groups;
drop policy if exists "Group creators can update their groups" on public.groups;

drop policy if exists "Users can read group members of their groups" on public.group_members;
drop policy if exists "Users can add group members" on public.group_members;

drop policy if exists "Users can read expenses they participate in" on public.expenses;
drop policy if exists "Users can create expenses" on public.expenses;
drop policy if exists "Expense creator can update" on public.expenses;

drop policy if exists "Users can read own expense participation" on public.expense_participants;
drop policy if exists "Service role can manage expense participants" on public.expense_participants;

drop policy if exists "Users can read own settlements" on public.settlements;
drop policy if exists "Users can create settlements" on public.settlements;

drop policy if exists "Users can read own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists "Service role can create notifications" on public.notifications;

drop policy if exists "Anyone can read invitations by token" on public.invitations;
drop policy if exists "Service role can manage invitations" on public.invitations;

drop policy if exists "Users can read own payment reminders" on public.payment_reminders;
drop policy if exists "Users can create payment reminders" on public.payment_reminders;

drop policy if exists "Service role can manage migration logs" on public.migration_logs;

-- Storage policies
drop policy if exists "Public read access for doosplit" on storage.objects;

-- --------------------------------------------
-- Users policies
-- --------------------------------------------

create policy "Users can read own profile"
on public.users
for select
using (public.app_user_id() = id);

create policy "Users can update own profile"
on public.users
for update
using (public.app_user_id() = id);

create policy "Service role can insert users"
on public.users
for insert
with check (public.app_role() = 'service_role');

-- --------------------------------------------
-- Friendships policies
-- --------------------------------------------

create policy "Users can read own friendships"
on public.friendships
for select
using (
  public.app_user_id() = user_id
  or public.app_user_id() = friend_id
);

create policy "Users can create friendships"
on public.friendships
for insert
with check (
  public.app_user_id() = user_id
  or public.app_role() = 'service_role'
);

create policy "Users can update own friendships"
on public.friendships
for update
using (
  public.app_user_id() = user_id
  or public.app_user_id() = friend_id
  or public.app_role() = 'service_role'
);

-- --------------------------------------------
-- Groups policies
-- --------------------------------------------

create policy "Users can read groups they belong to"
on public.groups
for select
using (
  exists (
    select 1
    from public.group_members
    where group_members.group_id = groups.id
      and group_members.user_id = public.app_user_id()
  )
);

create policy "Users can create groups"
on public.groups
for insert
with check (
  public.app_user_id() = created_by
  or public.app_role() = 'service_role'
);

create policy "Group creators can update their groups"
on public.groups
for update
using (
  public.app_user_id() = created_by
  or public.app_role() = 'service_role'
);

-- --------------------------------------------
-- Group members policies
-- --------------------------------------------

create policy "Users can read group members of their groups"
on public.group_members
for select
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = public.app_user_id()
  )
);

create policy "Users can add group members"
on public.group_members
for insert
with check (
  public.app_role() = 'service_role'
  or exists (
    select 1
    from public.groups
    where groups.id = group_members.group_id
      and groups.created_by = public.app_user_id()
  )
);

-- --------------------------------------------
-- Expenses policies
-- --------------------------------------------

create policy "Users can read expenses they participate in"
on public.expenses
for select
using (
  exists (
    select 1
    from public.expense_participants
    where expense_participants.expense_id = expenses.id
      and expense_participants.user_id = public.app_user_id()
  )
  or public.app_user_id() = created_by
);

create policy "Users can create expenses"
on public.expenses
for insert
with check (
  public.app_user_id() = created_by
  or public.app_role() = 'service_role'
);

create policy "Expense creator can update"
on public.expenses
for update
using (
  public.app_user_id() = created_by
  or public.app_role() = 'service_role'
);

-- --------------------------------------------
-- Expense participants policies
-- --------------------------------------------

create policy "Users can read own expense participation"
on public.expense_participants
for select
using (public.app_user_id() = user_id);

create policy "Service role can manage expense participants"
on public.expense_participants
for all
using (public.app_role() = 'service_role')
with check (public.app_role() = 'service_role');

-- --------------------------------------------
-- Settlements policies
-- --------------------------------------------

create policy "Users can read own settlements"
on public.settlements
for select
using (
  public.app_user_id() = from_user_id
  or public.app_user_id() = to_user_id
);

create policy "Users can create settlements"
on public.settlements
for insert
with check (
  public.app_user_id() = from_user_id
  or public.app_role() = 'service_role'
);

-- --------------------------------------------
-- Notifications policies
-- --------------------------------------------

create policy "Users can read own notifications"
on public.notifications
for select
using (public.app_user_id() = user_id);

create policy "Users can update own notifications"
on public.notifications
for update
using (
  public.app_user_id() = user_id
  or public.app_role() = 'service_role'
);

create policy "Service role can create notifications"
on public.notifications
for insert
with check (public.app_role() = 'service_role');

-- --------------------------------------------
-- Invitations policies
-- --------------------------------------------

create policy "Anyone can read invitations by token"
on public.invitations
for select
using (true);

create policy "Service role can manage invitations"
on public.invitations
for all
using (public.app_role() = 'service_role')
with check (public.app_role() = 'service_role');

-- --------------------------------------------
-- Payment reminders policies
-- --------------------------------------------

create policy "Users can read own payment reminders"
on public.payment_reminders
for select
using (
  public.app_user_id() = from_user_id
  or public.app_user_id() = to_user_id
);

create policy "Users can create payment reminders"
on public.payment_reminders
for insert
with check (
  public.app_user_id() = from_user_id
  or public.app_role() = 'service_role'
);

-- --------------------------------------------
-- Migration logs policies
-- --------------------------------------------

create policy "Service role can manage migration logs"
on public.migration_logs
for all
using (public.app_role() = 'service_role')
with check (public.app_role() = 'service_role');

-- --------------------------------------------
-- Storage bucket + policies (SQL-safe)
-- --------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'doosplit',
  'doosplit',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read access for doosplit"
on storage.objects
for select
using (bucket_id = 'doosplit');

-- --------------------------------------------
-- Realtime publication verification
-- --------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception
      when duplicate_object then
        null;
    end;

    begin
      alter publication supabase_realtime add table public.friendships;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

-- --------------------------------------------
-- Debug helpers
-- --------------------------------------------

create or replace function check_rls_coverage()
returns table (
  table_name text,
  rls_enabled boolean,
  policy_count bigint
)
as $$
begin
  return query
  select
    t.tablename::text,
    t.rowsecurity,
    count(p.policyname)
  from pg_tables t
  left join pg_policies p on t.tablename = p.tablename and t.schemaname = p.schemaname
  where t.schemaname = 'public'
  group by t.tablename, t.rowsecurity
  order by t.tablename;
end;
$$ language plpgsql;

create or replace function check_realtime_tables()
returns table (
  table_name text,
  in_publication boolean
)
as $$
begin
  return query
  select
    t.tablename::text,
    exists (
      select 1 from pg_publication_tables pt
      where pt.pubname = 'supabase_realtime'
        and pt.schemaname = 'public'
        and pt.tablename = t.tablename
    )
  from pg_tables t
  where t.schemaname = 'public'
  order by t.tablename;
end;
$$ language plpgsql;

commit;
