import { ReactNode } from "react";
import { SearchX } from "lucide-react";

export interface EmptyStateProps {
  /** Short statement of what isn't here. */
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Grow to fill the remaining column height instead of sitting in a fixed
   * py-12 strip. Use on a page whose only content is this state, so a
   * degraded route reads as intentional rather than half-rendered. */
  fill?: boolean;
}

export default function EmptyState({
  title,
  message = "No data available",
  icon,
  action,
  fill = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${
        fill ? "min-h-[320px] flex-1" : "py-12"
      }`}
    >
      <span className="text-muted-2">
        {icon ?? <SearchX size={26} strokeWidth={1.5} />}
      </span>
      {title && <p className="text-subhead font-medium text-foreground">{title}</p>}
      <p className="max-w-[46ch] text-body text-muted">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
