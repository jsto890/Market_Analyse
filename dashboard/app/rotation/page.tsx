import fs from "fs";
import path from "path";
import Link from "next/link";
import { type RotationRow } from "@/components/today/RotationPanel";
import { type SectorNames } from "@/components/rotation/RRGChart";
import RotationView from "@/components/rotation/RotationView";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import Page from "@/components/ui/Page";
import { loadBridgeSignals } from "@/lib/bridge";
import { buildTrails, type TrailHistory } from "@/lib/rotationTrails";

export const dynamic = "force-dynamic";

function reportsDir(): string {
  return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
}

function rotationPath(): string {
  return path.join(reportsDir(), "rotation_latest.json");
}

function loadRotation(): RotationRow[] | null {
  try {
    const raw = fs.readFileSync(rotationPath(), "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as RotationRow[];
    return null;
  } catch {
    return null;
  }
}

/**
 * Today's candidates keyed by industry — the bridge tags every row with the
 * same industry vocabulary the rotation job uses, so a sector on the chart maps
 * straight onto the names that came out of it. Null when the signals file can't
 * be read: the chart then shows no picked-names line rather than telling you
 * every sector is empty.
 */
function loadNamesBySector(): SectorNames | undefined {
  try {
    const bySector: SectorNames = {};
    for (const row of loadBridgeSignals()) {
      if (!row.industry || !row.ticker) continue;
      (bySector[row.industry] ??= []).push({ ticker: row.ticker, action_label: row.action_label });
    }
    return bySector;
  } catch {
    return undefined;
  }
}

/**
 * Where each sector has been. The rotation job began keeping RS coordinates on
 * 2026-08-01, so the file is short at first and the chart simply draws fewer
 * tails — nothing renders a sector's history until there are two weeks of it.
 */
function loadTrailHistory(): TrailHistory | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(reportsDir(), "rotation_history.json"), "utf-8")
    ) as TrailHistory;
  } catch {
    return undefined;
  }
}

function loadRotationMtime(): Date | null {
  try {
    return fs.statSync(rotationPath()).mtime;
  } catch {
    return null;
  }
}

export default function RotationPage() {
  const rotation = loadRotation();
  const mtime = loadRotationMtime();
  const namesBySector = loadNamesBySector();
  const trails = rotation
    ? buildTrails(loadTrailHistory(), rotation.map((r) => r.industry))
    : {};

  return (
    <Page width="wide">
      <Page.Header
        title="Sector Rotation"
        // No source: `run_daily` is the name of a cron job, not a data
        // provider — it tells a reader nothing that `IBKR` or `yfinance` would.
        status={<Stale asOf={mtime} staleAfterMins={1440} />}
        actions={
          // Price strength by sector and news tone by sector are the same
          // question read off two different feeds — they belong one click apart.
          <Link href="/macro" className="text-body text-muted hover:text-accent">
            Sector sentiment ›
          </Link>
        }
      />
      {rotation ? (
        <RotationView rows={rotation} namesBySector={namesBySector} trails={trails} />
      ) : (
        <Failed
          title="No rotation data"
          message="rotation_latest.json hasn't been written — the run_daily rotation job may have failed."
        />
      )}
    </Page>
  );
}
