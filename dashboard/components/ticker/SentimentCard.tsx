"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import Empty from "@/components/ui/Empty";
import CenterBar from "@/components/ui/CenterBar";
import ConvictionDot from "@/components/ui/ConvictionDot";
import { splitAccounts } from "@/lib/sources";
import type { BridgeRow, Conviction } from "@/types/bridge";

interface SentimentCardProps {
  bridgeRow: BridgeRow | null;
  lastSeen: string | null;
}

/** What the three numbers add up to. Tone says which way the chatter leans,
 *  breadth says whether it is a crowd or one account posting twenty times. */
function sentimentRead(score: number, mentions: number, accounts: number): string {
  const tone =
    score >= 0.3 ? "Positive tone" : score <= -0.3 ? "Negative tone" : "Mixed tone";
  if (accounts < 1 || mentions < 1) return `${tone}, on too little chatter to read breadth.`;
  const perAccount = mentions / accounts;
  const breadth =
    accounts <= 3
      ? `from ${accounts} account${accounts === 1 ? "" : "s"} — one voice, not a crowd`
      : perAccount >= 4
        ? `concentrated in ${accounts} accounts at ~${perAccount.toFixed(1)} posts each`
        : `spread across ${accounts} accounts`;
  return `${tone} ${breadth}. Chatter surfaced this name; the technical read decides it.`;
}

export default function SentimentCard({ bridgeRow, lastSeen }: SentimentCardProps) {
  if (!bridgeRow) {
    return (
      <Panel title="Sentiment">
        <Empty
          title="No social signal today"
          message={`Last seen ${lastSeen ?? "never"}.`}
        />
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
          <span className="text-data text-muted">
            <span className="text-foreground">{mentions}</span> mentions
          </span>
          <span className="text-data text-muted">
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
                className="inline-flex items-center rounded border-l-2 border-l-accent border border-line bg-surface pl-1.5 pr-2 py-0.5 text-data text-muted hover:text-accent hover:border-accent/40 transition-colors"
              >
                {acct}
              </Link>
            ))}
          </div>
        )}

        <p className="text-body text-2">{sentimentRead(sentiment_score, mentions, accounts)}</p>
      </div>
    </Panel>
  );
}
