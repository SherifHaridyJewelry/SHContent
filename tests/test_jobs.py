def test_list_active_jobs_empty(client):
    response = client.get("/api/jobs/active")
    assert response.status_code == 200
    assert response.json() == []


def test_create_job_requires_ready_products(client):
    client.post(
        "/api/products",
        json={"id": "draft_prod", "name": "Draft", "type": "ring"},
    )
    response = client.post(
        "/api/jobs",
        json={"product_ids": ["draft_prod"], "template": "jewelry_catalog_4x5"},
    )
    assert response.status_code == 400
