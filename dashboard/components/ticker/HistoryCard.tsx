import Panel from "@/components/ui/Panel";

interface SignalRow {
  date: string;
  report_group: string | null;
  action_label: string | null;
  combined_score: number | null;
  entry: number | null;
}

interface HistoryCardProps {
  rows: SignalRow[];
  lastClose: number | null;
}

function pctSince(entry: number | null, now: number | null): {
  text: string;
  pos: boolean;
} | null {
  if (entry === null || entry === 0 || now === null || !Number.isFinite(entry) || !Number.isFinite(now)) {
    return null;
  }
  const pct = ((now - entry) / entry) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, pos: pct >= 0 };
}

export default function HistoryCard({ rows, lastClose }: HistoryCardProps) {
  if (rows.length === 0) {
    return (
      <Panel title="Signal History">
        <p className="text-[12px] text-muted">No prior flags in the database</p>
      </Panel>
    );
  }

  // Most recent first
  const ordered = [...rows].reverse();
  const shown = ordered.slice(0, 10);
  const older = ordered.length - shown.length;

  return (
    <Panel title="Signal History">
      <div className="space-y-2">
        <table className="w-full font-mono text-[12px] tabular-nums border-collapse">
          <thead>
            <tr className="text-left text-muted text-[11px]">
              <th className="pb-1 pr-3 font-medium">date</th>
              <th className="pb-1 pr-3 font-medium">group</th>
              <th className="pb-1 pr-3 font-medium">label</th>
              <th className="pb-1 pr-3 font-medium text-right">comb</th>
              <th className="pb-1 font-medium text-right">then→now</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const since = pctSince(r.entry, lastClose);
              return (
                <tr key={`${r.date}-${i}`} className="border-t border-line">
                  <td className="py-1 pr-3 text-muted">{r.date}</td>
                  <td className="py-1 pr-3 text-foreground">{r.report_group ?? "—"}</td>
                  <td className="py-1 pr-3 text-muted">{r.action_label ?? "—"}</td>
                  <td className="py-1 pr-3 text-right text-foreground">
                    {r.combined_score != null ? r.combined_score.toFixed(2) : "—"}
                  </td>
                  <td className="py-1 text-right">
                    {since ? (
                      <span className={since.pos ? "text-pos" : "text-neg"}>{since.text}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {older > 0 && (
          <p className="text-[11px] text-muted">+{older} older</p>
        )}
      </div>
    </Panel>
  );
}
