"""Pydantic schemas for the jewelry workflow API."""

from __future__ import annotations

from enum import Enum
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field

ReferenceMode = Literal["none", "job", "product"]

T = TypeVar("T")


class ImageRole(str, Enum):
    anchor = "anchor"
    detail = "detail"
    analysis_only = "analysis_only"
    archived = "archived"


class ProductType(str, Enum):
    ring = "ring"
    bracelet = "bracelet"
    earrings = "earrings"
    necklace = "necklace"
    half_set = "half_set"
    full_set = "full_set"
    general = "general"


class ProductStatus(str, Enum):
    draft = "draft"
    ready = "ready"
    generated = "generated"


class ProductImage(BaseModel):
    filename: str
    path: str
    role: ImageRole = ImageRole.analysis_only


class Product(BaseModel):
    id: str
    name: str
    type: ProductType = ProductType.general
    collection: str | None = None
    status: ProductStatus = ProductStatus.draft
    images: list[ProductImage] = Field(default_factory=list)
    last_job_id: str | None = None
    last_output: str | None = None
    approved_output: str | None = None
    review_status: str | None = None  # synced from canonical output review


class ProductCreate(BaseModel):
    id: str
    name: str
    type: ProductType = ProductType.general
    collection: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    type: ProductType | None = None
    collection: str | None = None
    status: ProductStatus | None = None
    review_status: str | None = None
    clear_review_status: bool = False


class ImageRoleUpdate(BaseModel):
    role: ImageRole


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class CatalogMeta(BaseModel):
    collections: list[str] = Field(default_factory=list)
    product_types: list[str] = Field(default_factory=list)
    total: int = 0
    scene_plate_count: int = 0
    canonical_count: int = 0
    counts_by_review: dict[str, int] = Field(default_factory=dict)


class ScenePlateInfo(BaseModel):
    id: str
    label: str
    scene_key: str
    output_path: str
    registered: bool = False
    registered_url: str | None = None


class ScenePlateGenerateRequest(BaseModel):
    plate_ids: list[str] = Field(default_factory=list)
    register_refs: bool = True


class ScenePlateJobStatus(str, Enum):
    pending = "pending"
    generating = "generating"
    success = "success"
    failed = "failed"


class ScenePlateJob(BaseModel):
    id: str
    template: str
    status: ScenePlateJobStatus = ScenePlateJobStatus.pending
    plates: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str
    updated_at: str
    error: str | None = None


class ProductMeta(BaseModel):
    collections: list[str] = Field(default_factory=list)
    counts_by_type: dict[str, int] = Field(default_factory=dict)
    counts_by_type_ready: dict[str, int] = Field(default_factory=dict)
    counts_by_type_generatable: dict[str, int] = Field(default_factory=dict)
    total: int = 0


class ProductBatchSkipped(BaseModel):
    key: str
    reason: str


class ProductBatchResult(BaseModel):
    created: list[Product] = Field(default_factory=list)
    skipped: list[ProductBatchSkipped] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class ImportFolderInfo(BaseModel):
    folder_id: str
    image_count: int


class ProductImportRequest(BaseModel):
    folder_ids: list[str]
    type: ProductType = ProductType.general
    collection: str | None = None


class ProductImportResult(BaseModel):
    created: list[Product] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class JobStatus(str, Enum):
    pending = "pending"
    uploading = "uploading"
    analyzing = "analyzing"
    generating = "generating"
    success = "success"
    failed = "failed"


class JobProductResult(BaseModel):
    product_id: str
    output_name: str
    run_id: str | None = None
    status: JobStatus = JobStatus.pending
    error: str | None = None
    task_id: str | None = None
    output_image: str | None = None
    output_path: str | None = None
    prompt_file: str | None = None
    prompt_path: str | None = None
    image_url: str | None = None
    product_urls: list[str] = Field(default_factory=list)
    output_r2_url: str | None = None
    selected_ref_url: str | None = None
    resolved_ref_url: str | None = None


class Job(BaseModel):
    id: str
    status: JobStatus = JobStatus.pending
    template: str
    workflow: str | None = None
    analyze: bool = True
    category: str = "jewelry"
    output_prefix: str = "catalog"
    product_ids: list[str] = Field(default_factory=list)
    products: list[JobProductResult] = Field(default_factory=list)
    reference_mode: ReferenceMode = "none"
    selected_ref_url: str | None = None
    created_at: str
    updated_at: str
    error: str | None = None


