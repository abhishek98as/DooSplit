# 🚀 Deployment Guide - DooSplit

Complete deployment checklist for Vercel, GitHub, and Supabase integration.

---

## ✅ Pre-Deployment Checklist

### 1. Database & Services Verification

- [x] **Supabase Database**: Schema applied, RLS policies active
- [x] **Supabase Connection**: Validated (all env vars configured)
- [x] **MongoDB Connection**: Valid (for migration period)
- [ ] **Storage Bucket**: Create `doosplit` bucket in Supabase Dashboard
- [ ] **Realtime Publication**: Verify notifications & friendships tables enabled

### 2. Environment Variables

All environment variables must be added to **Vercel Project Settings → Environment Variables**.

#### Required Supabase Variables

```env
# Supabase Core
NEXT_PUBLIC_SUPABASE_URL=https://kebjunfsxwzefjwqsnky.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=lMqCaMCfw6raO4hNTcrRPkwu1N5mEjpbAXbhG1GC47o...

# Supabase Config
SUPABASE_REGION=ap-south-1
SUPABASE_STORAGE_BUCKET=doosplit
```

#### Migration Control Flags

```env
# Backend Selection
DATA_BACKEND_MODE=shadow          # shadow | supabase-primary | supabase-only
DATA_WRITE_MODE=dual             # single | dual

# Storage Provider
IMAGE_STORAGE_PROVIDER=supabase  # imagekit | supabase

# Cron Auth
OUTBOX_CRON_SECRET=<generate-secure-32-char-random>
```

#### Existing Services (Keep During Migration)

```env
# MongoDB (Required during shadow/dual-write mode)
MONGODB_URI=mongodb+srv://...

# Firebase Auth (Current auth system)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
FIREBASE_ADMIN_PRIVATE_KEY=...
FIREBASE_ADMIN_CLIENT_EMAIL=...

# Email Service
RESEND_API_KEY=...

# Redis (if using)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

#### Production-Specific Variables

```env
NODE_ENV=production
NEXTAUTH_URL=https://your-domain.vercel.app
NEXTAUTH_SECRET=<generate-new-secret>
```

---

## 📋 Deployment Steps

### Step 1: Create Storage Bucket (Manual - 2 minutes)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/kebjunfsxwzefjwqsnky)
2. Navigate to **Storage** → **New Bucket**
3. Configure:
   - **Name**: `doosplit`
   - **Public**: ✅ YES
   - **File size limit**: 50MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/gif`
4. Click **Create Bucket**

### Step 2: Verify Realtime Publication (30 seconds)

1. Go to **Database** → **Replication**
2. Find publication: `supabase_realtime`
3. Verify tables included:
   - ✅ `notifications`
   - ✅ `friendships`

If missing, run in SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
```

### Step 3: Commit Changes to GitHub

```powershell
# Stage all Supabase migration files
git add .env.example .env.production README.md
git add docs/ scripts/ supabase/
git add src/lib/supabase/ src/lib/storage/ src/lib/data/ src/lib/realtime/
git add src/app/api/realtime/ src/app/api/internal/
git add src/models/SupabaseOutbox.ts src/lib/outbox.ts
git add vercel.json package.json package-lock.json

# Commit
git commit -m "feat: Supabase integration - database, storage, realtime, and migration infrastructure

- Configure Supabase PostgreSQL as shadow database
- Implement dual-write pattern with outbox queue
- Add Supabase Storage for images (replacing ImageKit)
- Enable Realtime for notifications and friendships
- Create RLS policies for all 11 tables
- Add migration scripts for MongoDB → Supabase
- Configure Vercel cron for outbox flush (1-minute interval)
- Update documentation with setup guides"

# Push to GitHub
git push origin main
```

### Step 4: Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import repository: `abhishek98as/DooSplit`
4. Configure:
   - **Framework**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
5. **Environment Variables** → **Add**:
   - Copy all variables from `.env.production`
   - Ensure `OUTBOX_CRON_SECRET` is set (required for cron job)
6. Click **Deploy**

#### Option B: Via Vercel CLI

```powershell
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Add environment variables (one-time setup)
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_JWT_SECRET production
# ... add all other variables from .env.production
```

### Step 5: Configure Vercel Cron Job

The `vercel.json` already includes cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/internal/outbox/flush",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

**Verify cron is active:**
1. Vercel Dashboard → Your Project → **Cron Jobs**
2. Should show: `/api/internal/outbox/flush` - Every 1 minute
3. Status: **Active**

**Note**: Cron jobs require **Pro plan** ($20/month) or higher.  
For Hobby plan, use external cron service (cron-job.org, EasyCron).

### Step 6: Post-Deployment Verification

Run these tests after deployment:

#### 1. Health Check

```bash
curl https://your-domain.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "supabase": "connected",
  "timestamp": "2026-02-11T..."
}
```

#### 2. Realtime Test

- Login to app → Dashboard
- Create a friend request
- Check if notification appears instantly (Realtime working)

#### 3. Storage Test

- Upload a profile picture or expense image
- Verify URL starts with `https://kebjunfsxwzefjwqsnky.supabase.co/storage/v1/object/public/doosplit/...`
- Image should load correctly

#### 4. Dual-Write Verification

Check outbox queue is processing:

