"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import ScoreBar from "@/components/ui/ScoreBar";
import ConvictionDot from "@/components/ui/ConvictionDot";
import type { BridgeRow, Conviction } from "@/types/bridge";

interface SentimentCardProps {
  bridgeRow: BridgeRow | null;
  lastSeen: string | null;
}

function splitAccounts(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function SentimentCard({ bridgeRow, lastSeen }: SentimentCardProps) {
  if (!bridgeRow) {
    return (
      <Panel title="Sentiment">
        <p className="text-[12px] text-muted">
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
          <ScoreBar value={sentiment_score} showValue />
          <span className="font-mono text-[13px] tabular-nums text-muted">
            <span className="text-foreground">{mentions}</span> mentions
          </span>
          <span className="font-mono text-[13px] tabular-nums text-muted">
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
                href="/sources"
                className="inline-flex items-center rounded border-l-2 border-l-accent border border-line bg-surface pl-1.5 pr-2 py-0.5 font-mono text-[12px] text-muted hover:text-accent hover:border-accent/40 transition-colors"
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
