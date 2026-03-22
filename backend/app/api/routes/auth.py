import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.entities import AuthResponse, LoginRequest, SignupRequest
from app.domain.exceptions import AuthenticationError, DuplicateError
from app.services.auth_service import AuthService
from app.api.deps import get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        return auth_service.signup(email=body.email, password=body.password)
    except DuplicateError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)
    except Exception as e:
        logger.exception("Signup failed for %s", body.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {type(e).__name__}: {e}",
        )


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        return auth_service.login(email=body.email, password=body.password)
    except AuthenticationError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)
    except Exception as e:
        logger.exception("Login failed for %s", body.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {type(e).__name__}: {e}",
        )
