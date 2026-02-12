-- ============================================
-- AUTH IDENTITY BRIDGE + SESSION HELPERS
-- ============================================
-- This migration links Supabase Auth UUIDs to existing
-- app-level text IDs in public.users.
-- ============================================

begin;

create table if not exists public.user_identities (
  auth_uid uuid primary key references auth.users(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade unique,
  provider text not null default 'supabase',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_identities_user_id
  on public.user_identities(user_id);

drop trigger if exists trg_user_identities_updated_at on public.user_identities;
create trigger trg_user_identities_updated_at
before update on public.user_identities
for each row execute function public.set_updated_at();

alter table public.user_identities enable row level security;

drop policy if exists "Service role can manage user identities"
  on public.user_identities;
create policy "Service role can manage user identities"
on public.user_identities
for all
using (public.app_role() = 'service_role')
with check (public.app_role() = 'service_role');

-- Resolve app user ID with support for:
-- 1) explicit user_id claim (bridge token path)
-- 2) user_metadata.id claim
-- 3) mapped auth.uid() in public.user_identities
-- 4) legacy sub claim fallback
create or replace function public.app_user_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt()->>'user_id', ''),
    nullif(auth.jwt()->'user_metadata'->>'id', ''),
    (
      select ui.user_id
      from public.user_identities ui
      where ui.auth_uid = auth.uid()
      limit 1
    ),
    nullif(auth.jwt()->>'sub', ''),
    nullif(auth.uid()::text, '')
  );
$$;

create or replace function public.link_auth_identity(
  p_auth_uid uuid,
  p_user_id text,
  p_provider text default 'supabase'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_identities (auth_uid, user_id, provider)
  values (p_auth_uid, p_user_id, coalesce(nullif(p_provider, ''), 'supabase'))
  on conflict (auth_uid)
  do update
    set user_id = excluded.user_id,
        provider = excluded.provider,
        updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.link_auth_identity(uuid, text, text) from public;
grant execute on function public.link_auth_identity(uuid, text, text) to postgres;
grant execute on function public.link_auth_identity(uuid, text, text) to service_role;

commit;
