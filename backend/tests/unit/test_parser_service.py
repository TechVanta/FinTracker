import pytest

from app.services.parser_service import ParserService


@pytest.fixture
def parser():
    return ParserService()


class TestCSVParser:
    def test_parse_csv_basic(self, parser):
        csv_content = b"Date,Description,Amount\n2024-01-15,STARBUCKS COFFEE,4.50\n2024-01-16,WALMART GROCERY,52.30\n"
        rows = parser.parse_csv(csv_content)
        assert len(rows) == 2
        assert rows[0]["Date"] == "2024-01-15"
        assert rows[0]["Description"] == "STARBUCKS COFFEE"
        assert rows[0]["Amount"] == "4.50"

    def test_parse_csv_with_bom(self, parser):
        csv_content = b"\xef\xbb\xbfDate,Description,Amount\n2024-01-15,TEST,10.00\n"
        rows = parser.parse_csv(csv_content)
        assert len(rows) == 1
        assert "Date" in rows[0]

    def test_parse_csv_empty(self, parser):
        csv_content = b"Date,Description,Amount\n"
        rows = parser.parse_csv(csv_content)
        assert len(rows) == 0


class TestPDFParser:
    def test_parse_pdf_returns_string(self, parser):
        # pdfplumber needs a real PDF; just verify the interface works
        # with invalid bytes it should raise
        with pytest.raises(Exception):
            parser.parse_pdf(b"not a real pdf")
