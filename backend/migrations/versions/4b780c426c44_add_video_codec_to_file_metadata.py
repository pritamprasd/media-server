"""add video_codec to file_metadata

Revision ID: 4b780c426c44
Revises: 740b20f81a1d
Create Date: 2026-07-12 15:48:26.817384

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4b780c426c44'
down_revision = '740b20f81a1d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('file_metadata', sa.Column('video_codec', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('file_metadata', 'video_codec')
