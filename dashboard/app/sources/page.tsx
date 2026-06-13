"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";
import DataTable, { Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import PipelineHealth from "@/components/sources/PipelineHealth";
import type { AccountsData, AccountStat } from "@/types/accounts";
import { TIER_ORDER, TIER_LABEL } from "@/types/accounts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmtPct(v: number | null): React.ReactNode {
  if (v === null) return <span className="text-muted">—</span>;
  const pct = v * 100;
  const cls = pct >= 0 ? "text-pos" : "text-neg";
  return (
    <span className={`tabular-nums ${cls}`}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function TierSection({ accounts }: { accounts: AccountStat[] }) {
  const columns: Column<AccountStat>[] = [
    {
      key: "account",
      header: "Account",
      render: (r) => {
        const handle = r.account.replace("@", "");
        return (
          <a
            href={`https://x.com/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-mono text-[12px]"
            onClick={(e) => e.stopPropagation()}
          >
            {r.account}
          </a>
        );
      },
    },
    {
      key: "complete_1d_count",
      header: "N (1d)",
      align: "right",
      render: (r) => (
        <span className={`tabular-nums ${r.complete_1d_count < 10 ? "text-warn" : "text-muted"}`}>
          {r.complete_1d_count}
        </span>
      ),
    },
    {
      key: "hit_rate_1d",
      header: "Hit rate 1d",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.hit_rate_1d ?? -1) - (b.hit_rate_1d ?? -1),
      render: (r) => {
        if (r.hit_rate_1d === null) return <span className="text-muted">—</span>;
        const pct = r.hit_rate_1d * 100;
        const cls = pct >= 65 ? "text-pos" : pct >= 45 ? "text-warn" : "text-neg";
        return <span className={`tabular-nums ${cls}`}>{pct.toFixed(1)}%</span>;
      },
    },
    {
      key: "avg_ret_1d",
      header: "Avg ret 1d",
      align: "right",
      render: (r) => fmtPct(r.avg_ret_1d),
    },
    {
      key: "avg_excess_ret_1d",
      header: "Excess ret",
      align: "right",
      render: (r) => fmtPct(r.avg_excess_ret_1d),
    },
    {
      key: "trust_score",
      header: "Trust",
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.trust_score - b.trust_score,
      render: (r) => (
        <span className="tabular-nums font-medium">{r.trust_score.toFixed(1)}</span>
      ),
    },
    {
      key: "top_tickers",
      header: "Top tickers",
      render: (r) => (
        <span className="flex flex-wrap gap-0.5">
          {r.top_tickers.slice(0, 5).map((t) => (
            <span
              key={t}
              className="inline-block px-1 py-px bg-elevated text-muted text-[11px] rounded border border-line"
            >
              {t}
            </span>
          ))}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={accounts}
      rowKey={(r) => r.account}
      defaultSort={{ key: "trust_score", dir: "desc" }}
      persistKey={`sources-tier-${accounts[0]?.account_tier ?? "unknown"}`}
    />
  );
}

export default function SourcesPage() {
  const { data, isLoading } = useSWR<AccountsData>("/api/accounts", fetcher);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Sources</h1>
      <p className="text-[13px] text-muted">
        X/Twitter accounts tracked by Argus. N &lt; 10 shown in amber (insufficient sample).
      </p>

      <PipelineHealth />

      {isLoading && <p className="text-[13px] text-muted">Loading…</p>}

      {data &&
        TIER_ORDER.map((tier) => {
          const rows = data.by_tier[tier];
          if (!rows || rows.length === 0) return null;
          return (
            <Panel key={tier} title={TIER_LABEL[tier]} persistKey={`sources-panel-${tier}`}>
              <TierSection accounts={rows} />
            </Panel>
          );
        })}

      {data && TIER_ORDER.every((t) => !data.by_tier[t]?.length) && (
        <EmptyState message="No account data available" />
      )}
    </main>
  );
}
