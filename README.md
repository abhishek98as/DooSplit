# DooSplit - Expense Sharing Made Simple

A modern expense splitting application built with Next.js, MongoDB, and Supabase.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ 
- MongoDB Atlas account (or local MongoDB)
- Supabase account (free tier)
- Vercel account (for deployment)

### Installation

```bash
# Clone repository
git clone <your-repo-url>
cd splitwise

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev
```

Access at: http://localhost:3000

---

## 📚 Documentation

### Setup & Configuration
- **[Supabase Setup Guide](docs/SUPABASE_SETUP_GUIDE.md)** - Complete step-by-step setup
- **[Quick Reference](docs/SUPABASE_QUICK_REFERENCE.md)** - Commands & credentials
- **[Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md)** - What's been done

### Migration
- **[Migration Guide](docs/migration/README.md)** - MongoDB → Supabase migration
- **[Production Deployment](docs/PRODUCTION_DEPLOYMENT.md)** - Production checklist

---

## 🏗️ Architecture

### Current Stack (Post-Supabase Migration)

**Frontend:**
- Next.js 15 (React 19)
- TypeScript
- Tailwind CSS
- Zustand (state management)

**Backend:**
- Next.js API Routes
- NextAuth.js (authentication)
- Firebase Admin (Google OAuth)

**Database:**
- **MongoDB** (primary - transitioning)
- **Supabase PostgreSQL** (shadow/target)
- Dual-write via outbox pattern

**Services:**
- **Supabase Storage** (images - new uploads)
- **Supabase Realtime** (live notifications)
- **ImageKit** (legacy images)
- **In-memory cache** (no Redis for free tier)

---

## 🔄 Migration Status

### Current Phase: Shadow Mode

**Configuration:**
```env
DATA_BACKEND_MODE=shadow    # MongoDB primary, Supabase validates
DATA_WRITE_MODE=dual        # Write to both databases
IMAGE_STORAGE_PROVIDER=supabase  # New uploads to Supabase
```

**What this means:**
- All reads served from MongoDB
- Supabase validates data in background
- Writes go to MongoDB + Supabase (via outbox queue)
- Monitoring parity between databases

**Next Steps:**
1. Monitor parity errors (<1% for 1-2 weeks)
2. Switch to Supabase primary (`DATA_BACKEND_MODE=supabase`)
3. After stable: single-write mode (`DATA_WRITE_MODE=single`)
4. Archive MongoDB

See [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) for full timeline.

---

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Migration Scripts
npm run migrate:mongodb-to-supabase      # Backfill MongoDB → Supabase
npm run migrate:validate-parity          # Check data parity
npm run migrate:reconcile                # Fix data mismatches
npm run migrate:imagekit-to-supabase     # Migrate images

# Performance Testing
npm run perf:seed    # Seed test data
npm run perf:bench   # Benchmark read performance
npm run perf:cleanup # Clean up test data

# Admin
npm run admin:reset  # Reset admin account
```

### Environment Variables

**Required:**
```env
# MongoDB
MONGODB_URI=...

# NextAuth
NEXTAUTH_URL=...
NEXTAUTH_SECRET=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

