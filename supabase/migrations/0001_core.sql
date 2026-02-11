-- Core DooSplit schema (Mongo-compatible IDs stored as text).
-- Designed for phased migration with Next.js server-side access via service role.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id text primary key,
  email text not null unique,
  password text,
  name text not null,
  phone text,
  profile_picture text,
  default_currency text not null default 'INR',
  timezone text default 'Asia/Kolkata',
  language text not null default 'en',
  is_active boolean not null default true,
  is_dummy boolean not null default false,
  created_by text references public.users(id) on delete set null,
  role text not null default 'user' check (role in ('user', 'admin')),
  email_verified boolean not null default false,
  auth_provider text not null default 'email' check (auth_provider in ('email', 'firebase')),
  reset_password_token text,
  reset_password_expires timestamptz,
  push_notifications_enabled boolean not null default false,
  email_notifications_enabled boolean not null default true,
  push_subscription jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.friendships (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  friend_id text not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  requested_by text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, friend_id)
);

create table if not exists public.groups (
  id text primary key,
  name text not null,
  description text,
  image text,
  type text not null default 'other' check (type in ('home', 'trip', 'couple', 'event', 'office', 'other')),
  currency text not null default 'INR',
  created_by text not null references public.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.group_members (
  id text primary key,
  group_id text not null references public.groups(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (group_id, user_id)
);

create table if not exists public.expenses (
  id text primary key,
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  category text not null,
  date timestamptz not null default timezone('utc', now()),
  currency text not null default 'INR',
  created_by text not null references public.users(id) on delete restrict,
  group_id text references public.groups(id) on delete set null,
  images jsonb not null default '[]'::jsonb,
  notes text,
  is_deleted boolean not null default false,
  edit_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expense_participants (
  id text primary key,
  expense_id text not null references public.expenses(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  owed_amount numeric(14,2) not null default 0 check (owed_amount >= 0),
  is_settled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (expense_id, user_id)
);

create table if not exists public.settlements (
  id text primary key,
  from_user_id text not null references public.users(id) on delete restrict,
  to_user_id text not null references public.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'INR',
  method text not null default 'upi',
  note text,
  screenshot text,
  date timestamptz not null default timezone('utc', now()),
  group_id text references public.groups(id) on delete set null,
  version integer not null default 1,
  last_modified timestamptz not null default timezone('utc', now()),
  modified_by text not null references public.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.invitations (
  id text primary key,
  invited_by text not null references public.users(id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_reminders (
  id text primary key,
  from_user_id text not null references public.users(id) on delete cascade,
  to_user_id text not null references public.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'INR',
  message text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'read', 'paid')),
  sent_at timestamptz,
  read_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.migration_logs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  collection text not null,
  status text not null check (status in ('success', 'error', 'dry-run')),
  total_records integer not null default 0,
  processed_records integer not null default 0,
  error_count integer not null default 0,
  error_details jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_users_dummy_creator on public.users (is_dummy, created_by);
create index if not exists idx_friendships_friend_status on public.friendships (friend_id, status);
create index if not exists idx_friendships_user_status_req on public.friendships (user_id, status, requested_by);
create index if not exists idx_group_members_user on public.group_members (user_id);
create index if not exists idx_expenses_creator_deleted_date on public.expenses (created_by, is_deleted, date desc, created_at desc);
create index if not exists idx_expenses_group_deleted_date on public.expenses (group_id, is_deleted, date desc, created_at desc);
create index if not exists idx_exp_participants_user_settled_exp on public.expense_participants (user_id, is_settled, expense_id);
create index if not exists idx_exp_participants_exp_settled on public.expense_participants (expense_id, is_settled);
create index if not exists idx_settlements_from_date on public.settlements (from_user_id, date desc);
create index if not exists idx_settlements_to_date on public.settlements (to_user_id, date desc);
create index if not exists idx_settlements_group_date on public.settlements (group_id, date desc);
create index if not exists idx_notifications_user_read_created on public.notifications (user_id, is_read, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_invitations_email_invited_by on public.invitations (email, invited_by);
create index if not exists idx_invitations_expires_at on public.invitations (expires_at);
create index if not exists idx_payment_reminders_from_created on public.payment_reminders (from_user_id, created_at desc);
create index if not exists idx_payment_reminders_to_created on public.payment_reminders (to_user_id, created_at desc);
create index if not exists idx_migration_logs_run_collection on public.migration_logs (run_id, collection);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_friendships_updated_at on public.friendships;
create trigger trg_friendships_updated_at before update on public.friendships
for each row execute function public.set_updated_at();

drop trigger if exists trg_groups_updated_at on public.groups;
create trigger trg_groups_updated_at before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_group_members_updated_at on public.group_members;
create trigger trg_group_members_updated_at before update on public.group_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists trg_expense_participants_updated_at on public.expense_participants;
create trigger trg_expense_participants_updated_at before update on public.expense_participants
for each row execute function public.set_updated_at();

drop trigger if exists trg_settlements_updated_at on public.settlements;
create trigger trg_settlements_updated_at before update on public.settlements
for each row execute function public.set_updated_at();

drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at before update on public.notifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_invitations_updated_at on public.invitations;
create trigger trg_invitations_updated_at before update on public.invitations
for each row execute function public.set_updated_at();

drop trigger if exists trg_payment_reminders_updated_at on public.payment_reminders;
create trigger trg_payment_reminders_updated_at before update on public.payment_reminders
for each row execute function public.set_updated_at();

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

-- Realtime publication for phase-1 channels.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
    alter publication supabase_realtime add table public.friendships;
  end if;
exception
  when duplicate_object then
    null;
end $$;
