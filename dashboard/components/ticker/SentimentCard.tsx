"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import CenterBar from "@/components/ui/CenterBar";
import ConvictionDot from "@/components/ui/ConvictionDot";
import { splitAccounts } from "@/lib/sources";
import type { BridgeRow, Conviction } from "@/types/bridge";

interface SentimentCardProps {
  bridgeRow: BridgeRow | null;
  lastSeen: string | null;
}

export default function SentimentCard({ bridgeRow, lastSeen }: SentimentCardProps) {
  if (!bridgeRow) {
    return (
      <Panel title="Sentiment">
        <p className="text-dense text-muted">
          No social signal today — last seen {lastSeen ?? "never"}
        </p>
      </Panel>
    );
  }

  const { sentiment_score, mentions, accounts, conviction, top_accounts } = bridgeRow;
  const chips = splitAccounts(top_accounts);

  return (
    <Panel title="Sentiment">
      <div className="space-y-3">
        {/* Score + stats line */}
        <div className="flex items-center gap-3 flex-wrap">
          <CenterBar value={sentiment_score} width={100} showValue />
          <span className="font-mono text-body tabular-nums text-muted">
            <span className="text-foreground">{mentions}</span> mentions
          </span>
          <span className="font-mono text-body tabular-nums text-muted">
            <span className="text-foreground">{accounts}</span> accounts
          </span>
          <ConvictionDot value={conviction as Conviction} />
        </div>

        {/* Account chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((acct) => (
              <Link
                key={acct}
                href={`/sources?ticker=${bridgeRow.ticker.toUpperCase()}`}
                className="inline-flex items-center rounded border-l-2 border-l-accent border border-line bg-surface pl-1.5 pr-2 py-0.5 font-mono text-dense text-muted hover:text-accent hover:border-accent/40 transition-colors"
              >
                {acct}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
