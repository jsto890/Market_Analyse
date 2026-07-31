"use client";

import type { ReactNode } from "react";
import type { Verdict } from "@/lib/odte-verdicts";
import Loading from "@/components/ui/Loading";
import Collapsible from "@/components/ui/Collapsible";

const borderClass: Record<Verdict["status"], string> = {
  good: "border-l-teal",
  neutral: "border-l-line",
  caution: "border-l-warn",
};

interface VerdictCardProps {
  title: string;
  verdict: Verdict | null;
  loading?: boolean;
  stats?: { label: string; value: string }[];
  whyItMatters?: string;
  detail?: ReactNode;
}

export default function VerdictCard({
  title,
  verdict,
  loading,
  stats = [],
  whyItMatters,
  detail,
}: VerdictCardProps) {
  const accent = verdict ? borderClass[verdict.status] : "border-l-line";
  const canExpand = !loading && !!verdict && !!detail;
  const persistKey = `verdict-${title.toLowerCase().replace(/\s+/g, "-")}`;

  const trigger = (
    <div className="min-w-0 flex-1">
      <span className="eyebrow">{title}</span>
      {loading ? (
        <Loading variant="lines" count={1} className="mt-1.5" />
      ) : verdict ? (
        <p className="text-body mt-1 leading-snug">{verdict.sentence}</p>
      ) : (
        <p className="text-body text-muted mt-1">no data — source unavailable</p>
      )}
      {!loading && verdict && stats.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {stats.map((s) => (
            <div key={s.label} className="text-data">
              <span className="text-muted">{s.label} </span>
              <span className="text-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const body = (
    <div className="mt-3 pt-3 border-t border-line space-y-2">
      {whyItMatters && <p className="text-body text-2 italic">{whyItMatters}</p>}
      {detail}
    </div>
  );

  return (
    <div className={`bg-surface border border-line ${accent} border-l-2 rounded p-3`}>
      {canExpand ? (
        <Collapsible persistKey={persistKey} trigger={trigger}>
          {body}
        </Collapsible>
      ) : (
        <Collapsible
          trigger={trigger}
          disabled
          disabledReason="No detail available until the verdict finishes loading"
        >
          <></>
        </Collapsible>
      )}
    </div>
  );
}
