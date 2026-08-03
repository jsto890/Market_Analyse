"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { ReadThisTerm } from "@/components/ui/ReadThis";
import { eventShortName } from "@/lib/eventMeta";
import { useCalendar, type CalEvent } from "@/lib/calendar";
import {
  TAPE_LOOKBACK_H,
  TAPE_SPAN_H,
  assignLanes,
  eventMs,
  laneCount,
  localDayShift,
  fmtLocalTime,
  tapeWindow,
  windowFraction,
  windowSessions,
  windowTicks,
  windowDates,
  type TapeWindow,
} from "@/lib/tape";

/** Band geometry, in px. Earnings lanes · the `now` lane · the axis · the hour
 *  ruler · the release lanes. `now` owns the 22px directly above the axis so its
 *  pill can never land on the same row as an event label. */
const LANE_H = 22;
const NOW_H = 22;
const AXIS_H = 24;
const RULER_H = 16;
/** Air between the ruler and the first release lane, which the connector spans. */
const TICK_GAP = 8;
/** Past this fraction a left-anchored label runs off the right edge. */
const FLIP_AT = 0.72;
/** A session band narrower than this cannot hold its own label — "Regular ·
 *  23:30" is ~90px on a ~900px track. The window clips whichever sessions it
 *  opens and closes inside, and a two-hour sliver of Pre at the right-hand edge
 *  would print its label off the end of the axis. */
const MIN_LABEL_FRAC = 0.1;

interface Mark {
  key: string;
  ms: number;
  /** Minutes from the window's left edge — what the lane packer measures in. */
  minutes: number;
  label: string;
  importance: string;
  ticker: string | null;
}

function isEarnings(e: CalEvent): boolean {
  return e.category === "earnings" || e.source === "earnings" || e.ticker != null;
}

/** One clock reading, plus the `+1` that says it has rolled into tomorrow here.
 *  The suffix is not decoration: over a 24-hour window a bare "06:00" printed to
 *  the right of "23:30" reads as the tape running backwards. */
function Clock({ ms, win }: { ms: number; win: TapeWindow }) {
  const shift = localDayShift(ms, win.startMs);
  return (
    <>
      {fmtLocalTime(ms)}
      {shift > 0 && <span className="text-muted-2"> +{shift}</span>}
    </>
  );
}

/** Earnings sit above the axis as amber chips — single-name event risk should
 *  not look like a scheduled macro print. The connector drops past the `now`
 *  lane to the top of the axis. */
function EarningsMark({ mark, lane, win, f }: { mark: Mark; lane: number; win: TapeWindow; f: number }) {
  const flip = f > FLIP_AT;
  const chip = `inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-[4px] border border-warn/50 bg-warn/10 px-[7px] py-[3px] text-micro font-semibold text-warn ${
    flip ? "-translate-x-full" : ""
  }`;
  const inner = (
    <>
      <span>
        <Clock ms={mark.ms} win={win} />
      </span>
      {" · "}
      <span>{mark.label}</span>
    </>
  );
  return (
    <div
      className="absolute"
      style={{ left: `${f * 100}%`, bottom: `${lane * LANE_H}px`, height: `${LANE_H}px` }}
    >
      <span
        className="absolute left-0 w-px bg-warn/50"
        style={{ top: `${LANE_H}px`, height: `${lane * LANE_H + NOW_H}px` }}
      />
      <span className="flex h-full items-center">
        {mark.ticker ? (
          <Link href={`/t/${mark.ticker}`} className={`${chip} hover:bg-warn/20`}>
            {inner}
          </Link>
        ) : (
          <span className={chip}>{inner}</span>
        )}
      </span>
    </div>
  );
}

/** Releases sit below the axis as text on a connector: a 1px drop from the axis
 *  to the label's lane, then an 8px tick into the label, so a 10:00 print reads
 *  against 10:00 on the bar rather than floating near it. */
