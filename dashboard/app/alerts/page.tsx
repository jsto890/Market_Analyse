"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bell, Trash2, Play } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Toggle from "@/components/ui/Toggle";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { useUndoAction } from "@/components/ui/UndoToastProvider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Rule {
  id: number;
  kind: string;
  symbol: string;
  params: Record<string, unknown>;
  note: string | null;
  enabled: boolean;
  last_fired_ts: string | null;
}

interface LogItem {
  id: number;
  ts: string;
  title: string;
  body: string;
}

const KIND_LABEL: Record<string, string> = {
  verdict: "Verdict flips to",
  earnings: "Earnings within",
  price: "Price crosses",
};

/** Local calendar date (not UTC) — matches the local timestamp shown per-row below. */
function localDayKey(ts: string): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function groupByDay(items: LogItem[]): Array<[string, LogItem[]]> {
  const groups = new Map<string, LogItem[]>();
  for (const it of items) {
    const day = localDayKey(it.ts);
    const bucket = groups.get(day) ?? [];
    bucket.push(it);
    groups.set(day, bucket);
  }
  return Array.from(groups.entries());
}

function ruleSummary(r: Rule): string {
  if (r.kind === "verdict") return `${r.symbol} → ${KIND_LABEL.verdict} ${r.params.target ?? "LONG"}`;
  if (r.kind === "earnings") return `${r.symbol} → ${KIND_LABEL.earnings} ${r.params.days ?? 3}d`;
  if (r.kind === "price")
    return `${r.symbol} → ${KIND_LABEL.price} ${r.params.direction ?? "above"} ${r.params.level}`;
  return `${r.symbol} · ${r.kind}`;
}

