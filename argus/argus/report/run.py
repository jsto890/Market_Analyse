"""Morning-report entrypoint (master plan §WS-3.5) — launchd ~8am ET + run_daily.
Generates the brief, writes a stable reports/morning_latest.md artifact, and
appends it to the newest Obsidian daily report (idempotent — skipped if already
present). Run: python -m argus.report.run"""
import glob
import os
import sys
from pathlib import Path

from ..db import heartbeat
from .morning import generate, render_markdown

_MARKER = "## Morning Brief"
_DEFAULT_OBSIDIAN = str(Path.home() / "Documents/Obsidian Vault/Finance/Market Reports")


def _reports_dir() -> Path:
    # parents[3] is the repo root (.../Market_Analyse); reports/ lives there.
    d = Path(os.environ.get("BRIDGE_DIR") or (Path(__file__).resolve().parents[3] / "reports"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _append_to_obsidian(md: str) -> str | None:
    """Append the brief to the newest '*Daily Report.md', once. Returns the file
    touched, or None if there's no report to append to."""
    obs_dir = os.environ.get("OBSIDIAN_DIR", _DEFAULT_OBSIDIAN)
    files = sorted(glob.glob(os.path.join(obs_dir, "*Daily Report.md")),
                   key=os.path.getmtime, reverse=True)
    if not files:
        return None
    target = files[0]
    with open(target, encoding="utf-8") as f:
        body = f.read()
    if _MARKER in body:
        return target  # already appended — idempotent
    with open(target, "a", encoding="utf-8") as f:
        f.write("\n\n---\n\n" + md)
    return target


def main() -> int:
    report = generate()
    md = render_markdown(report)
    out = _reports_dir() / "morning_latest.md"
    out.write_text(md, encoding="utf-8")
    target = _append_to_obsidian(md)
    detail = f"brief {report['date']}" + (f", appended {os.path.basename(target)}" if target else "")
    heartbeat("morning-report", "ok", detail)
    print(f"morning-report: {detail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
