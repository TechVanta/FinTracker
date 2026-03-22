import pytest

from app.services.extraction_service import ExtractionService


@pytest.fixture
def extractor():
    return ExtractionService()


class TestCSVExtraction:
    def test_extract_basic_csv(self, extractor):
        rows = [
            {"Date": "2024-01-15", "Description": "STARBUCKS COFFEE", "Amount": "4.50"},
            {"Date": "2024-01-16", "Description": "WALMART GROCERY", "Amount": "52.30"},
        ]
        transactions = extractor.extract_from_csv(rows)
        assert len(transactions) == 2
        assert transactions[0].description == "STARBUCKS COFFEE"
        assert transactions[0].amount == 4.50
        assert transactions[1].amount == 52.30

    def test_extract_csv_with_debit_credit_columns(self, extractor):
        rows = [
            {"Date": "2024-01-15", "Description": "PAYMENT", "Debit": "100.00", "Credit": ""},
            {"Date": "2024-01-16", "Description": "DEPOSIT", "Debit": "", "Credit": "500.00"},
        ]
        transactions = extractor.extract_from_csv(rows)
        assert len(transactions) == 2
        assert transactions[0].amount == 100.00
        assert transactions[1].amount == 500.00

    def test_extract_csv_empty_rows(self, extractor):
        rows = []
        transactions = extractor.extract_from_csv(rows)
        assert len(transactions) == 0

    def test_extract_csv_date_normalization(self, extractor):
        rows = [
            {"Date": "01/15/2024", "Description": "TEST", "Amount": "10.00"},
        ]
        transactions = extractor.extract_from_csv(rows)
        assert len(transactions) == 1
        assert transactions[0].date == "2024-01-15"


class TestTextExtraction:
    def test_extract_from_text_basic(self, extractor):
        text = """
        Statement for January 2024
        2024-01-15 STARBUCKS COFFEE $4.50
        2024-01-16 WALMART GROCERY $52.30
        2024-01-17 NETFLIX SUBSCRIPTION $15.99
        """
        transactions = extractor.extract_from_text(text)
        assert len(transactions) == 3
        assert transactions[0].description == "STARBUCKS COFFEE"
        assert transactions[0].amount == 4.50

    def test_extract_from_text_skips_totals(self, extractor):
        text = """
        2024-01-15 STARBUCKS COFFEE $4.50
        2024-01-31 Total Balance $1,234.56
        """
        transactions = extractor.extract_from_text(text)
        assert len(transactions) == 1

    def test_extract_from_text_handles_commas_in_amounts(self, extractor):
        text = "2024-01-15 BIG PURCHASE $1,234.56\n"
        transactions = extractor.extract_from_text(text)
        assert len(transactions) == 1
        assert transactions[0].amount == 1234.56

    def test_extract_from_text_empty(self, extractor):
        transactions = extractor.extract_from_text("")
        assert len(transactions) == 0
