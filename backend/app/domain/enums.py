from enum import Enum


class TransactionCategory(str, Enum):
    FOOD = "Food"
    TRAVEL = "Travel"
    GROCERIES = "Groceries"
    BILLS = "Bills"
    SHOPPING = "Shopping"
    ENTERTAINMENT = "Entertainment"
    OTHER = "Other"


class FileStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class LLMProviderType(str, Enum):
    GROK = "grok"
    OPENAI = "openai"
