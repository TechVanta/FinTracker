from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.domain.enums import FileStatus, TransactionCategory


class User(BaseModel):
    user_id: str
    email: EmailStr
    password_hash: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class Transaction(BaseModel):
    transaction_id: str
    user_id: str
    date: str
    description: str
    amount: float
    category: TransactionCategory = TransactionCategory.OTHER
    file_id: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class FileRecord(BaseModel):
    file_id: str
    user_id: str
    s3_key: str
    original_filename: str
    file_type: str
    status: FileStatus = FileStatus.PENDING
    upload_date: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    transaction_count: int = 0


# --- API Schemas ---

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str


class UploadRequest(BaseModel):
    filename: str
    content_type: str = Field(pattern=r"^(application/pdf|text/csv)$")


class UploadResponse(BaseModel):
    file_id: str
    upload_url: str


class FileResponse(BaseModel):
    file_id: str
    original_filename: str
    file_type: str
    status: FileStatus
    upload_date: str
    transaction_count: int


class TransactionResponse(BaseModel):
    transaction_id: str
    date: str
    description: str
    amount: float
    category: TransactionCategory
    file_id: str


class UpdateCategoryRequest(BaseModel):
    category: TransactionCategory


class DashboardSummary(BaseModel):
    total_spending: float
    category_breakdown: dict[str, float]
    monthly_trend: list[dict]
    transaction_count: int
