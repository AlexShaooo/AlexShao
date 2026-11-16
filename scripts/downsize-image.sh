#!/usr/bin/env bash
# Downsize JPEG photos in place to the site's standard:
#   long edge capped at 1600 px, JPEG quality 80, EXIF/XMP/ICC stripped,
#   baseline, chroma subsampling kept from the source.
#
# These are the settings of commit a2214f1 (2026-06-21). Re-running them on
# that commit's originals reproduces its output byte for byte. ICC profiles
# are stripped without colour conversion, so a Display P3 source loses a
# little saturation; that matches the existing files.
#
# Requires ImageMagick 7: brew install imagemagick
#
# Usage: scripts/downsize-image.sh IMAGE [IMAGE...]
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 IMAGE [IMAGE...]" >&2
  exit 2
fi

for f in "$@"; do
  before=$(stat -f %z "$f")
  magick "$f" -auto-orient -resize '1600x1600>' -strip -quality 80 "$f"
  after=$(stat -f %z "$f")
  printf '%s: %d -> %d bytes, %s\n' "$f" "$before" "$after" "$(identify -format '%wx%h' "$f")"
done
