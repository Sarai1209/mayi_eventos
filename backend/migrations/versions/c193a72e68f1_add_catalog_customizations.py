"""Add configurable catalog product options.

Revision ID: c193a72e68f1
Revises: b840c27b2d51
Create Date: 2026-11-16 13:40:00
"""
from alembic import op
import sqlalchemy as sa


revision = "c193a72e68f1"
down_revision = "b840c27b2d51"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "catalog_items",
        sa.Column("customization_fields", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("catalog_items", "customization_fields")
