import ReadThis from "@/components/ui/ReadThis";
import {
  TINT_PUT,
  TINT_TEAL,
  axisDecimals,
  fmtExpiryLabel,
  fmtLevel,
  fmtSigned,
  gexUnit,
  niceCeil,
} from "@/components/odte/gammaFormat";

export interface GexPoint {
  strike: number;
  gex: number;
}

export interface GexProfileProps {
  /** Ascending by strike. 15 rows is the designed height. */
  rows: GexPoint[];
  spot: number | null;
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  expiry: string | null;
}

/** Row emphasis, most specific first — a strike can be both the flip and the
 *  wall, and the flip is what the page is about. */
function marks(
  strike: number,
  atm: number | null,
  zeroGamma: number | null,
  callWall: number | null,
  putWall: number | null
): { tags: string[]; tint: string; strikeTone: string } {
  const tags: string[] = [];
  if (strike === zeroGamma) tags.push("ZG");
  if (strike === callWall) tags.push("CW");
  if (strike === putWall) tags.push("PW");
  if (strike === atm) tags.push("ATM");

  if (strike === zeroGamma) return { tags, tint: TINT_TEAL, strikeTone: "text-teal" };
  if (strike === callWall) return { tags, tint: TINT_TEAL, strikeTone: "text-teal" };
  if (strike === putWall) return { tags, tint: TINT_PUT, strikeTone: "text-put" };
  if (strike === atm)
    return { tags, tint: "bg-elevated", strikeTone: "text-warn font-semibold" };
  return { tags, tint: "", strikeTone: "text-muted" };
}

const TAG_TONE: Record<string, string> = {
  ZG: "text-teal",
  CW: "text-teal",
  PW: "text-put",
  ATM: "text-warn",
};

export default function GexProfile({
  rows,
  spot,
  zeroGamma,
  callWall,
  putWall,
  expiry,
}: GexProfileProps) {
  const peak = Math.max(...rows.map((r) => Math.abs(r.gex)), 0);
  if (rows.length === 0 || peak <= 0) return null;

  const unit = gexUnit(peak);
  const axis = niceCeil(peak / unit.div);
  const dp = axisDecimals(axis);

  // The row the reader thinks of as "here" — nearest listed strike to spot.
  const atm =
    spot != null
      ? rows.reduce((best, r) =>
          Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best
        ).strike
      : null;

  // Levels are prices, not strikes; snap them onto the row they land on. A
  // level outside this window snaps to nothing rather than tinting the edge row
  // — a put wall three strikes below the profile is not on the profile.
  const step = rows
    .slice(1)
    .reduce((min, r, i) => Math.min(min, r.strike - rows[i].strike), Infinity);
  const reach = Number.isFinite(step) ? step / 2 : 0;
  const snap = (level: number | null) => {
    if (level == null) return null;
    const row = rows.reduce((best, r) =>
      Math.abs(r.strike - level) < Math.abs(best.strike - level) ? r : best
    );
    return Math.abs(row.strike - level) <= reach ? row.strike : null;
  };
  const zgRow = snap(zeroGamma);
  const cwRow = snap(callWall);
  const pwRow = snap(putWall);

  const heaviest = rows.reduce((best, r) => (r.gex > best.gex ? r : best));

  return (
    <section className="overflow-hidden rounded-[8px] border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-[11px]">
        <span className="text-title text-foreground">Gamma exposure by strike</span>
        <span className="text-micro text-muted">
          ${unit.suffix} per 1% move{expiry ? ` · ${fmtExpiryLabel(expiry)}` : ""}
        </span>
      </div>

      <div className="px-4 pb-2.5 pt-3.5">
        <div className="mb-2 flex justify-between pl-[52px] pr-[74px] text-micro text-muted">
          <span>−{axis.toFixed(dp)}</span>
          <span>−{(axis / 2).toFixed(dp)}</span>
          <span>0</span>
          <span>+{(axis / 2).toFixed(dp)}</span>
          <span>+{axis.toFixed(dp)}</span>
        </div>

        {rows.map((r) => {
          const value = r.gex / unit.div;
          const width = (Math.abs(value) / axis) * 50;
          const positive = value >= 0;
          const { tags, tint, strikeTone } = marks(r.strike, atm, zgRow, cwRow, pwRow);
          const strong = tags.length > 0 && !(tags.length === 1 && tags[0] === "ATM");
          return (
            <div
              key={r.strike}
              className={`flex h-[22px] items-center gap-[6px] rounded-[3px] ${tint}`}
            >
              <span className={`w-[46px] shrink-0 text-right text-data ${strikeTone}`}>
                {fmtLevel(r.strike)}
              </span>
              <span className="relative h-[14px] flex-1">
                <span
                  className={`absolute inset-y-0 w-px ${
                    r.strike === zgRow ? "bg-teal" : "bg-line-strong"
                  }`}
                  style={{ left: "50%" }}
                />
                <span
                  className={`absolute inset-y-px ${
                    positive ? "rounded-r-[2px] bg-teal" : "rounded-l-[2px] bg-put"
                  } ${strong ? "" : "opacity-60"}`}
                  style={
                    positive
                      ? { left: "50%", width: `${width}%` }
                      : { right: "50%", width: `${width}%` }
                  }
                />
              </span>
              <span
                className={`w-[68px] shrink-0 text-data ${positive ? "text-teal" : "text-put"}`}
              >
                {fmtSigned(value, dp)}
                {tags.length > 0 && (
                  <span className={`ml-1 text-micro ${TAG_TONE[tags[0]]}`}>{tags[0]}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <ReadThis>
        bars right of the axis mean dealers buy dips and sell rips at that strike; bars left mean
        they do the opposite.
        {zgRow != null && <> The flip sits at <span className="text-teal">{fmtLevel(zgRow)}</span>.</>}
        {heaviest.gex > 0 && (
          <>
            {" "}
            The heaviest positive block, at{" "}
            <span className="text-teal">{fmtLevel(heaviest.strike)}</span>, is what caps the
            session.
          </>
        )}
      </ReadThis>
    </section>
  );
}
