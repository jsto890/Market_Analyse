/** Sydney-primary, ET-secondary clock string (master plan §2.3 / §WS-2 hierarchy). */
export function dualClock(now: Date = new Date()): { primary: string; secondary: string } {
  const syd = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  const et = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  return { primary: syd, secondary: `${et} ET` };
}
