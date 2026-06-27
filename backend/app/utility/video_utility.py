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


def edit_video(input_path, output_path, operations):
    filter_parts = []
    trim_start = None
    trim_end = None
    rotate_deg = None

    for op in operations:
        t = op.get("type")
        if t == "trim":
            if op.get("start") is not None:
                trim_start = float(op["start"])
            if op.get("end") is not None:
                trim_end = float(op["end"])
        elif t == "rotate":
            rotate_deg = int(op.get("degrees", 0))
        elif t == "brightness":
            v = op.get("value", 1.0)
            if v != 1.0:
                filter_parts.append(f"eq=brightness={v - 1.0:.2f}")
        elif t == "contrast":
            v = op.get("value", 1.0)
            if v != 1.0:
                filter_parts.append(f"eq=contrast={v:.2f}")
        elif t == "saturation":
            v = op.get("value", 1.0)
            if v != 1.0:
                filter_parts.append(f"eq=saturation={v:.2f}")

    cmd = ["ffmpeg", "-y", "-v", "error"]

    if trim_start is not None and trim_start > 0:
        cmd.extend(["-ss", f"{trim_start:.2f}"])
    cmd.extend(["-i", input_path])
    if trim_end is not None and trim_end > 0:
        cmd.extend(["-to", f"{trim_end:.2f}"])

    video_filters = []
    if rotate_deg == 90:
        video_filters.append("transpose=1")
    elif rotate_deg == -90 or rotate_deg == 270:
        video_filters.append("transpose=2")
    elif rotate_deg == 180:
        video_filters.append("vflip,hflip")

    video_filters.extend(filter_parts)

    needs_reencode = len(video_filters) > 0

    if video_filters:
        cmd.extend(["-vf", ",".join(video_filters)])

    if needs_reencode:
        cmd.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac"])
    else:
        cmd.extend(["-c:v", "copy", "-c:a", "copy"])

    cmd.append(output_path)

    subprocess.run(cmd, check=True, timeout=600)
