import re

def extract_folder_tags(relative_path):
    parts = relative_path.replace("\\", "/").split("/")
    parts = [p for p in parts if p and p != "."]
    if len(parts) <= 1:
        return []
    dir_parts = parts[:-1]
    tags = []
    for p in dir_parts:
        cleaned = p.strip().replace("_", " ").replace("-", " ").strip()
        if not cleaned:
            continue
        if re.match(r"^\d+$", cleaned):
            continue
        if len(cleaned) < 2:
            continue
        tags.append(cleaned.lower())
    seen = set()
    return [t for t in tags if not (t in seen or seen.add(t))]
