"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import { ReadThisTerm } from "@/components/ui/ReadThis";
import { eventShortName } from "@/lib/eventMeta";
import { useMorningReport, type MorningEvent } from "@/lib/report";
import {
  TAPE_SESSIONS,
  assignLanes,
  etMinutes,
  fmtEtClock,
  laneCount,
  nowEtMinutes,
  nowOnAxis,
  tapeFraction,
} from "@/lib/tape";

const LANE_H = 22;
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

function Positioned({ mark, lane, side }: { mark: Mark; lane: number; side: "above" | "below" }) {
  const f = tapeFraction(mark.minutes);
  const flip = f > FLIP_AT;
  const body = (
    <span
      className={`flex items-baseline gap-1.5 whitespace-nowrap ${
        flip ? "-translate-x-full border-r pr-1.5" : "border-l pl-1.5"
      } ${mark.importance === "high" ? "border-warn" : "border-line-strong"}`}
    >
      <span className="text-data text-muted">{fmtEtClock(mark.minutes)}</span>
      <span
        className={mark.importance === "high" ? "text-body text-foreground" : "text-body text-2"}
      >
        {mark.label}
      </span>
    </span>
  );
  return (
    <div
      className="absolute"
      style={{
        left: `${f * 100}%`,
        [side === "above" ? "bottom" : "top"]: `${lane * LANE_H}px`,
        height: `${LANE_H}px`,
      }}
    >
      {mark.ticker ? (
        <Link href={`/t/${mark.ticker}`} className="hover:text-accent">
          {body}
        </Link>
      ) : (
        body
      )}
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

export default function TodaysTape({ actions }: { actions?: ReactNode }) {
  // Same SWR key as the masthead, so the two share one request.
  const { data, error, isLoading } = useMorningReport();
  // The date stepper rides in this panel's header. With no brief there is no
  // header to ride in, and dropping it would drop history navigation with it.
  if (isLoading || error || !data) return <>{actions}</>;
  return <TapeBand events={data.today_events ?? []} actions={actions} />;
}

export function TapeBand({
  events,
  nowMin = nowEtMinutes(),
  actions,
}: {
  events: MorningEvent[];
  nowMin?: number;
  actions?: ReactNode;
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
      subtitle={nothingTimed ? undefined : "all times ET"}
      actions={actions}
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
                  <Positioned key={m.key} mark={m} lane={m.lane} side="above" />
                ))}
              </div>
            )}

            {/* the axis */}
            <div className="relative h-5">
              {TAPE_SESSIONS.map((s) => {
                const left = tapeFraction(s.startMin) * 100;
                const width = (tapeFraction(s.endMin) - tapeFraction(s.startMin)) * 100;
                return (
                  <div
                    key={s.key}
                    className={`absolute top-0 h-full border-l border-line ${
                      s.key === "regular" ? "bg-raised" : ""
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    <span className="absolute left-1 top-0.5 eyebrow">
                      {s.label} {fmtEtClock(s.startMin)}
                    </span>
                  </div>
                );
              })}
              <div className="absolute inset-x-0 bottom-0 border-b border-line-strong" />
              {showNow && (
                <div
                  className="absolute top-0 h-full border-l border-accent"
                  style={{ left: `${nowF * 100}%` }}
                >
                  <span
                    className={`absolute top-0.5 whitespace-nowrap text-data text-accent ${
                      nowF > FLIP_AT ? "right-1" : "left-1"
                    }`}
                  >
                    now {fmtEtClock(nowMin)} ET
                  </span>
                </div>
              )}
            </div>

            {belowH > 0 && (
              <div className="relative mt-1" style={{ height: `${belowH}px` }}>
                {belowLanes.map((m) => (
                  <Positioned key={m.key} mark={m} lane={m.lane} side="below" />
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
