import os
import subprocess
import sys
from pathlib import Path

from argus.db import get_conn

ARGUS_DIR = Path(__file__).resolve().parents[1]  # .../Market_Analyse/argus


def test_cli_writes_heartbeat(tmp_path):
    db = tmp_path / "t.db"
    env = dict(os.environ, ARGUS_DB=str(db))
    result = subprocess.run(
        [sys.executable, "-m", "argus.heartbeat", "test-job", "ok", "all good"],
        env=env, capture_output=True, text=True, cwd=str(ARGUS_DIR),
    )
    assert result.returncode == 0, result.stderr
    conn = get_conn(db)
    row = conn.execute("SELECT job, status, detail FROM heartbeats").fetchone()
    conn.close()
    assert (row["job"], row["status"], row["detail"]) == ("test-job", "ok", "all good")