class JobCreate(BaseModel):
    product_ids: list[str]
    template: str = "jewelry_catalog_4x5"
    workflow: str | None = None
    analyze: bool = True
    output_prefix: str | None = None
    reference_mode: ReferenceMode = "none"
    selected_ref_url: str | None = None
    product_refs: dict[str, str] = Field(default_factory=dict)


class TemplateSummary(BaseModel):
    name: str
    template_name: str
    category: str
    product_type: str
    background: str
    aspect_ratio: str
    style_ref_count: int
    scene_ref_count: int = 0


class TemplateStyleReferenceRequest(BaseModel):
    output_paths: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)


class TemplateStyleReferenceResult(BaseModel):
    template: str
    added: list[str] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    style_references: list[str] = Field(default_factory=list)


class TemplateSceneReferenceRequest(BaseModel):
    product_type: str = "default"
    output_paths: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)


class TemplateSceneReferenceResult(BaseModel):
    template: str
    product_type: str
    added: list[str] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    scene_references: dict[str, list[str]] = Field(default_factory=dict)


class TemplateSceneReferenceReorderRequest(BaseModel):
    product_type: str
    url: str
    direction: Literal["up", "down"]


class DistillSceneRefRequest(BaseModel):
    output_path: str
    scene_key: str


class HistoryEntry(BaseModel):
    task_id: str
    timestamp: str
    state: str
    prompt_file: str | None = None
    output_file: str | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    template: str | None = None
    pipeline: bool | None = None
    job_id: str | None = None
    image_url: str | None = None
    product_urls: list[str] = Field(default_factory=list)
    output_r2_url: str | None = None
    review_status: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class CatalogItem(BaseModel):
    id: str
    output_path: str
    product_id: str | None = None
    product_name: str | None = None
    product_type: str | None = None
    collection: str | None = None
    review_status: str | None = None
    template: str | None = None
    task_id: str | None = None
    run_id: str | None = None
    job_id: str | None = None
    timestamp: str | None = None
    source: str
    image_url: str | None = None
    product_urls: list[str] = Field(default_factory=list)
    output_r2_url: str | None = None
    prompt_path: str | None = None
    is_scene_plate: bool = False
    is_canonical: bool = False
    output_label: str | None = None


class CatalogExportScope(str, Enum):
    selected = "selected"
    current_filter = "current_filter"
    all_catalog = "all_catalog"


class CatalogExportStatus(str, Enum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"


class CatalogExportFilters(BaseModel):
    collection: str | None = None
    product_type: str | None = None
    review_status: str | None = None
    sort: str = "newest"
    scene_plates_only: bool = False


class CatalogExportCreate(BaseModel):
    scope: CatalogExportScope
    output_paths: list[str] = Field(default_factory=list)
    filters: CatalogExportFilters | None = None


class CatalogExportCounts(BaseModel):
    total: int = 0
    exported: int = 0
    remote_fetched: int = 0
    skipped: int = 0
    failed: int = 0


class CatalogExportJob(BaseModel):
    id: str
    status: CatalogExportStatus = CatalogExportStatus.pending
    scope: CatalogExportScope
    filters: CatalogExportFilters | None = None
    output_paths: list[str] = Field(default_factory=list)
    counts: CatalogExportCounts = Field(default_factory=CatalogExportCounts)
    zip_path: str | None = None
    error: str | None = None
    created_at: str
    updated_at: str


class ReviewStatus(str, Enum):
    approved = "approved"
    rejected = "rejected"
    pending = "pending"


class CatalogReviewUpdate(BaseModel):
    output_path: str
    status: ReviewStatus
    set_canonical: bool = True
    product_id: str | None = None
    task_id: str | None = None


class SetCanonicalRequest(BaseModel):
    product_id: str
    output_path: str


class CatalogReviewResult(BaseModel):
    output_path: str
    status: str | None
    reviewed_at: str | None = None
    product_id: str | None = None
    is_canonical: bool = False
    product: Product | None = None
