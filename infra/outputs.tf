output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "frontend_bucket" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "uploads_bucket" {
  description = "Uploads S3 bucket name"
  value       = aws_s3_bucket.uploads.id
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "categories_table" {
  description = "Categories DynamoDB table name"
  value       = aws_dynamodb_table.categories.name
}

output "merchant_mappings_table" {
  description = "Merchant mappings DynamoDB table name"
  value       = aws_dynamodb_table.merchant_mappings.name
}
