# =============================================================================
# DynamoDB Tables — FinTracker
# All tables use PAY_PER_REQUEST (on-demand) billing for $0 cost at low scale.
# =============================================================================

# --- Users Table ---
# Stores user accounts. EmailIndex allows login lookup by email address.
resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }
}

# --- Transactions Table ---
# Stores individual financial transactions extracted from uploaded documents
# or entered manually. UserDateIndex enables efficient per-user date range queries
# which power the dashboard and insights engine.
resource "aws_dynamodb_table" "transactions" {
  name         = "${var.project_name}-transactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "transaction_id"

  attribute {
    name = "transaction_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    name            = "UserDateIndex"
    hash_key        = "user_id"
    range_key       = "date"
    projection_type = "ALL"
  }
}

# --- Files Table ---
# Tracks uploaded documents (PDFs, CSVs, receipt images) and their processing status.
# UserIndex allows listing a user's uploads sorted by date.
resource "aws_dynamodb_table" "files" {
  name         = "${var.project_name}-files"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "file_id"

  attribute {
    name = "file_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "upload_date"
    type = "S"
  }

  global_secondary_index {
    name            = "UserIndex"
    hash_key        = "user_id"
    range_key       = "upload_date"
    projection_type = "ALL"
  }
}

# --- Categories Table ---
# Dynamic, admin-managed spending categories (e.g., Groceries, Dining, Transportation).
# Supports hierarchy via parent_id (null = top-level, set = subcategory).
# This replaces the old hardcoded CATEGORIES array — categories can now be added,
# edited, and deactivated without code deployments.
resource "aws_dynamodb_table" "categories" {
  name         = "${var.project_name}-categories"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "category_id"

  attribute {
    name = "category_id"
    type = "S"
  }
}

# --- Merchant Mappings Table ---
# Maps normalized merchant names (e.g., "tim hortons") to category IDs.
# This is Layer 1 of the 3-layer categorization pipeline — the fastest and cheapest
# lookup. Pre-seeded with ~500 Canadian merchants, grows automatically when:
#   1. Admin manually adds a mapping
#   2. A user corrects a transaction's category (auto-learning)
#   3. LLM categorizes an unknown merchant (result cached here)
resource "aws_dynamodb_table" "merchant_mappings" {
  name         = "${var.project_name}-merchant-mappings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "merchant_pattern"

  attribute {
    name = "merchant_pattern"
    type = "S"
  }
}
