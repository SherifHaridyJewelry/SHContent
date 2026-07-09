"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("collection", sa.String(length=256), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("last_job_id", sa.String(length=64), nullable=True),
        sa.Column("last_output", sa.Text(), nullable=True),
        sa.Column("approved_output", sa.Text(), nullable=True),
        sa.Column("review_status", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("template", sa.String(length=256), nullable=False),
        sa.Column("workflow", sa.String(length=512), nullable=True),
        sa.Column("analyze", sa.Boolean(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("output_prefix", sa.String(length=128), nullable=False),
        sa.Column("product_ids", sa.JSON(), nullable=False),
        sa.Column("reference_mode", sa.String(length=32), nullable=False),
        sa.Column("selected_ref_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_status_updated", "jobs", ["status", "updated_at"], unique=False)
    op.create_table(
        "catalog_reviews",
        sa.Column("output_path", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.String(length=128), nullable=True),
        sa.Column("task_id", sa.String(length=128), nullable=True),
        sa.Column("reviewed_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("output_path"),
    )
    op.create_index("ix_catalog_reviews_status", "catalog_reviews", ["status"], unique=False)
    op.create_table(
        "history_entries",
        sa.Column("task_id", sa.String(length=128), nullable=False),
        sa.Column("timestamp", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("prompt_file", sa.Text(), nullable=True),
        sa.Column("output_file", sa.Text(), nullable=True),
        sa.Column("aspect_ratio", sa.String(length=32), nullable=True),
        sa.Column("resolution", sa.String(length=32), nullable=True),
        sa.Column("template", sa.String(length=256), nullable=True),
        sa.Column("pipeline", sa.Boolean(), nullable=True),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("product_urls", sa.JSON(), nullable=False),
        sa.Column("output_r2_url", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.String(length=64), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("task_id"),
    )
    op.create_index("ix_history_output_file", "history_entries", ["output_file"], unique=False)
    op.create_index("ix_history_job_id", "history_entries", ["job_id"], unique=False)
    op.create_table(
        "scene_plate_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("template", sa.String(length=256), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("plates", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "catalog_exports",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=True),
        sa.Column("output_paths", sa.JSON(), nullable=False),
        sa.Column("counts", sa.JSON(), nullable=False),
        sa.Column("zip_path", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "catalog_outputs",
        sa.Column("output_path", sa.Text(), nullable=False),
        sa.Column("product_id", sa.String(length=128), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("task_id", sa.String(length=128), nullable=True),
        sa.Column("template", sa.String(length=256), nullable=True),
        sa.Column("timestamp", sa.String(length=64), nullable=True),
        sa.Column("is_scene_plate", sa.Boolean(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("product_urls", sa.JSON(), nullable=False),
        sa.Column("output_r2_url", sa.Text(), nullable=True),
        sa.Column("prompt_path", sa.Text(), nullable=True),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("product_name", sa.String(length=512), nullable=True),
        sa.Column("product_type", sa.String(length=64), nullable=True),
        sa.Column("collection", sa.String(length=256), nullable=True),
        sa.Column("anchor_path", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("output_path"),
    )
    op.create_index("ix_catalog_outputs_product_id", "catalog_outputs", ["product_id"], unique=False)
    op.create_index("ix_catalog_outputs_timestamp", "catalog_outputs", ["timestamp"], unique=False)
    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("product_id", sa.String(length=128), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "filename", name="uq_product_image"),
    )
    op.create_table(
        "job_products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.String(length=128), nullable=False),
        sa.Column("output_name", sa.String(length=512), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("task_id", sa.String(length=128), nullable=True),
        sa.Column("output_image", sa.Text(), nullable=True),
        sa.Column("output_path", sa.Text(), nullable=True),
        sa.Column("prompt_file", sa.Text(), nullable=True),
        sa.Column("prompt_path", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("product_urls", sa.JSON(), nullable=False),
        sa.Column("output_r2_url", sa.Text(), nullable=True),
        sa.Column("selected_ref_url", sa.Text(), nullable=True),
        sa.Column("resolved_ref_url", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "product_id", name="uq_job_product"),
    )


def downgrade() -> None:
    op.drop_table("job_products")
    op.drop_table("product_images")
    op.drop_index("ix_catalog_outputs_timestamp", table_name="catalog_outputs")
    op.drop_index("ix_catalog_outputs_product_id", table_name="catalog_outputs")
    op.drop_table("catalog_outputs")
    op.drop_table("catalog_exports")
    op.drop_table("scene_plate_jobs")
    op.drop_index("ix_history_job_id", table_name="history_entries")
    op.drop_index("ix_history_output_file", table_name="history_entries")
    op.drop_table("history_entries")
    op.drop_index("ix_catalog_reviews_status", table_name="catalog_reviews")
    op.drop_table("catalog_reviews")
    op.drop_index("ix_jobs_status_updated", table_name="jobs")
    op.drop_table("jobs")
    op.drop_table("products")
