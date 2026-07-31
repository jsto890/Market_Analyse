/** History as the rotation job writes it: date → industry → [RS-Ratio, RS-Mom]. */
export type TrailHistory = Record<string, Record<string, [number, number]>>;

export interface TrailPoint {
  date: string;
  rs_ratio: number;
  rs_mom: number;
}

/** The Monday owning a date, so a week of daily runs collapses to one point. */
function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * One point per week for an industry, oldest first, at most `weeks` of them.
 * The job runs daily but an RRG tail is weekly — daily points draw the sampling
 * noise rather than the rotation. A single point is not a trail, so the caller
 * gets nothing to draw rather than a dot on top of the dot already there.
 */
export function weeklyTrail(
  history: TrailHistory | undefined,
  industry: string,
  weeks = 8
): TrailPoint[] {
  if (!history) return [];
  const byWeek = new Map<string, TrailPoint>();
  for (const date of Object.keys(history).sort()) {
    const xy = history[date]?.[industry];
    if (!xy) continue;
    // Ascending, so the last run of a week is the one that survives it.
    byWeek.set(weekOf(date), { date, rs_ratio: xy[0], rs_mom: xy[1] });
  }
  const points = Array.from(byWeek.values()).slice(-weeks);
  return points.length < 2 ? [] : points;
}

/** Trails for the industries that have one; the rest are absent, not empty. */
export function buildTrails(
  history: TrailHistory | undefined,
  industries: string[],
  weeks = 8
): Record<string, TrailPoint[]> {
  const out: Record<string, TrailPoint[]> = {};
  for (const industry of industries) {
    const trail = weeklyTrail(history, industry, weeks);
    if (trail.length) out[industry] = trail;
  }
  return out;
}
