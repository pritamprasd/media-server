import base64
import json
import math
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
        meta.video_codec = video_stream.get("codec_name")

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


def _atempo_chain(speed):
    """Build atempo filter chain for any speed value.
    atempo supports 0.5–2.0, so chain multiple filters for wider range.
    """
    filters = []
    remaining = speed
    while remaining > 2.0:
        filters.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        filters.append("atempo=0.5")
        remaining /= 0.5
    if remaining != 1.0:
        filters.append(f"atempo={remaining:.5f}")
    return filters


def edit_video(input_path, output_path, operations, codec_args=None):
    video_filters = []
    audio_filters = []
    text_files = []
    trim_start = None
    trim_end = None
    rotate_deg = None
    speed_val = 1.0

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
                video_filters.append(f"eq=brightness={v - 1.0:.2f}")
        elif t == "contrast":
            v = op.get("value", 1.0)
            if v != 1.0:
                video_filters.append(f"eq=contrast={v:.2f}")
        elif t == "saturation":
            v = op.get("value", 1.0)
            if v != 1.0:
                video_filters.append(f"eq=saturation={v:.2f}")
        elif t == "warmth":
            v = op.get("value", 0)
            if v != 0:
                r = max(-0.5, min(0.5, v / 200))
                b = -r
                video_filters.append(f"colorbalance=rs={r:.3f}:gs=0:bs={b:.3f}")
        elif t == "speed":
            speed_val = op.get("value", 1.0)
        elif t == "volume":
            v = op.get("value", 1.0)
            if v != 1.0:
                audio_filters.append(f"volume={v:.2f}")
        elif t == "reverse":
            video_filters.append("reverse")
            audio_filters.append("areverse")
        elif t == "text":
            txt = op.get("text", "")
            if txt:
                tx = op.get("x", 0.5)
                ty = op.get("y", 0.5)
                fs = op.get("font_size", 24)
                color = op.get("color", "#ffffff")
                import tempfile
                tf = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8")
                tf.write(txt)
                tf.close()
                text_files.append(tf.name)
                drawtext_filter = (
                    f"drawtext=textfile={tf.name}"
                    f":fontsize={fs}"
                    f":fontcolor={color}"
                    f":x=w*{tx:.2f}-tw/2"
                    f":y=h*{ty:.2f}-th/2"
                )
                video_filters.append(drawtext_filter)
        elif t == "audio_mute":
            audio_filters.append("volume=0")

    # Speed via setpts (video) and atempo (audio)
    if speed_val != 1.0:
        video_filters.append(f"setpts={1 / speed_val:.5f}*PTS")
        audio_filters.extend(_atempo_chain(speed_val))

    cmd = ["ffmpeg", "-y", "-v", "error"]

    if trim_start is not None and trim_start > 0:
        cmd.extend(["-ss", f"{trim_start:.2f}"])
    cmd.extend(["-i", input_path])
    if trim_end is not None and trim_end > 0:
        cmd.extend(["-to", f"{trim_end:.2f}"])

    # Build video filter chain (rotate ops come first)
    vf_parts = []
    if rotate_deg == 90:
        vf_parts.append("transpose=1")
    elif rotate_deg == -90 or rotate_deg == 270:
        vf_parts.append("transpose=2")
    elif rotate_deg == 180:
        vf_parts.append("vflip,hflip")
    vf_parts.extend(video_filters)

    needs_reencode = len(vf_parts) > 0 or len(audio_filters) > 0

    if vf_parts:
        cmd.extend(["-vf", ",".join(vf_parts)])
    if audio_filters:
        cmd.extend(["-af", ",".join(audio_filters)])

    if needs_reencode:
        if codec_args:
            cmd.extend(codec_args)
        else:
            cmd.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac"])
    else:
        cmd.extend(["-c:v", "copy", "-c:a", "copy"])

    cmd.append(output_path)

    try:
        subprocess.run(cmd, check=True, timeout=600)
    finally:
        for tf in text_files:
            try:
                os.unlink(tf)
            except Exception:
                pass
