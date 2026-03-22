// =============================================================================
// Application Configuration
// =============================================================================
// Centralizes all environment-based configuration. Every external dependency
// (DynamoDB tables, S3 buckets, API keys) is configured here so the rest of
// the codebase never reads process.env directly.
//
// In production (Lambda), these are set by Terraform via Lambda environment
// variables. In local dev, they fall back to sensible defaults.
// =============================================================================

const config = {
  // AWS region for all SDK clients
  region: process.env.AWS_REGION || "us-east-1",

  // DynamoDB table names — must match Terraform resource names
  dynamodb: {
    usersTable: process.env.DYNAMODB_USERS_TABLE || "fintracker-users",
    transactionsTable: process.env.DYNAMODB_TRANSACTIONS_TABLE || "fintracker-transactions",
    filesTable: process.env.DYNAMODB_FILES_TABLE || "fintracker-files",
    categoriesTable: process.env.DYNAMODB_CATEGORIES_TABLE || "fintracker-categories",
    merchantsTable: process.env.DYNAMODB_MERCHANTS_TABLE || "fintracker-merchant-mappings",
  },

  // S3 bucket for uploaded files (PDFs, CSVs, receipt images)
  s3: {
    uploadsBucket: process.env.S3_UPLOADS_BUCKET || "fintracker-uploads",
  },

  // JWT authentication settings
  jwt: {
    secret: process.env.JWT_SECRET || "local-dev-secret",
    expiresIn: "24h",
  },

  // LLM provider configuration (Groq free tier for MVP)
  llm: {
    apiKey: process.env.LLM_API_KEY || "",
    provider: process.env.LLM_PROVIDER || "groq",
  },

  // CORS — "*" for MVP, restrict to CloudFront domain in production
  corsOrigins: process.env.CORS_ORIGINS || "*",

  // Admin user ID — the single user who can manage categories and merchant mappings.
  // Set via Terraform variable (admin_user_id). For local dev, any value works.
  adminUserId: process.env.ADMIN_USER_ID || "",
};

export default config;
