import csv
import io
import logging

import pdfplumber

logger = logging.getLogger(__name__)


class ParserService:
    """Parses uploaded files into raw text or structured data."""

    def parse_pdf(self, file_bytes: bytes) -> str:
        """Extract text from a PDF file."""
        text_parts = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        full_text = "\n".join(text_parts)
        logger.info("Extracted %d characters from PDF (%d pages)", len(full_text), len(text_parts))
        return full_text

    def parse_csv(self, file_bytes: bytes) -> list[dict]:
        """Parse a CSV file into a list of dictionaries."""
        text = file_bytes.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        logger.info("Parsed %d rows from CSV", len(rows))
        return rows
