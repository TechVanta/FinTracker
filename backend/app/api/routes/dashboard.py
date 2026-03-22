from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.domain.entities import DashboardSummary
from app.services.dashboard_service import DashboardService
from app.api.deps import get_current_user, get_dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    month: int = Query(default_factory=lambda: datetime.utcnow().month, ge=1, le=12),
    year: int = Query(default_factory=lambda: datetime.utcnow().year, ge=2000, le=2100),
    user_id: str = Depends(get_current_user),
    dashboard_service: DashboardService = Depends(get_dashboard_service),
):
    return dashboard_service.get_summary(user_id=user_id, month=month, year=year)
