"""add is_primary to imported_files

Revision ID: 361f874674e7
Revises: 4b780c426c44
Create Date: 2026-07-12 16:40:35.117884

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '361f874674e7'
down_revision = '4b780c426c44'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('imported_files', sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('imported_files', 'is_primary')
