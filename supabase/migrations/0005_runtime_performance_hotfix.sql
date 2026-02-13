-- Runtime hotfix indexes for API latency under serverless time limits.
-- Safe to run multiple times.

-- Friends API: WHERE user_id = ? AND status = ? ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_friendships_user_status_created_hotfix
ON public.friendships (user_id, status, created_at DESC);

-- Groups API: membership lookup by user_id, then fan-out on group_id
CREATE INDEX IF NOT EXISTS idx_group_members_user_group_hotfix
ON public.group_members (user_id, group_id);

-- Group members fan-out by group_id when hydrating group detail lists
CREATE INDEX IF NOT EXISTS idx_group_members_group_hotfix
ON public.group_members (group_id);
