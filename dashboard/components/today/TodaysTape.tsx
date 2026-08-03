"use client";

import { Fragment } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { ReadThisTerm } from "@/components/ui/ReadThis";
import { eventShortName } from "@/lib/eventMeta";
import { useMorningReport, type MorningEvent } from "@/lib/report";
import {
  TAPE_SESSIONS,
  assignLanes,
  etMinutes,
  fmtLocalClock,
  laneCount,
  localOffsetMin,
  nowEtMinutes,
  nowOnAxis,
  tapeFraction,
} from "@/lib/tape";

/** Band geometry, in px. Earnings lanes · the `now` lane · the axis · the
 *  release lanes stack to ~150px on a normal day (one lane up, three down).
 *  `now` owns the 22px directly above the axis so its pill can never land on
 *  the same row as an event label. */
const LANE_H = 22;
const NOW_H = 22;
const AXIS_H = 24;
/** Air between the axis and the first release lane, which the connector spans. */
const TICK_GAP = 8;
/** Past this fraction a left-anchored label runs off the right edge. */
const FLIP_AT = 0.72;

interface Mark {
  key: string;
  minutes: number;
  label: string;
  importance: string;
  ticker: string | null;
}

function isEarnings(e: MorningEvent): boolean {
  return e.category === "earnings" || e.ticker != null;
}

function toMark(e: MorningEvent, i: number, minutes: number): Mark {
  return {
    key: `${e.event}-${i}`,
    minutes,
    label: eventShortName(e.event, e.category, e.ticker),
    importance: e.importance,
    ticker: e.ticker,
  };
}

/** One clock reading, plus the `+1` that says it has rolled into tomorrow here.
 *  The suffix is not decoration: a bare "06:00" printed to the right of "23:30"
 *  reads as the tape running backwards. */
function Clock({ minutes, offsetMin }: { minutes: number; offsetMin: number }) {
  const { clock, dayShift } = fmtLocalClock(minutes, offsetMin);
  return (
    <>
      {clock}
      {dayShift === 1 && <span className="text-muted-2"> +1</span>}
    </>
  );
}

/** Earnings sit above the axis as amber chips — single-name event risk should
 *  not look like a scheduled macro print. The connector drops past the `now`
 *  lane to the top of the axis. */
