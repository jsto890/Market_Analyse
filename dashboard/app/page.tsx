import fs from "fs";
import path from "path";
import { loadBridgeSignals } from "@/lib/bridge";
import { groupSignals } from "@/lib/groups";
import { diffReports, loadYesterdayRows, type DiffRow } from "@/lib/diff";
import { byDate, reportDates } from "@/lib/signals";
import type { BridgeRow, ReportGroup } from "@/types/bridge";
import { statusMessage } from "@/lib/todayStatus";
import DiffStrip from "@/components/today/DiffStrip";
import SignalGroups from "@/components/today/SignalGroups";
import DateStepper from "@/components/today/DateStepper";
import { type RotationRow } from "@/components/today/RotationPanel";
import { MorningReport } from "@/components/today/MorningReport";
import TodaysTape from "@/components/today/TodaysTape";
import SectorStrip from "@/components/today/SectorStrip";
import Page from "@/components/ui/Page";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";

export const dynamic = "force-dynamic";

function reportsDir(): string {
  return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
}

function loadMeta(): { generated_at: string | null } {
  try {
    const raw = fs.readFileSync(path.join(reportsDir(), "bridge_meta.json"), "utf-8");
    const meta = JSON.parse(raw) as { generated_at?: string };
    return { generated_at: meta.generated_at ?? null };
  } catch {
    return { generated_at: null };
  }
}

function loadRotation(): RotationRow[] | null {
  try {
    const raw = fs.readFileSync(path.join(reportsDir(), "rotation_latest.json"), "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as RotationRow[];
    return null;
  } catch {
    return null;
  }
}

function isStale(generatedAt: string | null): boolean {
  if (!generatedAt) return false;
  const t = new Date(generatedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) / 3_600_000 > 24;
}

function toDiffRow(row: BridgeRow, group: ReportGroup): DiffRow {
  return {
    ticker: row.ticker.toUpperCase(),
    report_group: group,
    sentiment_score: Number.isFinite(row.sentiment_score) ? row.sentiment_score : 0,
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const requestedDate = searchParams?.date ?? null;

  let dates: string[] = [];
  try {
    // reportDates() returns rows { date: string } DESC (newest first); DateStepper wants ascending (oldest first).
    const rawDates = reportDates() as { date: string }[];
    dates = rawDates.map((r) => r.date).reverse();
  } catch {
    dates = [];
  }
  const viewingHistory = requestedDate !== null && dates.includes(requestedDate);

  let rows: BridgeRow[] = [];
  if (viewingHistory) {
    try {
      rows = byDate(requestedDate) as unknown as BridgeRow[];
    } catch {
      rows = [];
    }
  } else {
    try {
      rows = loadBridgeSignals();
    } catch {
      rows = [];
    }
  }
  const groups = groupSignals(rows);

  // Build today's diff rows from derived groups (CSV report_group is not the group name).
  const todayDiffRows: DiffRow[] = [];
  (Object.keys(groups) as ReportGroup[]).forEach((g) => {
    for (const row of groups[g]) todayDiffRows.push(toDiffRow(row, g));
  });

  let diffData = {
    newTickers: [] as string[],
    dropped: [] as { ticker: string; group: string }[],
    groupMoves: [] as { ticker: string; from: string; to: string }[],
    sentimentTurns: [] as string[],
  };
  let hasYesterday = false;
  try {
    const yesterday = await loadYesterdayRows(viewingHistory ? requestedDate! : undefined);
    if (yesterday.length > 0) {
      hasYesterday = true;
      const d = diffReports(todayDiffRows, yesterday);
      diffData = {
        newTickers: Array.from(d.newTickers),
        dropped: d.dropped,
        groupMoves: d.groupMoves,
        sentimentTurns: Array.from(d.sentimentTurns),
      };
    }
  } catch {
    hasYesterday = false;
  }

  const meta = loadMeta();
  const stale = !viewingHistory && isStale(meta.generated_at);
  const rotation = viewingHistory ? null : loadRotation();

  const sectors = Array.from(
    new Set(rows.map((r) => r.industry).filter((s): s is string => !!s))
  ).sort();

  const stepper = <DateStepper dates={dates} current={viewingHistory ? requestedDate : null} />;

  return (
    <Page width="wide">
      <MorningReport />
      {/* The stepper rides in the tape's header rather than floating under it.
          On a history date there is no tape to ride in. */}
      {viewingHistory ? stepper : <TodaysTape actions={stepper} />}
      {(() => {
        const status = statusMessage({ rows, viewingHistory, stale, generatedAt: meta.generated_at });
        if (!status) return null;
        if (status.level === "error") {
          return (
            <Failed
              title="No bridge data"
              message="run_daily may have failed — no signals were produced for today."
            />
          );
        }
        return (
          <div role="status" className="flex flex-wrap items-center gap-2">
            <Stale asOf={meta.generated_at} source="bridge" />
            <span className="text-body text-2">run_daily may have failed.</span>
          </div>
        );
      })()}

      {hasYesterday && <DiffStrip diff={diffData} />}

      <SignalGroups groups={groups} newTickers={diffData.newTickers} sectors={sectors} />

      {rotation && rotation.length > 0 && <SectorStrip rows={rotation} />}
    </Page>
  );
}
