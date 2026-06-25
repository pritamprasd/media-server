import mimetypes
import os

MIME_GROUPS = {
    "image": [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "image/bmp", "image/tiff", "image/svg+xml", "image/avif",
    ],
    "video": [
        "video/mp4", "video/x-matroska", "video/webm",
        "video/x-msvideo", "video/quicktime", "video/x-flv",
        "video/x-ms-wmv", "video/ogg",
    ],
}
EXT_TO_MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff", ".tif": "image/tiff",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".mp4": "video/mp4", ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".flv": "video/x-flv",
    ".wmv": "video/x-ms-wmv",
    ".ogv": "video/ogg",
}


def guess_mime(filename):
    ext = os.path.splitext(filename)[1].lower()
    mime = EXT_TO_MIME.get(ext)
    if mime:
        return mime
    guessed = mimetypes.guess_type(filename)[0]
    return guessed or "application/octet-stream"


def expand_mime_groups(groups):
    types = set()
    for g in groups:
        types.update(MIME_GROUPS.get(g, []))
    return types
