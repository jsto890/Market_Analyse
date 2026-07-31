"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import {
  NEUTRAL_BAND,
  WINDOW_META,
  scopeLabel,
  signed,
  toneClass,
  toneLabel,
  useMacro,
  useMacroSeries,
  useMacroTiles,
} from "@/lib/macro";
import { MacroChart, type SpxBar } from "@/components/macro/MacroChart";
import Contributors from "@/components/macro/Contributors";
import ScopeTile from "@/components/macro/ScopeTile";
import Collapsible from "@/components/ui/Collapsible";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import PageShell from "@/components/PageShell";

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
const WINDOWS = ["1h", "1d", "1w"];
const VALID_WINDOWS = new Set(WINDOWS);

function Methodology({ window }: { window: string }) {
  const meta = WINDOW_META[window];
  return (
    <Collapsible
      persistKey="macro-methodology"
      className="mb-4 rounded-md border border-line bg-surface"
      triggerClassName="px-3 py-2"
      trigger={
        <span className="text-dense font-medium text-foreground">
          How this score is computed
          <span className="ml-2 font-normal text-muted">
            model, sources, decay, and what a number means
          </span>
        </span>
      }
    >
      <dl className="grid gap-x-6 gap-y-2 border-t border-line px-3 py-3 text-dense leading-relaxed sm:grid-cols-2">
        <div>
          <dt className="font-mono text-micro uppercase tracking-wide text-muted">Model</dt>
          <dd className="text-muted">
            FinBERT (ProsusAI/finbert), a sentiment classifier fine-tuned on financial text. Each
            headline scores −1 (bearish) to +1 (bullish) as P(positive) − P(negative). Headline text
            only — bodies are not scored.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-micro uppercase tracking-wide text-muted">Corpus</dt>
          <dd className="text-muted">
            Every item in the news store: the Discord feeds, RSS pulls and whale-flow alerts that
            fill the news rail. Scored once on arrival by the aggregator, which runs every 20
            minutes — each chart point is one of those runs.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-micro uppercase tracking-wide text-muted">Lookback &amp; decay</dt>
          <dd className="text-muted">
            The <span className="font-mono">{window}</span> gauge reads the {meta.lookback} only.
            Inside it, weight decays exponentially with age at a half-life of {meta.halfLife}, so a
            headline that old counts half as much as one arriving now. Nothing outside the lookback
            counts at all.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-micro uppercase tracking-wide text-muted">Scopes</dt>
          <dd className="text-muted">
            Every item lands in <span className="font-mono">GLOBAL</span>. It also lands in{" "}
            <span className="font-mono">US</span> if the headline hits a US-macro keyword (Fed, CPI,
            payrolls, yields, tariff…) or names a tracked ticker, and in{" "}
            <span className="font-mono">sector:X</span> when its ticker resolves to a sector family.
            One item can count in several scopes.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-micro uppercase tracking-wide text-muted">n =</dt>
          <dd className="text-muted">
            Headlines inside the lookback for that scope, before decay weighting. A high score on
            n=3 is three headlines, not a consensus.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-micro uppercase tracking-wide text-muted">Reading a number</dt>
          <dd className="text-muted">
            ±{NEUTRAL_BAND.toFixed(2)} is the neutral band — inside it the tone is treated as no
            signal, so +0.04 is <em>not</em> mild bullishness. Beyond it the score says the
            weighted balance of coverage leans one way; it does not forecast a return, and it is not
            an input to any trade signal.
          </dd>
        </div>
      </dl>
    </Collapsible>
  );
}

