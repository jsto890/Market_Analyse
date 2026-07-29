"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface DateStepperProps {
  /** Distinct report dates, newest last (matches reportDates()'s DESC order reversed by the caller — see Task 5 Step 3). */
  dates: string[];
  /** The date currently being viewed. Null/absent means "latest" (no ?date= param). */
  current: string | null;
}

export default function DateStepper({ dates, current }: DateStepperProps) {
  const router = useRouter();
  if (dates.length <= 1) return null;

  const latest = dates[dates.length - 1];
  const activeDate = current ?? latest;
  const idx = dates.indexOf(activeDate);
  const prevDate = idx > 0 ? dates[idx - 1] : null;
  const nextDate = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  function go(date: string | null) {
    if (date === null || date === latest) {
      router.push("/");
    } else {
      router.push(`/?date=${date}`);
    }
  }

  return (
    <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
      <button
        type="button"
        aria-label="Previous"
        disabled={prevDate === null}
        onClick={() => go(prevDate)}
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40 disabled:cursor-not-allowed hover:border-accent hover:text-accent transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="tabular-nums text-foreground">{activeDate}</span>
      {activeDate !== latest && <span className="text-warn">(viewing history)</span>}
      <button
        type="button"
        aria-label="Next"
        disabled={nextDate === null}
        onClick={() => go(nextDate)}
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40 disabled:cursor-not-allowed hover:border-accent hover:text-accent transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
