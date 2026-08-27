"""Tests for settings API (masked secrets, updates, validation)."""

from __future__ import annotations

import os


def test_get_settings_masks_secrets(client, monkeypatch):
    monkeypatch.setenv("KIE_API_KEY", "super-secret-kie-key-1234")
    monkeypatch.setenv("CF_ACCOUNT_ID", "acct123")

    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert "groups" in data
    assert "status" in data
    assert "defaults" in data

    kie = next(
        f
        for g in data["groups"]
        for f in g["fields"]
        if f["key"] == "KIE_API_KEY"
    )
    assert kie["secret"] is True
    assert kie["configured"] is True
    assert kie["value"] is None
    assert kie["hint"] == "••••1234"
    assert "super-secret" not in response.text


def test_update_settings_persists_and_applies_env(client, monkeypatch):
    monkeypatch.delenv("KIE_API_KEY", raising=False)

    put = client.put(
        "/api/settings",
        json={
            "values": {
                "KIE_API_KEY": "new-kie-key-9999",
                "max_parallel_products": 5,
                "default_analyze": True,
                "default_generation_model": "gpt-image-2-image-to-image",
            }
        },
    )
    assert put.status_code == 200, put.text
    body = put.json()
    assert body["status"]["kie_configured"] is True
    assert body["defaults"]["max_parallel_products"] == 5
    assert body["defaults"]["default_analyze"] is True
    assert body["defaults"]["default_generation_model"] == "gpt-image-2-image-to-image"
    assert os.environ.get("KIE_API_KEY") == "new-kie-key-9999"

    get = client.get("/api/settings")
    assert get.status_code == 200
    kie = next(
        f for g in get.json()["groups"] for f in g["fields"] if f["key"] == "KIE_API_KEY"
    )
    assert kie["hint"] == "••••9999"
    assert kie["source"] == "database"

    parallel = next(
        f
        for g in get.json()["groups"]
        for f in g["fields"]
        if f["key"] == "max_parallel_products"
    )
    assert parallel["value"] == 5


def test_update_settings_rejects_unknown_and_invalid(client):
    bad_key = client.put("/api/settings", json={"values": {"NOT_A_KEY": "x"}})
    assert bad_key.status_code == 400

    bad_parallel = client.put(
        "/api/settings", json={"values": {"max_parallel_products": 99}}
    )
    assert bad_parallel.status_code == 400

    bad_model = client.put(
        "/api/settings",
        json={"values": {"default_generation_model": "not-a-model"}},
    )
    assert bad_model.status_code == 400


def test_clear_secret_removes_override(client, monkeypatch):
    monkeypatch.setenv("KIE_API_KEY", "env-fallback-key-abcd")
    client.put("/api/settings", json={"values": {"KIE_API_KEY": "db-override-key-zzzz"}})
    assert os.environ.get("KIE_API_KEY") == "db-override-key-zzzz"

    cleared = client.put("/api/settings", json={"values": {"KIE_API_KEY": ""}})
    assert cleared.status_code == 200
    kie = next(
        f
        for g in cleared.json()["groups"]
        for f in g["fields"]
        if f["key"] == "KIE_API_KEY"
    )
    # Falls back to environment after clearing DB override
    assert kie["configured"] is True
    assert kie["hint"] == "••••abcd"
    assert kie["source"] == "environment"


def test_test_kie_without_key(client, monkeypatch):
    monkeypatch.delenv("KIE_API_KEY", raising=False)
    client.put("/api/settings", json={"values": {"KIE_API_KEY": ""}})
    # Ensure no leftover
    os.environ.pop("KIE_API_KEY", None)

    response = client.post("/api/settings/test/kie")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert "not configured" in data["detail"].lower()


def test_test_r2_missing_fields(client, monkeypatch):
    for key in (
        "CF_ACCOUNT_ID",
        "CF_R2_ACCESS_KEY",
        "CF_R2_SECRET_KEY",
        "CF_R2_BUCKET",
        "CF_R2_PUBLIC_URL",
    ):
        monkeypatch.delenv(key, raising=False)
        os.environ.pop(key, None)

    response = client.post("/api/settings/test/r2")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert "Missing R2" in data["detail"]
