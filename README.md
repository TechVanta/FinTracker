# FinTracker

AI-powered personal finance platform for Canadians. Upload any financial document — bank statements, credit card PDFs, receipts, screenshots — and instantly see where your money goes.

## The Problem

Most Canadians don't track their spending. Bank apps show transactions but not insights. Budgeting apps like YNAB require tedious manual entry or scary bank logins. There's no simple way to answer: *"Where did my money go this month?"*

## The Solution

Upload anything. Get answers.

- **PDF/CSV statements** — Auto-extracted and categorized
- **Receipt photos** — AI reads the receipt, you confirm
- **Manual entry** — Quick-add for cash expenses
- **Canadian-optimized** — Knows Loblaws, Tim Hortons, Petro-Canada, Rogers, and 500+ Canadian merchants

No bank login required. No subscription needed to start.

## Target Users

- **Young professionals** trying to understand their spending habits
- **Students** on tight budgets who need visibility into every dollar
- **New immigrant families** tracking expenses across categories including remittance

## Key Features (MVP)

- Upload credit card/bank statements (PDF, CSV) or receipt photos
- AI-powered transaction extraction and categorization
- Dynamic category system with 20+ Canadian-optimized categories
- Spending dashboard with monthly trends and category breakdowns
- Month-over-month comparisons and spending insights
- Manual transaction entry for cash expenses
- Admin module for managing categories and merchant mappings
- Auto-learning: category corrections improve future accuracy

## How It Works

```
1. Upload    →  Drop a PDF, CSV, or snap a receipt photo
2. Extract   →  AI pulls out date, merchant, and amount
3. Categorize → 3-layer system: merchant DB → keyword rules → LLM
4. Insights  →  See where your money goes, month over month
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand, React Query, Recharts |
| Backend | Node.js 20, Express, serverless-http, esbuild |
| Database | AWS DynamoDB (5 tables, pay-per-request) |
| Storage | AWS S3 (file uploads + frontend hosting) |
| Compute | AWS Lambda (single function, ~5MB bundle) |
| CDN | AWS CloudFront (frontend + API proxy) |
| API | AWS API Gateway HTTP v2 |
| AI/LLM | Groq (free tier) — Llama 3.1 8B + Llama 3.2 Vision |
| IaC | Terraform (S3 backend) |
| CI/CD | GitHub Actions (OIDC auth, push-to-main deploy) |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    CloudFront CDN                        │
│                                                          │
│   /*     → S3 (React SPA)                                │
│   /api/* → API Gateway → Lambda (Node.js + Express)      │
└──────────────────────────┬───────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼────┐ ┌────▼─────┐ ┌───▼──────┐
        │ DynamoDB │ │    S3    │ │ Groq API │
        │ 5 tables │ │ uploads  │ │ (free)   │
        └──────────┘ └──────────┘ └──────────┘
```

## Project Structure

