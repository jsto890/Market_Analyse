import fs from "fs";
import path from "path";
import { loadBridgeSignals } from "@/lib/bridge";
import { groupSignals } from "@/lib/groups";
import { diffReports, loadYesterdayRows, type DiffRow } from "@/lib/diff";
import { byDate, reportDates } from "@/lib/signals";
import { rotationSummary } from "@/lib/rotation";
import type { BridgeRow, ReportGroup } from "@/types/bridge";
import DiffStrip from "@/components/today/DiffStrip";
import SignalGroups from "@/components/today/SignalGroups";
import DateStepper from "@/components/today/DateStepper";
import Link from "next/link";
import { type RotationRow } from "@/components/today/RotationPanel";
import { MorningReport } from "@/components/today/MorningReport";

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

function formatTime(generatedAt: string | null): string {
  if (!generatedAt) return "unknown";
  const d = new Date(generatedAt);
  return d.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export type StatusMessage = { level: "error" | "warn"; text: string };

export function statusMessage({
  rows,
  viewingHistory,
  stale,
  generatedAt,
}: {
  rows: BridgeRow[];
  viewingHistory: boolean;
  stale: boolean;
  generatedAt: string | null;
}): StatusMessage | null {
  if (rows.length === 0 && !viewingHistory) {
    return { level: "error", text: "No bridge data — run_daily may have failed" };
  }
  if (stale) {
    return {
      level: "warn",
      text: `Bridge data is stale (generated ${formatTime(generatedAt)}) — run_daily may have failed`,
    };
  }
  return null;
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

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <MorningReport />
      </div>
      <DateStepper dates={dates} current={viewingHistory ? requestedDate : null} />
      {(() => {
        const status = statusMessage({ rows, viewingHistory, stale, generatedAt: meta.generated_at });
        if (!status) return null;
        const tone =
          status.level === "error"
            ? "border-neg/50 bg-neg/10 text-neg"
            : "border-warn/50 bg-warn/10 text-warn";
        return (
          <div role="status" className={`rounded-md border px-4 py-2.5 text-[13px] ${tone}`}>
            {status.text}
          </div>
        );
      })()}

      {hasYesterday && <DiffStrip diff={diffData} />}

      <SignalGroups groups={groups} newTickers={diffData.newTickers} sectors={sectors} />

      {rotation && rotation.length > 0 && (
        <Link
          href="/rotation"
          className="block rounded-md border border-line bg-elevated px-4 py-2.5 text-[13px] text-muted hover:text-foreground transition-colors"
        >
          {rotationSummary(rotation)}
        </Link>
      )}
    </main>
  );
}
