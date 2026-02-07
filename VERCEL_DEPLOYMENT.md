# DooSplit - Vercel Deployment Guide

## 🚀 Deploy to Vercel

Follow these steps to deploy DooSplit to Vercel with GitHub CI/CD:

### Step 1: Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your GitHub repository: `abhishek98as/DooSplit`
4. Vercel will auto-detect Next.js framework settings

### Step 2: Configure Environment Variables

Before deploying, add these environment variables in Vercel:

#### MongoDB
```
MONGODB_URI=mongodb+srv://abhishek98as_db_user:D25TkcV0CqVj8ARq@cluster0.c94me0z.mongodb.net/splitwise?retryWrites=true&w=majority&appName=Cluster0
```

#### NextAuth
```
NEXTAUTH_URL=https://your-app-name.vercel.app
NEXTAUTH_SECRET=your-secret-key-here-change-in-production
```

#### Firebase (Client)
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDbbpQJ5Gp2hFWY1ul5qKqGxRagzHo7hlw
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=doosplit.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=doosplit
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=doosplit.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=441906630101
NEXT_PUBLIC_FIREBASE_APP_ID=1:441906630101:web:85f8aa211da62e6146c15c
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-DEGX2K0WLB
```

#### Firebase Admin (Optional - for better security)
```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"doosplit",...}
```
*Get this from Firebase Console → Project Settings → Service Accounts → Generate New Private Key*

#### MongoDB IP Whitelisting
Make sure to add Vercel's IP addresses to MongoDB Atlas:
1. Go to MongoDB Atlas → Network Access
2. Click "Add IP Address"
3. **Add:** `0.0.0.0/0` (allows all IPs) OR add specific Vercel IPs
4. Vercel uses dynamic IPs, so `0.0.0.0/0` is recommended for serverless

### Step 3: Deploy

1. Click **"Deploy"** in Vercel
2. Vercel will build and deploy your app
3. You'll get a URL like: `https://doo-split-xyz.vercel.app`

### Step 4: Update Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Navigate to **Authentication → Settings → Authorized domains**
3. Add your Vercel domain: `doo-split-xyz.vercel.app`

### Step 5: Update NEXTAUTH_URL

1. After deployment, copy your Vercel app URL
2. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
3. Update `NEXTAUTH_URL` to your actual Vercel URL
4. Redeploy (Vercel → Deployments → ... → Redeploy)

---

## 📱 Inviting Friends Without a Domain

### Option 1: Use Vercel URL (Recommended)
Your Vercel URL works perfectly fine! Examples:
- `https://doo-split.vercel.app`
- `https://doo-split-abhishek98as.vercel.app`

**How to invite:**
1. Go to `/invite` page in your app
2. Copy your invite link
3. Share via WhatsApp, Email, SMS, or any messaging app
4. Friends click the link → Register → You send friend request → Start splitting!

### Option 2: Use Custom Domain (Optional)
If you want a custom domain like `doosplit.com`:
1. Buy a domain from Namecheap, GoDaddy, etc.
2. In Vercel → Your Project → Settings → Domains
3. Add your custom domain
4. Update DNS records (Vercel provides instructions)
5. Update `NEXTAUTH_URL` and Firebase authorized domains

---

## 🔄 Automatic Deployments (CI/CD)

Vercel automatically sets up CI/CD when you connect GitHub:

- **Push to `main` branch** → Automatic production deployment
- **Push to other branches** → Preview deployments
- **Pull Requests** → Automatic preview deployments

### Manual Deploy from Local
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

---

## ✅ Post-Deployment Checklist

- [ ] MongoDB Atlas IP whitelist updated to `0.0.0.0/0`
- [ ] All environment variables added in Vercel
- [ ] `NEXTAUTH_URL` updated to actual Vercel URL
- [ ] Firebase authorized domains include Vercel URL
- [ ] App deploys without errors
- [ ] Login/Register works
- [ ] Database connection works
- [ ] Invite friends feature tested

---

## 🔧 Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify environment variables are set

### Authentication Errors
- Verify `NEXTAUTH_URL` matches your Vercel URL
- Check Firebase authorized domains
- Ensure `NEXTAUTH_SECRET` is set

### Database Connection Issues
- Verify MongoDB Atlas network access allows Vercel IPs
- Check `MONGODB_URI` is correct
- Ensure MongoDB user has correct permissions

### Firebase Auth Not Working
- Verify all Firebase env variables are set
- Check Firebase authorized domains
- Ensure Firebase API keys are correct

---

## 📞 Support

For issues:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Test locally first with `npm run dev`
4. Verify all environment variables

---

**Your app is now live! 🎉**

Share the invite link with friends and start tracking expenses together!
