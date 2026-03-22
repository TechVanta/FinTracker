from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.entities import TransactionResponse, UpdateCategoryRequest
from app.domain.exceptions import NotFoundError
from app.services.transaction_service import TransactionService
from app.api.deps import get_current_user, get_transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    start_date: str | None = Query(None, description="Filter from date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter to date (YYYY-MM-DD)"),
    category: str | None = Query(None, description="Filter by category"),
    user_id: str = Depends(get_current_user),
    txn_service: TransactionService = Depends(get_transaction_service),
):
    transactions = txn_service.get_transactions(
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        category=category,
    )
    return [
        TransactionResponse(
            transaction_id=t.transaction_id,
            date=t.date,
            description=t.description,
            amount=t.amount,
            category=t.category,
            file_id=t.file_id,
        )
        for t in transactions
    ]


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction_category(
    transaction_id: str,
    body: UpdateCategoryRequest,
    user_id: str = Depends(get_current_user),
    txn_service: TransactionService = Depends(get_transaction_service),
):
    try:
        t = txn_service.update_category(transaction_id, body.category)
        return TransactionResponse(
            transaction_id=t.transaction_id,
            date=t.date,
            description=t.description,
            amount=t.amount,
            category=t.category,
            file_id=t.file_id,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
