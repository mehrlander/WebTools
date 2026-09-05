"""Render a step list as an MP4 of still cards, one card per step.

The point is not motion. iOS Picture-in-Picture is the only mechanism that keeps
content floating above another app, and it only floats video, so a walkthrough
that has to stay readable while the reader works in Settings or Shortcuts is
shipped as frames of text. The player's own scrubber becomes the step
navigator: each step occupies an equal, known slice of the timeline.

    python3 scripts/pip-steps.py data/pip-steps/<name>.json pages/media/<name>.mp4

Source shape: {"title": str, "steps": [{"text": str, "detail": str?}, ...]}.

Needs Pillow and an ffmpeg binary. Neither is a repo dependency, since nothing
else here encodes video:

    pip install pillow imageio-ffmpeg

ffmpeg is taken from imageio_ffmpeg when present, otherwise from PATH.
"""
import argparse
import json
import shutil
import subprocess
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (11, 13, 16)
RULE = (30, 36, 44)
DIM = (122, 134, 154)
BODY = (242, 245, 248)
ACCENT = (79, 156, 249)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")


def font(name, size):
    path = FONT_DIR / name
    if not path.exists():
        sys.exit(f"missing font {path}; install fonts-dejavu-core")
    return ImageFont.truetype(str(path), size)


def wrap(draw, text, fnt, width):
    """Greedy wrap on measured width, since a card is sized by pixels not columns."""
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=fnt) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def card(step, index, total, size):
    w, h = size
    pad = round(w * 0.06)
    img = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(img)

    label_f = font("DejaVuSans-Bold.ttf", round(h * 0.042))
    body_f = font("DejaVuSans-Bold.ttf", round(h * 0.098))
    detail_f = font("DejaVuSans.ttf", round(h * 0.055))

    y = pad
    d.text((pad, y), f"STEP {index + 1} OF {total}", font=label_f, fill=DIM)
    y += round(h * 0.042) + round(h * 0.03)
    d.line([(pad, y), (w - pad, y)], fill=RULE, width=2)
    y += round(h * 0.05)

    inner = w - 2 * pad
    for line in wrap(d, step["text"], body_f, inner):
        d.text((pad, y), line, font=body_f, fill=BODY)
        y += round(h * 0.128)

    detail = step.get("detail")
    if detail:
        y += round(h * 0.02)
        for line in wrap(d, detail, detail_f, inner):
            d.text((pad, y), line, font=detail_f, fill=DIM)
            y += round(h * 0.072)

    bar_h = round(h * 0.014)
    bar_y = h - bar_h
    d.rectangle([0, bar_y, w, h], fill=RULE)
    d.rectangle([0, bar_y, round(w * (index + 1) / total), h], fill=ACCENT)
    return img


def ffmpeg_exe():
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        exe = shutil.which("ffmpeg")
        if not exe:
            sys.exit("no ffmpeg: pip install imageio-ffmpeg, or put ffmpeg on PATH")
        return exe


def encode(cards, out, seconds, fps):
    """Pipe each card as PNG for `seconds`, so the timeline is evenly divided."""
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg_exe(), "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
        "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-r", str(fps), str(out),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for img in cards:
        b = BytesIO()
        img.save(b, format="PNG")
        frame = b.getvalue()
        for _ in range(seconds * fps):
            proc.stdin.write(frame)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path, help="steps JSON")
    ap.add_argument("out", type=Path, help="MP4 to write")
    ap.add_argument("--seconds", type=int, default=5, help="seconds per step")
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--width", type=int, default=800)
    ap.add_argument("--height", type=int, default=600)
    a = ap.parse_args()

    doc = json.loads(a.source.read_text())
    steps = doc["steps"]
    size = (a.width, a.height)
    cards = [card(s, i, len(steps), size) for i, s in enumerate(steps)]
    encode(cards, a.out, a.seconds, a.fps)
    print(f"{a.out} · {len(steps)} steps · {a.seconds}s each · {a.out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
