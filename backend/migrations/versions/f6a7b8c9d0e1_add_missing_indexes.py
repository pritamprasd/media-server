"""add missing database indexes for query performance

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-29 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    # --- import_sessions ---
    with op.batch_alter_table('import_sessions', schema=None) as batch_op:
        batch_op.create_index('ix_import_sessions_root_path', ['root_path'], unique=False)
        batch_op.create_index('ix_import_sessions_created_at', ['created_at'], unique=False)

    # --- imported_files ---
    with op.batch_alter_table('imported_files', schema=None) as batch_op:
        batch_op.create_index('ix_imported_files_mime_type', ['mime_type'], unique=False)
        batch_op.create_index('ix_imported_files_relative_path', ['relative_path'], unique=False)
        batch_op.create_index('ix_imported_files_is_favorite', ['is_favorite'], unique=False)
        batch_op.create_index('ix_imported_files_filename', ['filename'], unique=False)
        batch_op.create_index('ix_imported_files_nickname', ['nickname'], unique=False)
        batch_op.create_index('ix_imported_files_session_relative', ['session_id', 'relative_path'], unique=False)
        batch_op.create_index('ix_imported_files_created_deleted', ['created_at', 'deleted'], unique=False)

    # --- imported_directories ---
    with op.batch_alter_table('imported_directories', schema=None) as batch_op:
        batch_op.create_index('ix_imported_directories_name', ['name'], unique=False)
        batch_op.create_index('ix_imported_directories_session_parent', ['session_id', 'parent_path'], unique=False)

    # --- file_metadata ---
    with op.batch_alter_table('file_metadata', schema=None) as batch_op:
        batch_op.create_index('ix_file_metadata_metadata_status', ['metadata_status'], unique=False)
        batch_op.create_index('ix_file_metadata_thumbnail_status', ['thumbnail_status'], unique=False)
        batch_op.create_index('ix_file_metadata_lat_lon', ['latitude', 'longitude'], unique=False)

    # --- dhash_bands ---
    with op.batch_alter_table('dhash_bands', schema=None) as batch_op:
        batch_op.create_index('ix_dhash_bands_metadata_id', ['metadata_id'], unique=False)

    # --- persons ---
    with op.batch_alter_table('persons', schema=None) as batch_op:
        batch_op.create_index('ix_persons_name', ['name'], unique=False)
        batch_op.create_index('ix_persons_face_count', ['face_count'], unique=False)
        batch_op.create_index('ix_persons_created_at', ['created_at'], unique=False)

    # --- detected_faces ---
    with op.batch_alter_table('detected_faces', schema=None) as batch_op:
        batch_op.create_index('ix_detected_faces_created_at', ['created_at'], unique=False)
        batch_op.create_index('ix_detected_faces_confidence', ['confidence'], unique=False)

    # --- saved_locations ---
    with op.batch_alter_table('saved_locations', schema=None) as batch_op:
        batch_op.create_index('ix_saved_locations_name', ['name'], unique=False)

    # --- filter_presets ---
    with op.batch_alter_table('filter_presets', schema=None) as batch_op:
        batch_op.create_index('ix_filter_presets_name', ['name'], unique=False)


def downgrade():
    with op.batch_alter_table('import_sessions', schema=None) as batch_op:
        batch_op.drop_index('ix_import_sessions_root_path')
        batch_op.drop_index('ix_import_sessions_created_at')

    with op.batch_alter_table('imported_files', schema=None) as batch_op:
        batch_op.drop_index('ix_imported_files_mime_type')
        batch_op.drop_index('ix_imported_files_relative_path')
        batch_op.drop_index('ix_imported_files_is_favorite')
        batch_op.drop_index('ix_imported_files_filename')
        batch_op.drop_index('ix_imported_files_nickname')
        batch_op.drop_index('ix_imported_files_session_relative')
        batch_op.drop_index('ix_imported_files_created_deleted')

    with op.batch_alter_table('imported_directories', schema=None) as batch_op:
        batch_op.drop_index('ix_imported_directories_name')
        batch_op.drop_index('ix_imported_directories_session_parent')

    with op.batch_alter_table('file_metadata', schema=None) as batch_op:
        batch_op.drop_index('ix_file_metadata_metadata_status')
        batch_op.drop_index('ix_file_metadata_thumbnail_status')
        batch_op.drop_index('ix_file_metadata_lat_lon')

    with op.batch_alter_table('dhash_bands', schema=None) as batch_op:
        batch_op.drop_index('ix_dhash_bands_metadata_id')

    with op.batch_alter_table('persons', schema=None) as batch_op:
        batch_op.drop_index('ix_persons_name')
        batch_op.drop_index('ix_persons_face_count')
        batch_op.drop_index('ix_persons_created_at')

    with op.batch_alter_table('detected_faces', schema=None) as batch_op:
        batch_op.drop_index('ix_detected_faces_created_at')
        batch_op.drop_index('ix_detected_faces_confidence')

    with op.batch_alter_table('saved_locations', schema=None) as batch_op:
        batch_op.drop_index('ix_saved_locations_name')

    with op.batch_alter_table('filter_presets', schema=None) as batch_op:
        batch_op.drop_index('ix_filter_presets_name')
