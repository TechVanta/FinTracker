import os

import pytest
from moto import mock_aws

from app.config import Settings
from app.domain.exceptions import AuthenticationError, DuplicateError
from app.infrastructure.dynamodb.user_repo import UserRepository
from app.services.auth_service import AuthService


@pytest.fixture
def settings():
    return Settings(
        JWT_SECRET="test-secret",
        JWT_ALGORITHM="HS256",
        JWT_EXPIRY_HOURS=1,
    )


@pytest.fixture
def auth_service(dynamodb_tables, settings):
    # Clear the lru_cache so it picks up the mock
    from app.infrastructure.dynamodb.client import get_dynamodb_resource, get_table
    get_dynamodb_resource.cache_clear()

    repo = UserRepository()
    return AuthService(user_repo=repo, settings=settings)


class TestAuthService:
    def test_signup_creates_user(self, auth_service):
        result = auth_service.signup("test@example.com", "password123")
        assert result.email == "test@example.com"
        assert result.token is not None
        assert result.user_id is not None

    def test_signup_duplicate_email_fails(self, auth_service):
        auth_service.signup("test@example.com", "password123")
        with pytest.raises(DuplicateError):
            auth_service.signup("test@example.com", "password456")

    def test_login_success(self, auth_service):
        auth_service.signup("test@example.com", "password123")
        result = auth_service.login("test@example.com", "password123")
        assert result.email == "test@example.com"
        assert result.token is not None

    def test_login_wrong_password(self, auth_service):
        auth_service.signup("test@example.com", "password123")
        with pytest.raises(AuthenticationError):
            auth_service.login("test@example.com", "wrongpassword")

    def test_login_nonexistent_email(self, auth_service):
        with pytest.raises(AuthenticationError):
            auth_service.login("nobody@example.com", "password123")

    def test_verify_token(self, auth_service):
        result = auth_service.signup("test@example.com", "password123")
        user_id = auth_service.verify_token(result.token)
        assert user_id == result.user_id

    def test_verify_invalid_token(self, auth_service):
        with pytest.raises(AuthenticationError):
            auth_service.verify_token("invalid.token.here")
