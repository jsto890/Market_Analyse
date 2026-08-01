"use client";

import Link from "next/link";
import Loading from "@/components/ui/Loading";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import {
  groupNewsByTicker,
  parseGexLine,
  useMorningReport,
  plain,
  type MorningReport as Report,
} from "@/lib/report";
import { NEUTRAL_BAND, signed, toneClass, toneLabel, useMacroTiles } from "@/lib/macro";

/** Futures the tape tile leads with; the rail carries the full strip. */
const TAPE_SYMBOLS = ["ES=F", "NQ=F", "^VIX"];

function FutureChip({ symbol, change_pct }: { symbol: string; change_pct: number }) {
  const tone = change_pct > 0.02 ? "text-pos" : change_pct < -0.02 ? "text-neg" : "text-muted";
  return (
    <span className="whitespace-nowrap text-data">
      <span className="text-muted">{symbol.replace("=F", "").replace("^", "")}</span>{" "}
      <span className={tone}>
        {change_pct >= 0 ? "+" : ""}
        {change_pct.toFixed(2)}%
      </span>
    </span>
  );
}

/**
 * One of the three masthead reads. `href` turns the whole tile into the way
 * through to the page that owns the number — the positioning read used to be
 * the most actionable line in the brief and the faintest thing on the page.
 */
function Tile({
  label,
  href,
  linkLabel,
  headline,
  detail,
  children,
}: {
  label: string;
  href?: string;
  linkLabel?: string;
  headline?: React.ReactNode;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-raised px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {href && (
          <Link href={href} className="text-body text-muted hover:text-accent">
            {linkLabel} ›
          </Link>
        )}
      </div>
      {headline && <div className="text-title text-foreground">{headline}</div>}
      {children}
      {detail && <p className="text-body text-2">{detail}</p>}
    </div>
  );
}

/** Wide enough that a quote-to-quote wobble doesn't read as a direction. */
const TAPE_FLAT_PCT = 0.15;

/** The tape tile reads verdict → figures → read like its two neighbours, so
 *  the verdict has to come from the quotes rather than a stored word. Futures
 *  bid with vol offered is the only pairing that says risk-on; when the two
 *  disagree the tape hasn't settled on a direction yet. */
function tapeRead(quotes: { symbol: string; change_pct: number }[]) {
  const es = quotes.find((q) => q.symbol === "ES=F");
  if (!es) return null;
  const dir = es.change_pct > TAPE_FLAT_PCT ? 1 : es.change_pct < -TAPE_FLAT_PCT ? -1 : 0;
  if (dir === 0) {
    return {
      verdict: "flat",
      read: `S&P futures inside ±${TAPE_FLAT_PCT}% — the open is priced as a non-event.`,
    };
  }
  const vix = quotes.find((q) => q.symbol === "^VIX");
  if (!vix) {
    return dir > 0
      ? {
          verdict: "bid",
          read: "S&P futures up into the open, with no vol quote to confirm it.",
        }
      : {
          verdict: "offered",
          read: "S&P futures down into the open, with no vol quote to confirm it.",
        };
  }
  if (dir > 0 && vix.change_pct < 0) {
    return {
      verdict: "risk-on",
      read: "Futures bid and vol offered — the tape leans into the open.",
    };
  }
  if (dir < 0 && vix.change_pct > 0) {
    return {
      verdict: "risk-off",
      read: "Futures offered and vol bid — pressure into the open.",
    };
  }
  return {
    verdict: "mixed",
    read: "Futures and vol disagree — the direction isn’t settled yet.",
  };
}

/** US news tone with its one-day move — a score with no delta says nothing
 *  about whether the mood is turning. `1d` is the only window `/macro/tiles`
 *  and `/macro/series` both serve. */
