"use client";

import Link from "next/link";
import Collapsible from "@/components/ui/Collapsible";
import {
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

function Consensus({ ev }: { ev: CalEvent }) {
  const cells: [string, string | null | undefined][] = [
    ["consensus", ev.consensus],
    ["prior", ev.prior],
    ["actual", ev.actual],
  ];
  const present = cells.filter(([, v]) => v != null && v !== "");
  if (present.length === 0) {
    return <span className="text-body text-muted">consensus · prior not tracked</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-data">
      {present.map(([label, value]) => (
        <span key={label}>
          <span className="text-muted">{label} </span>
          <span className="text-foreground">{value}</span>
        </span>
      ))}
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

  const header = (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span
        className={`shrink-0 rounded border px-1.5 py-px font-mono text-micro uppercase tracking-wide ${importanceChipClass(
          ev.importance
        )}`}
      >
        {IMPORTANCE_LABEL[ev.importance] ?? ev.importance}
      </span>
      <span className="truncate text-body font-medium text-foreground">
        {earnings && ev.ticker ? (
          <span className="font-mono">{ev.ticker}</span>
        ) : (
          name
        )}
        {earnings && <span className="ml-1.5 text-body text-muted">earnings</span>}
      </span>
      {isWatchlist && (
        <span className="shrink-0 rounded border border-accent/50 bg-accent/10 px-1 py-px font-mono text-micro text-accent">
          watchlist
        </span>
      )}
      <span className="shrink-0 text-body text-muted">
        {CATEGORY_LABEL[ev.category] ?? ev.category}
      </span>
      <span className="ml-auto shrink-0 text-data text-muted">
        {ev.time_et ? `${ev.time_et} ET` : "time TBA"}
        {local && <span> · {local}</span>}
      </span>
    </div>
  );

  return (
    <Collapsible
      className="border-b border-line last:border-b-0"
      triggerClassName="px-3 py-2 hover:bg-elevated/50"
      trigger={header}
    >
      <div className="space-y-2.5 border-t border-line bg-elevated/30 px-3 py-3">
        <Consensus ev={ev} />
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
