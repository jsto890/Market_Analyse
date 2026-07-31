import fs from "fs";
import path from "path";
import Link from "next/link";
import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";
import RRGChart, { type SectorNames } from "@/components/rotation/RRGChart";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import Page from "@/components/ui/Page";
import { loadBridgeSignals } from "@/lib/bridge";

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

  return (
    <Page width="wide">
      <Page.Header
        title="Sector Rotation"
        status={<Stale asOf={mtime} source="run_daily" staleAfterMins={1440} />}
        actions={
          // Price strength by sector and news tone by sector are the same
          // question read off two different feeds — they belong one click apart.
          <Link href="/macro" className="text-body text-muted hover:text-accent">
            Sector sentiment ›
          </Link>
        }
      />
      {rotation ? (
        <>
          <RRGChart rows={rotation} namesBySector={namesBySector} />
          <RotationPanel rows={rotation} defaultOpen collapsible={false} />
        </>
      ) : (
        <Failed
          title="No rotation data"
          message="rotation_latest.json hasn't been written — the run_daily rotation job may have failed."
        />
      )}
    </Page>
  );
}
