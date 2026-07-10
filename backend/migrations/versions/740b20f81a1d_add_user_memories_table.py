"""Add user_memories table

Revision ID: 740b20f81a1d
Revises: 6b52ab66cdf1
Create Date: 2026-07-11 01:40:27.911579

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '740b20f81a1d'
down_revision = '6b52ab66cdf1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_memories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('file_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['file_id'], ['imported_files.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('user_memories')
