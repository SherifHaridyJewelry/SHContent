"""Product CRUD and batch import tests."""

from __future__ import annotations

from pathlib import Path

# Minimal JPEG payload
_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
    "070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c"
    "1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d"
    "0d1832211c2132323232323232323232323232323232323232323232323232323232"
    "323232323232323232323232323232323232323232323232ffc0001108000a000a03"
    "012200021101031101ffc40014000100000000000000000000000000000000ffc400"
    "14100100000000000000000000000000000000ffda000c0301000210031000003f00"
    "bf80ffd9"
)


def test_product_crud(client):
    create = client.post(
        "/api/products",
        json={"id": "test_ring", "name": "Test Ring", "type": "ring", "collection": "Test"},
    )
    assert create.status_code == 201
    product = create.json()
    assert product["id"] == "test_ring"
    assert product["status"] == "draft"

    listed = client.get("/api/products")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    fetched = client.get("/api/products/test_ring")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Test Ring"

    updated = client.patch(
        "/api/products/test_ring",
        json={"name": "Updated Ring", "status": "ready"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated Ring"

    deleted = client.delete("/api/products/test_ring")
    assert deleted.status_code == 204

    missing = client.get("/api/products/test_ring")
    assert missing.status_code == 404


def test_batch_import_images(client, tmp_path, monkeypatch):
    data_root = tmp_path / "data-root"
    data_root.mkdir()
    monkeypatch.setenv("DATA_ROOT", str(data_root))

    import app.config as cfg
    import app.services.product_store as product_store
    import app.services.path_utils as path_utils

    monkeypatch.setattr(cfg, "DATA_ROOT", data_root)
    monkeypatch.setattr(cfg, "RAW_JEWELRY_DIR", data_root / "raw" / "jewelry")
    monkeypatch.setattr(product_store, "RAW_JEWELRY_DIR", data_root / "raw" / "jewelry")
    monkeypatch.setattr(path_utils, "DATA_ROOT", data_root)

    response = client.post(
        "/api/products/batch",
        data={
            "type": "ring",
            "collection": "Zahya",
            "mode": "one_per_file",
            "assign_anchor": "true",
            "overrides": (
                '[{"key":"ring1.jpg","id":"ring_batch01","name":"Ring One"},'
                '{"key":"ring2.jpg","id":"ring_batch02","name":"Ring Two"}]'
            ),
        },
        files=[
            ("files", ("ring1.jpg", _JPEG, "image/jpeg")),
            ("paths", (None, "ring1.jpg")),
            ("files", ("ring2.jpg", _JPEG, "image/jpeg")),
            ("paths", (None, "ring2.jpg")),
        ],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert len(body["created"]) == 2
    assert body["created"][0]["status"] == "ready"
    assert body["created"][0]["images"][0]["path"].startswith("raw/jewelry/")

    stored = data_root / "raw" / "jewelry" / "ring_batch01" / "ring1.jpg"
    assert stored.is_file()

    asset = client.get(f"/api/assets/{body['created'][0]['images'][0]['path']}")
    assert asset.status_code == 200


def test_upload_image_to_product(client, tmp_path, monkeypatch):
    data_root = tmp_path / "data-root"
    data_root.mkdir()
    monkeypatch.setenv("DATA_ROOT", str(data_root))

    import app.config as cfg
    import app.services.product_store as product_store
    import app.services.path_utils as path_utils

    monkeypatch.setattr(cfg, "DATA_ROOT", data_root)
    monkeypatch.setattr(cfg, "RAW_JEWELRY_DIR", data_root / "raw" / "jewelry")
    monkeypatch.setattr(product_store, "RAW_JEWELRY_DIR", data_root / "raw" / "jewelry")
    monkeypatch.setattr(path_utils, "DATA_ROOT", data_root)

    create = client.post(
        "/api/products",
        json={"id": "ring_up01", "name": "Upload Ring", "type": "ring", "collection": "Test"},
    )
    assert create.status_code == 201

    upload = client.post(
        "/api/products/ring_up01/images",
        data={"role": "anchor"},
        files={"file": ("photo.jpg", _JPEG, "image/jpeg")},
    )
    assert upload.status_code == 200, upload.text
    product = upload.json()
    assert product["status"] == "ready"
    assert Path(data_root, product["images"][0]["path"]).is_file()
