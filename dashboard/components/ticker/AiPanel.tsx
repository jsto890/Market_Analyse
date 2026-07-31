"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
import Loading from "@/components/ui/Loading";
import Failed from "@/components/ui/Failed";
import type { WrittenAnalysis } from "@/types/argus";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; report: string }
  | { status: "error"; message: string };

function reportParagraphs(report: string): string[] {
  return report
    .split(/\n{2,}/)
    .flatMap((block) => (block.includes("\n") ? block.split(/\n/) : [block]))
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function AiPanel({ ticker }: { ticker: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (state.status === "loading") return;
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
            className="text-data text-accent border border-accent/40 rounded px-3 py-1 hover:bg-accent/10 transition-colors"
          >
            Generate analysis ~10s
          </button>
        )}

        {state.status === "loading" && (
          <Loading variant="lines" count={5} label="Writing analysis… ~10s" />
        )}

        {state.status === "error" && (
          <div className="space-y-2">
            <Failed
              title="Analysis didn’t run"
              message={state.message}
              action={
                <button
                  type="button"
                  onClick={() => setState({ status: "idle" })}
                  className="text-data text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors"
                >
                  Retry
                </button>
              }
            />
          </div>
        )}

        {state.status === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={generate}
                className="text-data text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.report);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-data text-muted border border-line rounded px-2 py-0.5 hover:text-foreground hover:border-accent/40 transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="space-y-2 text-body text-foreground leading-relaxed">
              {reportParagraphs(state.report).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
