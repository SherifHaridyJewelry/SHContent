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