function MacroPageInner() {
  const searchParams = useSearchParams();
  const initialWindow = searchParams.get("window");
  const initialScope = searchParams.get("scope");
  const { data } = useMacro();
  const [scope, setScope] = useState(initialScope || "global");
  const [storedWindow, setStoredWindow] = useLocalStorage<string>(STATIC_KEYS.macroWindow, "1d");
  const [win, setWin] = useState(
    initialWindow && VALID_WINDOWS.has(initialWindow) ? initialWindow : "1d"
  );
  const urlWindow = useRef(Boolean(initialWindow && VALID_WINDOWS.has(initialWindow)));
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // The URL wins on first paint; otherwise fall back to the stored preference.
  useEffect(() => {
    if (!urlWindow.current && VALID_WINDOWS.has(storedWindow)) setWin(storedWindow);
  }, [storedWindow]);

  const meta = WINDOW_META[win];
  const { data: tiles } = useMacroTiles(win);
  const { data: series } = useMacroSeries(scope, win, meta.seriesLimit);
  const { data: hist } = useSWR<{ bars: SpxBar[] }>(
    `/api/argus/history/SPY?period=${meta.benchmark.period}&interval=${meta.benchmark.interval}`,
    fetcher, { shouldRetryOnError: false });

  const gauges = (data?.gauges ?? []).filter((g) => g.window === win);
  const anyData = (data?.gauges ?? []).length > 0;
  const rows = tiles?.tiles ?? [];
  const current = rows.find((t) => t.scope === scope);

  function pickWindow(w: string) {
    urlWindow.current = false;
    setWin(w);
    setStoredWindow(w);
  }

  useEffect(() => {
    if (!tiles) return;
    if (tiles.tiles.some((t) => t.scope === scope)) return;
    // Not every scope survives every lookback — say so instead of silently
    // snapping the selection back to global (MAC-11).
    setResetNotice(
      `${scopeLabel(scope)} has no scored headlines in the ${WINDOW_META[win].label} lookback — showing GLOBAL instead.`
    );
    setScope("global");
  }, [tiles, scope, win]);

  return (
    <PageShell width="wide">
      <PageHeader
        title="Macro Sentiment"
        subtitle="FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish."
        actions={
          <Link href="/calendar" className="text-dense text-muted hover:text-accent">
            Event calendar ›
          </Link>
        }
      />

      <Methodology window={win} />

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-micro uppercase tracking-wide text-muted">Lookback</span>
        <div className="flex gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => pickWindow(w)}
              aria-pressed={w === win}
              className={`rounded px-2 py-1 text-micro ${
                w === win ? "bg-accent/20 text-accent" : "bg-elevated text-muted hover:text-foreground"
              }`}
            >
              {WINDOW_META[w].label}
            </button>
          ))}
        </div>
        <span className="text-micro text-muted-2">{meta.meaning}</span>
      </div>

      {resetNotice && (
        <p
          role="status"
          className="mb-3 rounded border border-warn/40 bg-warn/5 px-3 py-1.5 text-dense text-warn"
        >
          {resetNotice}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((t) => (
          <ScopeTile
            key={t.scope}
            tile={t}
            selected={t.scope === scope}
            onSelect={() => { setResetNotice(null); setScope(t.scope); }}
          />
        ))}
        {rows.length === 0 &&
          gauges.map((g) => (
            <ScopeTile
              key={g.scope}
              tile={{ scope: g.scope, score: g.score, n: g.n, ts: "", delta_1h: null, delta_1d: null, spark: [] }}
              selected={g.scope === scope}
              onSelect={() => setScope(g.scope)}
            />
          ))}
      </div>

      {anyData ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-muted">
            <span>
              {scopeLabel(scope)} · {meta.label} lookback
              {current && (
                <span className={`ml-2 font-mono ${toneClass(current.score)}`}>
                  {signed(current.score)} {toneLabel(current.score)}
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-accent" />
              Macro score (left)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-muted" />
              SPY close (right, {meta.benchmark.interval} bars)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-px w-3 border-t border-dashed border-line-strong" />
              ±{NEUTRAL_BAND.toFixed(2)} neutral band — inside it reads as no signal
            </span>
          </div>
          <MacroChart points={series?.points ?? []} spx={hist?.bars ?? []} />
          <div className="mt-4">
            <Contributors scope={scope} window={win} />
          </div>
        </>
      ) : (
        <EmptyState message="No macro data yet — the aggregator runs every 20 min." />
      )}
    </PageShell>
  );
}

export default function MacroPage() {
  return (
    <Suspense fallback={null}>
      <MacroPageInner />
    </Suspense>
  );
}
