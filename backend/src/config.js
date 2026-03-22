const config = {
  region: process.env.AWS_REGION || "us-east-1",
  dynamodb: {
    usersTable: process.env.DYNAMODB_USERS_TABLE || "fintracker-users",
    transactionsTable: process.env.DYNAMODB_TRANSACTIONS_TABLE || "fintracker-transactions",
    filesTable: process.env.DYNAMODB_FILES_TABLE || "fintracker-files",
  },
  s3: {
    uploadsBucket: process.env.S3_UPLOADS_BUCKET || "fintracker-uploads",
  },
  jwt: {
    secret: process.env.JWT_SECRET || "local-dev-secret",
    expiresIn: "24h",
  },
  llm: {
    apiKey: process.env.LLM_API_KEY || "",
    provider: process.env.LLM_PROVIDER || "groq",
  },
  corsOrigins: process.env.CORS_ORIGINS || "*",
};

export default config;
