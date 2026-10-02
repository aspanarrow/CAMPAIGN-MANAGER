# Shopify Marketing Automation AI Agent

A comprehensive AI-powered marketing automation system for Shopify stores, automating ad campaigns, content generation, and performance optimization across Meta, Google Ads, and email platforms.

## 🚀 Features

- **Automated Campaign Management**: Create Meta and Google Ads campaigns automatically from your Shopify products
- **AI Content Generation**: Ad copy, product descriptions, and email content (OpenCode Go, Gemini fallback)
- **Performance Monitoring**: Daily metric sync at campaign / ad-set / ad level with real ROAS
- **Revenue Attribution**: Matches Shopify orders to campaigns (UTM) to compute ROAS
- **Automation Rules**: "If ROAS < 2 for the last N days → propose pause" — with human approval
- **Human-in-the-Loop**: Approval workflows; budget changes and pauses execute only after you approve
- **Analytics Dashboard**: Aggregated spend / revenue / ROAS by platform and status
- **Audit Log**: Every create / update / approve / pause is recorded
- **Notifications**: Optional webhook (Slack/Discord/Telegram) for approvals & rule triggers

## 🏗️ Architecture

```
shopify-marketing-ai/
├── backend/          # Node.js/TypeScript API server
│   ├── src/services/ # shopify, meta, ai, metrics-sync, attribution, rules, approval...
│   └── src/workers/  # BullMQ worker + node-cron scheduler
├── frontend/         # Next.js dashboard (campaigns, approvals, automation, analytics)
├── shared/           # Shared types and utilities
├── scripts/          # manage.sh, meta-oauth/, shopify-auth/
└── docs/             # Documentation
```

## 🛠️ Tech Stack

- **Backend**: Node.js 20+, TypeScript, Express.js
- **Frontend**: Next.js 14+, React 18+, Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis
- **AI**: OpenCode Go (primary) / Google Gemini (fallback)
- **Ads**: Meta Marketing API (Google Ads: partially implemented)
- **Hosting**: Railway.app (recommended)

## ⚡ Quick start (one command)

```bash
./scripts/manage.sh doctor   # check prerequisites
./scripts/manage.sh start    # backend + frontend + worker + scheduler
./scripts/manage.sh status   # what's running + Shopify token age
./scripts/manage.sh logs     # tail all logs
./scripts/manage.sh stop     # stop everything
```

The Shopify access token expires every 24h — refresh it with:

```bash
./scripts/manage.sh token
```


## 📋 Prerequisites

- Node.js 20+ and npm/yarn
- PostgreSQL 15+
- Redis 7+
- API credentials for:
  - Shopify Admin API
  - Meta Business Suite
  - Google Ads API
  - OpenAI API
  - Email platform (Klaviyo recommended)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Set Up Environment Variables

Copy the example env files and fill in your credentials:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 3. Set Up Database

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Queue Worker
cd backend
npm run worker
```

Visit `http://localhost:3000` for the dashboard.

## 📚 Documentation

- [Setup Guide](docs/SETUP.md)
- [API Documentation](docs/API.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## 🔐 Security

- All API keys stored in environment variables
- Database encryption at rest
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS configuration

## 📝 License

MIT

## 🤝 Contributing

This is a private project. For questions or issues, please contact the development team.

