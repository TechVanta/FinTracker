# FinTracker

Financial analytics web application for uploading bank/credit card statements, extracting transactions, auto-categorizing spending via LLM, and visualizing financial data on an interactive dashboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Zustand, React Query, Recharts |
| **Backend** | Python 3.11, FastAPI, Pydantic v2, Mangum |
| **Database** | AWS DynamoDB (3 tables) |
| **Storage** | AWS S3 (uploads + frontend hosting) |
| **Compute** | AWS Lambda (single function) |
| **CDN** | AWS CloudFront |
| **API** | AWS API Gateway (HTTP API) |
| **IaC** | Terraform (S3 backend with native locking) |
| **CI/CD** | GitHub Actions (OIDC auth) |
| **LLM** | Provider-agnostic (Groq, OpenAI, etc.) |

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              CloudFront CDN                 │
                         │         (single entry point)                │
                         │                                             │
                         │  /*        → S3 Frontend (React SPA)        │
                         │  /api/*    → API Gateway → Lambda           │
                         └──────────┬────────────────┬─────────────────┘
                                    │                │
                    ┌───────────────▼──┐    ┌───────▼──────────────┐
                    │  S3 Frontend     │    │  API Gateway (HTTP)  │
                    │  (static files)  │    └───────┬──────────────┘
                    └──────────────────┘            │
                                           ┌───────▼──────────────┐
                                           │  AWS Lambda          │
                                           │  (FastAPI + Mangum)  │
                                           └──┬─────┬─────┬──────┘
                                              │     │     │
                              ┌───────────────┘     │     └──────────────┐
                              ▼                     ▼                    ▼
                        ┌──────────┐         ┌──────────┐         ┌──────────┐
                        │ DynamoDB │         │    S3    │         │   LLM    │
                        │ 3 tables │         │ uploads  │         │  (Groq)  │
                        └──────────┘         └──────────┘         └──────────┘
```

### Backend Clean Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  API Layer          (app/api/)           HTTP routes, auth  │
├─────────────────────────────────────────────────────────────┤
│  Service Layer      (app/services/)      Business logic     │
├─────────────────────────────────────────────────────────────┤
│  Domain Layer       (app/domain/)        Entities, enums    │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure     (app/infrastructure/) DynamoDB, S3, LLM │
└─────────────────────────────────────────────────────────────┘
```

### File Processing Pipeline

```
User uploads file
       │
       ▼
POST /api/files/upload → returns presigned S3 URL + file_id
       │
       ▼
Frontend uploads directly to S3 (bypasses Lambda 6MB limit)
       │
       ▼
POST /api/files/{id}/process → triggers pipeline:
       │
       ├── Download from S3
       ├── Parse (PDF via pdfplumber / CSV via csv.DictReader)
       ├── Extract transactions (regex + column detection)
       ├── Categorize via LLM (with keyword-based fallback)
       └── Store in DynamoDB
```

## Project Structure

```
FinTracker/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py                    # Dependency injection
│   │   │   └── routes/
│   │   │       ├── auth.py                # POST /auth/signup, /auth/login
│   │   │       ├── files.py               # POST /files/upload, /files/{id}/process
│   │   │       ├── transactions.py        # GET /transactions, PATCH /transactions/{id}
│   │   │       └── dashboard.py           # GET /dashboard/summary
│   │   ├── domain/
│   │   │   ├── entities.py                # Pydantic models (User, Transaction, FileRecord)
│   │   │   ├── enums.py                   # TransactionCategory, FileStatus, LLMProviderType
│   │   │   └── exceptions.py              # Domain errors
│   │   ├── services/
│   │   │   ├── auth_service.py            # JWT + bcrypt auth
│   │   │   ├── parser_service.py          # PDF/CSV parsing
│   │   │   ├── extraction_service.py      # Transaction extraction
│   │   │   ├── categorization_service.py  # LLM + rule-based fallback
│   │   │   ├── file_service.py            # Upload/processing orchestrator
│   │   │   ├── transaction_service.py     # Transaction CRUD
│   │   │   └── dashboard_service.py       # Analytics aggregation
│   │   ├── infrastructure/
│   │   │   ├── dynamodb/                  # Repository classes (user, transaction, file)
│   │   │   ├── s3/                        # S3 storage client
│   │   │   └── llm/                       # Abstract LLM interface + providers
│   │   ├── config.py                      # Environment-based settings
│   │   └── main.py                        # FastAPI app
│   ├── lambda_handler.py                  # Mangum entry point
│   ├── tests/
│   │   ├── unit/                          # Parser, extraction, categorization, auth tests
│   │   └── integration/                   # API endpoint tests
│   ├── requirements.txt
│   └── requirements-dev.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/                           # Axios client + API functions
│   │   ├── components/
│   │   │   ├── ui/                        # Button, Input, Card, Spinner
│   │   │   ├── layout/                    # Sidebar, TopBar, AppLayout
│   │   │   ├── auth/                      # LoginForm, SignupForm
│   │   │   ├── dashboard/                 # Charts, RecentTransactions
│   │   │   ├── files/                     # FileUpload, FileList
│   │   │   └── transactions/              # TransactionTable
│   │   ├── hooks/                         # useAuth, useTransactions
│   │   ├── pages/                         # Login, Signup, Dashboard, Upload, Transactions
│   │   ├── store/                         # Zustand stores (auth)
│   │   └── router.tsx                     # React Router config
│   ├── package.json
│   └── vite.config.ts
│
├── infra/
│   ├── main.tf                            # Terraform backend (S3) + AWS provider
│   ├── dynamodb.tf                        # 3 tables with GSIs
│   ├── s3.tf                              # Uploads bucket + frontend bucket
│   ├── lambda.tf                          # Lambda + API Gateway + auto-generated JWT secret
│   ├── cloudfront.tf                      # CDN with OAC + SPA routing
│   ├── iam.tf                             # Lambda execution role
│   ├── variables.tf                       # Input variables
│   └── outputs.tf                         # API URL, CloudFront domain, bucket names
│
├── .github/workflows/
│   ├── ci.yml                             # Lint + test on PR
│   ├── deploy-backend.yml                 # Package + deploy Lambda on push to main
│   └── deploy-frontend.yml                # Build + S3 sync + CloudFront invalidation
│
├── CLAUDE.md                              # Project guide for Claude Code
└── README.md
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/signup` | No | Create account (email + password) |
| `POST` | `/api/auth/login` | No | Login, returns JWT token |
| `POST` | `/api/files/upload` | JWT | Returns presigned S3 upload URL |
| `POST` | `/api/files/{id}/process` | JWT | Triggers extraction pipeline |
| `GET` | `/api/files` | JWT | List user's uploaded files |
| `GET` | `/api/transactions` | JWT | List transactions (filter by date/category) |
| `PATCH` | `/api/transactions/{id}` | JWT | Update transaction category |
| `GET` | `/api/dashboard/summary` | JWT | Monthly spending analytics |
| `GET` | `/api/health` | No | Health check |

### Example Requests

**Signup:**
```bash
curl -X POST https://<cloudfront-domain>/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepass123"}'
```

**Upload flow:**
```bash
# Step 1: Get presigned URL
curl -X POST https://<cloudfront-domain>/api/files/upload \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"filename": "statement.csv", "content_type": "text/csv"}'

# Step 2: Upload file directly to S3
curl -X PUT "<presigned-url>" \
  -H "Content-Type: text/csv" \
  --data-binary @statement.csv

# Step 3: Process
curl -X POST https://<cloudfront-domain>/api/files/<file-id>/process \
  -H "Authorization: Bearer <jwt-token>"
```

**Dashboard:**
```bash
curl "https://<cloudfront-domain>/api/dashboard/summary?month=3&year=2026" \
  -H "Authorization: Bearer <jwt-token>"
```

## DynamoDB Tables

| Table | PK | GSI | Purpose |
|-------|----|-----|---------|
| `fintracker-users` | `user_id` | `EmailIndex` (email) | User accounts |
| `fintracker-transactions` | `transaction_id` | `UserDateIndex` (user_id + date) | Transaction records |
| `fintracker-files` | `file_id` | `UserIndex` (user_id + upload_date) | Upload tracking |

## LLM Integration

The categorization engine is provider-agnostic via an abstract `LLMProvider` interface:

- Provider is selected at runtime by `LLM_PROVIDER` environment variable
- Supported categories: Food, Travel, Groceries, Bills, Shopping, Entertainment, Other
- If the LLM call fails, automatic fallback to keyword-based rules
- LLM is used ONLY for categorization (not parsing)

To add a new provider: create a class implementing `LLMProvider.categorize()` and register it in the factory.

## GitHub Secrets Required

Only **3 secrets** at the organization level:

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | IAM role ARN for GitHub OIDC authentication |
| `LLM_API_KEY` | API key for the LLM provider (e.g., Groq) |
| `LLM_PROVIDER` | Provider name (e.g., `groq`) |

> JWT signing secret is auto-generated by Terraform — no manual setup needed.

## Deployment

### Prerequisites
- Terraform >= 1.10
- AWS CLI configured (or use the OIDC role)
- Node.js 20+, Python 3.11+

### First-Time Setup

```bash
# 1. Create AWS infrastructure
cd infra
terraform init
terraform plan
terraform apply

# 2. Note the outputs:
#    - cloudfront_domain  → your app URL
#    - api_gateway_url    → API endpoint
#    - frontend_bucket    → S3 bucket for frontend
#    - lambda_function_name → Lambda function name
```

### Ongoing Deployment

Push to `main` branch triggers automatic deployment:
- **Backend changes** (`backend/**`) → packages and deploys Lambda
- **Frontend changes** (`frontend/**`) → builds, syncs to S3, invalidates CloudFront

### Terraform State

- **Bucket**: `terraform-state-geekyrbhalala`
- **Key**: `fintracker/terraform.tfstate`
- **Locking**: S3-native lockfile (no DynamoDB table)

## Local Development

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env             # Edit with your values
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                      # Starts on http://localhost:5173
```

Vite proxies `/api` requests to `http://localhost:8000` in dev mode.

### Running Tests
```bash
cd backend
pytest -v
```

Tests use `moto` to mock AWS services (DynamoDB, S3) — no AWS credentials needed.

## Cost

For MVP traffic, this runs within AWS Free Tier (~$0/month):
- Lambda: 1M requests/mo free
- API Gateway: 1M calls/mo free
- DynamoDB: 25 GB + 25 RCU/WCU free
- S3: 5 GB free
- CloudFront: 1 TB transfer free
