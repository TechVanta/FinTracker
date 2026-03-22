# FinTracker - Project Guide

## Overview

FinTracker is a serverless financial analytics web application. Users upload bank/credit card
statements (PDF or CSV), the system extracts transactions, categorizes them via LLM (with
rule-based fallback), and displays a dashboard with spending analytics.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand (client state), React Query (server state), Recharts (charts)
- **Backend**: Python 3.11, FastAPI, Pydantic v2, Mangum (ASGI-to-Lambda adapter)
- **Database**: DynamoDB (3 tables: users, transactions, files)
- **Storage**: S3 (file uploads + frontend hosting)
- **CDN**: CloudFront (serves frontend + proxies /api/* to API Gateway)
- **Compute**: AWS Lambda (single function wrapping entire FastAPI app)
- **IaC**: Terraform with S3 backend (bucket: terraform-state-geekyrbhalala, key: fintracker/terraform.tfstate)
- **CI/CD**: GitHub Actions with OIDC authentication

## Architecture

### Clean Architecture (Backend)

The backend follows strict clean architecture with 4 layers. Dependencies point inward only.

```
API Layer        → backend/app/api/          (FastAPI routes, request/response handling)
Service Layer    → backend/app/services/     (business logic, orchestration)
Domain Layer     → backend/app/domain/       (entities, enums, exceptions - zero dependencies)
Infrastructure   → backend/app/infrastructure/ (DynamoDB, S3, LLM providers)
```

### File Processing Pipeline

```
Upload → S3 (presigned URL) → Parse (PDF/CSV) → Extract transactions → Categorize (LLM) → Store in DynamoDB
```

The presigned URL pattern keeps large files off Lambda (bypasses the 6MB API Gateway payload limit).

### LLM Integration

LLM is used ONLY for transaction categorization. The design is provider-agnostic:

- Abstract interface: `backend/app/infrastructure/llm/base.py`
- Concrete providers: `grok_provider.py`, `openai_provider.py`
- Factory: `backend/app/infrastructure/llm/factory.py`
- Provider selected at runtime via `LLM_PROVIDER` env var
- Fallback: keyword-based rules in `backend/app/services/categorization_service.py`

Categories: Food, Travel, Groceries, Bills, Shopping, Entertainment, Other

## Project Structure

```
backend/
  app/
    api/routes/          # FastAPI route handlers
    api/deps.py          # Dependency injection (composition root)
    domain/              # Pydantic models, enums, exceptions
    services/            # Business logic (auth, parser, extraction, categorization, dashboard)
    infrastructure/
      dynamodb/          # Repository classes for each DynamoDB table
      s3/                # S3 storage client (presigned URLs, get/put objects)
      llm/               # Abstract LLM interface + concrete providers
    config.py            # Settings via pydantic-settings (env vars)
    main.py              # FastAPI app creation, middleware, exception handlers
  lambda_handler.py      # Mangum adapter entry point
  tests/
    unit/                # Tests for parser, extraction, categorization, auth
    integration/         # API endpoint tests with moto mocks

frontend/
  src/
    api/                 # Axios client + endpoint functions
    components/          # UI (ui/, layout/, auth/, dashboard/, files/, transactions/)
    hooks/               # React Query hooks (useAuth, useTransactions)
    pages/               # Page components (Login, Signup, Dashboard, Upload, Transactions)
    store/               # Zustand stores (authStore, uiStore)
    router.tsx           # React Router configuration

infra/
  main.tf               # Terraform backend (S3, use_lockfile), AWS provider
  dynamodb.tf           # 3 tables with GSIs
  s3.tf                 # Uploads bucket + frontend bucket
  lambda.tf             # Lambda function, API Gateway HTTP API, auto-generated JWT secret
  cloudfront.tf         # CDN distribution with OAC + SPA routing
  iam.tf                # Lambda execution role with DynamoDB + S3 policies
```

## DynamoDB Tables

| Table | Partition Key | GSI |
|-------|--------------|-----|
| fintracker-users | user_id | EmailIndex (email) |
| fintracker-transactions | transaction_id | UserDateIndex (user_id + date) |
| fintracker-files | file_id | UserIndex (user_id + upload_date) |

## Key API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/login | No | Login, get JWT |
| POST | /api/files/upload | Yes | Get presigned S3 upload URL |
| POST | /api/files/{id}/process | Yes | Trigger processing pipeline |
| GET | /api/files | Yes | List uploaded files |
| GET | /api/transactions | Yes | List transactions (filterable) |
| PATCH | /api/transactions/{id} | Yes | Update transaction category |
| GET | /api/dashboard/summary | Yes | Aggregated spending analytics |

## Environment Variables

Backend reads config via pydantic-settings. In production, these are set as Lambda env vars by Terraform.

| Variable | Source | Description |
|----------|--------|-------------|
| AWS_REGION | Terraform | AWS region |
| DYNAMODB_*_TABLE | Terraform | Table names |
| S3_UPLOADS_BUCKET | Terraform | Uploads bucket name |
| JWT_SECRET | Terraform (auto-generated) | Signing key for JWT tokens |
| LLM_API_KEY | GitHub Actions (from secrets) | LLM provider API key |
| LLM_PROVIDER | GitHub Actions (from secrets) | Provider name (groq/openai) |
| CORS_ORIGINS | Terraform | Allowed origins for CORS |

## GitHub Secrets (Organization Level)

Only 3 secrets are needed:

| Secret | Purpose |
|--------|---------|
| AWS_ROLE_ARN | IAM role for GitHub OIDC authentication |
| LLM_API_KEY | API key for the LLM provider |
| LLM_PROVIDER | Provider name (e.g., groq) |

JWT_SECRET is NOT a GitHub secret - it is auto-generated by Terraform via `random_password`.

## Deployment Order

1. `cd infra && terraform init && terraform apply` (creates all AWS infrastructure)
2. Push to `main` triggers GitHub Actions:
   - `deploy-backend.yml` packages and deploys Lambda
   - `deploy-frontend.yml` builds React app and syncs to S3 + invalidates CloudFront

## Running Locally

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev

# Tests
cd backend && pytest -v
```

## Terraform State

- Bucket: `terraform-state-geekyrbhalala`
- Key: `fintracker/terraform.tfstate`
- Locking: S3-native lockfile (`use_lockfile = true`), NO DynamoDB lock table
- Required Terraform version: >= 1.10

## Important Conventions

- Backend uses `async` for LLM calls and file processing, sync for DynamoDB operations
- DynamoDB stores amounts as `Decimal`; conversion happens in the repository layer
- All timestamps are ISO 8601 strings
- File upload uses presigned URLs (frontend uploads directly to S3)
- CloudFront handles SPA routing (403/404 → /index.html with 200)
