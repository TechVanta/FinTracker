from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    AWS_REGION: str = "us-east-1"
    DYNAMODB_USERS_TABLE: str = "fintracker-users"
    DYNAMODB_TRANSACTIONS_TABLE: str = "fintracker-transactions"
    DYNAMODB_FILES_TABLE: str = "fintracker-files"
    S3_UPLOADS_BUCKET: str = "fintracker-uploads"

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24

    LLM_API_KEY: str = ""
    LLM_PROVIDER: str = "grok"

    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
