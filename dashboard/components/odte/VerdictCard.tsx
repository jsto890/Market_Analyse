"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { Verdict } from "@/lib/odte-verdicts";
import Skeleton from "@/components/ui/Skeleton";

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
  strikesHref?: string;
}

export default function VerdictCard({
  title,
  verdict,
  loading,
  stats = [],
  whyItMatters,
  detail,
  strikesHref = "/odte/strikes",
}: VerdictCardProps) {
  const [open, setOpen] = useState(false);
  const accent = verdict ? borderClass[verdict.status] : "border-l-line";
  const canExpand = !loading && !!verdict && !!detail;

  return (
    <div className={`bg-surface border border-line ${accent} border-l-2 rounded p-3`}>
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        disabled={!canExpand}
        className="flex w-full items-start justify-between gap-2 text-left disabled:cursor-default"
      >
        <div className="min-w-0 flex-1">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted font-mono">
            {title}
          </span>
          {loading ? (
            <Skeleton height={12} className="w-2/3 mt-1.5" />
          ) : verdict ? (
            <p className="text-[11px] font-mono mt-1 leading-snug">{verdict.sentence}</p>
          ) : (
            <p className="text-[11px] font-mono text-muted mt-1">no data — source unavailable</p>
          )}
        </div>
        {canExpand && (
          <ChevronDown
            size={14}
            className="shrink-0 text-muted mt-0.5 transition-transform duration-200"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        )}
      </button>

      {!loading && verdict && stats.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {stats.map((s) => (
            <div key={s.label} className="font-mono text-[11px] tabular-nums">
              <span className="text-muted">{s.label} </span>
              <span className="text-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {open && canExpand && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          {whyItMatters && <p className="text-[10px] text-muted italic">{whyItMatters}</p>}
          {detail}
          <Link href={strikesHref} className="inline-block text-[11px] text-teal hover:underline">
            Open strikes →
          </Link>
        </div>
      )}
    </div>
  );
}
