#!/usr/bin/env bash
# Render docs/assets/sample-daily-report.pdf → PNG pages + one tall scroll image
# for the GitHub README embed. Requires poppler (brew install poppler).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PDF="${1:-$ROOT/docs/assets/sample-daily-report.pdf}"
OUT="$ROOT/docs/assets/report-preview"
SCROLL="$OUT/scroll-preview.png"

if ! command -v pdftoppm >/dev/null 2>&1; then
  echo "pdftoppm not found. Install poppler: brew install poppler" >&2
  exit 1
fi

if [[ ! -f "$PDF" ]]; then
  echo "PDF not found: $PDF" >&2
  exit 1
fi

if ! file "$PDF" | grep -qi 'pdf'; then
  echo "Not a valid PDF: $PDF" >&2
  file "$PDF" >&2
  exit 1
fi

mkdir -p "$OUT"
rm -f "$OUT"/page-*.png "$SCROLL"

pdftoppm -png -r 144 "$PDF" "$OUT/page"
# pdftoppm names: page-1.png, page-2.png, …

shopt -s nullglob
pages=( "$OUT"/page-*.png )
if (( ${#pages[@]} == 0 )); then
  echo "No pages rendered from $PDF" >&2
  exit 1
fi

if command -v magick >/dev/null 2>&1; then
  magick "${pages[@]}" -append "$SCROLL"
elif command -v convert >/dev/null 2>&1; then
  convert "${pages[@]}" -append "$SCROLL"
else
  echo "ImageMagick not found for scroll stitch. Install: brew install imagemagick" >&2
  echo "Individual pages are in $OUT (page-*.png)" >&2
  exit 1
fi

echo "Rendered ${#pages[@]} page(s)"
echo "  Pages:  $OUT/page-*.png"
echo "  Scroll: $SCROLL"