```bash
curl https://your-domain.vercel.app/api/internal/outbox/flush \
  -H "Authorization: Bearer YOUR_OUTBOX_CRON_SECRET"
```

Expected response:
```json
{
  "processed": 5,
  "failed": 0,
  "remaining": 0
}
```

---

## 🔄 Migration Timeline

### Phase 1: Shadow Mode (1-2 weeks) - **CURRENT**

- ✅ MongoDB is primary (all reads/writes)
- ✅ Supabase receives dual-writes (validation only)
- ✅ Outbox queue ensures eventual consistency
- ⚠️ Monitor Supabase data parity (should be 99%+)

**Actions:**
```bash
# Run data migration from MongoDB
npm run migrate:mongodb-to-supabase -- --run-id initial --collection all

# Validate parity daily
npm run migrate:validate-parity -- --run-id parity-check-1
```

### Phase 2: Supabase Primary (1 week)

**Before switching:**
- Data parity must be 99.9%+
- No errors in outbox queue for 48 hours
- Realtime working reliably

**Update env vars:**
```env
DATA_BACKEND_MODE=supabase-primary  # Supabase reads, MongoDB fallback
DATA_WRITE_MODE=dual               # Still dual-write
```

**Redeploy** to Vercel with new env vars.

### Phase 3: Supabase Only (Final)

**After 1 week of stable Supabase-primary:**
```env
DATA_BACKEND_MODE=supabase-only    # 100% Supabase
DATA_WRITE_MODE=single             # No more dual-write
```

**Then remove:**
- MongoDB connection (MONGODB_URI)
- Outbox queue code
- Migration scripts

---

## 🛠️ Troubleshooting

### Deployment Fails with Build Error

**Check:**
1. `npm run build` works locally
2. All dependencies in `package.json`
3. Environment variables set in Vercel

**Common fix:**
```powershell
# Clear cache and rebuild
rm -rf .next node_modules package-lock.json
npm install
npm run build
```

### Supabase Connection Fails in Production

**Symptoms:** 500 errors on API routes

**Check:**
1. Vercel env vars are set (Dashboard → Settings → Environment Variables)
2. `SUPABASE_SERVICE_ROLE_KEY` is correct (starts with `eyJh...`)
3. Supabase project is active (not paused)

**Test connection:**
```bash
curl https://your-domain.vercel.app/api/health
```

### Realtime Not Working in Production

**Check:**
1. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set (client-side needs it)
2. Realtime publication includes tables:
   ```sql
   SELECT * FROM check_realtime_tables();
   ```
3. Browser console for WebSocket errors

### Cron Job Not Running

**Hobby Plan**: Vercel Cron requires Pro plan.

**Workaround:**
1. Use [cron-job.org](https://cron-job.org) (free)
2. Create job:
   - URL: `https://your-domain.vercel.app/api/internal/outbox/flush`
   - Interval: Every 1 minute
   - Header: `Authorization: Bearer YOUR_OUTBOX_CRON_SECRET`

### Images Not Loading

**Check:**
1. Storage bucket `doosplit` exists and is **public**
2. `IMAGE_STORAGE_PROVIDER=supabase` in env vars
3. RLS policies allow public read:
   ```sql
   SELECT * FROM storage.policies WHERE bucket_id = 'doosplit';
   ```

**Fix bucket permissions:**
- Dashboard → Storage → `doosplit` → Settings → **Public: ON**

---

## 📊 Monitoring

### Key Metrics to Track

1. **Supabase Dashboard → Reports**
   - Database connections (stay under 60 for free tier)
   - Storage usage (1GB limit)
   - Bandwidth (5GB/month limit)

2. **Vercel Analytics**
   - API response times
   - Error rates
   - Cron job execution logs

3. **Data Parity (during migration)**
   ```bash
   npm run migrate:validate-parity
   ```
   - Target: <1% mismatch rate
   - Check daily during shadow mode

### Alerts to Set Up

1. **Uptime Monitoring**: Use [UptimeRobot](https://uptimerobot.com) (free)
   - Monitor: `https://your-domain.vercel.app/api/health`
   - Interval: 5 minutes

2. **Error Tracking**: Vercel Integration → Sentry
   - Capture 500 errors
   - Track API failures

---

## 🎯 Success Criteria

### Deployment is successful when:

- ✅ Site loads at Vercel URL
- ✅ `/api/health` returns `"status": "healthy"`
- ✅ Login/signup works
- ✅ Expenses can be created
- ✅ Notifications appear in real-time
- ✅ Images upload and display
- ✅ Outbox queue processes (check logs)
- ✅ No errors in Vercel logs for 1 hour

### Migration is successful when:

- ✅ Data parity validation: 99.9%+ match
- ✅ No outbox errors for 48 hours
- ✅ Realtime subscriptions stable
- ✅ API response times <500ms (p95)
- ✅ All users can access their data

---

## 📞 Support Resources

- **Supabase Docs**: https://supabase.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Project Setup**: [docs/SUPABASE_SETUP_GUIDE.md](./SUPABASE_SETUP_GUIDE.md)
- **Migration Details**: [docs/IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Supabase Support**: https://supabase.com/dashboard/support

---

**Last Updated**: February 11, 2026  
**Deployment Status**: Ready for production 🚀
