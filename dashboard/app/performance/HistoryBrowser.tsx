"use client";

import { useState } from "react";
import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import DataTable, { Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";

interface SignalRow {
  date: string;
  ticker: string;
  action_label: string;
  combined_score: number;
  entry: number;
  combo: string;
  report_group: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function HistoryBrowser() {
  const { data: dates } = useSWR<{ date: string }[]>("/api/signals/dates", fetcher);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const activeDate = selectedDate || (dates?.[0]?.date ?? "");
  const { data: signals } = useSWR<SignalRow[]>(
    activeDate ? `/api/signals/by-date?date=${activeDate}` : null,
    fetcher
  );

  const columns: Column<SignalRow>[] = [
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => <span className="font-mono font-medium">{r.ticker}</span>,
    },
    {
      key: "action_label",
      header: "Action",
      render: (r) => r.action_label ? <Badge variant="tier" value={r.action_label} /> : <span className="text-muted">—</span>,
    },
    {
      key: "combo",
      header: "Combo",
      render: (r) => <span className="font-mono text-[12px] text-muted">{r.combo ?? "—"}</span>,
    },
    {
      key: "combined_score",
      header: "Score",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.combined_score - b.combined_score,
      render: (r) =>
        r.combined_score != null ? (
          <span className="tabular-nums">{r.combined_score.toFixed(2)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      render: (r) =>
        r.entry != null ? (
          <span className="tabular-nums">${r.entry.toFixed(2)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "report_group",
      header: "Group",
      render: (r) => <span className="text-[12px] text-muted">{r.report_group ?? "—"}</span>,
    },
  ];

  return (
    <Panel
      title="History Browser"
      subtitle="selections only — not the screened universe; no survivorship correction"
      collapsible
      defaultOpen
      persistKey="perf-history"
    >
      <div className="mb-3 flex items-center gap-2">
        <label className="text-[12px] text-muted" htmlFor="history-date">Date</label>
        <select
          id="history-date"
          value={activeDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded border border-line bg-elevated px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {(dates ?? []).map((d) => (
            <option key={d.date} value={d.date}>
              {d.date}
            </option>
          ))}
        </select>
      </div>

      {!signals || signals.length === 0 ? (
        <EmptyState message="No signals for this date" />
      ) : (
        <DataTable
          columns={columns}
          rows={signals}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "combined_score", dir: "desc" }}
          persistKey="perf-history-table"
        />
      )}
    </Panel>
  );
}
