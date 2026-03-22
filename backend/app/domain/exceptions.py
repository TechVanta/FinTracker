class DomainError(Exception):
    def __init__(self, message: str = "An error occurred"):
        self.message = message
        super().__init__(self.message)


class NotFoundError(DomainError):
    def __init__(self, resource: str, identifier: str):
        super().__init__(f"{resource} not found: {identifier}")


class AuthenticationError(DomainError):
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message)


class FileProcessingError(DomainError):
    def __init__(self, message: str = "File processing failed"):
        super().__init__(message)


class DuplicateError(DomainError):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message)
