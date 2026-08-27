"""SQLAlchemy ORM models."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


class ProductRow(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    collection: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="draft")
    last_job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str | None] = mapped_column(String(64), nullable=True)

    images: Mapped[list[ProductImageRow]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImageRow.filename",
    )


class ProductImageRow(Base):
    __tablename__ = "product_images"
    __table_args__ = (UniqueConstraint("product_id", "filename", name="uq_product_image"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False, default="analysis_only")

    product: Mapped[ProductRow] = relationship(back_populates="images")


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_updated", "status", "updated_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    template: Mapped[str] = mapped_column(String(256), nullable=False)
    workflow: Mapped[str | None] = mapped_column(String(512), nullable=True)
    analyze: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    model: Mapped[str] = mapped_column(
        String(64), nullable=False, default="nano-banana-2"
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="jewelry")
    output_prefix: Mapped[str] = mapped_column(String(128), nullable=False, default="catalog")
    product_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    reference_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="none")
    selected_ref_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    products: Mapped[list[JobProductRow]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobProductRow.product_id",
    )


class JobProductRow(Base):
    __tablename__ = "job_products"
    __table_args__ = (UniqueConstraint("job_id", "product_id", name="uq_job_product"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    product_id: Mapped[str] = mapped_column(String(128), nullable=False)
    output_name: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    output_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_urls: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    output_r2_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_ref_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_ref_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[JobRow] = relationship(back_populates="products")


class CatalogReviewRow(Base):
    __tablename__ = "catalog_reviews"
    __table_args__ = (Index("ix_catalog_reviews_status", "status"),)

    output_path: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    product_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewed_at: Mapped[str] = mapped_column(String(64), nullable=False)


class HistoryEntryRow(Base):
    __tablename__ = "history_entries"
    __table_args__ = (
        Index("ix_history_output_file", "output_file"),
        Index("ix_history_job_id", "job_id"),
    )

    task_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    timestamp: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    aspect_ratio: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resolution: Mapped[str | None] = mapped_column(String(32), nullable=True)
    template: Mapped[str | None] = mapped_column(String(256), nullable=True)
    pipeline: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_urls: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    output_r2_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)


class ScenePlateJobRow(Base):
    __tablename__ = "scene_plate_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    template: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    plates: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class CatalogExportRow(Base):
    __tablename__ = "catalog_exports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    scope: Mapped[str] = mapped_column(String(64), nullable=False)
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_paths: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    counts: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    zip_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)


class AppSettingRow(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)


class CatalogOutputRow(Base):
    __tablename__ = "catalog_outputs"
    __table_args__ = (
        Index("ix_catalog_outputs_product_id", "product_id"),
        Index("ix_catalog_outputs_timestamp", "timestamp"),
    )

    output_path: Mapped[str] = mapped_column(Text, primary_key=True)
    product_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="history")
    task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    template: Mapped[str | None] = mapped_column(String(256), nullable=True)
    timestamp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_scene_plate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_urls: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    output_r2_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    product_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    product_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    collection: Mapped[str | None] = mapped_column(String(256), nullable=True)
    anchor_path: Mapped[str | None] = mapped_column(Text, nullable=True)
