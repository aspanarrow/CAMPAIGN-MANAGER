# Quick Deployment Guide - Railway
**Time to Deploy:** 30-60 minutes  
**Status:** ✅ Ready

---

## 🚀 Quick Start

### Step 1: Push to GitHub (5 min)
```bash
# If not already on GitHub
git remote add origin https://github.com/yourusername/shopify-marketing-ai.git
git push -u origin development
```

### Step 2: Deploy Backend (15 min)

1. **Create Railway Project**
   - Go to railway.app
   - New Project → GitHub Repo
   - Select your repo

2. **Add PostgreSQL**
   - New → Database → PostgreSQL
   - Copy `DATABASE_URL`

3. **Add Redis**
   - New → Database → Redis
   - Copy `REDIS_URL`

4. **Deploy Backend**
   - Railway auto-detects Node.js
   - Set root: `backend`
   - Set build: `npm install && npm run build`
   - Set start: `npm start`

5. **Set Environment Variables**
   ```
   API_KEY=your-secure-key-here
   DATABASE_URL=<from Railway>
   REDIS_URL=<from Railway>
   SHOPIFY_ACCESS_TOKEN=your_token
   OPENAI_API_KEY=your_key
   SHOPIFY_STORE_URL=ccxwq4-cp.myshopify.com
   ```

6. **Run Migrations**
   - Open backend terminal in Railway
   - Run: `npx prisma migrate deploy`

7. **Deploy Worker**
   - Duplicate backend service
   - Change start to: `npm run worker`

### Step 3: Deploy Frontend (10 min)

1. **Create Frontend Service**
   - New → GitHub Repo (same repo)
   - Set root: `frontend`

2. **Configure**
   - Build: `npm install && npm run build`
   - Start: `npm start`

3. **Set Environment**
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   ```

4. **Update Backend CORS**
   - Add to backend env: `FRONTEND_URL=https://your-frontend.railway.app`

### Step 4: Test (5 min)

1. Visit frontend URL
2. Login with API key
3. Create test campaign
4. Verify it works

---

## 📋 Environment Variables Quick Reference

### Backend (Required)
```
API_KEY=generate-with-openssl-rand-hex-32
DATABASE_URL=<Railway provides>
REDIS_URL=<Railway provides>
SHOPIFY_ACCESS_TOKEN=your_token
OPENAI_API_KEY=your_key
SHOPIFY_STORE_URL=ccxwq4-cp.myshopify.com
```

### Frontend (Required)
```
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

---

## ✅ Verification

After deployment:
- ✅ Backend health: `https://backend.railway.app/health`
- ✅ Frontend loads: `https://frontend.railway.app`
- ✅ Can login
- ✅ Can create campaign

---

**Full Guide:** See `docs/RAILWAY_DEPLOYMENT.md`

