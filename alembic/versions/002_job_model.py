"""Add generation model to jobs

Revision ID: 002
Revises: 001
Create Date: 2026-07-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "model",
            sa.String(length=64),
            nullable=False,
            server_default="nano-banana-2",
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "model")
