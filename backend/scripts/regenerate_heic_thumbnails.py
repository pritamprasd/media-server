import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app, db
from app.models.imported_file import ImportedFile
from app.models.file_metadata import FileMetadata
from app.utility.image_utility import generate_image_thumbnail

app = create_app()

HEIC_MIMES = ("image/heic", "image/heif")

def main():
    with app.app_context():
        files = ImportedFile.query.filter(
            ImportedFile.mime_type.in_(HEIC_MIMES),
            ImportedFile.deleted == False,
        ).all()

        if not files:
            print("No HEIC/HEIF files found.")
            return

        print(f"Found {len(files)} HEIC/HEIF file(s). Regenerating thumbnails...")

        count = 0
        errors = 0
        for f in files:
            if not os.path.isfile(f.file_path):
                print(f"  SKIP  (file missing) [{f.id}] {f.file_path}")
                continue

            meta = FileMetadata.query.filter_by(file_id=f.id).first()
            if not meta:
                meta = FileMetadata(file_id=f.id)
                db.session.add(meta)
                db.session.flush()

            try:
                generate_image_thumbnail(f.file_path, meta)
                meta.thumbnail_status = "completed" if meta.thumbnail else "failed"
                db.session.commit()
                status = "OK" if meta.thumbnail else "FAILED"
                print(f"  {status}  [{f.id}] {f.filename}")
                count += 1
            except Exception as e:
                db.session.rollback()
                print(f"  ERROR [{f.id}] {f.filename}: {e}")
                errors += 1

        print(f"\nDone. {count} regenerated, {errors} errors.")

if __name__ == "__main__":
    main()
