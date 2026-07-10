"""add collections and collection_files tables

Revision ID: 6b52ab66cdf1
Revises: b8c9d0e1f2a3
Create Date: 2026-07-11 00:54:31.980543

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6b52ab66cdf1'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('collections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('cover_file_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['cover_file_id'], ['imported_files.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_table('collection_files',
        sa.Column('collection_id', sa.Integer(), nullable=False),
        sa.Column('file_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['collection_id'], ['collections.id']),
        sa.ForeignKeyConstraint(['file_id'], ['imported_files.id']),
        sa.PrimaryKeyConstraint('collection_id', 'file_id'),
    )


def downgrade():
    op.drop_table('collection_files')
    op.drop_table('collections')
