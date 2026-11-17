"""Add persistent image framing controls.

Revision ID: 9f61b4c8d2a0
Revises: 8c74f18a13b2
Create Date: 2026-11-16 14:25:00
"""
from alembic import op
import sqlalchemy as sa


revision = "9f61b4c8d2a0"
down_revision = "8c74f18a13b2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "product_images",
        sa.Column("position_x", sa.Integer(), nullable=False, server_default="50"),
    )
    op.add_column(
        "product_images",
        sa.Column("position_y", sa.Integer(), nullable=False, server_default="50"),
    )
    op.add_column(
        "product_images",
        sa.Column("zoom", sa.Integer(), nullable=False, server_default="100"),
    )


def downgrade():
    op.drop_column("product_images", "zoom")
    op.drop_column("product_images", "position_y")
    op.drop_column("product_images", "position_x")
