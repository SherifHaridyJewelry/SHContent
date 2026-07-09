from app.db.engine import get_session
from app.db.repositories.catalog_outputs import CatalogOutputRepository


def _seed_catalog_output(**kwargs):
    defaults = {
        "output_path": "images/jewelry/catalog_test_ring_4x5_abcd1234.jpg",
        "product_id": "test_ring",
        "source": "history",
        "product_name": "Test Ring",
        "product_type": "ring",
        "collection": "Test",
        "timestamp": "2026-07-09T12:00:00+00:00",
        "is_scene_plate": False,
    }
    defaults.update(kwargs)
    with get_session() as session:
        CatalogOutputRepository(session).upsert(defaults)


def test_catalog_list_with_meta(client):
    _seed_catalog_output()
    _seed_catalog_output(
        output_path="images/jewelry/catalog_test_bracelet_4x5_abcd5678.jpg",
        product_id="test_bracelet",
        product_name="Test Bracelet",
        product_type="bracelet",
        timestamp="2026-07-08T12:00:00+00:00",
    )

    response = client.get("/api/catalog?page=1&page_size=1&sort=newest")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 1
    assert "meta" in data
    assert data["meta"]["total"] == 2
    assert data["page_size"] == 1
    assert data["total_pages"] == 2


def test_catalog_filter_by_collection(client):
    _seed_catalog_output(collection="Alpha")
    _seed_catalog_output(
        output_path="images/jewelry/catalog_beta_4x5_abcd9999.jpg",
        product_id="beta",
        product_name="Beta",
        collection="Beta",
    )

    response = client.get("/api/catalog?collection=Alpha")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["collection"] == "Alpha"
