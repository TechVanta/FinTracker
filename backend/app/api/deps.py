from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.domain.exceptions import AuthenticationError
from app.infrastructure.dynamodb.file_repo import FileRepository
from app.infrastructure.dynamodb.transaction_repo import TransactionRepository
from app.infrastructure.dynamodb.user_repo import UserRepository
from app.infrastructure.llm.factory import get_llm_provider
from app.infrastructure.s3.storage import S3StorageClient
from app.services.auth_service import AuthService
from app.services.categorization_service import CategorizationService
from app.services.dashboard_service import DashboardService
from app.services.extraction_service import ExtractionService
from app.services.file_service import FileService
from app.services.parser_service import ParserService
from app.services.transaction_service import TransactionService

security = HTTPBearer()


# --- Repository singletons ---


@lru_cache
def get_user_repo() -> UserRepository:
    return UserRepository()


@lru_cache
def get_transaction_repo() -> TransactionRepository:
    return TransactionRepository()


@lru_cache
def get_file_repo() -> FileRepository:
    return FileRepository()


@lru_cache
def get_s3_client() -> S3StorageClient:
    return S3StorageClient()


# --- Services ---


def get_auth_service(
    user_repo: UserRepository = Depends(get_user_repo),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(user_repo=user_repo, settings=settings)


def get_categorization_service(
    settings: Settings = Depends(get_settings),
) -> CategorizationService:
    llm = None
    if settings.LLM_API_KEY:
        try:
            llm = get_llm_provider(settings.LLM_PROVIDER, settings.LLM_API_KEY)
        except ValueError:
            pass
    return CategorizationService(llm_provider=llm)


def get_file_service(
    file_repo: FileRepository = Depends(get_file_repo),
    transaction_repo: TransactionRepository = Depends(get_transaction_repo),
    s3_client: S3StorageClient = Depends(get_s3_client),
    categorizer: CategorizationService = Depends(get_categorization_service),
) -> FileService:
    return FileService(
        file_repo=file_repo,
        transaction_repo=transaction_repo,
        s3_client=s3_client,
        parser=ParserService(),
        extractor=ExtractionService(),
        categorizer=categorizer,
    )


def get_transaction_service(
    transaction_repo: TransactionRepository = Depends(get_transaction_repo),
) -> TransactionService:
    return TransactionService(transaction_repo=transaction_repo)


def get_dashboard_service(
    transaction_repo: TransactionRepository = Depends(get_transaction_repo),
) -> DashboardService:
    return DashboardService(transaction_repo=transaction_repo)


# --- Auth dependency ---


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    auth_service: AuthService = Depends(get_auth_service),
) -> str:
    """Returns the user_id from the JWT token."""
    try:
        return auth_service.verify_token(credentials.credentials)
    except AuthenticationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
