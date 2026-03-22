# FinTracker - Development Guide

## Overview

FinTracker is a serverless personal finance platform for Canadians. Users upload financial
documents (PDF, CSV, receipt images), the system extracts transactions, categorizes them
using a 3-layer approach (merchant DB → keyword rules → LLM fallback), and displays
spending insights on a dashboard.

Self-funded MVP. Cost minimization is a hard constraint.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, React Query, Recharts
- **Backend**: Node.js 20, Express, serverless-http (Lambda adapter), esbuild (bundler)
- **Database**: DynamoDB (5 tables: users, transactions, files, categories, merchants)
- **Storage**: S3 (file uploads + frontend hosting)
- **CDN**: CloudFront (serves frontend + proxies /api/* to API Gateway)
- **Compute**: AWS Lambda (single function, bundled JS)
- **LLM**: Groq free tier (Llama 3.1 8B for categorization, Llama 3.2 Vision for receipts)
- **IaC**: Terraform with S3 backend (bucket: terraform-state-geekyrbhalala)
- **CI/CD**: GitHub Actions with OIDC authentication

## Backend Structure

```
backend/
  src/
    app.js                  # Express app with routes and middleware
    lambda.js               # Lambda entry point (serverless-http wrapper)
    local.js                # Local dev server
    config.js               # Environment variable config
    routes/
      auth.js               # POST /api/auth/signup, /api/auth/login
      files.js              # POST /api/files/upload, /api/files/:id/process, GET /api/files
      transactions.js       # GET/POST/PATCH/DELETE /api/transactions
      dashboard.js          # GET /api/dashboard/summary, /api/dashboard/insights
      categories.js         # CRUD /api/categories (admin)
      merchants.js          # CRUD /api/merchants (admin)
    services/
      authService.js        # bcryptjs hashing + jsonwebtoken JWT
      fileService.js        # Upload/processing pipeline orchestrator
      parserService.js      # PDF (pdf-parse) and CSV (papaparse) parsing
      extractionService.js  # Transaction extraction from parsed data
      dashboardService.js   # Spending aggregation + insights generation
      categoryService.js    # Category CRUD + seed logic
      merchantService.js    # Merchant mapping CRUD + auto-learning
    infrastructure/
      dynamodb.js           # ALL DynamoDB operations (single abstraction layer)
      s3.js                 # S3 presigned URLs and object retrieval
      llm.js                # LLM categorization (Groq) + vision extraction + rule-based fallback
    middleware/
      auth.js               # JWT verification middleware
      admin.js              # Admin role check middleware
  esbuild.config.js         # Bundles src/ into single dist/lambda.js
  package.json
```

## Key Architecture Decisions

- **esbuild bundling**: Entire backend compiles to a single ~5MB JS file. No node_modules
  in Lambda, no binary compatibility issues, fast cold starts.
- **AWS SDK v3 externalized**: @aws-sdk packages excluded from bundle (Lambda runtime
  includes them). Saves bundle size.
- **bcryptjs**: Pure JavaScript bcrypt. No native C/Rust extensions.
- **serverless-http**: Wraps Express for Lambda.
- **DynamoDB abstraction**: All DB operations in dynamodb.js. Never use raw SDK calls in
  routes or services. This enables future migration to PostgreSQL.
- **3-layer categorization**: Merchant DB lookup → keyword rules → LLM fallback.
  Minimizes LLM calls (~80% handled before LLM).
- **Synchronous processing**: File processing happens in the API Lambda request.
  Acceptable for <100 users. No SQS needed yet.
- **Admin = hardcoded user_id**: No RBAC system. Single admin check.

## Development Principles

### Keep It Simple
- Prefer working features over perfect design
- No abstractions until you have 3+ concrete uses
- If a feature can be done in 20 lines of JavaScript, don't add a library
- Inline logic is better than premature abstraction

### Cost-First Mindset
- Every new AWS service needs justification
- Prefer Groq free tier over paid alternatives
- Prefer in-memory computation over additional database queries
- Prefer polling over WebSocket infrastructure
- Log only what's needed (CloudWatch costs money after free tier)

### Build Iteratively
- Ship small, working increments
- Validate with real usage before optimizing
- Manual processes are fine at MVP scale (admin manages categories by hand)

## Categorization System

Categories are dynamic (stored in DynamoDB, managed via admin module), not hardcoded.

### 3-Layer Pipeline (executed in order, first match wins)

1. **Merchant mapping table** — DynamoDB lookup by normalized merchant name. $0 cost.
   Pre-seeded with ~500 Canadian merchants.
2. **Keyword rules** — In-memory keyword matching against category keywords. $0 cost.
   Keywords stored in the categories table.
3. **Groq LLM** — Last resort for unknown merchants. $0 on free tier.
   Result auto-saved to merchant mapping table for future lookups.

### Auto-Learning
When a user corrects a transaction's category (PATCH /api/transactions/:id), the backend
upserts the merchant into the merchant mapping table. Next time that merchant appears,
Layer 1 catches it.

## LLM Usage Rules

### Use LLM For:
- Categorizing unknown merchants (Layer 3 fallback, ~20% of transactions)
- Extracting transaction data from receipt images (Groq Vision)

### Do NOT Use LLM For:
- Dashboard insights — use JavaScript math (subtract, compare, sort)
- Recurring detection — use pattern matching (same merchant + amount + interval)
- Budget alerts — use threshold comparison
- Category breakdowns — use aggregation in code
- Any computation that can be done with arithmetic

### LLM Provider Config
- Provider: Groq (free tier)
- Categorization model: llama-3.1-8b-instant (temperature: 0)
- Vision model: llama-3.2-11b-vision-preview (temperature: 0)
- Fallback: keyword-based rules if LLM call fails

## GitHub Secrets (Organization Level)

| Secret | Purpose |
|--------|---------|
| AWS_ROLE_ARN | IAM role for GitHub OIDC authentication |
| LLM_API_KEY | API key for Groq |
| LLM_PROVIDER | `groq` |

JWT_SECRET is auto-generated by Terraform via `random_password`.

## Terraform State

- Bucket: `terraform-state-geekyrbhalala`
- Key: `fintracker/terraform.tfstate`
- Locking: S3-native lockfile (`use_lockfile = true`)

## Local Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## DO NOT BUILD YET

The following are explicitly deferred. Do not implement, scaffold, or design for these:

- **Bank integrations** (Plaid, Flinks) — Phase 4
- **Mobile native app** — Phase 4
- **SQS / async processing** — Only if sync processing exceeds 30s
- **Email notifications (SES)** — Phase 3
- **User roles / RBAC** — Only when >1 admin exists
- **AI predictions / ML pipeline** — Phase 3
- **Real-time WebSocket** — Polling is sufficient
- **Data export** — Phase 2
- **Multi-currency support** — Phase 2
- **Household/shared mode** — Phase 3
- **Custom user-created categories** — Phase 2
- **Test suite** — Add after Phase 1 data model stabilizes
- **Error tracking (Sentry)** — Add when serving unknown users

## MVP Feature Priority (Phase 1)

Build in this order:

1. Dynamic category system (DynamoDB table + admin CRUD + seed data)
2. Merchant mapping table (DynamoDB table + admin CRUD + seed ~500 Canadian merchants)
3. Refactor categorization pipeline (3-layer: merchant DB → keywords → LLM)
4. Receipt/image upload (Groq Vision extraction)
5. Enhanced dashboard (month-over-month, category drill-down, top merchants)
6. Rule-based spending insights
7. Manual transaction entry + deletion
8. Category correction auto-learning (user edits feed merchant mappings)

## Architecture Reference

See [plot.md](plot.md) for full architecture decisions, trade-offs, cost analysis, and roadmap.
