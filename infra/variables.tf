variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "fintracker"
}

# The user_id of the admin user who can manage categories and merchant mappings.
# Set this after creating your first account — check DynamoDB users table for the value.
variable "admin_user_id" {
  description = "User ID of the admin user (from fintracker-users table)"
  type        = string
  default     = ""
}
