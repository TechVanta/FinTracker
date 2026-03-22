import logging
import uuid

from app.domain.entities import FileRecord, Transaction
from app.domain.enums import FileStatus
from app.domain.exceptions import FileProcessingError, NotFoundError
from app.infrastructure.dynamodb.file_repo import FileRepository
from app.infrastructure.dynamodb.transaction_repo import TransactionRepository
from app.infrastructure.s3.storage import S3StorageClient
from app.services.categorization_service import CategorizationService
from app.services.extraction_service import ExtractionService
from app.services.parser_service import ParserService

logger = logging.getLogger(__name__)


class FileService:
    """Orchestrates the file upload and processing pipeline."""

    def __init__(
        self,
        file_repo: FileRepository,
        transaction_repo: TransactionRepository,
        s3_client: S3StorageClient,
        parser: ParserService,
        extractor: ExtractionService,
        categorizer: CategorizationService,
    ):
        self._file_repo = file_repo
        self._transaction_repo = transaction_repo
        self._s3 = s3_client
        self._parser = parser
        self._extractor = extractor
        self._categorizer = categorizer

    def initiate_upload(
        self, user_id: str, filename: str, content_type: str
    ) -> tuple[str, str]:
        """Create file record and return (file_id, presigned_upload_url)."""
        file_id = str(uuid.uuid4())
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        s3_key = f"uploads/{user_id}/{file_id}.{ext}"

        file_record = FileRecord(
            file_id=file_id,
            user_id=user_id,
            s3_key=s3_key,
            original_filename=filename,
            file_type=ext,
        )
        self._file_repo.create(file_record)

        upload_url = self._s3.generate_presigned_upload_url(s3_key, content_type)
        logger.info("Initiated upload: file_id=%s, s3_key=%s", file_id, s3_key)
        return file_id, upload_url

    async def process_file(self, file_id: str, user_id: str) -> FileRecord:
        """Run the full processing pipeline on an uploaded file."""
        file_record = self._file_repo.get_by_id(file_id)
        if not file_record:
            raise NotFoundError("File", file_id)
        if file_record.user_id != user_id:
            raise NotFoundError("File", file_id)

        self._file_repo.update_status(file_id, FileStatus.PROCESSING)

        try:
            # Step 1: Download from S3
            file_bytes = self._s3.get_object(file_record.s3_key)
            logger.info("Downloaded file %s (%d bytes)", file_id, len(file_bytes))

            # Step 2: Parse
            if file_record.file_type == "csv":
                rows = self._parser.parse_csv(file_bytes)
                raw_transactions = self._extractor.extract_from_csv(rows)
            elif file_record.file_type == "pdf":
                text = self._parser.parse_pdf(file_bytes)
                raw_transactions = self._extractor.extract_from_text(text)
            else:
                raise FileProcessingError(f"Unsupported file type: {file_record.file_type}")

            if not raw_transactions:
                raise FileProcessingError("No transactions found in file")

            # Step 3: Categorize
            categories = await self._categorizer.categorize(raw_transactions)

            # Step 4: Create transaction entities
            transactions = [
                Transaction(
                    transaction_id=str(uuid.uuid4()),
                    user_id=user_id,
                    date=raw.date,
                    description=raw.description,
                    amount=raw.amount,
                    category=cat,
                    file_id=file_id,
                )
                for raw, cat in zip(raw_transactions, categories)
            ]

            # Step 5: Store in DynamoDB
            self._transaction_repo.create_batch(transactions)

            # Step 6: Update file status
            updated = self._file_repo.update_status(
                file_id, FileStatus.COMPLETED, transaction_count=len(transactions)
            )
            logger.info("Processed file %s: %d transactions", file_id, len(transactions))
            return updated

        except FileProcessingError:
            self._file_repo.update_status(file_id, FileStatus.FAILED)
            raise
        except Exception as e:
            logger.exception("Unexpected error processing file %s", file_id)
            self._file_repo.update_status(file_id, FileStatus.FAILED)
            raise FileProcessingError(f"Processing failed: {e}")

    def get_user_files(self, user_id: str) -> list[FileRecord]:
        return self._file_repo.get_by_user(user_id)
