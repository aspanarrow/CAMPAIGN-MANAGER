# Login Credentials & Environment Variables Guide

## 🔐 Login Credentials

### Current Login Credentials
The application uses **API Key authentication**. To log in:

1. **Navigate to**: http://localhost:3000/login
2. **Enter API Key**: `dev-api-key-change-in-production`
   - This is the current value set in `backend/.env`
   - You can change this by updating the `API_KEY` variable in `backend/.env`

### How Authentication Works
- The frontend stores the API key in browser localStorage
- The backend validates the API key against the `API_KEY` environment variable
- All API routes (except `/health`) require this authentication

---

## 📋 Required Environment Variables

### 🔴 **REQUIRED** - Must be set for basic functionality

#### 1. **API_KEY** (Authentication)
```bash
API_KEY=dev-api-key-change-in-production
```
- **Purpose**: Authentication key for API access
- **Current Value**: `dev-api-key-change-in-production`
- **Action**: Change this to a secure random string for production
- **Where to use**: Enter this value in the login page

#### 2. **DATABASE_URL** (Database Connection)
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/shopify_marketing?schema=public"
```
- **Purpose**: PostgreSQL database connection string
- **Current Value**: Placeholder PostgreSQL URL
- **Action**: 
  - Set up PostgreSQL database
  - Update with your actual database credentials
  - Or use a service like Supabase, Railway, or Neon

#### 3. **GEMINI_API_KEY** (AI Features)
```bash
GEMINI_API_KEY=your-gemini-api-key
```
- **Purpose**: Google Gemini API key for AI content generation
- **Current Value**: `your-gemini-api-key` (placeholder)
- **Action**: 
  - Get your API key from: https://makersuite.google.com/app/apikey
  - Replace the placeholder with your actual key
- **Required for**: AI content generation, ad copy creation

#### 4. **SHOPIFY_STORE_URL** (Shopify Integration)
```bash
SHOPIFY_STORE_URL=https://your-store.myshopify.com
```
- **Purpose**: Your Shopify store URL
- **Current Value**: `https://your-store.myshopify.com` (placeholder)
- **Action**: Replace with your actual Shopify store URL

#### 5. **SHOPIFY_ACCESS_TOKEN** (Shopify API Access)
```bash
SHOPIFY_ACCESS_TOKEN=your-shopify-access-token
```
- **Purpose**: Shopify Admin API access token
- **Current Value**: `your-shopify-access-token` (placeholder)
- **Action**: 
  - Create a private app in your Shopify admin
  - Generate an Admin API access token
  - Replace with your actual token
- **How to get**: 
  1. Go to Shopify Admin → Settings → Apps and sales channels
  2. Click "Develop apps" → "Create an app"
  3. Configure Admin API scopes (read_products, write_products, etc.)
  4. Install the app and copy the Admin API access token

---

## 🟡 **OPTIONAL** - For additional platform integrations

### Meta (Facebook/Instagram Ads)
```bash
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_ACCESS_TOKEN=your-meta-access-token
META_AD_ACCOUNT_ID=your-meta-ad-account-id
META_PAGE_ID=your-meta-page-id
```
- **Purpose**: Meta Business Suite API integration
- **Required for**: Creating and managing Meta/Facebook/Instagram ad campaigns
- **How to get**: 
  - Create a Meta App at https://developers.facebook.com/
  - Get App ID and App Secret
  - Generate access token with ads_management permissions
  - Get your Ad Account ID from Meta Business Manager

### Google Ads
```bash
GOOGLE_ADS_CLIENT_ID=your-google-ads-client-id
GOOGLE_ADS_CLIENT_SECRET=your-google-ads-client-secret
GOOGLE_ADS_DEVELOPER_TOKEN=your-google-ads-developer-token
GOOGLE_ADS_REFRESH_TOKEN=your-google-ads-refresh-token
GOOGLE_ADS_CUSTOMER_ID=your-google-ads-customer-id
```
- **Purpose**: Google Ads API integration
- **Required for**: Creating and managing Google Ads campaigns
- **How to get**: 
  - Apply for Google Ads API access
  - Create OAuth 2.0 credentials in Google Cloud Console
  - Get developer token from Google Ads account
  - Complete OAuth flow to get refresh token

### Email Platform (Klaviyo)
```bash
KLAVIYO_API_KEY=your-klaviyo-api-key
KLAVIYO_LIST_ID=your-klaviyo-list-id
```
- **Purpose**: Klaviyo email marketing integration
- **Required for**: Sending email campaigns
- **How to get**: 
  - Get API key from Klaviyo account settings
  - Get List ID from your Klaviyo lists

### Shopify Additional (Optional)
```bash
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
```
- **Purpose**: For OAuth-based Shopify app installation
- **Note**: Not required if using Admin API access token

---

## 🟢 **CONFIGURATION** - Optional settings

### Server Configuration
```bash
NODE_ENV=development          # development, production, or test
PORT=5000                      # Backend server port
FRONTEND_URL=http://localhost:3000  # Frontend URL for CORS
REDIS_URL=redis://localhost:6379    # Redis connection (for job queues)
```

### Feature Flags
```bash
ENABLE_AI_CONTENT_GENERATION=true   # Enable/disable AI features
ENABLE_AUTO_APPROVAL=false           # Auto-approve campaigns below threshold
AUTO_APPROVAL_THRESHOLD=20           # Budget threshold for auto-approval (in currency)
```

### Logging
```bash
LOG_LEVEL=info  # error, warn, info, or debug
```

---

## 🚀 Quick Setup Steps

1. **Update Required Variables** in `backend/.env`:
   ```bash
   # Minimum required
   API_KEY=your-secure-api-key-here
   GEMINI_API_KEY=your-actual-gemini-key
   SHOPIFY_STORE_URL=https://your-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=your-actual-shopify-token
   DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
   ```

2. **Set up Database**:
   ```bash
   cd backend
   npx prisma migrate dev
   ```

3. **Restart Backend** (if running):
   - The backend will automatically reload with new environment variables

4. **Login**:
   - Go to http://localhost:3000/login
   - Enter the `API_KEY` value from your `.env` file

---

## 📝 Environment File Location

- **Backend**: `/backend/.env`
- **Frontend**: `/frontend/.env.local`

---

## 🔒 Security Notes

- **Never commit** `.env` files to version control
- **Change default API_KEY** before production deployment
- **Use strong, random API keys** for production
- **Rotate API keys** periodically
- **Keep all API keys secure** and never share them publicly

---

## 🆘 Troubleshooting

### Login Issues
- Ensure `API_KEY` in backend `.env` matches what you enter in login
- Check backend server is running on port 5000
- Check browser console for errors

### Missing Features
- AI features require valid `GEMINI_API_KEY`
- Shopify features require valid `SHOPIFY_ACCESS_TOKEN`
- Platform-specific features require respective API credentials

### Database Issues
- Ensure PostgreSQL is running
- Verify `DATABASE_URL` is correct
- Run `npx prisma migrate dev` to set up database schema

