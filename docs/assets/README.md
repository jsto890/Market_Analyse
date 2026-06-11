# Report assets for the GitHub README

## Files

| File | Purpose |
|------|---------|
| `sample-daily-report.pdf` | **Only PDF committed** — README download link + source for preview |
| `report-preview/scroll-preview.png` | Tall stitched image for the scrollable README embed |
| `report-preview/page-*.png` | Intermediate pages (gitignored; regenerate via script) |
| `* Daily Report.pdf` (dated exports) | Gitignored — copy into `sample-daily-report.pdf` when refreshing the README |

## Regenerate preview images

After updating the PDF:

```bash
brew install poppler imagemagick   # once
./scripts/render_report_preview.sh
git add docs/assets/sample-daily-report.pdf docs/assets/report-preview/scroll-preview.png
# page-*.png are intermediate; only scroll-preview.png is needed for the README
```

GitHub cannot embed a live PDF viewer in README markdown. The README uses a fixed-height box with `scroll-preview.png` instead.
