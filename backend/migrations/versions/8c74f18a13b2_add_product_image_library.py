"""Add persistent product image library.

Revision ID: 8c74f18a13b2
Revises: c193a72e68f1
Create Date: 2026-11-16 14:10:00
"""
from alembic import op
import sqlalchemy as sa


revision = "8c74f18a13b2"
down_revision = "c193a72e68f1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalog_item_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["catalog_item_id"], ["catalog_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_product_images_catalog_item_id", "product_images", ["catalog_item_id"])
    op.create_index("ix_product_images_category", "product_images", ["category"])
    op.create_index("ix_product_images_is_published", "product_images", ["is_published"])


def downgrade():
    op.drop_index("ix_product_images_is_published", table_name="product_images")
    op.drop_index("ix_product_images_category", table_name="product_images")
    op.drop_index("ix_product_images_catalog_item_id", table_name="product_images")
    op.drop_table("product_images")
