"""One-off script to fix stale file_path values in imported_files table.

Every ImportedFile must have file_path == os.path.join(UPLOAD_DIR, relative_path).
Move/rename operations previously updated relative_path without syncing file_path,
causing 'not on disk' errors when serving files.

Usage:
    cd backend && python scripts/fix_file_paths.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.imported_file import ImportedFile


def fix_file_paths():
    app = create_app()
    with app.app_context():
        upload_dir = app.config["UPLOAD_DIR"]
        all_files = ImportedFile.query.filter_by(deleted=False).all()
        fixed = 0
        already_ok = 0
        missing_on_disk = 0

        for f in all_files:
            expected = os.path.join(upload_dir, f.relative_path)
            if f.file_path == expected:
                already_ok += 1
                continue

            old_path = f.file_path
            f.file_path = expected
            fixed += 1

            if os.path.isfile(expected):
                print(f"  FIXED  id={f.id} file={f.filename}")
                print(f"         {old_path}")
                print(f"      -> {expected}")
            else:
                missing_on_disk += 1
                print(f"  FIXED  id={f.id} file={f.filename} (WARNING: file not on disk at new path)")
                print(f"         {old_path}")
                print(f"      -> {expected}")

        if fixed:
            db.session.commit()
            print(f"\nDone: {fixed} record(s) fixed, {already_ok} already correct, {missing_on_disk} missing on disk.")
        else:
            print(f"\nAll {already_ok} record(s) already have correct file_path. Nothing to fix.")


if __name__ == "__main__":
    fix_file_paths()
