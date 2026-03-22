import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RawTransaction:
    date: str
    description: str
    amount: float


class ExtractionService:
    """Extracts structured transactions from parsed file content."""

    # Common date patterns: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, MMM DD YYYY
    DATE_PATTERNS = [
        r"\d{4}-\d{2}-\d{2}",
        r"\d{1,2}/\d{1,2}/\d{2,4}",
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}",
    ]

    # Amount pattern: optional minus, optional $, digits with commas, optional decimals
    AMOUNT_PATTERN = r"-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})"

    def extract_from_csv(self, rows: list[dict]) -> list[RawTransaction]:
        """Extract transactions from CSV rows by detecting column mappings."""
        if not rows:
            return []

        headers = {k.lower().strip(): k for k in rows[0].keys()}
        date_col = self._find_column(headers, ["date", "transaction date", "posted date", "trans date"])
        desc_col = self._find_column(headers, ["description", "memo", "details", "narrative", "transaction description"])
        amount_col = self._find_column(headers, ["amount", "total", "value"])
        debit_col = self._find_column(headers, ["debit", "withdrawal", "debit amount"])
        credit_col = self._find_column(headers, ["credit", "deposit", "credit amount"])

        if not date_col or not desc_col:
            logger.warning("Could not detect required CSV columns. Headers: %s", list(headers.keys()))
            return []

        transactions = []
        for row in rows:
            try:
                date = row.get(date_col, "").strip()
                description = row.get(desc_col, "").strip()

                if not date or not description:
                    continue

                if amount_col:
                    amount = self._parse_amount(row.get(amount_col, "0"))
                elif debit_col or credit_col:
                    debit = self._parse_amount(row.get(debit_col, "0")) if debit_col else 0.0
                    credit = self._parse_amount(row.get(credit_col, "0")) if credit_col else 0.0
                    amount = debit if debit != 0 else -credit
                else:
                    continue

                date = self._normalize_date(date)
                transactions.append(RawTransaction(date=date, description=description, amount=abs(amount)))
            except (ValueError, KeyError) as e:
                logger.debug("Skipping row: %s", e)
                continue

        logger.info("Extracted %d transactions from CSV", len(transactions))
        return transactions

    def extract_from_text(self, text: str) -> list[RawTransaction]:
        """Extract transactions from PDF text using pattern matching."""
        transactions = []
        lines = text.split("\n")

        combined_pattern = (
            r"(" + "|".join(self.DATE_PATTERNS) + r")"
            r"\s+"
            r"(.+?)"
            r"\s+"
            r"(" + self.AMOUNT_PATTERN + r")"
            r"\s*$"
        )

        for line in lines:
            line = line.strip()
            if not line:
                continue

            match = re.search(combined_pattern, line)
            if match:
                date_str = match.group(1)
                description = match.group(2).strip()
                amount_str = match.group(3)

                # Skip header-like lines
                if any(kw in description.lower() for kw in ["balance", "total", "opening", "closing"]):
                    continue

                try:
                    date = self._normalize_date(date_str)
                    amount = self._parse_amount(amount_str)
                    transactions.append(
                        RawTransaction(date=date, description=description, amount=abs(amount))
                    )
                except ValueError:
                    continue

        logger.info("Extracted %d transactions from text", len(transactions))
        return transactions

    def _find_column(self, headers: dict[str, str], candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate in headers:
                return headers[candidate]
        # Partial match
        for candidate in candidates:
            for header_lower, header_original in headers.items():
                if candidate in header_lower:
                    return header_original
        return None

    def _parse_amount(self, value: str) -> float:
        if not value or not value.strip():
            return 0.0
        cleaned = value.strip().replace("$", "").replace(",", "").replace(" ", "")
        return float(cleaned)

    def _normalize_date(self, date_str: str) -> str:
        """Attempt to normalize date to YYYY-MM-DD format."""
        import re as _re
        from datetime import datetime

        date_str = date_str.strip()

        # Already YYYY-MM-DD
        if _re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
            return date_str

        # Try common formats
        formats = [
            "%m/%d/%Y", "%d/%m/%Y", "%m/%d/%y", "%d/%m/%y",
            "%b %d, %Y", "%b %d %Y", "%B %d, %Y", "%B %d %Y",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

        # Return as-is if no format matches
        return date_str
