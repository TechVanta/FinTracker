# FinTracker — Architecture & Planning Document

> Single source of truth for architecture decisions, trade-offs, and product direction.
> Last updated: 2026-03-22

## Product Vision

FinTracker is an AI-powered personal finance platform for Canadians. Users upload financial
documents (statements, receipts, screenshots), the system extracts and categorizes transactions,
and provides spending insights — helping users understand where their money goes.

**Core value proposition:** "Upload anything. See where your money goes."

## Target Users

1. **Young professionals (25-35)** — 2-3 credit cards, no tracking habits, want visibility
2. **Students (18-24)** — tight budgets, need to track cash + small transactions
3. **New immigrant families** — multiple expense types, remittance tracking, price-conscious

Common traits: price-conscious, not using finance tools today, need simplicity over power.

## Design Principles

1. **Cost-first** — Self-funded MVP. Every architecture decision starts with "what does this cost?"
2. **Ship fast** — Working features over perfect design. 8-week MVP timeline.
3. **Simple over clever** — No over-engineering. Add complexity only when forced by real problems.
4. **Canadian-specific** — Categories, merchants, and insights designed for Canadian spending patterns.
5. **Document-first** — Users upload documents, not connect bank accounts. Lower trust barrier.

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CloudFront CDN                          │
│                                                             │
│   /*  → S3 (React SPA)       /api/*  → API Gateway v2      │
└────────────────────────────────────────┬────────────────────┘
                                         │
                               ┌─────────▼──────────┐
                               │   Lambda (512MB)    │
                               │   Node.js + Express │
                               └──┬─────┬────┬──────┘
                                  │     │    │
           ┌──────────────────────┘     │    └──────────────────┐
           │                            │                       │
┌──────────▼──────────┐    ┌────────────▼──────────┐   ┌───────▼────────┐
│   DynamoDB          │    │   S3 Uploads          │   │  Groq API      │
│   (5 tables)        │    │   PDF / CSV / Images  │   │  (free tier)   │
│                     │    │                        │   │                │
│   users             │    └────────────────────────┘   │  llama-3.1-8b  │
│   transactions      │                                 │  (categorize)  │
│   files             │                                 │                │
│   categories    NEW │                                 │  llama-3.2-11b │
│   merchants     NEW │                                 │  -vision (OCR) │
└─────────────────────┘                                 └────────────────┘
```

### Processing Pipeline

```
User uploads file (PDF / CSV / Image)
       │
       ▼
Frontend → presigned S3 URL → direct upload to S3
       │
       ▼
POST /api/files/:id/process (synchronous)
       │
       ├── Detect file type
       │
       ├── PDF  → pdf-parse → regex extraction → transactions
       ├── CSV  → papaparse → column detection → transactions
       └── Image → Groq Vision → JSON extraction → transactions
               │
               ▼
       Categorize each transaction:
         1. Merchant mapping table lookup ($0)
         2. Keyword rules ($0)
         3. Groq LLM — last resort ($0 on free tier)
               │
               ▼
       Store transactions in DynamoDB
```

### Categorization Strategy (3-Layer, Cost-Optimized)

```
LAYER 1: Merchant Mapping Table (DynamoDB)
  - Pre-seeded with ~500 Canadian merchants
  - Grows via admin additions + user corrections
  - Cost: $0 per lookup
  - Target hit rate: 70-80%

LAYER 2: Keyword Rules (in-memory)
  - Expanded keyword list for Canadian merchants
  - Cost: $0 (code logic)
  - Catches ~15% of remaining

LAYER 3: Groq LLM (fallback)
  - Only for truly unknown merchants
  - Cost: $0 (Groq free tier)
  - Auto-adds result to merchant mapping table
```

This means ~80% of transactions never touch the LLM.

---

## Technology Choices

### Backend: Node.js 20 + Express + esbuild

**Why:** Already built and deployed. Single bundled JS file (~5MB) for Lambda. No native
dependencies, fast cold starts. serverless-http wraps Express for Lambda.

**Considered but rejected:**
- Python/FastAPI — was the original backend, rewritten to Node.js for simpler Lambda bundling
- Go — better Lambda performance but slower development for a solo developer

### Frontend: React 19 + TypeScript + Vite + Tailwind

**Why:** Modern, fast build times, good ecosystem. Zustand for minimal state. React Query
for server state. Recharts for charts.

### Database: DynamoDB (pay-per-request)

**Why for MVP:** Already working. $0 at low scale. Clean abstraction layer in dynamodb.js
makes future migration contained.

**Known limitation:** Analytics queries require in-memory JavaScript aggregation instead of
SQL GROUP BY. This is fine for <100 users but will need migration to PostgreSQL in Phase 2-3.

**Migration plan:** When analytics logic exceeds ~30 lines of JS aggregation per endpoint,
migrate to PostgreSQL (Neon free tier). The dynamodb.js abstraction means replacing one file.

### LLM: Groq (free tier)

**Why:** $0 cost. Already integrated. Llama 3.1 8B for categorization, Llama 3.2 11B Vision
for receipt image extraction. Rate limits (30 req/min) are sufficient for MVP.

**Where LLM is used:**
- Categorizing unknown merchants (Layer 3 fallback only, ~20% of transactions)
- Extracting data from receipt images

**Where LLM is NOT used (rules instead):**
- Dashboard insights (JavaScript math)
- Spending comparisons (subtraction)
- Recurring detection (pattern matching)
- Budget alerts (threshold comparison)

### Image Processing: Groq Vision ($0)

**Why not AWS Textract:** Textract AnalyzeExpense ($0.01/page) is more accurate but adds SDK
dependency, IAM policy, and Terraform changes. At MVP volume (~20 receipts/month), we save
$0.20/month. Not worth the complexity.

**Upgrade path:** If accuracy drops below 60% on real receipts, swap to Textract. It's a
single function change.

### Infrastructure: Terraform + GitHub Actions

**Why:** Already built. S3 backend with native locking. GitHub Actions with OIDC (no stored
AWS keys). Push-to-main deploys automatically.

---

## Trade-Offs

### What We Chose

| Decision | Benefit | Cost |
|----------|---------|------|
| DynamoDB over PostgreSQL | Zero migration effort, $0 cost | Analytics queries require JS aggregation |
| Groq Vision over Textract | $0, one-function addition | ~75% accuracy vs ~92% for Textract |
| Synchronous processing | Simple code, no queue infra | Users wait 5-15s during processing |
| Single Lambda | One deployment unit, simple | All routes share cold start + timeout |
| Hardcoded admin role | Zero RBAC complexity | Only one admin (the developer) |
| No test suite for MVP | Ship faster | Bugs caught manually |

### What We Skipped

| Skipped | Why | Revisit When |
|---------|-----|--------------|
| Bank integrations (Plaid/Flinks) | Complex OAuth, ongoing cost, not needed for validation | Phase 4, after organic growth |
| Mobile native app | Mobile web with camera works | After 500+ users |
| SQS async processing | <10 users, sync is fine | Processing exceeds 30s or 50+ concurrent users |
| Email notifications (SES) | Setup overhead, zero value for known users | Phase 3, for unknown users |
| Multi-currency | Target users spend in CAD | Phase 2, if immigrant users request it |
| Household mode | Single-user validates core value first | Phase 3 |
| AI predictions | Rule-based insights cover 80% of value | Phase 3 |
| Complex ML pipeline | Not needed at MVP scale | When rule-based accuracy plateaus |
| Real-time processing | Polling every 2s is fine | Likely never needed |

---

## Cost Analysis

### MVP (<100 users)

```
Lambda:            $0.00   (1M free requests/month)
API Gateway:       $0.00   (1M free calls/month)
DynamoDB:          $0.00   (25 RCU + 25 WCU + 25GB free)
S3:                $0.00   (5GB free storage)
CloudFront:        $0.00   (1TB free transfer)
CloudWatch:        $0.00   (5GB free ingestion)
Groq API:          $0.00   (free tier)
────────────────────────
TOTAL:             $0/month
```

### At Scale

| Users | Monthly Cost | Action Needed |
|-------|-------------|---------------|
| <100 | $0 | Nothing — AWS free tier |
| 100 | $5-12 | Nothing — still negligible |
| 500 | $20-40 | Consider Groq paid plan |
| 1,000 | $50-75 | Introduce premium tier ($5.99/mo) |
| 5,000+ | $200-400 | Premium revenue exceeds costs |

### Main Cost Drivers (ranked)

1. **LLM API calls** — Mitigated by merchant mapping cache (80% hit rate)
2. **DynamoDB reads** — Mitigated by on-demand pricing + efficient GSI queries
3. **S3 storage** — Mitigated by lifecycle rules (90-day transition to IA)
4. **CloudWatch Logs** — First real cost after free tier expires. Reduce log verbosity.

---

## Database Schema

### Existing Tables

| Table | PK | GSI | Purpose |
|-------|-----|-----|---------|
| `fintracker-users` | `user_id` | `EmailIndex` (email) | User accounts |
| `fintracker-transactions` | `transaction_id` | `UserDateIndex` (user_id + date) | Transaction records |
| `fintracker-files` | `file_id` | `UserIndex` (user_id + upload_date) | Upload tracking |

### New Tables (MVP)

**`fintracker-categories`**
| Attribute | Type | Description |
|-----------|------|-------------|
| `category_id` | S (PK) | UUID |
| `name` | S | Display name (e.g., "Groceries") |
| `parent_id` | S | null for top-level, category_id for sub |
| `icon` | S | Icon identifier for frontend |
| `color` | S | Hex color for charts |
| `keywords` | L | Keyword list for rule-based matching |
| `is_active` | BOOL | Soft delete |
| `sort_order` | N | Display ordering |

**`fintracker-merchant-mappings`**
| Attribute | Type | Description |
|-----------|------|-------------|
| `merchant_pattern` | S (PK) | Normalized merchant name |
| `category_id` | S | Maps to categories table |
| `source` | S | "seed", "admin", "user_correction" |
| `match_count` | N | Times this mapping was used |

---

## API Endpoints

### Existing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/login | No | Login, returns JWT |
| POST | /api/files/upload | JWT | Get presigned S3 URL |
| POST | /api/files/:id/process | JWT | Process uploaded file |
| GET | /api/files | JWT | List user's files |
| GET | /api/transactions | JWT | List transactions (filterable) |
| PATCH | /api/transactions/:id | JWT | Update transaction category |
| GET | /api/dashboard/summary | JWT | Monthly spending analytics |
| GET | /api/health | No | Health check |

### New (MVP)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/categories | JWT | List all active categories |
| POST | /api/categories | Admin | Create category |
| PATCH | /api/categories/:id | Admin | Update category |
| DELETE | /api/categories/:id | Admin | Soft-delete category |
| GET | /api/merchants | Admin | List merchant mappings |
| POST | /api/merchants | Admin | Create merchant mapping |
| PATCH | /api/merchants/:pattern | Admin | Update merchant mapping |
| POST | /api/transactions | JWT | Manual transaction entry |
| DELETE | /api/transactions/:id | JWT | Delete transaction |
| GET | /api/dashboard/insights | JWT | Rule-based spending insights |

---

## Phased Roadmap

### Phase 1: MVP (Weeks 1-8) — Current focus

- Dynamic category system + admin module
- Canadian merchant seed database (~500 merchants)
- 3-layer categorization (merchant DB → keywords → LLM)
- Receipt/image upload via Groq Vision
- Enhanced dashboard (month-over-month, insights, top merchants)
- Manual transaction entry
- Transaction deletion
- Category correction auto-learning

### Phase 2: Budgeting & Intelligence (Months 3-4)

- Budget setting per category
- Recurring expense detection
- Budget alerts (approaching limit)
- Data export (CSV)
- Migrate to PostgreSQL (if analytics queries outgrow DynamoDB)
- Add test suite

### Phase 3: AI & Engagement (Months 5-6)

- LLM-generated monthly summaries (1 call/user/month)
- Smart notifications (email or push)
- Savings goals
- Tax-deductible expense tagging
- Custom user tags

### Phase 4: Platform Expansion (Months 7+)

- Mobile app (React Native)
- Bank integration (Flinks for Canadian banks)
- AI financial assistant (chat with your finances)
- Household mode
- Premium tier ($5.99/month)

---

## Key Files

```
backend/
  src/
    app.js                  # Express app with routes and middleware
    lambda.js               # Lambda entry point (serverless-http wrapper)
    local.js                # Local dev server (port 3001)
    config.js               # Environment variable config
    routes/
      auth.js               # Auth endpoints
      files.js              # File upload + processing
      transactions.js       # Transaction CRUD
      dashboard.js          # Dashboard analytics
    services/
      authService.js        # Password hashing + JWT
      fileService.js        # Upload/processing pipeline orchestrator
      parserService.js      # PDF + CSV parsing
      extractionService.js  # Transaction extraction from parsed data
      dashboardService.js   # Spending aggregation
    infrastructure/
      dynamodb.js           # ALL DynamoDB operations (single abstraction layer)
      s3.js                 # S3 presigned URLs + object retrieval
      llm.js                # Groq/OpenAI categorization + rule-based fallback

frontend/
  src/
    pages/                  # Dashboard, Upload, Transactions, Login, Signup
    components/             # UI components organized by feature
    api/                    # Axios API client functions
    store/                  # Zustand auth store
    hooks/                  # Custom hooks (useAuth, useTransactions)

infra/
  main.tf                   # Terraform backend + provider
  dynamodb.tf               # DynamoDB tables
  lambda.tf                 # Lambda + API Gateway
  s3.tf                     # S3 buckets
  cloudfront.tf             # CDN configuration
  iam.tf                    # IAM roles and policies
  variables.tf              # Input variables
  outputs.tf                # Output values
```
