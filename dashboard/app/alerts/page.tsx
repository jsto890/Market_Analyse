"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Bell, BellOff, History, Trash2, Play } from "lucide-react";
import Toggle from "@/components/ui/Toggle";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { useUndoAction } from "@/components/ui/UndoToastProvider";
import Empty from "@/components/ui/Empty";
import Page from "@/components/ui/Page";

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
  /** Rule fires carry {rule_id, kind, symbol}; manual dispatches carry nothing. */
  payload?: { rule_id?: number; kind?: string; symbol?: string };
}

/**
 * The middle of the sentence, in both places a rule is written: the builder
 * ("Alert me when NVDA verdict flips to LONG") and the row that results. One
 * phrasing, so the rule you read back is the rule you typed.
 */
const KIND_LABEL: Record<string, string> = {
  verdict: "verdict flips to",
  earnings: "has earnings within",
  price: "price crosses",
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

/** The rule without its symbol — the row renders that as a link to the ticker. */
function ruleCondition(r: Rule): string {
  if (r.kind === "verdict") return `${KIND_LABEL.verdict} ${r.params.target ?? "LONG"}`;
  if (r.kind === "earnings") return `${KIND_LABEL.earnings} ${r.params.days ?? 3} days`;
  if (r.kind === "price")
    return `${KIND_LABEL.price} ${r.params.direction ?? "above"} ${r.params.level}`;
  return r.kind;
}

export default function AlertsPage() {
  return (
    <Suspense fallback={null}>
      <AlertsBody />
    </Suspense>
  );
}

function AlertsBody() {
  // /alerts?symbol=NVDA — the ticker header's "Alert" action prefills the form.
  const prefill = useSearchParams().get("symbol")?.toUpperCase() ?? "";
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
  const [symbol, setSymbol] = useState(prefill);
  const [target, setTarget] = useState("LONG");
  const [days, setDays] = useState("3");
  const [level, setLevel] = useState("");
  const [direction, setDirection] = useState("above");
  const [busy, setBusy] = useState(false);
  const [sendTestResult, setSendTestResult] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [logSymbol, setLogSymbol] = useState("");

  const rules = rulesData?.rules ?? [];
  const log = logData?.items ?? [];
  const isIncomplete = !symbol.trim() || (kind === "price" && !level.trim());

  // Nothing configured means a fire is recorded here and leaves the machine
  // nowhere — the one state the three chips could not say on their own.
  const noChannel = channels != null && !Object.values(channels).some(Boolean);

  // The log is every rule's fires in one stream; on a busy day the only
  // question is what one name did.
  const ruleById = new Map(rules.map((r) => [r.id, r] as const));
  const fireSymbols = Array.from(
    new Set(log.map((it) => it.payload?.symbol).filter((s): s is string => !!s))
  );
  const shownLog = logSymbol ? log.filter((it) => it.payload?.symbol === logSymbol) : log;

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
    <Page width="prose">
        <Page.Header
          title="Alerts"
          subtitle="Watch conditions the app already computes — fires via your alert channels"
          actions={
            <Button variant="secondary" onClick={evaluateNow} disabled={busy} icon={<Play size={14} />}>
              Evaluate now
            </Button>
          }
        />

        {evalResult && <p className="text-body text-2">{evalResult}</p>}

        <div className="rounded-md border border-line bg-elevated px-3 py-2">
          <div className="flex flex-wrap items-center gap-3 text-body">
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
          {noChannel && (
            <p className="mt-1.5 text-body text-2">
              Nothing is configured, so fires are recorded below and sent nowhere else. Set{" "}
              <code className="text-data text-muted">SMTP_HOST</code>,{" "}
              <code className="text-data text-muted">TELEGRAM_BOT_TOKEN</code> or{" "}
              <code className="text-data text-muted">WEBHOOK_URL</code> in{" "}
              <code className="text-data text-muted">argus/.env</code> and restart the API.
            </p>
          )}
        </div>

        {/* New rule */}
        <section className="rounded-md border border-line bg-elevated">
          <div className="border-b border-line px-4 py-2.5">
            <span className="text-title text-foreground">New alert</span>
          </div>
          {/* A sentence, not a form. The rule reads as one in the list below;
              writing it in four stacked labelled boxes made you assemble the
              same sentence in your head before you could tell what it said. */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 text-body text-2">
            <span>Alert me when</span>
            <Input
              aria-label="Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="NVDA"
              className="w-24"
            />
            <Select
              aria-label="Condition"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))}
              className="w-44"
            />
            {kind === "verdict" && (
              <Select
                aria-label="Verdict"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                options={[{ value: "LONG", label: "LONG" }, { value: "SHORT", label: "SHORT" }, { value: "WAIT", label: "WAIT" }]}
                className="w-28"
              />
            )}
            {kind === "earnings" && (
              <>
                <Input
                  aria-label="Days"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  type="number"
                  min={1}
                  className="w-16"
                />
                <span>days</span>
              </>
            )}
            {kind === "price" && (
              <>
                <Select
                  aria-label="Direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  options={[{ value: "above", label: "above" }, { value: "below", label: "below" }]}
                  className="w-24"
                />
                <Input
                  aria-label="Level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  type="number"
                  placeholder="200"
                  className="w-24"
                />
              </>
            )}
            <Button variant="primary" onClick={addRule} disabled={busy || isIncomplete} icon={<Bell size={14} />}>
              Add
            </Button>
          </div>
          {addError && (
            <p className="px-4 pb-3 text-body text-neg">{addError}</p>
          )}
        </section>

        {/* Active rules */}
        <section className="rounded-md border border-line bg-elevated">
          <div className="border-b border-line px-4 py-2.5">
            <span className="text-title text-foreground">
              Active rules ({rules.length})
            </span>
          </div>
          {rules.length === 0 ? (
            <Empty
              icon={<BellOff size={26} strokeWidth={1.5} />}
              title="No alert rules yet"
              message="Add one above — e.g. “NVDA verdict becomes LONG” or “AAPL earnings within 3d”. Rules are checked whenever the evaluator runs."
            />
          ) : (
            <ul className="divide-y divide-line/60">
              {rules.map((r) => (
                <li
                  key={r.id}
                  id={`rule-${r.id}`}
                  className="flex scroll-mt-16 items-center gap-2 px-4 py-2.5 text-body target:bg-raised"
                >
                  {/* No kind chip: the sentence beside it already opens with
                      the condition, and the chip said it a second time. */}
                  <Link href={`/t/${r.symbol}`} className="text-data text-accent hover:underline">
                    {r.symbol}
                  </Link>
                  <span className="text-2">{ruleCondition(r)}</span>
                  {r.last_fired_ts && (
                    <span className="text-data text-muted">
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
          <div className="border-b border-line px-4 py-2.5 flex flex-wrap items-center gap-2">
            <span className="text-title text-foreground">Recent fires</span>
            {fireSymbols.length > 1 && (
              <Select
                aria-label="Filter fires by symbol"
                value={logSymbol}
                onChange={(e) => setLogSymbol(e.target.value)}
                options={[
                  { value: "", label: "All symbols" },
                  ...fireSymbols.map((s) => ({ value: s, label: s })),
                ]}
                className="w-32"
              />
            )}
            <span className="ml-auto text-body text-muted">
              {logSymbol ? `${shownLog.length} of ${log.length}` : "Showing latest 30"}
            </span>
          </div>
          {log.length === 0 ? (
            <Empty
              icon={<History size={26} strokeWidth={1.5} />}
              title="Nothing fired yet"
              message="Rules are checked when the evaluator runs. Hit “Evaluate now” above to check them against the current data."
            />
          ) : (
            groupByDay(shownLog).map(([day, items]) => (
              <div key={day}>
                <div className="bg-surface px-4 py-1 text-data text-muted">{day}</div>
                <ul className="divide-y divide-line/60">
                  {items.map((it) => {
                    // Only rules still on the page can be jumped to; a fire
                    // from a since-deleted rule gets no dead link.
                    const rule = it.payload?.rule_id != null ? ruleById.get(it.payload.rule_id) : undefined;
                    return (
                      <li key={it.id} className="px-4 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-body font-medium text-foreground">{it.title}</span>
                          <span className="text-data text-muted">
                            {new Date(it.ts).toLocaleString()} (local time)
                          </span>
                        </div>
                        <p className="mt-0.5 text-body text-2">{it.body}</p>
                        {rule && (
                          <a href={`#rule-${rule.id}`} className="mt-1 inline-block text-body text-accent hover:underline">
                            View rule
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
    </Page>
  );
}
