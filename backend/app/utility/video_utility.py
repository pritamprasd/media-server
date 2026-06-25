import base64
import json
import os
import subprocess

from app.utility.type_utility import safe_int


def extract_video_metadata(path, meta):
    if not os.path.isfile(path):
        return

    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            path,
        ],
        capture_output=True, text=True, timeout=30,
        check=True,
    )
    data = json.loads(result.stdout)

    streams = data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video_stream:
        meta.width = safe_int(video_stream.get("width"))
        meta.height = safe_int(video_stream.get("height"))

    fmt = data.get("format", {})
    duration_str = fmt.get("duration") or (video_stream or {}).get("duration")
    if duration_str:
        try:
            meta.duration = float(duration_str)
        except (ValueError, TypeError):
            pass


def extract_video_frames(path, max_frames=5):
    if not os.path.isfile(path):
        return []

    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True, timeout=15,
    )
    data = json.loads(result.stdout)
    duration_str = data.get("format", {}).get("duration", "0")
    try:
        duration = float(duration_str)
    except (ValueError, TypeError):
        duration = 0

    if duration <= 0:
        return []

    n = min(max_frames, max(1, int(duration // 2)))
    interval = duration / (n + 1)
    frames = []

    for i in range(1, n + 1):
        timestamp = interval * i
        pipe = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "quiet",
                "-ss", str(timestamp),
                "-i", path,
                "-vframes", "1",
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "-q:v", "5",
                "-",
            ],
            capture_output=True, timeout=30,
        )
        if pipe.returncode == 0 and pipe.stdout:
            frames.append(base64.b64encode(pipe.stdout).decode("utf-8"))

    return frames


def generate_video_thumbnail(path, meta):
    if not os.path.isfile(path):
        return

    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            path,
        ],
        capture_output=True, text=True, timeout=15,
    )
    data = json.loads(result.stdout)
    duration_str = data.get("format", {}).get("duration", "0")
    try:
        duration = float(duration_str)
    except (ValueError, TypeError):
        duration = 0

    seek = max(1.0, duration * 0.3) if duration > 0 else 1.0

    pipe = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "quiet",
            "-ss", str(seek),
            "-i", path,
            "-vframes", "1",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "-q:v", "5",
            "-s", "400x400",
            "-",
        ],
        capture_output=True, timeout=30,
    )
    if pipe.returncode != 0 or not pipe.stdout:
        return

    b64 = base64.b64encode(pipe.stdout).decode("utf-8")
    meta.thumbnail = f"data:image/jpeg;base64,{b64}"
