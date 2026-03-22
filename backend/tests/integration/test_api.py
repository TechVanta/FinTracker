import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.main import app


@pytest.fixture
def client(dynamodb_tables):
    from app.infrastructure.dynamodb.client import get_dynamodb_resource
    get_dynamodb_resource.cache_clear()

    with TestClient(app) as c:
        yield c


class TestHealthEndpoint:
    def test_health_check(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestAuthEndpoints:
    def test_signup(self, client):
        response = client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "password123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert "token" in data
        assert data["email"] == "test@example.com"

    def test_signup_duplicate(self, client):
        client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "password123"},
        )
        response = client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "password456"},
        )
        assert response.status_code == 409

    def test_login(self, client):
        client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "password123"},
        )
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        assert "token" in response.json()

    def test_login_wrong_password(self, client):
        client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "password123"},
        )
        response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "wrong"},
        )
        assert response.status_code == 401


class TestProtectedEndpoints:
    def _get_token(self, client) -> str:
        response = client.post(
            "/api/auth/signup",
            json={"email": "test@example.com", "password": "password123"},
        )
        return response.json()["token"]

    def test_transactions_requires_auth(self, client):
        response = client.get("/api/transactions")
        assert response.status_code == 403

    def test_transactions_with_auth(self, client):
        token = self._get_token(client)
        response = client.get(
            "/api/transactions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json() == []

    def test_dashboard_with_auth(self, client):
        token = self._get_token(client)
        response = client.get(
            "/api/dashboard/summary?month=1&year=2024",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_spending"] == 0
        assert data["transaction_count"] == 0

    def test_files_list_with_auth(self, client):
        token = self._get_token(client)
        response = client.get(
            "/api/files",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert response.json() == []
