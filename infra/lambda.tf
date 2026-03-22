# --- Auto-generated JWT secret (created once, stable in Terraform state) ---
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# --- Lambda Function ---
resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "lambda.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  memory_size   = 512

  filename         = "${path.module}/../backend/lambda.zip"
  source_code_hash = fileexists("${path.module}/../backend/lambda.zip") ? filebase64sha256("${path.module}/../backend/lambda.zip") : null

  environment {
    variables = {
      DYNAMODB_USERS_TABLE           = aws_dynamodb_table.users.name
      DYNAMODB_TRANSACTIONS_TABLE    = aws_dynamodb_table.transactions.name
      DYNAMODB_FILES_TABLE           = aws_dynamodb_table.files.name
      S3_UPLOADS_BUCKET              = aws_s3_bucket.uploads.id
      JWT_SECRET                     = random_password.jwt_secret.result
      CORS_ORIGINS                   = "*"
    }
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# --- API Gateway HTTP API ---
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_cloudwatch_log_group" "api_gw" {
  name              = "/aws/apigateway/${var.project_name}-api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14
}
