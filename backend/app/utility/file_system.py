import os
from typing import LiteralString, Any

from app.utility.mime_utility import guess_mime


def traverse_directory(path) -> tuple[str | bytes | LiteralString, list[Any], list[Any]]:
    entries = sorted(os.listdir(path))
    dirs = []
    files = []
    for entry in entries:
        if entry.startswith("."):
            continue
        full = os.path.join(path, entry)
        if os.path.isdir(full):
            dirs.append({"name": entry, "path": full})
        else:
            mime = guess_mime(entry)
            if mime:
                files.append({"name": entry, "path": full, "mime_type": mime})
    parent = os.path.dirname(path)
    if not parent:
        parent = None
    return dirs, files, parent
