"""add deleted column to imported_files and imported_directories

Revision ID: a1b2c3d4e5f6
Revises: 8f45fa6bc439
Create Date: 2026-06-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '8f45fa6bc439'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('imported_files', sa.Column('deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('imported_directories', sa.Column('deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade():
    op.drop_column('imported_directories', 'deleted')
    op.drop_column('imported_files', 'deleted')
