"""add index on file_metadata.date_taken for timeline queries

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-30 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'g7h8i9j0k1l2'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('file_metadata', schema=None) as batch_op:
        batch_op.create_index('ix_file_metadata_date_taken', ['date_taken'], unique=False)


def downgrade():
    with op.batch_alter_table('file_metadata', schema=None) as batch_op:
        batch_op.drop_index('ix_file_metadata_date_taken')