function ReleaseMark({ mark, lane, win, f }: { mark: Mark; lane: number; win: TapeWindow; f: number }) {
  const flip = f > FLIP_AT;
  const high = mark.importance === "high";
  const rule = high ? "bg-warn/50" : "bg-line-strong";
  const drop = TICK_GAP + lane * LANE_H;
  const tick = <span className={`h-px w-[8px] shrink-0 ${rule}`} />;
  const body = (
    <span
      className={`flex items-center gap-1.5 whitespace-nowrap ${flip ? "-translate-x-full" : ""}`}
    >
      {!flip && tick}
      <span className="text-data text-muted">
        <Clock ms={mark.ms} win={win} />
      </span>
      <span className="text-body text-muted">{" · "}</span>
      <span className={high ? "text-body text-warn" : "text-body text-3"}>{mark.label}</span>
      {flip && tick}
    </span>
  );
  return (
    <div
      className="absolute"
      style={{ left: `${f * 100}%`, top: `${lane * LANE_H}px`, height: `${LANE_H}px` }}
    >
      <span
        className={`absolute left-0 w-px ${rule}`}
        style={{ top: `-${drop}px`, height: `${drop + LANE_H / 2}px` }}
      />
      <span className="flex h-full items-center">
        {mark.ticker ? (
          <Link href={`/t/${mark.ticker}`} className="hover:text-accent">
            {body}
          </Link>
        ) : (
          body
        )}
      </span>
    </div>
  );
}

/** Events the feed gives no time for. They belong on the tape, but not on the
 *  axis — a clock position would be invented. */
