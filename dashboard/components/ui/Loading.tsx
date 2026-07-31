import type { CSSProperties } from "react";

/** The one pulsing placeholder in the app. `animate-pulse` appears nowhere else. */
function Bar({ width, height = 10, className = "" }: { width?: number | string; height?: number; className?: string }) {
  const style: CSSProperties = { width, height };
  return (
    <span
      className={`inline-block animate-pulse rounded bg-raised ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export interface LoadingProps {
  /** `rows` — a ghosted table; `lines` — ghosted prose; `block` — one panel-sized slab. */
  variant?: "rows" | "lines" | "block";
  /** Column headers to print above a `rows` skeleton, so the shape is honest. */
  headers?: string[];
  count?: number;
  /** Announced to screen readers; also the visible label on `block`. */
  label?: string;
  className?: string;
}

/**
 * The single loading idiom. Replaces `Skeleton`, `SkeletonTable`, the bespoke
 * `animate-pulse` blocks in `MorningReport`/`SignalGroups`, and the eight
 * one-off `<p>Loading…</p>` strings.
 */
export default function Loading({
  variant = "lines",
  headers,
  count = 6,
  label = "Loading",
  className = "",
}: LoadingProps) {
  if (variant === "block") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex min-h-[120px] animate-pulse items-center justify-center rounded-md border border-line bg-elevated text-body text-muted ${className}`}
      >
        {label}…
      </div>
    );
  }

  if (variant === "rows") {
    const cols = headers ?? ["", "", "", ""];
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        className={`overflow-hidden rounded-md border border-line bg-elevated/40 ${className}`}
      >
        {headers && (
          <div className="flex gap-4 border-b border-line px-4 py-2" aria-hidden="true">
            {headers.map((h, i) => (
              <span key={i} className="eyebrow opacity-40" style={{ flex: i === 0 ? "0 0 90px" : "1" }}>
                {h}
              </span>
            ))}
          </div>
        )}
        {Array.from({ length: count }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b border-line/40 px-4 py-2 last:border-0"
            aria-hidden="true"
          >
            {cols.map((_c, i) => (
              <span key={i} style={{ flex: i === 0 ? "0 0 90px" : "1" }}>
                <Bar
                  height={10}
                  // Deterministic jitter: a random width would re-render differently
                  // on every hydration and thrash the screenshot diff.
                  width={i === 0 ? "70%" : `${40 + ((r * 7 + i * 13) % 45)}%`}
                  className="opacity-40"
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label={label} className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} height={10} width={`${88 - ((i * 17) % 40)}%`} className="opacity-40" />
      ))}
    </div>
  );
}