# Migration
DATA_BACKEND_MODE=shadow
DATA_WRITE_MODE=dual
```

See [.env.example](.env.example) for complete list.

---

## 📋 Key Features

### Expense Management
- ✅ Create/edit/delete expenses
- ✅ Split equally or by percentage
- ✅ Upload receipt images (Supabase Storage)
- ✅ Group expenses

### User Management
- ✅ Email/password authentication (NextAuth)
- ✅ Google OAuth (Firebase)
- ✅ Friend requests
- ✅ User profiles

### Settlements
- ✅ Track who owes whom
- ✅ Settle up transactions
- ✅ Payment history

### Real-time Features (Supabase Realtime)
- ✅ Live notifications
- ✅ Friend request updates
- ✅ WebSocket subscriptions

### Analytics
- ✅ Expense trends
- ✅ Category breakdowns
- ✅ Monthly summaries
- ✅ Export to Excel/PDF

---

## 🗂️ Project Structure

```
splitwise/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── api/                # API routes
│   │   │   ├── expenses/       # Expense CRUD
│   │   │   ├── friends/        # Friend management
│   │   │   ├── realtime/       # Realtime auth tokens
│   │   │   └── internal/       # Internal workers (outbox)
│   │   ├── expenses/           # Expense pages
│   │   ├── dashboard/          # Dashboard
│   │   └── auth/               # Auth pages
│   ├── components/             # React components
│   ├── lib/
│   │   ├── supabase/           # Supabase clients
│   │   │   ├── admin.ts        # Server-side client
│   │   │   ├── browser.ts      # Client-side client
│   │   │   └── server.ts       # Server component client
│   │   ├── data/               # Data routing layer
│   │   │   ├── config.ts       # Mode flags
│   │   │   ├── read-routing.ts # Shadow reads
│   │   │   ├── mongo-adapter.ts
│   │   │   └── supabase-adapter.ts
│   │   ├── storage/            # Image storage
│   │   ├── realtime/           # Realtime client
│   │   ├── cache.ts            # Cache layer
│   │   └── outbox.ts           # Outbox worker
│   ├── models/                 # Mongoose/DB models
│   └── types/                  # TypeScript types
├── supabase/
│   └── migrations/
│       ├── 0001_core.sql       # Core schema
│       └── 0002_rls_and_storage.sql  # RLS policies
├── scripts/
│   ├── migrate/                # Migration scripts
│   ├── perf/                   # Performance testing
│   └── admin/                  # Admin tools
├── docs/                       # Documentation
│   ├── SUPABASE_SETUP_GUIDE.md
│   ├── SUPABASE_QUICK_REFERENCE.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── PRODUCTION_DEPLOYMENT.md
│   └── migration/
└── public/                     # Static assets
```

---

## 🔐 Security

### Authentication
- Email/password via NextAuth.js
- Google OAuth via Firebase Admin
- Custom JWT tokens for Supabase Realtime
- Session-based auth with secure cookies

### Database Security
- Row Level Security (RLS) on all Supabase tables
- Service role key for server-side operations (bypasses RLS)
- Anon key for client-side Realtime only

### Secrets Management
- All secrets in `.env.local` (not committed)
- Encrypted in Vercel environment variables
- Separate secrets for dev/staging/prod

---

## 📊 Performance Optimization

### Database
- MongoDB connection pooling (max 5)
- Supabase PgBouncer (connection pooler)
- Indexes on frequently queried fields
- Shadow mode for gradual cutover (zero downtime)

### Caching
- In-memory process cache (no Redis needed)
- Registry-based invalidation (efficient for free tier)
- TTLs: 180s (expenses/groups), 120s (activities)

### Storage
- Supabase Storage CDN for images
- Public bucket for shared receipt images
- 50 MB max file size

### Deployment
- Vercel Edge Network
- Region: Mumbai (bom1) - matches database
- Automatic static optimization

---

## 🧪 Testing

### Manual Testing Checklist
- [ ] Health endpoint: `curl http://localhost:3000/api/health`
- [ ] Create expense
- [ ] Upload image
- [ ] Send friend request
- [ ] Receive realtime notification
- [ ] Check outbox queue draining
- [ ] Validate data parity

### Migration Testing
```bash
# Dry run
npm run migrate:mongodb-to-supabase -- --run-id test --collection users --dry-run true

# Validate parity
npm run migrate:validate-parity -- --run-id parity-1 --sample-size 100

# Check health
curl http://localhost:3000/api/health
```

---

## 🚢 Deployment

### Vercel (Production)

1. **Prerequisites:**
   - Supabase project configured (see [Setup Guide](docs/SUPABASE_SETUP_GUIDE.md))
   - Environment variables ready
   - Data migrated and validated

2. **Deploy:**
   ```bash
   git push origin main  # Auto-deploys via Vercel
   ```

3. **Post-deployment:**
   - Verify health: `curl https://doosplit.vercel.app/api/health`
   - Check Vercel Cron Jobs running
   - Monitor outbox queue

See [Production Deployment Guide](docs/PRODUCTION_DEPLOYMENT.md) for complete checklist.

---

## 📈 Monitoring

### Health Endpoint
`GET /api/health`

Returns:
```json
{
  "status": "healthy",
  "database": "connected",
  "supabase": "connected",
  "mode": "shadow",
  "cache": "in-memory",
  "timestamp": "2026-02-11T..."
}
```

### Key Metrics
- **Parity error rate:** <1% target
- **Outbox queue depth:** <100 pending entries
- **API response time:** <500ms (p95)
- **Database query time:** <100ms (p95)

### Logs
- Vercel deployment logs
- Supabase query logs
- MongoDB Atlas metrics
- Outbox worker status

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit pull request

---

## 📝 License

[Add your license here]

---

## 🆘 Support

### Documentation
- [Supabase Setup Guide](docs/SUPABASE_SETUP_GUIDE.md)
- [Quick Reference](docs/SUPABASE_QUICK_REFERENCE.md)
- [Migration Guide](docs/migration/README.md)
- [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md)

### Issues
- Check [Troubleshooting](docs/SUPABASE_SETUP_GUIDE.md#troubleshooting)
- Review [GitHub Issues](link-to-issues)

---

**Built with ❤️ using Next.js and Supabase**
