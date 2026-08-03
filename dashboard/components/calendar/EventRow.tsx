"use client";

import Link from "next/link";
import Collapsible from "@/components/ui/Collapsible";
import RankText from "@/components/ui/RankText";
import ValueCell from "@/components/ui/ValueCell";
import {
  earningsSession,
  isEarnings,
  localTimeLabel,
  type CalEvent,
} from "@/lib/calendar";
import { CATEGORY_LABEL, eventMeta, eventShortName } from "@/lib/eventMeta";
import { HeldChips } from "@/lib/positions";

function Chain({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <p className="text-body leading-relaxed text-2">
      <span className={`font-mono text-micro font-semibold ${tone}`}>{label}</span>{" "}
      {text}
    </p>
  );
}

export default function EventRow({
  ev,
  isWatchlist,
  held,
  showFigures = true,
}: {
  ev: CalEvent;
  isWatchlist: boolean;
  /** Your open positions, fetched once by the page. The row already names the
   *  tickers a print moves; this is what closes the loop to your own book. */
  held?: Map<string, number>;
  /** Whether actual/consensus/prior exist anywhere in the horizon. Only the
   *  page can know that, and a column of dashes on every row of every day is
   *  three empty columns, not three unknown figures. */
  showFigures?: boolean;
}) {
  const meta = eventMeta(ev.event, ev.category, ev.ticker);
  const earnings = isEarnings(ev);
  const local = localTimeLabel(ev.date, ev.time_et);
  const name = eventShortName(ev.event, ev.category, ev.ticker);

  const session = earnings ? earningsSession(ev.time_et) : null;

  /* Fixed tracks, not a wrapping flex row: time · rank · name · three figures,
     so a day's worth of events reads as columns rather than as ragged
     sentences. The chevron is Collapsible's own 20px slot. */
  const header = (
    <div
      className={`grid min-w-0 flex-1 grid-cols-[62px_26px_1fr] items-center gap-[12px] ${
        showFigures ? "sm:grid-cols-[62px_26px_1fr_96px_96px_96px]" : ""
      }`}
    >
      {/* The track holds its width whether or not there is a time, so the
          columns still line up. A field with no feed renders nothing — no
          earnings row has ever carried a time, so "TBA" printed on all of
          them and said only that the row was an earnings row. One line: the
          local conversion quadrupled the row height to restate the same
          instant, so it moved into the expanded body below. Neither hover
          affordance was available here: InfoTip's trigger is a <button> and
          this header already sits inside Collapsible's <button> (invalid HTML,
          which React refuses to hydrate), and a native title= is barred from
          #main by the Phase 1 substrate rule. */}
      {ev.time_et ? (
        <span className="text-data text-muted">{ev.time_et}</span>
      ) : (
        <span />
      )}
      <RankText importance={ev.importance} />
      <span className="min-w-0 truncate text-body font-medium text-foreground">
        {earnings && ev.ticker ? <span className="font-mono">{ev.ticker}</span> : name}
        {earnings && (
          <span className="ml-1.5 text-body text-muted">
            earnings{session && ` · ${session}`}
          </span>
        )}
        {isWatchlist && (
          <span className="ml-1.5 rounded border border-accent/50 bg-accent/10 px-1 py-px font-mono text-micro text-accent">
            watchlist
          </span>
        )}
        {/* The category on an earnings row is the word "earnings" a second
            time — it only says something on a macro release. */}
        {!earnings && (
          <span className="ml-1.5 text-body text-3">
            {CATEGORY_LABEL[ev.category] ?? ev.category}
          </span>
        )}
      </span>
      {showFigures && (
        <>
          <ValueCell label="act" value={ev.actual} strong className="hidden sm:block" />
          <ValueCell label="cons" value={ev.consensus} className="hidden sm:block" />
          <ValueCell label="prior" value={ev.prior} className="hidden sm:block" />
        </>
      )}
    </div>
  );

  return (
    <Collapsible
      triggerClassName="px-3 py-2 hover:bg-elevated/50"
      trigger={header}
    >
      <div className="space-y-2.5 border-t border-line bg-elevated/30 px-3 py-3">
        {local && (
          <p className="text-data text-muted">
            {ev.time_et} ET · {local} local
          </p>
        )}
        {meta ? (
          <>
            <p className="text-body leading-relaxed text-2">
              <span className="eyebrow font-semibold">MEASURES</span> {meta.measures}
            </p>
            <p className="text-body leading-relaxed text-2">
              <span className="eyebrow font-semibold">WHY NOW</span> {meta.whyNow}
            </p>
            <Chain label="BEAT" text={meta.beat} tone="text-pos" />
            <Chain label="MISS" text={meta.miss} tone="text-neg" />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {meta.sectors.map((s) => (
                <Link
                  key={s}
                  href={`/macro?scope=${encodeURIComponent(`sector:${s}`)}`}
                  className="rounded border border-line px-1.5 py-px font-mono text-micro text-muted hover:text-accent"
                >
                  {s} sentiment ›
                </Link>
              ))}
              {meta.tickers.map((t) => (
                <Link
                  key={t}
                  href={`/t/${t}`}
                  className="rounded border border-line px-1.5 py-px font-mono text-micro text-accent hover:bg-elevated"
                >
                  ${t}
                </Link>
              ))}
              {held && <HeldChips symbols={meta.tickers} held={held} />}
            </div>
          </>
        ) : (
          <p className="text-body text-2">
            No transmission note written for this release yet — it is shown for scheduling only.
          </p>
        )}
      </div>
    </Collapsible>
  );
}
