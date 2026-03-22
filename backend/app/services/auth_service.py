import logging
import uuid
from datetime import datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.config import Settings
from app.domain.entities import AuthResponse, User
from app.domain.exceptions import AuthenticationError, DuplicateError
from app.infrastructure.dynamodb.user_repo import UserRepository

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, user_repo: UserRepository, settings: Settings):
        self._user_repo = user_repo
        self._settings = settings

    def signup(self, email: str, password: str) -> AuthResponse:
        existing = self._user_repo.get_by_email(email)
        if existing:
            raise DuplicateError("User with this email already exists")

        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        user = User(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash=password_hash,
        )
        self._user_repo.create(user)

        token = self._create_token(user)
        logger.info("User signed up: %s", user.user_id)
        return AuthResponse(token=token, user_id=user.user_id, email=user.email)

    def login(self, email: str, password: str) -> AuthResponse:
        user = self._user_repo.get_by_email(email)
        if not user:
            raise AuthenticationError("Invalid email or password")

        if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
            raise AuthenticationError("Invalid email or password")

        token = self._create_token(user)
        logger.info("User logged in: %s", user.user_id)
        return AuthResponse(token=token, user_id=user.user_id, email=user.email)

    def verify_token(self, token: str) -> str:
        try:
            payload = jwt.decode(
                token,
                self._settings.JWT_SECRET,
                algorithms=[self._settings.JWT_ALGORITHM],
            )
            user_id: str = payload.get("sub")
            if user_id is None:
                raise AuthenticationError("Invalid token")
            return user_id
        except JWTError as e:
            raise AuthenticationError(f"Invalid token: {e}")

    def _create_token(self, user: User) -> str:
        payload = {
            "sub": user.user_id,
            "email": user.email,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=self._settings.JWT_EXPIRY_HOURS),
        }
        return jwt.encode(
            payload,
            self._settings.JWT_SECRET,
            algorithm=self._settings.JWT_ALGORITHM,
        )
