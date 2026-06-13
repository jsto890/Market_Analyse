"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";

interface Heartbeat {
  job: string;
  last_run_ts: string;
  status: string;
  detail: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function ageLabel(ts: string): { text: string; stale: boolean } {
  const ms = Date.now() - new Date(ts.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(ms)) return { text: "—", stale: true };
  const h = ms / 3_600_000;
  if (h < 1) return { text: `${Math.max(1, Math.round(h * 60))}m ago`, stale: false };
  if (h < 48) return { text: `${Math.round(h)}h ago`, stale: h > 26 };
  return { text: `${Math.round(h / 24)}d ago`, stale: true };
}

export default function PipelineHealth() {
  const { data, error } = useSWR<{ heartbeats: Heartbeat[] }>(
    "/api/argus/heartbeats",
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );

  if (error) {
    return (
      <Panel title="Pipeline health">
        <p className="font-mono text-[12px] text-muted">Argus API offline</p>
      </Panel>
    );
  }
  const rows = data?.heartbeats ?? [];
  return (
    <Panel title="Pipeline health" collapsible defaultOpen persistKey="sources-health">
      {rows.length === 0 ? (
        <p className="font-mono text-[12px] text-muted">
          no job heartbeats yet — jobs report here once scheduled work runs
        </p>
      ) : (
        <table className="w-full font-mono text-[12px] tabular-nums border-collapse">
          <tbody>
            {rows.map((h) => {
              const age = ageLabel(h.last_run_ts);
              return (
                <tr key={h.job} className="border-t border-line">
                  <td className="py-1 pr-3 text-foreground">{h.job}</td>
                  <td className={`py-1 pr-3 ${h.status === "ok" ? "text-pos" : h.status === "running" ? "text-muted" : "text-neg"}`}>
                    {h.status}
                  </td>
                  <td className={`py-1 pr-3 ${age.stale ? "text-warn" : "text-muted"}`}>{age.text}</td>
                  <td className="py-1 text-muted">{h.detail ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