function EarningsMark({ mark, lane, offsetMin }: { mark: Mark; lane: number; offsetMin: number }) {
  const f = tapeFraction(mark.minutes);
  const flip = f > FLIP_AT;
  const chip = `inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-[4px] border border-warn/50 bg-warn/10 px-[7px] py-[3px] text-micro font-semibold text-warn ${
    flip ? "-translate-x-full" : ""
  }`;
  const inner = (
    <>
      <span>
        <Clock minutes={mark.minutes} offsetMin={offsetMin} />
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
function ReleaseMark({ mark, lane, offsetMin }: { mark: Mark; lane: number; offsetMin: number }) {
  const f = tapeFraction(mark.minutes);
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
        <Clock minutes={mark.minutes} offsetMin={offsetMin} />
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
function Untimed({ label, events }: { label: string; events: MorningEvent[] }) {
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
  // Same SWR key as the masthead, so the two share one request.
  const { data, error, isLoading } = useMorningReport();
  if (isLoading || error || !data) return null;
  return <TapeBand events={data.today_events ?? []} />;
}

export function TapeBand({
  events,
  nowMin = nowEtMinutes(),
  offsetMin = localOffsetMin(),
}: {
  events: MorningEvent[];
  nowMin?: number;
  /** Injected in tests so a clock assertion does not depend on the runner's
   *  hemisphere or the date it runs on. */
  offsetMin?: number;
}) {
  const earnings = events.filter(isEarnings);
  const releases = events.filter((e) => !isEarnings(e));

  const timed = (list: MorningEvent[]) =>
    list.flatMap((e, i) => {
      const m = etMinutes(e.time_et);
      return m === null ? [] : [toMark(e, i, m)];
    });
  const untimed = (list: MorningEvent[]) => list.filter((e) => etMinutes(e.time_et) === null);

  const aboveLanes = assignLanes(timed(earnings));
  const belowLanes = assignLanes(timed(releases));
  const aboveH = laneCount(aboveLanes) * LANE_H;
  const belowH = laneCount(belowLanes) * LANE_H;

  const untimedEarnings = untimed(earnings);
  const untimedReleases = untimed(releases);
  const showNow = nowOnAxis(nowMin);
  const nowF = tapeFraction(nowMin);

  const nothingTimed = aboveLanes.length === 0 && belowLanes.length === 0;

  return (
    <Panel
      title="Today’s tape"
      heading="eyebrow"
      subtitle={nothingTimed ? undefined : "all times Sydney"}
      readThis={
        nothingTimed ? (
          <>
            everything scheduled to move the tape today. The earnings feed carries dates only, so
            those names have no clock position:{" "}
            <ReadThisTerm>today&rsquo;s risk is the position you hold into them</ReadThisTerm>, not
            the reaction you trade.
          </>
        ) : (
          <>
            everything scheduled to move the tape today, on one axis —{" "}
            <ReadThisTerm>releases below the line, earnings above</ReadThisTerm>.{" "}
            {untimedEarnings.length > 0
              ? "The earnings feed carries dates only, so those names sit off the axis: today's risk is the position you hold into them, not the reaction you trade."
              : "Nothing above the line means no tracked name reports today."}
          </>
        )
      }
    >
      <div className="flex flex-col gap-2">
        {(untimedEarnings.length > 0 || untimedReleases.length > 0) && (
          <div className="flex flex-col gap-1">
            {untimedEarnings.length > 0 && <Untimed label="Earnings" events={untimedEarnings} />}
            {untimedReleases.length > 0 && <Untimed label="Releases" events={untimedReleases} />}
          </div>
        )}

        {/* An axis with nothing on it is 150px of furniture saying nothing, and
            session phase is the context strip's job. It appears the moment one
            event has a time. */}
        {!nothingTimed && (
          <div className="relative">
            {aboveH > 0 && (
              <div className="relative" style={{ height: `${aboveH}px` }}>
                {aboveLanes.map((m) => (
                  <EarningsMark key={m.key} mark={m} lane={m.lane} offsetMin={offsetMin} />
                ))}
              </div>
            )}

            {/* `now` gets a lane to itself — a pill sharing the axis row collides
                with the REGULAR label between 09:30 and 10:00. */}
            <div className="relative" style={{ height: `${NOW_H}px` }}>
              {showNow && (
                <span
                  className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-accent px-1.5 py-0.5 text-micro font-semibold normal-case text-bg"
                  style={{ left: `${nowF * 100}%` }}
                >
                  now <Clock minutes={nowMin} offsetMin={offsetMin} />
                </span>
              )}
            </div>

            {/* The trading day as one bar: pre and after on the track, the
                regular session lifted between two edges. The track is
                `--surface`, a step *below* the panel it sits in rather than the
                mock's step above — the panel is already `--elevated`, so an
                elevated track would have been invisible against it and the pre
                and after wings would have read as empty space. Recessed, the
                wings are legible and the regular session still lifts clear. */}
            <div
              className="relative overflow-hidden rounded-[4px] bg-surface"
              style={{ height: `${AXIS_H}px` }}
            >
              {TAPE_SESSIONS.map((s) => {
                const left = tapeFraction(s.startMin) * 100;
                const width = (tapeFraction(s.endMin) - tapeFraction(s.startMin)) * 100;
                const regular = s.key === "regular";
                return (
                  <Fragment key={s.key}>
                    <div
                      className={`absolute inset-y-0 ${
                        regular ? "border-x border-line-strong bg-raised" : ""
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-micro font-semibold ${
                        regular ? "text-muted" : "text-muted-2"
                      }`}
                      style={{ left: `calc(${left}% + 8px)` }}
                    >
                      {s.label} · <Clock minutes={s.startMin} offsetMin={offsetMin} />
                    </span>
                  </Fragment>
                );
              })}
              {showNow && (
                <div
                  className="absolute inset-y-0 w-[2px] bg-accent"
                  style={{ left: `${nowF * 100}%` }}
                />
              )}
            </div>

            {belowH > 0 && (
              <div
                className="relative"
                style={{ height: `${belowH}px`, marginTop: `${TICK_GAP}px` }}
              >
                {belowLanes.map((m) => (
                  <ReleaseMark key={m.key} mark={m} lane={m.lane} offsetMin={offsetMin} />
                ))}
              </div>
            )}
          </div>
        )}

        {nothingTimed && (
          <p className="text-body text-muted">
            No timed release today.{" "}
            <Link href="/calendar" className="hover:text-accent">
              What’s scheduled ›
            </Link>
          </p>
        )}
      </div>
    </Panel>
  );
}