```
FinTracker/
├── backend/
│   ├── src/
│   │   ├── app.js                    # Express app setup
│   │   ├── lambda.js                 # Lambda entry point
│   │   ├── local.js                  # Local dev server
│   │   ├── config.js                 # Environment config
│   │   ├── routes/                   # API route handlers
│   │   │   ├── auth.js               # Signup, login
│   │   │   ├── files.js              # Upload, process
│   │   │   ├── transactions.js       # List, update, create, delete
│   │   │   └── dashboard.js          # Summary, insights
│   │   ├── services/                 # Business logic
│   │   │   ├── authService.js        # JWT + bcrypt
│   │   │   ├── fileService.js        # Processing pipeline
│   │   │   ├── parserService.js      # PDF + CSV parsing
│   │   │   ├── extractionService.js  # Transaction extraction
│   │   │   └── dashboardService.js   # Spending aggregation
│   │   ├── infrastructure/           # External service integrations
│   │   │   ├── dynamodb.js           # All DB operations
│   │   │   ├── s3.js                 # File storage
│   │   │   └── llm.js               # LLM categorization + vision
│   │   └── middleware/
│   │       └── auth.js               # JWT verification
│   ├── esbuild.config.js            # Bundles to single lambda.js
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/                    # Dashboard, Upload, Transactions, Login, Signup
│   │   ├── components/               # UI components by feature
│   │   ├── api/                      # Axios API client
│   │   ├── store/                    # Zustand auth store
│   │   ├── hooks/                    # useAuth, useTransactions
│   │   └── router.tsx                # Route definitions
│   ├── package.json
│   └── vite.config.ts
│
├── infra/                            # Terraform (DynamoDB, Lambda, S3, CloudFront, IAM)
├── .github/workflows/                # CI + deploy pipelines
├── plot.md                           # Architecture & planning (source of truth)
├── CLAUDE.md                         # Development guide
└── README.md                         # This file
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/files/upload` | JWT | Get presigned S3 upload URL |
| POST | `/api/files/:id/process` | JWT | Process uploaded file |
| GET | `/api/files` | JWT | List user's files |
| GET | `/api/transactions` | JWT | List transactions (filter by date/category) |
| POST | `/api/transactions` | JWT | Create manual transaction |
| PATCH | `/api/transactions/:id` | JWT | Update transaction category |
| DELETE | `/api/transactions/:id` | JWT | Delete transaction |
| GET | `/api/dashboard/summary` | JWT | Monthly spending data |
| GET | `/api/dashboard/insights` | JWT | Rule-based spending insights |
| GET | `/api/categories` | JWT | List categories |
| POST | `/api/categories` | Admin | Create category |
| PATCH | `/api/categories/:id` | Admin | Update category |
| DELETE | `/api/categories/:id` | Admin | Soft-delete category |
| GET | `/api/merchants` | Admin | List merchant mappings |
| POST | `/api/merchants` | Admin | Create merchant mapping |
| GET | `/api/health` | No | Health check |

## DynamoDB Tables

| Table | PK | GSI | Purpose |
|-------|-----|-----|---------|
| `fintracker-users` | `user_id` | `EmailIndex` (email) | User accounts |
| `fintracker-transactions` | `transaction_id` | `UserDateIndex` (user_id + date) | Transactions |
| `fintracker-files` | `file_id` | `UserIndex` (user_id + upload_date) | Upload tracking |
| `fintracker-categories` | `category_id` | — | Dynamic category definitions |
| `fintracker-merchant-mappings` | `merchant_pattern` | — | Merchant → category lookup |

## Local Development

### Backend

```bash
cd backend
npm install
npm run dev    # Starts on http://localhost:3001 (watch mode)
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # Starts on http://localhost:5173
```

Vite proxies `/api` requests to `http://localhost:3001` in dev mode.

### Environment Variables

Backend requires these environment variables (set in `.env` for local dev):

```
AWS_REGION=us-east-1
DYNAMODB_USERS_TABLE=fintracker-users
DYNAMODB_TRANSACTIONS_TABLE=fintracker-transactions
DYNAMODB_FILES_TABLE=fintracker-files
S3_UPLOADS_BUCKET=fintracker-uploads-<account-id>
JWT_SECRET=<any-string-for-local-dev>
LLM_PROVIDER=groq
LLM_API_KEY=<your-groq-api-key>
CORS_ORIGINS=*
```

## Deployment

Push to `main` triggers automatic deployment via GitHub Actions:
- Backend changes → bundles with esbuild, deploys to Lambda
- Frontend changes → builds with Vite, syncs to S3, invalidates CloudFront

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | IAM role for OIDC authentication |
| `LLM_API_KEY` | Groq API key |
| `LLM_PROVIDER` | `groq` |

### Infrastructure Setup

```bash
cd infra
terraform init
terraform plan
terraform apply
```

Terraform state: `s3://terraform-state-geekyrbhalala/fintracker/terraform.tfstate`

## Cost

Runs within AWS Free Tier at MVP scale (~$0/month):
- Lambda: 1M requests/month free
- API Gateway: 1M calls/month free
- DynamoDB: 25GB + 25 RCU/WCU free
- S3: 5GB free
- CloudFront: 1TB transfer free
- Groq: Free tier for LLM calls

## Current Status

**MVP in progress** — Phase 1 of 4.

Building: dynamic categories, Canadian merchant database, receipt image upload, enhanced
dashboard with insights, manual transaction entry.

## Future Vision

- Budget setting and alerts
- Recurring expense detection
- AI-generated monthly summaries
- Mobile app (React Native)
- Canadian bank integration (Flinks)
- Premium tier ($5.99/month)

See [plot.md](plot.md) for detailed architecture decisions and roadmap.
