import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.domain.exceptions import (
    AuthenticationError,
    DomainError,
    DuplicateError,
    FileProcessingError,
    NotFoundError,
)
from app.api.routes import auth, dashboard, files, transactions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

settings = get_settings()

app = FastAPI(
    title="FinTracker API",
    version="0.1.0",
    description="Financial Analytics API - Upload statements, extract transactions, categorize spending",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


# Exception handlers
@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(status_code=404, content={"detail": exc.message})


@app.exception_handler(AuthenticationError)
async def auth_error_handler(request: Request, exc: AuthenticationError):
    return JSONResponse(status_code=401, content={"detail": exc.message})


@app.exception_handler(DuplicateError)
async def duplicate_handler(request: Request, exc: DuplicateError):
    return JSONResponse(status_code=409, content={"detail": exc.message})


@app.exception_handler(FileProcessingError)
async def file_processing_handler(request: Request, exc: FileProcessingError):
    return JSONResponse(status_code=422, content={"detail": exc.message})


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=400, content={"detail": exc.message})


@app.get("/api/health")
def health_check():
    import boto3
    import os
    try:
        dynamodb = boto3.client("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        tables = [
            settings.DYNAMODB_USERS_TABLE,
            settings.DYNAMODB_TRANSACTIONS_TABLE,
            settings.DYNAMODB_FILES_TABLE,
        ]
        table_status = {}
        for table_name in tables:
            resp = dynamodb.describe_table(TableName=table_name)
            table_status[table_name] = resp["Table"]["TableStatus"]
        return {
            "status": "healthy",
            "version": "0.1.0",
            "tables": table_status,
            "region": os.environ.get("AWS_REGION", "unknown"),
            "s3_bucket": settings.S3_UPLOADS_BUCKET,
        }
    except Exception as e:
        return {
            "status": "degraded",
            "version": "0.1.0",
            "error": f"{type(e).__name__}: {e}",
        }
