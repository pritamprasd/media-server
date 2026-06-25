import mimetypes
import os

try:
    import filetype
except ImportError:
    filetype = None

MIME_GROUPS = {
    "image": [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "image/bmp", "image/tiff", "image/svg+xml", "image/avif",
        "image/heic", "image/heif"
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
    ".heic": "image/heic",       # <-- Added HEIC support
    ".heif": "image/heif",       # <-- Added HEIF support
    ".mp4": "video/mp4", ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".flv": "video/x-flv",
    ".wmv": "video/x-ms-wmv",
    ".ogv": "video/ogg"
}


def guess_mime_from_bytes(file_path):
    """Fallback byte checker for environments without the filetype library."""
    try:
        with open(file_path, 'rb') as f:
            header = f.read(32)
            
        # Image Magic Bytes
        if header.startswith(b'\x89PNG\r\n\x1a\n'):
            return "image/png"
        if header.startswith(b'\xff\xd8\xff'):
            return "image/jpeg"
        if header.startswith(b'GIF87a') or header.startswith(b'GIF89a'):
            return "image/gif"
        if header.startswith(b'RIFF') and header[8:12] == b'WEBP':
            return "image/webp"
        if header.startswith(b'BM'):
            return "image/bmp"
            
        # HEIC Magic Bytes (Checks for ftypheic, ftypheix, ftyphevc, etc. at offset 4)
        if len(header) >= 12 and header[4:8] == b'ftyp':
            ftyp_brand = header[8:12]
            if ftyp_brand in (b'heic', b'heix', b'hevc', b'hevx'):
                return "image/heic"
            if ftyp_brand in (b'mif1', b'msf1'):
                return "image/heif"
            
        # Video Magic Bytes
        if b'ftypmp42' in header or b'ftypisom' in header or b'ftypMSNV' in header:
            return "video/mp4"
        if header.startswith(b'\x1a\x45\xdf\xa3'):
            if b'webm' in header:
                return "video/webm"
            return "video/x-matroska"
            
    except Exception:
        pass
    return None


def guess_mime(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    mime = EXT_TO_MIME.get(ext)
    if mime:
        return mime
    
    guessed = mimetypes.guess_type(file_path)[0]
    if guessed:
        return guessed
        
    if os.path.exists(file_path):
        if filetype:
            try:
                kind = filetype.guess(file_path)
                if kind:
                    return kind.mime
            except Exception:
                pass
        
        byte_mime = guess_mime_from_bytes(file_path)
        if byte_mime:
            return byte_mime
            
    return "application/octet-stream"


def expand_mime_groups(groups):
    types = set()
    for g in groups:
        types.update(MIME_GROUPS.get(g, []))
    return types
