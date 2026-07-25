#!/usr/bin/env bash
# Install everything docstruct needs. Measured at about 18 seconds on the
# Claude Code web sandbox (9 s apt, 8 s pip).
#
# This exists because the sandbox container does not persist: a session that
# ran a full extraction pass yesterday starts today with no tesseract, no
# poppler and no PyMuPDF. Re-running this is the first step of any session that
# touches the harness, and it is idempotent.
#
#   ./docstruct/bootstrap.sh          # baseline
#   ./docstruct/bootstrap.sh --check  # report what is present, install nothing
set -euo pipefail

APT_PKGS="tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd poppler-utils qpdf"
PIP_PKGS="pymupdf pillow"

check() {
  local missing=0
  for b in tesseract pdftoppm qpdf; do
    if command -v "$b" >/dev/null; then
      printf '  %-12s %s\n' "$b" "$("$b" --version 2>&1 | head -1)"
    else
      printf '  %-12s MISSING\n' "$b"; missing=1
    fi
  done
  for m in fitz PIL; do
    if python3 -c "import $m" 2>/dev/null; then
      printf '  %-12s ok\n' "$m"
    else
      printf '  %-12s MISSING\n' "$m"; missing=1
    fi
  done
  # osd is a separate traineddata file and its absence is silent until a page
  # needs orientation detection, which is exactly when it matters.
  if tesseract --list-langs 2>/dev/null | grep -qx osd; then
    printf '  %-12s ok\n' "osd data"
  else
    printf '  %-12s MISSING (orientation detection will fail)\n' "osd data"; missing=1
  fi
  return $missing
}

if [ "${1:-}" = "--check" ]; then
  echo "docstruct dependencies:"
  check && echo "all present" || { echo "run ./docstruct/bootstrap.sh to install"; exit 1; }
  exit 0
fi

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

echo "installing system packages..."
$SUDO apt-get update -qq
# shellcheck disable=SC2086
$SUDO apt-get install -y -qq $APT_PKGS

echo "installing python packages..."
# shellcheck disable=SC2086
pip install -q $PIP_PKGS

echo
echo "docstruct dependencies:"
check
