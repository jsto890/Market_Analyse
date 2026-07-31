"use client";

import Link from "next/link";
import Collapsible from "@/components/ui/Collapsible";
import {
  IMPORTANCE_RANK,
  earningsSession,
  importanceChipClass,
  isEarnings,
  localTimeLabel,
  type CalEvent,
} from "@/lib/calendar";
import {
  CATEGORY_LABEL,
  IMPORTANCE_LABEL,
  eventMeta,
  eventShortName,
} from "@/lib/eventMeta";

/** One of the three figure columns. Held at 96px so consensus, prior and actual
 * line up down the whole day, which is the comparison the row exists to make. */
function Figure({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <span className="hidden w-24 shrink-0 flex-col text-right sm:flex">
      <span className="text-micro uppercase tracking-[0.08em] text-3">{label}</span>
      <span className={value ? "text-data text-foreground" : "text-data text-muted"}>
        {value || "—"}
      </span>
    </span>
  );
}

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
}: {
  ev: CalEvent;
  isWatchlist: boolean;
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
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {/* The track holds its width whether or not there is a time, so the
          columns still line up. A field with no feed renders nothing — no
          earnings row has ever carried a time, so "TBA" printed on all of
          them and said only that the row was an earnings row. */}
      <span className="w-[62px] shrink-0 text-data leading-tight text-muted">
        {ev.time_et && `${ev.time_et} ET`}
        {local && <span className="block text-micro text-3">{local}</span>}
      </span>
      <span
        className={`w-[38px] shrink-0 rounded border py-px text-center font-mono text-micro tracking-wide ${importanceChipClass(
          ev.importance
        )}`}
      >
        <span className="sr-only">{IMPORTANCE_LABEL[ev.importance] ?? ev.importance} importance</span>
        <span aria-hidden>{IMPORTANCE_RANK[ev.importance] ?? ev.importance}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-medium text-foreground">
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
      <Figure label="cons" value={ev.consensus} />
      <Figure label="prior" value={ev.prior} />
      <Figure label="actual" value={ev.actual} />
    </div>
  );

  return (
    <Collapsible
      triggerClassName="px-3 py-2 hover:bg-elevated/50"
      trigger={header}
    >
      <div className="space-y-2.5 border-t border-line bg-elevated/30 px-3 py-3">
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
