from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.entities import FileResponse, UploadRequest, UploadResponse
from app.domain.exceptions import FileProcessingError, NotFoundError
from app.services.file_service import FileService
from app.api.deps import get_current_user, get_file_service

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
def upload_file(
    body: UploadRequest,
    user_id: str = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service),
):
    file_id, upload_url = file_service.initiate_upload(
        user_id=user_id,
        filename=body.filename,
        content_type=body.content_type,
    )
    return UploadResponse(file_id=file_id, upload_url=upload_url)


@router.post("/{file_id}/process", response_model=FileResponse)
async def process_file(
    file_id: str,
    user_id: str = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service),
):
    try:
        result = await file_service.process_file(file_id=file_id, user_id=user_id)
        return FileResponse(
            file_id=result.file_id,
            original_filename=result.original_filename,
            file_type=result.file_type,
            status=result.status,
            upload_date=result.upload_date,
            transaction_count=result.transaction_count,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)
    except FileProcessingError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)


@router.get("", response_model=list[FileResponse])
def list_files(
    user_id: str = Depends(get_current_user),
    file_service: FileService = Depends(get_file_service),
):
    files = file_service.get_user_files(user_id)
    return [
        FileResponse(
            file_id=f.file_id,
            original_filename=f.original_filename,
            file_type=f.file_type,
            status=f.status,
            upload_date=f.upload_date,
            transaction_count=f.transaction_count,
        )
        for f in files
    ]
