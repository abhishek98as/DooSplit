# Rollback Runbook (Mongo Source of Truth)

## Purpose
Use this runbook when Supabase reads/writes cause production errors and the app must return to stable MongoDB reads immediately.

## One-step rollback
1. Set `DATA_BACKEND_MODE=mongo`.
2. Set `DATA_WRITE_MODE=single`.
3. Redeploy application.

## Optional hard rollback
1. Remove/disable cron job calling `/api/internal/outbox/flush`.
2. Unset `SUPABASE_SERVICE_ROLE_KEY` in deployment environment.
3. Keep `NEXT_PUBLIC_SUPABASE_*` values only if client realtime/storage fallback should remain enabled.

## Post-rollback validation checklist
1. `GET /api/health` returns `dataRouting.backendMode = mongo`.
2. `GET /api/friends`, `GET /api/groups`, `GET /api/expenses`, `GET /api/dashboard/activity` succeed with normal latency.
3. Login and dashboard load successfully for existing users.
4. New expense/group/friend writes succeed and cache invalidation headers continue to appear.

## Data safety notes
1. Outbox entries remain in `supabaseoutboxes` collection and can be replayed later.
2. Do not delete migration logs (`public.migration_logs`) until parity validation is rerun.
3. Keep pre-cutover Mongo backup until stabilization window is complete.
