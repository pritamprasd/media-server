"""add favorite_folders table

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-29 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('favorite_folders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('path', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('path'),
    )


def downgrade():
    op.drop_table('favorite_folders')
