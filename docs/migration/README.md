# Supabase Migration Guide

> **📚 For complete setup instructions, see:** [`docs/SUPABASE_SETUP_GUIDE.md`](../SUPABASE_SETUP_GUIDE.md)
> 
> **📋 Quick reference:** [`docs/SUPABASE_QUICK_REFERENCE.md`](../SUPABASE_QUICK_REFERENCE.md)

---

## Prerequisites

Before running migration commands, ensure:

✅ **Supabase Project Configured**
- Database schema applied (`0001_core.sql`)
- RLS policies applied (`0002_rls_and_storage.sql`)
- Storage bucket `doosplit` created (public)
- Realtime enabled with `notifications` and `friendships` tables

✅ **Environment Variables Set** (`.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATA_BACKEND_MODE=shadow`
- `DATA_WRITE_MODE=dual`
- `OUTBOX_CRON_SECRET`

✅ **MongoDB Connection Active**
- `MONGODB_URI` configured
- Source data accessible

---

## Migration Steps

### 1) Apply Database Schema in Supabase

**Location:** Supabase Dashboard → SQL Editor

Run these SQL files in order:
1. `supabase/migrations/0001_core.sql` - Core tables, indexes, triggers
2. `supabase/migrations/0002_rls_and_storage.sql` - RLS policies, storage policies

**Verify:**
```sql
SELECT * FROM check_rls_coverage();
SELECT * FROM check_realtime_tables();
```

---

### 2) Backfill Data from MongoDB to Supabase
```bash
npm run migrate:mongodb-to-supabase -- --run-id initial-backfill --collection all --batch-size 200
```

Dry run:
```bash
npm run migrate:mongodb-to-supabase -- --run-id dryrun-1 --collection all --dry-run true
```

## 3) Validate parity
```bash
npm run migrate:validate-parity -- --run-id parity-1 --sample-size 20
```

## 4) Reconcile mismatches
```bash
npm run migrate:reconcile -- --run-id reconcile-1 --parity-file docs/migration/parity-1-parity.json --batch-size 200
```

## 5) Storage backfill (ImageKit -> Supabase)
```bash
npm run migrate:imagekit-to-supabase -- --run-id media-1 --batch-size 50
```

## 6) Runtime routing flags
- `DATA_BACKEND_MODE=mongo|shadow|supabase`
- `DATA_WRITE_MODE=single|dual`

## 7) Outbox worker endpoint
- Route: `POST /api/internal/outbox/flush`
- Auth header: `Authorization: Bearer <OUTBOX_CRON_SECRET or CRON_SECRET>`
