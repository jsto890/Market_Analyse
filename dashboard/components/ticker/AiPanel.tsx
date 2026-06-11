"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
import Skeleton from "@/components/ui/Skeleton";
import type { WrittenAnalysis } from "@/types/argus";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; report: string }
  | { status: "error"; message: string };

export default function AiPanel({ ticker }: { ticker: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function generate() {
    if (state.status === "loading" || state.status === "done") return;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/argus/analysis/${ticker}`, { cache: "no-store" });
      const json = (await res.json()) as WrittenAnalysis | { error: string };
      if (!res.ok || "error" in json || !("report" in json) || !json.report) {
        const msg = "error" in json && json.error ? json.error : "analysis unavailable";
        setState({ status: "error", message: msg });
        return;
      }
      setState({ status: "done", report: json.report });
    } catch {
      setState({ status: "error", message: "Argus API offline" });
    }
  }

  return (
    <Panel title="AI" collapsible defaultOpen={false} persistKey="ticker-ai">
      <div className="space-y-3">
        {state.status === "idle" && (
          <button
            type="button"
            onClick={generate}
            className="font-mono text-[12px] text-accent border border-accent/40 rounded px-3 py-1 hover:bg-accent/10 transition-colors"
          >
            Generate analysis ~10s
          </button>
        )}

        {state.status === "loading" && (
          <div className="space-y-2 py-1">
            <p className="font-mono text-[11px] text-muted animate-pulse">
              Writing analysis… ~10s
            </p>
            <Skeleton width="100%" height={10} />
            <Skeleton width="100%" height={10} />
            <Skeleton width="90%" height={10} />
            <Skeleton width="95%" height={10} />
            <Skeleton width="70%" height={10} />
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-2">
            <p className="font-mono text-[12px] text-neg">{state.message}</p>
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="font-mono text-[11px] text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {state.status === "done" && (
          <pre className="font-mono text-[12px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {state.report}
          </pre>
        )}
      </div>
    </Panel>
  );
}
