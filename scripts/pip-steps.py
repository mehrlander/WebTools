"""Render a walkthrough as an MP4 of still cards, one card per screen.

The point is not motion. iOS Picture-in-Picture is the only mechanism that keeps
content floating above another app, and it only floats video, so a walkthrough
that has to stay readable while the reader works in Settings or Shortcuts is
shipped as frames of text. The player's own scrubber becomes the navigator:
each card occupies an equal, known slice of the timeline.

    python3 scripts/pip-steps.py data/pip-steps/<name>.json pages/media/<name>.mp4

Source shape:

    {"title": str, "cards": [{"lines": [str, ...], "note": str?}, ...]}

A card holds the instructions the reader can act on without looking back, so
grouping two or three shortens the loop: a reader who misses their card waits
for the whole cycle, and the cycle is the cost this format has to keep down.

TYPE IS FITTED, NEVER CHOSEN. The size is the largest at which every line on
the card fits its width without wrapping, so a line that would wrap makes the
card's type smaller rather than making the reader parse a fragment. Measured on
the real thing: at 800px wide a card renders 243pt wide on an iPhone, 57% of
screen width, which puts a 59px card font at 17.8pt on screen. Lines are then
distributed down the card, because a top-aligned pair leaves two thirds of a
4:3 window empty.

Position is shown by a segment bar rather than the words "STEP 2 OF 10", which
cost a line of the space they were reporting on.

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
DONE = (58, 68, 82)
PENDING = (26, 31, 38)
DIM = (150, 162, 180)
BODY = (245, 247, 250)
ACCENT = (88, 166, 255)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
MEASURE = ImageDraw.Draw(Image.new("RGB", (1, 1)))


def font(name, size):
    path = FONT_DIR / name
    if not path.exists():
        sys.exit(f"missing font {path}; install fonts-dejavu-core")
    return ImageFont.truetype(str(path), size)


def fit(lines, width, ceiling, floor=18):
    """Largest size at which every line clears `width` on one line."""
    for size in range(ceiling, floor - 1, -1):
        f = font("DejaVuSans-Bold.ttf", size)
        if all(MEASURE.textlength(t, font=f) <= width for t in lines):
            return size
    return floor


def card(entry, index, total, size):
    w, h = size
    pad = round(w * 0.06)
    inner = w - 2 * pad
    bar = round(h * 0.022)
    top, bottom = pad, h - bar - round(h * 0.05)

    lines = entry["lines"]
    note = entry.get("note")
    body_size = fit(lines, inner, ceiling=round(h * 0.16))
    body_f = font("DejaVuSans-Bold.ttf", body_size)
    note_f = font("DejaVuSans.ttf", round(body_size * 0.62))

    img = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(img)

    note_block = 0
    if note:
        note_lines = wrap(note, note_f, inner)
        note_block = round(body_size * 0.62 * 1.35) * len(note_lines) + round(h * 0.03)

    # Distribute the lines down the card rather than stacking them at the top:
    # a 4:3 window is mostly empty otherwise.
    room = bottom - top - note_block
    step = room / len(lines)
    for i, text in enumerate(lines):
        y = top + step * i + (step - body_size * 1.2) / 2
        d.text((pad, y), text, font=body_f, fill=BODY)

    if note:
        y = bottom - note_block + round(h * 0.03)
        for text in note_lines:
            d.text((pad, y), text, font=note_f, fill=DIM)
            y += round(body_size * 0.62 * 1.35)

    # Position as segments, one per card: filled behind, accent here, dim ahead.
    gap = round(w * 0.008)
    seg = (w - gap * (total - 1)) / total
    for i in range(total):
        x = i * (seg + gap)
        fill = ACCENT if i == index else (DONE if i < index else PENDING)
        d.rectangle([x, h - bar, x + seg, h], fill=fill)
    return img


def wrap(text, fnt, width):
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if MEASURE.textlength(trial, font=fnt) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


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
    ap.add_argument("source", type=Path, help="cards JSON")
    ap.add_argument("out", type=Path, help="MP4 to write")
    ap.add_argument("--seconds", type=int, default=6, help="seconds per card")
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--width", type=int, default=800)
    ap.add_argument("--height", type=int, default=600)
    ap.add_argument("--frames", type=Path, help="also write each card as a PNG here")
    a = ap.parse_args()

    doc = json.loads(a.source.read_text())
    entries = doc["cards"]
    size = (a.width, a.height)
    imgs = [card(e, i, len(entries), size) for i, e in enumerate(entries)]
    if a.frames:
        a.frames.mkdir(parents=True, exist_ok=True)
        for i, img in enumerate(imgs):
            img.save(a.frames / f"{i + 1:02d}.png")
    encode(imgs, a.out, a.seconds, a.fps)
    total = len(entries) * a.seconds
    print(f"{a.out} · {len(entries)} cards · {a.seconds}s each · {total}s loop · {a.out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
