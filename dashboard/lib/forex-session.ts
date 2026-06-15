export type FxSession = "ASIA" | "LDN" | "NY";

/** Active FX sessions by UTC hour (no holidays). FX trades Sun 21:00 → Fri 21:00 UTC. */
export function forexSessions(now: Date = new Date()): {
  active: FxSession[];
  overlap: boolean;
  closed: boolean;
} {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const h = now.getUTCHours();
  // Weekend window: Sat all day, Sun before 21:00, Fri after 21:00.
  const closed =
    day === 6 || (day === 0 && h < 21) || (day === 5 && h >= 21);
  if (closed) return { active: [], overlap: false, closed: true };
  const active: FxSession[] = [];
  if (h >= 0 && h < 9) active.push("ASIA");
  if (h >= 7 && h < 16) active.push("LDN");
  if (h >= 12 && h < 21) active.push("NY");
  return { active, overlap: active.length > 1, closed: false };
}
