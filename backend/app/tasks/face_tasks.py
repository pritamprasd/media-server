import logging

from app import db
from app.celery_app import celery
from app.models.detected_face import DetectedFace
from app.models.imported_file import ImportedFile
from app.models.person import Person
from app.utility.face_utility import (
    detect_faces as run_detection,
    find_best_person_match,
    compute_average_encoding,
)
from app.metrics import faces_detected_total

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=2, name="app.tasks.detect_faces")
def detect_faces(self, file_infos):
    if not isinstance(file_infos, list):
        file_infos = [file_infos]

    persons = Person.query.all()
    batch_results = []

    for file_info in file_infos:
        file_id = file_info["id"]
        file_path = file_info["file_path"]
        mime = file_info.get("mime_type", "")

        if not mime.startswith("image/"):
            batch_results.append({"file_id": file_id, "faces": 0, "error": "Not an image"})
            continue

        with db.session.no_autoflush:
            file_exists = ImportedFile.query.get(file_id)
            if not file_exists:
                batch_results.append({"file_id": file_id, "faces": 0, "error": "File not found"})
                continue

            existing = DetectedFace.query.filter_by(file_id=file_id).first()
            if existing:
                batch_results.append({"file_id": file_id, "faces": 0, "error": "Already detected"})
                continue

        try:
            results = run_detection(file_path)
        except Exception as exc:
            logger.warning("Face detection failed for file %d: %s", file_id, exc)
            batch_results.append({"file_id": file_id, "faces": 0, "error": str(exc)})
            continue

        person_encodings = {}
        new_persons_count = 0

        for face_data in results:
            encoding = face_data.get("encoding", [])
            if not encoding:
                continue

            best_person, _ = find_best_person_match(encoding, persons)

            if best_person is None:
                new_persons_count += 1
                person = Person(
                    thumbnail=face_data.get("thumbnail"),
                    face_count=1,
                    avg_encoding=encoding,
                )
                db.session.add(person)
                db.session.flush([person])
                persons.append(person)
                person_encodings[person.id] = [encoding]
            else:
                person = best_person
                person.face_count = (person.face_count or 0) + 1
                if person.id not in person_encodings:
                    person_encodings[person.id] = []
                person_encodings[person.id].append(encoding)

            face = DetectedFace(
                file_id=file_id,
                person_id=person.id,
                encoding=encoding,
                bounding_box=face_data.get("bounding_box", {}),
                confidence=face_data.get("confidence"),
                thumbnail=face_data.get("thumbnail"),
                age=face_data.get("age"),
                gender=face_data.get("gender"),
                face_status="detected",
            )
            db.session.add(face)

        for pid, encs in person_encodings.items():
            p = next((p for p in persons if p.id == pid), None)
            if p and p.avg_encoding:
                all_encs = [p.avg_encoding] + encs
            elif p:
                all_encs = encs
            else:
                continue
            p.avg_encoding = compute_average_encoding(all_encs)

        faces_detected_total.inc(len(results))
        if new_persons_count:
            from app.metrics import persons_created_total
            persons_created_total.inc(new_persons_count)

        batch_results.append({"file_id": file_id, "faces": len(results)})

    # Flush person updates in ID order to prevent PostgreSQL deadlocks
    # when multiple concurrent tasks update overlapping persons
    dirty_persons = [p for p in db.session.dirty if isinstance(p, Person)]
    dirty_persons.sort(key=lambda p: p.id)
    for p in dirty_persons:
        db.session.flush([p])

    db.session.commit()
    return batch_results
