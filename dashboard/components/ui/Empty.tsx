import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

export interface EmptyProps {
  /** Short statement of what isn't here. */
  title?: string;
  /** Why it isn't here, and what would put something here. */
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** Grow to fill the remaining column height instead of sitting in a fixed
   * strip. Use where this state *is* the page, so a degraded route reads as
   * intentional rather than half-rendered. */
  fill?: boolean;
  className?: string;
}

/** The single empty idiom. Nothing here, said in a sentence. */
export default function Empty({
  title,
  message = "No data available",
  icon,
  action,
  fill = false,
  className = "",
}: EmptyProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${
        fill ? "min-h-[320px] flex-1" : "py-12"
      } ${className}`}
    >
      <span className="text-muted-2">{icon ?? <SearchX size={26} strokeWidth={1.5} />}</span>
      {title && <p className="text-title text-foreground">{title}</p>}
      <p className="max-w-[46ch] text-body text-2">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
