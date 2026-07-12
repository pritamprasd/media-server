from app import db
from app.models.imported_file import ImportedFile
from app.models.file_metadata import FileMetadata, DHashBand
from app.utility.hash_utility import hamming_distance

NEAR_DUPLICATE_THRESHOLD = 10


def find_exact_duplicates():
    hashes = (
        db.session.query(FileMetadata.file_hash, db.func.count(FileMetadata.id))
        .join(ImportedFile, FileMetadata.file_id == ImportedFile.id)
        .filter(
            ImportedFile.deleted != True,
            ImportedFile.is_primary != True,
            FileMetadata.file_hash.isnot(None),
        )
        .group_by(FileMetadata.file_hash)
        .having(db.func.count(FileMetadata.id) > 1)
        .all()
    )
    groups = []
    for h, cnt in hashes:
        metas = (
            FileMetadata.query.filter_by(file_hash=h)
            .join(ImportedFile)
            .filter(ImportedFile.deleted != True, ImportedFile.is_hidden != True)
            .order_by(ImportedFile.filename)
            .all()
        )
        group = []
        for m in metas:
            f = m.file
            if f.deleted or f.is_hidden:
                continue
            group.append({
                "file_id": f.id,
                "filename": f.filename,
                "relative_path": f.relative_path,
                "size": f.size,
                "mime_type": f.mime_type,
                "file_hash": m.file_hash,
                "thumbnail": m.thumbnail,
            })
        groups.append({"hash": h, "count": cnt, "files": group})
    return {"groups": groups}


def find_near_duplicates():
    near_meta = FileMetadata.query.join(
        ImportedFile, FileMetadata.file_id == ImportedFile.id
    ).filter(
        ImportedFile.deleted != True,
        ImportedFile.is_hidden != True,
        ImportedFile.is_primary != True,
        FileMetadata.dhash.isnot(None),
    ).all()
    pairs = []
    seen = set()
    for i, m1 in enumerate(near_meta):
        bands1 = {b.band_index: b.band_value for b in m1.dhash_bands}
        for j, m2 in enumerate(near_meta):
            if i >= j:
                continue
            key = tuple(sorted([m1.file_id, m2.file_id]))
            if key in seen:
                continue
            bands2 = {b.band_index: b.band_value for b in m2.dhash_bands}
            matches = sum(
                1 for bi in range(4)
                if bands1.get(bi) == bands2.get(bi)
            )
            if matches >= 3:
                dist = hamming_distance(m1.dhash, m2.dhash)
                if dist <= NEAR_DUPLICATE_THRESHOLD:
                    seen.add(key)
                    pairs.append({
                        "distance": dist,
                        "file_a": {
                            "file_id": m1.file_id,
                            "filename": m1.file.filename,
                            "relative_path": m1.file.relative_path,
                            "size": m1.file.size,
                            "mime_type": m1.file.mime_type,
                            "thumbnail": m1.thumbnail,
                        },
                        "file_b": {
                            "file_id": m2.file_id,
                            "filename": m2.file.filename,
                            "relative_path": m2.file.relative_path,
                            "size": m2.file.size,
                            "mime_type": m2.file.mime_type,
                            "thumbnail": m2.thumbnail,
                        },
                    })
    pairs.sort(key=lambda p: p["distance"])
    return {"pairs": pairs}


def find_near_duplicates_for_file(file_id):
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta or not meta.dhash:
        return None
    bands = {b.band_index: b.band_value for b in meta.dhash_bands}

    candidate_ids = set()
    for bi in range(4):
        matching = DHashBand.query.filter_by(
            band_index=bi, band_value=bands[bi]
        ).all()
        for m in matching:
            if m.metadata_id != meta.id:
                candidate_ids.add(m.metadata_id)

    results = []
    for mid in candidate_ids:
        other = db.session.get(FileMetadata, mid)
        if not other or not other.dhash:
            continue
        dist = hamming_distance(meta.dhash, other.dhash)
        if dist <= NEAR_DUPLICATE_THRESHOLD:
            results.append({
                "distance": dist,
                "file_id": other.file_id,
                "filename": other.file.filename,
                "thumbnail": other.thumbnail,
            })

    results.sort(key=lambda r: r["distance"])
    return {"duplicates": results}
