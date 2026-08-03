"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import {
  NEUTRAL_BAND,
  WINDOW_META,
  byMovement,
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
import ScopeBand from "@/components/macro/ScopeBand";
import ScopeTile from "@/components/macro/ScopeTile";
import Panel from "@/components/ui/Panel";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Empty from "@/components/ui/Empty";
import Stale from "@/components/ui/Stale";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import Page from "@/components/ui/Page";

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
const WINDOWS = ["1h", "1d", "1w"];
const VALID_WINDOWS = new Set(WINDOWS);
// "1 hour", not "1h": a control whose segments need a sentence beside them to
// be read is mislabelled. The blurb explains what the reading means, not what
// the segment says.
const WINDOW_OPTIONS = WINDOWS.map((w) => ({
  key: w,
  label: WINDOW_META[w].label,
  blurb: WINDOW_META[w].meaning,
}));

function Methodology({ window }: { window: string }) {
  const meta = WINDOW_META[window];
  return (
    // Every number on this page is a model output with a lookback, a decay and
    // a corpus behind it, and a reader who cannot see those cannot tell +0.31
    // from noise. It opens by default for that reason; it collapses because on
    // the fifth visit it is four paragraphs between you and the chart.
    <Panel
      heading="eyebrow"
      title="How this score is computed"
      subtitle="model, sources, decay, and what a number means"
      collapsible
      defaultOpen
      persistKey="macro-methodology"
    >
      <dl className="grid gap-x-6 gap-y-3 px-3 py-2 text-body leading-relaxed sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="eyebrow">Input</dt>
          <dd className="text-2">
            Every item in the news store: the Discord feeds, RSS pulls and whale-flow alerts that
            fill the Chatter &amp; Flow rail, scored once on arrival by the aggregator, which runs
            every 20 minutes — each chart point is one of those runs. Every item lands in{" "}
            <span className="font-mono">GLOBAL</span>; also in <span className="font-mono">US</span>{" "}
            if the headline hits a US-macro keyword (Fed, CPI, payrolls, yields, tariff…) or names a
            tracked ticker, and in <span className="font-mono">sector:X</span> when its ticker
            resolves to a sector family. One item can count in several scopes.{" "}
            <span className="font-mono">n=</span> is the headlines inside the lookback for that
            scope, before decay weighting — a high score on n=3 is three headlines, not a consensus.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Scoring</dt>
          <dd className="text-2">
            FinBERT (ProsusAI/finbert), a sentiment classifier fine-tuned on financial text. Each
            headline scores −1 (bearish) to +1 (bullish) as P(positive) − P(negative). Headline text
            only — bodies are not scored, and no source-reliability multiplier is applied.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Weighting</dt>
          <dd className="text-2">
            The <span className="font-mono">{window}</span> gauge reads the {meta.lookback} only.
            Inside it, weight decays exponentially with age at a half-life of {meta.halfLife}, so a
            headline that old counts half as much as one arriving now. Nothing outside the lookback
            counts at all. The 1h and 1d figures are this scope&rsquo;s move against one hour and one
            day ago; a dash means there is not enough history stored yet to compute it.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">What it isn't</dt>
          <dd className="text-2">
            ±{NEUTRAL_BAND.toFixed(2)} is the neutral band — inside it the tone is treated as no
            signal, so +0.04 is <em>not</em> mild bullishness. Beyond it the score says the weighted
            balance of coverage leans one way; it does not forecast a return, and it is not an input
            to any trade signal.
          </dd>
        </div>
      </dl>
    </Panel>
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
  const rows = byMovement(tiles?.tiles ?? []);
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
    <Page width="wide">
      <Page.Header
        title="Macro Sentiment"
        subtitle="FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish."
        actions={
          <span className="flex flex-wrap gap-x-4 text-body text-muted">
            {/* Tone by sector and price strength by sector are the same question
                read off two different feeds. */}
            <Link href="/rotation" className="hover:text-accent">
              Sector rotation ›
            </Link>
            <Link href="/calendar" className="hover:text-accent">
              Event calendar ›
            </Link>
          </span>
        }
      />

      <SegmentedControl
        label="Lookback"
        value={win}
        options={WINDOW_OPTIONS}
        onChange={pickWindow}
        className="flex-wrap gap-x-3 gap-y-2"
      />

      <Methodology window={win} />

      {resetNotice && (
        <p
          role="status"
          className="rounded border border-warn/40 bg-warn/5 px-3 py-1.5 text-body text-warn"
        >
          {resetNotice}
        </p>
      )}

      {/* The tiles carry the timestamp of the score they show but never printed it,
          so a corpus that had gone quiet for a week still read as a live reading. */}
      {rows.length > 0 && (
        <Stale
          asOf={rows.reduce<string | null>((newest, t) => (
            t.ts && (!newest || t.ts > newest) ? t.ts : newest
          ), null)}
          source="FinBERT"
          staleAfterMins={90}
          variant="line"
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          <Page.Section>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted">
              <span>
                {scopeLabel(scope)} · {meta.label} lookback
                {current && (
                  <span className={`ml-2 text-data ${toneClass(current.score)}`}>
                    {signed(current.score)} {toneLabel(current.score)}
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-model" />
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
          </Page.Section>
          <Contributors scope={scope} window={win} />
          <ScopeBand scope={scope} window={win} />
        </>
      ) : (
        <Empty message="No macro data yet — the aggregator runs every 20 min." />
      )}
    </Page>
  );
}

export default function MacroPage() {
  return (
    <Suspense fallback={null}>
      <MacroPageInner />
    </Suspense>
  );
}