function Untimed({ label, events }: { label: string; events: CalEvent[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="eyebrow">{label}</span>
      {events.map((e, i) =>
        e.ticker ? (
          <Link
            key={`${e.event}-${i}`}
            href={`/t/${e.ticker}`}
            className="text-data text-accent hover:underline"
          >
            {e.ticker}
          </Link>
        ) : (
          <span key={`${e.event}-${i}`} className="text-body text-2">
            {eventShortName(e.event, e.category, e.ticker)}
          </span>
        ),
      )}
      <span className="text-body text-3">· no time on the feed</span>
    </div>
  );
}

export default function TodaysTape() {
  // Three days covers a window that always runs into tomorrow and, on a Friday
  // evening, past it. The route caps nothing, so the extra days cost one field.
  const { data, error, isLoading } = useCalendar(3);
  // The window is hour-snapped, so a minute tick is enough to walk the now-marker
  // across the axis and to roll the whole window over on the hour. Held in state
  // rather than read at render time so the server and the first client render
  // agree — this component only mounts once SWR has data, but the clock must not
  // be what decides that.
  const [at, setAt] = useState<Date | null>(null);
  useEffect(() => {
    setAt(new Date());
    const id = setInterval(() => setAt(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading || error || !data || !at) return null;
  return <TapeBand events={data.events ?? []} at={at} />;
}

export function TapeBand({ events, at = new Date() }: { events: CalEvent[]; at?: Date }) {
  const win = tapeWindow(at);
  const dates = windowDates(win);

  const toMark = (e: CalEvent, i: number, ms: number): Mark => ({
    key: `${e.event}-${i}`,
    ms,
    minutes: (ms - win.startMs) / 60_000,
    label: eventShortName(e.event, e.category, e.ticker),
    importance: e.importance,
    ticker: e.ticker,
  });

  /** On the axis: has a clock, and that clock lands inside the window. */
  const timed = (list: CalEvent[]) =>
    list.flatMap((e, i) => {
      const ms = eventMs(e.date, e.time_et);
      if (ms === null || windowFraction(ms, win) === null) return [];
      return [toMark(e, i, ms)];
    });
  /** Off the axis: no clock at all, on a date the window covers. Rows dated
   *  outside it belong to the calendar page, not to this band. */
  const untimed = (list: CalEvent[]) =>
    list.filter((e) => eventMs(e.date, e.time_et) === null && dates.includes(e.date));

  const earnings = events.filter(isEarnings);
  const releases = events.filter((e) => !isEarnings(e));

  const aboveLanes = assignLanes(timed(earnings));
  const belowLanes = assignLanes(timed(releases));
  const aboveH = laneCount(aboveLanes) * LANE_H;
  const belowH = laneCount(belowLanes) * LANE_H;

  const untimedEarnings = untimed(earnings);
  const untimedReleases = untimed(releases);

  const nowMs = at.getTime();
  const nowF = windowFraction(nowMs, win) ?? 0;
  const sessions = windowSessions(win);
  const ticks = windowTicks(win);

  const nothingAtAll =
    aboveLanes.length === 0 &&
    belowLanes.length === 0 &&
    untimedEarnings.length === 0 &&
    untimedReleases.length === 0;

  return (
    <Panel
      title="Today’s tape"
      heading="eyebrow"
      subtitle={`${TAPE_SPAN_H}h window · all times Sydney`}
      readThis={
        <>
          the {TAPE_SPAN_H} hours of tape around now, on one axis —{" "}
          <ReadThisTerm>releases below the line, earnings above</ReadThisTerm>. The window rolls
          forward with the clock, starting {TAPE_LOOKBACK_H} hours behind it so a print you have
          just missed is still on screen.
          {untimedEarnings.length > 0 &&
            " Names the feed gives no clock for sit off the axis: the risk there is the position" +
              " you hold into them, not the reaction you trade."}
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {(untimedEarnings.length > 0 || untimedReleases.length > 0) && (
          <div className="flex flex-col gap-1">
            {untimedEarnings.length > 0 && <Untimed label="Earnings" events={untimedEarnings} />}
            {untimedReleases.length > 0 && <Untimed label="Releases" events={untimedReleases} />}
          </div>
        )}

        {/* The axis is drawn whether or not anything lands on it. A rolling
            window always has a `now` and a session structure to show, and an
            empty day is itself the reading — the old build hid the band on those
            days and the panel looked broken rather than quiet. */}
        <div className="relative">
          {aboveH > 0 && (
            <div className="relative" style={{ height: `${aboveH}px` }}>
              {aboveLanes.map((m) => (
                <EarningsMark
                  key={m.key}
                  mark={m}
                  lane={m.lane}
                  win={win}
                  f={windowFraction(m.ms, win) ?? 0}
                />
              ))}
            </div>
          )}

          {/* `now` gets a lane to itself — a pill sharing the axis row collides
              with a session label whenever the two want the same position. */}
          <div className="relative" style={{ height: `${NOW_H}px` }}>
            <span
              className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-accent px-1.5 py-0.5 text-micro font-semibold normal-case text-bg"
              style={{ left: `${nowF * 100}%` }}
            >
              now <Clock ms={nowMs} win={win} />
            </span>
          </div>

          {/* The trading day as one bar: pre and after on the track, the regular
              session lifted between two edges. Over 24 hours the same session can
              appear twice — once for each ET date the window touches — and the
              overnight gap between 20:00 and 04:00 is bare track. The track is
              `--surface`, a step *below* the panel it sits in: the panel is
              already `--elevated`, so an elevated track would be invisible
              against it and the wings would read as empty space. */}
          <div
            className="relative overflow-hidden rounded-[4px] bg-surface"
            style={{ height: `${AXIS_H}px` }}
          >
            {sessions.map((s) => {
              const left = (windowFraction(s.startMs, win) ?? 0) * 100;
              const right = (windowFraction(s.endMs, win) ?? 1) * 100;
              const width = right - left;
              const regular = s.key.endsWith(":regular");
              return (
                <Fragment key={s.key}>
                  <div
                    className={`absolute inset-y-0 ${
                      regular ? "border-x border-line-strong bg-raised" : ""
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                  {width / 100 >= MIN_LABEL_FRAC && (
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-micro font-semibold ${
                        regular ? "text-muted" : "text-muted-2"
                      }`}
                      style={{ left: `calc(${left}% + 8px)` }}
                    >
                      {s.label} · <Clock ms={s.startMs} win={win} />
                    </span>
                  )}
                </Fragment>
              );
            })}
            <div
              className="absolute inset-y-0 w-[2px] bg-accent"
              style={{ left: `${nowF * 100}%` }}
            />
          </div>

          {/* The hour ruler. On a fixed 04:00–20:00 axis the session labels were
              the only clock anyone needed; a window that moves needs its own
              scale, or "where is 3pm" has no answer on a quiet day. */}
          <div className="relative" style={{ height: `${RULER_H}px` }}>
            {ticks.map((ms) => (
              <span
                key={ms}
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-micro text-muted-2"
                style={{ left: `${(windowFraction(ms, win) ?? 0) * 100}%` }}
              >
                <Clock ms={ms} win={win} />
              </span>
            ))}
          </div>

          {belowH > 0 && (
            <div className="relative" style={{ height: `${belowH}px`, marginTop: `${TICK_GAP}px` }}>
              {belowLanes.map((m) => (
                <ReleaseMark
                  key={m.key}
                  mark={m}
                  lane={m.lane}
                  win={win}
                  f={windowFraction(m.ms, win) ?? 0}
                />
              ))}
            </div>
          )}
        </div>

        {nothingAtAll && (
          <p className="text-body text-muted">
            Nothing scheduled inside this window.{" "}
            <Link href="/calendar" className="hover:text-accent">
              What’s further out ›
            </Link>
          </p>
        )}
      </div>
    </Panel>
  );
}