function ToneTile({ data }: { data: Report }) {
  const { data: tiles } = useMacroTiles("1d");
  const us = tiles?.tiles?.find((t) => t.scope === "us");
  const score = us?.score ?? data.macro?.us_1d ?? null;
  const delta = us?.delta_1d ?? null;

  if (score === null) {
    return (
      <Tile label="Tone" href="/macro" linkLabel="macro" detail={plain(data.tone)}>
        <span className="text-body text-muted">no gauge</span>
      </Tile>
    );
  }

  const neutral = Math.abs(score) <= NEUTRAL_BAND;
  const glob = data.macro?.global_1d ?? null;
  // An arrow beside +0.00 asserts a direction the printed figure doesn't have,
  // so the direction has to come off the rounded value, not the raw one.
  const shown = delta === null ? null : Number(signed(delta));
  return (
    <Tile
      label="Tone"
      href="/macro"
      linkLabel="macro"
      headline={<span className={toneClass(score)}>{toneLabel(score)}</span>}
      detail={
        neutral
          ? `Inside the ±${NEUTRAL_BAND.toFixed(2)} neutral band — no directional read.`
          : plain(data.tone)
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 text-data">
        <span className="text-muted">US</span>
        <span className={toneClass(score)}>{signed(score)}</span>
        {shown !== null && (
          <span className={shown > 0 ? "text-pos" : shown < 0 ? "text-neg" : "text-muted"}>
            {signed(delta!)}
            {shown > 0 ? " ▲" : shown < 0 ? " ▼" : ""} 1d
          </span>
        )}
        {glob !== null && (
          <>
            <span className="text-muted">· global</span>
            <span className={toneClass(glob)}>{signed(glob)}</span>
          </>
        )}
      </div>
    </Tile>
  );
}

export function MorningReport() {
  const { data, error, isLoading } = useMorningReport();

  if (isLoading) {
    return (
      <section className="rounded-md border border-line bg-elevated p-4">
        <Loading variant="lines" count={3} label="Loading Morning Brief" />
      </section>
    );
  }

  if (error) {
    return (
      <Failed
        title="Couldn’t load the morning brief"
        message="It refreshes every 5 minutes — try reloading."
      />
    );
  }

  if (!data) return null;

  const news = groupNewsByTicker(data.day_ahead?.watchlist_news ?? []).slice(0, 5);
  const synthesis = data.day_ahead?.synthesis;
  const gex = parseGexLine(data.day_ahead?.gex_line);
  const futures = data.futures;
  const lead = TAPE_SYMBOLS.map((s) => futures.find((f) => f.symbol === s)).filter(
    (f): f is { symbol: string; change_pct: number } => !!f,
  );
  const tape = lead.length > 0 ? lead : futures.slice(0, 3);
  const tapeVerdict = tapeRead(futures);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-elevated p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-title text-foreground">Morning brief</h2>
        <span className="flex items-baseline gap-2 text-data text-muted">
          {data.weekday} {data.date}
          <Stale asOf={data.generated_at} variant="line" />
        </span>
      </div>

      {synthesis && synthesis !== "Quiet slate." && (
        <p className="text-headline text-foreground">{synthesis}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Tape" headline={tapeVerdict?.verdict} detail={tapeVerdict?.read}>
          {tape.length > 0 ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {tape.map((f) => (
                <FutureChip key={f.symbol} symbol={f.symbol} change_pct={f.change_pct} />
              ))}
            </div>
          ) : (
            <span className="text-body text-muted">no quotes</span>
          )}
        </Tile>

        {gex ? (
          <Tile
            label="Positioning"
            href="/options/gamma"
            linkLabel="gamma"
            headline={gex.verdict}
            detail={gex.read}
          >
            <span className="text-data text-foreground">{gex.figures}</span>
          </Tile>
        ) : (
          <Tile label="Positioning" href="/options/gamma" linkLabel="gamma">
            <span className="text-body text-muted">no gamma snapshot today</span>
          </Tile>
        )}

        <ToneTile data={data} />
      </div>

      {news.length > 0 && (
        <div className="flex flex-col gap-1">
          {news.map((n) => (
            <Link
              key={n.ticker}
              href={`/t/${n.ticker}`}
              className="flex items-baseline gap-2 text-body text-2 hover:text-accent"
            >
              <span className="w-12 shrink-0 text-data text-accent">${n.ticker}</span>
              <span className="min-w-0 flex-1">{n.headline}</span>
              {n.extra > 0 && (
                <span className="shrink-0 text-data text-muted">+{n.extra} more</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <Link href="/brief" className="text-body text-muted hover:text-accent">
        Full brief ›
      </Link>
    </section>
  );
}
