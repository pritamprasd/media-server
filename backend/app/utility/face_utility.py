import io
import base64
import logging
import os

from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

_face_app = None

FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.4"))


def _get_face_app():
    global _face_app
    if _face_app is None:
        try:
            import insightface
            from insightface.app import FaceAnalysis
        except ImportError:
            logger.error("insightface not installed. Run: pip install insightface onnxruntime")
            return None
        providers = os.environ.get("FACE_PROVIDERS", "CPUExecutionProvider")
        _face_app = FaceAnalysis(
            name="buffalo_l",
            root=os.path.join(os.path.expanduser("~"), ".insightface"),
            providers=[providers],
        )
        _face_app.prepare(
            ctx_id=0,
            det_size=(640, 640),
            det_thresh=float(os.environ.get("FACE_DET_THRESH", "0.3")),
        )
        logger.info("FaceAnalysis model loaded (buffalo_l, provider=%s, det_thresh=%.2f)",
                     providers, _face_app.det_thresh)
    return _face_app


def _pil_to_cv_image(pil_image):
    """Convert PIL RGB image to BGR numpy array (OpenCV convention)."""
    arr = np.array(pil_image)
    if arr.shape[2] == 3:
        return arr[:, :, ::-1]
    if arr.shape[2] == 4:
        return arr[:, :, :3][:, :, ::-1]
    return arr


def detect_faces(image_path):
    app = _get_face_app()
    if app is None:
        return []

    try:
        pil_img = Image.open(image_path).convert("RGB")
    except Exception as exc:
        logger.warning("Cannot open image %s: %s", image_path, exc)
        return []

    cv_img = _pil_to_cv_image(pil_img)

    faces = app.get(cv_img)
    results = []
    for face in faces:
        bbox = face.bbox.astype(int).tolist()
        x1, y1, x2, y2 = bbox[:4]
        encoding = face.normed_embedding.tolist() if hasattr(face, "normed_embedding") else []

        if y2 > y1 and x2 > x1 and y2 <= cv_img.shape[0] and x2 <= cv_img.shape[1]:
            face_cv = cv_img[y1:y2, x1:x2]
            face_pil = Image.fromarray(face_cv[:, :, ::-1])
            thumb_b64 = _pil_to_base64_jpeg(face_pil, size=(160, 160))
        else:
            thumb_b64 = None

        result = {
            "bounding_box": {"x": int(x1), "y": int(y1), "w": int(x2 - x1), "h": int(y2 - y1)},
            "confidence": float(face.det_score) if hasattr(face, "det_score") else None,
            "encoding": encoding,
            "thumbnail": thumb_b64,
            "age": float(face.age) if hasattr(face, "age") else None,
            "gender": int(face.gender) if hasattr(face, "gender") else None,
        }
        results.append(result)
    return results


def encoding_distance(enc_a, enc_b):
    a = np.array(enc_a, dtype=np.float32)
    b = np.array(enc_b, dtype=np.float32)
    if a.size == 0 or b.size == 0:
        return 1.0
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 1.0
    return float(1.0 - dot / (norm_a * norm_b))


def find_best_person_match(encoding, persons, threshold=FACE_MATCH_THRESHOLD):
    best_dist = threshold
    best_person = None
    for person in persons:
        avg_enc = person.avg_encoding
        if not avg_enc:
            continue
        dist = encoding_distance(encoding, avg_enc)
        if dist < best_dist:
            best_dist = dist
            best_person = person
    return best_person, best_dist


def compute_average_encoding(encodings):
    if not encodings:
        return None
    arr = np.array(encodings, dtype=np.float32)
    avg = np.mean(arr, axis=0).tolist()
    return avg


def _pil_to_base64_jpeg(pil_img, size=None):
    if pil_img is None:
        return None
    try:
        if size:
            pil_img = pil_img.resize(size, Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception as exc:
        logger.warning("pil_to_base64_jpeg failed: %s", exc)
        return None
