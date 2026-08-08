"""Pytest fixtures with disposable SQLite test database."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.db.models import Base  # noqa: E402
from app.main import app  # noqa: E402

TEST_DB_PATH = Path(__file__).resolve().parent / "test_shcontent.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB_PATH.as_posix()}"


@pytest.fixture(scope="session")
def engine():
    test_engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield test_engine
    Base.metadata.drop_all(bind=test_engine)
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture
def db_session(engine) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(bind=connection, autocommit=False, autoflush=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(autouse=True)
def _patch_database(monkeypatch, engine):
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    from app.db import engine as db_engine_module

    monkeypatch.setattr(db_engine_module, "engine", engine)
    monkeypatch.setattr(
        db_engine_module,
        "SessionLocal",
        sessionmaker(bind=engine, autocommit=False, autoflush=False),
    )
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