export default function AlertsPage() {
  const { data: rulesData, mutate: mutateRules } = useSWR<{ rules: Rule[] }>(
    "/api/argus/alerts/rules",
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: logData, mutate: mutateLog } = useSWR<{ items: LogItem[] }>(
    "/api/argus/alerts/log?limit=30",
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: channels } = useSWR<Record<string, boolean>>("/api/argus/alerts/channels", fetcher);
  const { run } = useUndoAction();

  const [kind, setKind] = useState("verdict");
  const [symbol, setSymbol] = useState("");
  const [target, setTarget] = useState("LONG");
  const [days, setDays] = useState("3");
  const [level, setLevel] = useState("");
  const [direction, setDirection] = useState("above");
  const [busy, setBusy] = useState(false);
  const [sendTestResult, setSendTestResult] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const rules = rulesData?.rules ?? [];
  const log = logData?.items ?? [];
  const isIncomplete = !symbol.trim() || (kind === "price" && !level.trim());

  async function addRule() {
    const sym = symbol.trim().toUpperCase();
    if (isIncomplete) return;
    const params =
      kind === "verdict"
        ? { target }
        : kind === "earnings"
          ? { days: Number(days) }
          : { level: Number(level), direction };
    setAddError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/argus/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, symbol: sym, params }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body?.error ?? `Failed to add rule for ${sym}`);
        return;
      }
      setSymbol("");
      setLevel("");
      await mutateRules();
    } finally {
      setBusy(false);
    }
  }

  function removeRule(rule: Rule) {
    mutateRules((prev) => (prev ? { rules: prev.rules.filter((r) => r.id !== rule.id) } : prev), false);
    run({
      label: `Removed ${rule.symbol} ${rule.kind} alert`,
      commit: () => fetch(`/api/argus/alerts/rules/${rule.id}`, { method: "DELETE" }),
      onError: () => mutateRules(),
      undo: () => {
        mutateRules((prev) => (prev ? { rules: [rule, ...prev.rules] } : prev), false);
        fetch("/api/argus/alerts/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: rule.kind, symbol: rule.symbol, params: rule.params, note: rule.note }),
        }).then(() => mutateRules());
      },
    });
  }

  async function updateRuleEnabled(id: number, enabled: boolean) {
    mutateRules(
      (prev) => (prev ? { rules: prev.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) } : prev),
      false
    );
    try {
      await fetch(`/api/argus/alerts/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } finally {
      mutateRules();
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await fetch("/api/argus/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Argus test alert", body: "Sent from the Alerts page." }),
      });
      setSendTestResult("Test alert sent.");
      setTimeout(() => setSendTestResult(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  async function evaluateNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/argus/alerts/evaluate", { method: "POST" });
      const body = (await res.json().catch(() => ({ fired: [] }))) as { fired: unknown[] };
      const fired = body.fired?.length ?? 0;
      const total = rules.length;
      setEvalResult(
        `Evaluated ${total} rule${total === 1 ? "" : "s"} · ${fired} fired · ${new Date().toLocaleTimeString()}`
      );
      await mutateLog();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <PageHeader
          title="Alerts"
          subtitle="Watch conditions the app already computes — fires via your alert channels"
          actions={
            <Button variant="secondary" onClick={evaluateNow} disabled={busy} icon={<Play size={14} />}>
              Evaluate now
            </Button>
          }
        />

        {evalResult && <p className="text-[12px] text-muted">{evalResult}</p>}

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-[12px]">
          <span className={channels?.email ? "text-pos" : "text-muted"}>Email {channels?.email ? "✓" : "—"}</span>
          <span className={channels?.telegram ? "text-pos" : "text-muted"}>Telegram {channels?.telegram ? "✓" : "—"}</span>
          <span className={channels?.webhook ? "text-pos" : "text-muted"}>Webhook {channels?.webhook ? "✓" : "—"}</span>
          <button
            onClick={sendTest}
            disabled={busy}
            className="ml-auto text-accent hover:underline disabled:opacity-50"
          >
            Send test
          </button>
          {sendTestResult && <span className="text-muted">{sendTestResult}</span>}
        </div>

        {/* New rule */}
        <section className="rounded-md border border-line bg-elevated">
          <div className="border-b border-line px-4 py-2.5">
            <span className="tick text-[13px] font-semibold text-foreground">New alert</span>
          </div>
          <div className="flex flex-wrap items-end gap-2 px-4 py-3">
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Condition
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Symbol
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="NVDA" className="w-24" />
            </label>
            {kind === "verdict" && (
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Verdict
                <Select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  options={[{ value: "LONG", label: "LONG" }, { value: "SHORT", label: "SHORT" }, { value: "WAIT", label: "WAIT" }]}
                />
              </label>
            )}
            {kind === "earnings" && (
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Days
                <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} className="w-20" />
              </label>
            )}
            {kind === "price" && (
              <>
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  Direction
                  <Select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    options={[{ value: "above", label: "above" }, { value: "below", label: "below" }]}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  Level
                  <Input value={level} onChange={(e) => setLevel(e.target.value)} type="number" placeholder="200" className="w-24" />
                </label>
              </>
            )}
            <Button variant="primary" onClick={addRule} disabled={busy || isIncomplete} icon={<Bell size={14} />}>
              Add
            </Button>
          </div>
          {addError && (
            <p className="px-4 pb-3 text-[12px] text-neg">{addError}</p>
          )}
        </section>

        {/* Active rules */}
        <section className="rounded-md border border-line bg-elevated">
          <div className="border-b border-line px-4 py-2.5">
            <span className="tick text-[13px] font-semibold text-foreground">
              Active rules ({rules.length})
            </span>
          </div>
          {rules.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              No alerts yet. Add one above — e.g. &ldquo;NVDA verdict becomes LONG&rdquo; or
              &ldquo;AAPL earnings within 3d&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="rounded bg-accent-dim px-1.5 py-px font-mono text-[11px] text-accent">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  <span className="font-mono text-foreground">{ruleSummary(r)}</span>
                  {r.last_fired_ts && (
                    <span className="text-[11px] text-muted">
                      last fired {new Date(r.last_fired_ts).toLocaleDateString()}
                    </span>
                  )}
                  <Toggle
                    checked={r.enabled}
                    onChange={(v) => updateRuleEnabled(r.id, v)}
                    label={`Enable ${r.kind} alert for ${r.symbol}`}
                    className="ml-auto"
                  />
                  <button
                    onClick={() => removeRule(r)}
                    className="text-muted transition-colors hover:text-neg"
                    aria-label="Delete rule"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent fires */}
        <section className="rounded-md border border-line bg-elevated">
          <div className="border-b border-line px-4 py-2.5 flex items-center justify-between">
            <span className="tick text-[13px] font-semibold text-foreground">Recent fires</span>
            <span className="text-[11px] text-muted">Showing latest 30</span>
          </div>
          {log.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              Nothing fired yet. Rules are checked when the evaluator runs (or hit &ldquo;Evaluate
              now&rdquo;).
            </p>
          ) : (
            groupByDay(log).map(([day, items]) => (
              <div key={day}>
                <div className="bg-surface px-4 py-1 text-[11px] font-mono text-muted">{day}</div>
                <ul className="divide-y divide-line/60">
                  {items.map((it) => (
                    <li key={it.id} className="px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-foreground">{it.title}</span>
                        <span className="text-[11px] text-muted">
                          {new Date(it.ts).toLocaleString()} (local time)
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[12px] text-muted">{it.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
