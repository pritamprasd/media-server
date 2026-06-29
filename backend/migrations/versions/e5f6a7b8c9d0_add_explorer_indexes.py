"""add explorer indexes

Revision ID: e5f6a7b8c9d0
Revises: d78f7404202d
Create Date: 2026-06-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd78f7404202d'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('imported_files', schema=None) as batch_op:
        batch_op.create_index('ix_imported_files_directory_id', ['directory_id'], unique=False)
        batch_op.create_index('ix_imported_files_deleted', ['deleted'], unique=False)

    with op.batch_alter_table('imported_directories', schema=None) as batch_op:
        batch_op.create_index('ix_imported_directories_parent_path', ['parent_path'], unique=False)
        batch_op.create_index('ix_imported_directories_path', ['path'], unique=False)
        batch_op.create_index('ix_imported_directories_deleted', ['deleted'], unique=False)


def downgrade():
    with op.batch_alter_table('imported_files', schema=None) as batch_op:
        batch_op.drop_index('ix_imported_files_directory_id')
        batch_op.drop_index('ix_imported_files_deleted')

    with op.batch_alter_table('imported_directories', schema=None) as batch_op:
        batch_op.drop_index('ix_imported_directories_parent_path')
        batch_op.drop_index('ix_imported_directories_path')
        batch_op.drop_index('ix_imported_directories_deleted')
