"""add is_hidden column to imported_files

Revision ID: b8c9d0e1f2a3
Revises: g7h8i9j0k1l2
Create Date: 2026-07-08 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b8c9d0e1f2a3'
down_revision = 'g7h8i9j0k1l2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('imported_files', sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_imported_files_is_hidden', 'imported_files', ['is_hidden'])


def downgrade():
    op.drop_index('ix_imported_files_is_hidden', table_name='imported_files')
    op.drop_column('imported_files', 'is_hidden')
