"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import { aggregateAccounts, splitAccounts, type AccountAgg } from "@/lib/sources";
import type { BridgeRow } from "@/types/bridge";

interface SourcesTableProps {
  rows: BridgeRow[];
  initialTicker: string;
}

export default function SourcesTable({ rows, initialTicker }: SourcesTableProps) {
  const [filter, setFilter] = useState(initialTicker);
  const needle = filter.trim().toUpperCase();

  const tickerRows = useMemo(
    () =>
      needle === ""
        ? rows
        : rows.filter(
            (r) =>
              r.ticker.toUpperCase().includes(needle) ||
              (r.top_accounts ?? "").toUpperCase().includes(needle)
          ),
    [rows, needle]
  );

  const accountRows = useMemo(() => {
    const all = aggregateAccounts(rows);
    if (needle === "") return all;
    return all.filter(
      (a) =>
        a.handle.toUpperCase().includes(needle) ||
        a.tickers.some((t) => t.includes(needle))
    );
  }, [rows, needle]);

  const tickerColumns: Column<BridgeRow>[] = [
    { key: "ticker", header: "Ticker", render: (r) => <Link href={`/t/${r.ticker}`} className="text-accent hover:underline">{r.ticker}</Link> },
    { key: "mentions", header: "Mentions", align: "right", sortable: true, sortFn: (a, b) => a.mentions - b.mentions, render: (r) => r.mentions },
    { key: "accounts", header: "Accounts", align: "right", sortable: true, sortFn: (a, b) => a.accounts - b.accounts, render: (r) => r.accounts },
    { key: "source_score", header: "Source score", align: "right", sortable: true, sortFn: (a, b) => a.source_score - b.source_score, render: (r) => r.source_score.toFixed(2) },
    {
      key: "top_accounts",
      header: "Top accounts",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {splitAccounts(r.top_accounts).map((h) => (
            <span key={h} className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {h}
            </span>
          ))}
        </div>
      ),
    },
  ];

  const accountColumns: Column<AccountAgg>[] = [
    { key: "handle", header: "Account", render: (a) => <span className="font-mono text-[12px]">{a.handle}</span> },
    { key: "tickerCount", header: "Tickers today", align: "right", sortable: true, sortFn: (a, b) => a.tickerCount - b.tickerCount, render: (a) => a.tickerCount },
    {
      key: "tickers",
      header: "Which tickers",
      render: (a) => (
        <div className="flex flex-wrap gap-1">
          {a.tickers.map((t) => (
            <Link key={t} href={`/t/${t}`} className="text-[11px] text-muted hover:text-accent">
              {t}
            </Link>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Input
        placeholder="Filter by ticker or account"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />

      <section>
        <h2 className="mb-2 text-[13px] font-medium text-muted">Today's tickers ({tickerRows.length})</h2>
        <DataTable
          columns={tickerColumns}
          rows={tickerRows}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "source_score", dir: "desc" }}
          persistKey="sources-tickers"
        />
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-medium text-muted">Today's accounts ({accountRows.length})</h2>
        <DataTable
          columns={accountColumns}
          rows={accountRows}
          rowKey={(a) => a.handle}
          defaultSort={{ key: "tickerCount", dir: "desc" }}
          persistKey="sources-accounts"
        />
      </section>
    </div>
  );
}
