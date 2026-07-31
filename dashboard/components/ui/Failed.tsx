import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export interface FailedProps {
  /** What failed, in the user's terms — not the exception class. */
  title?: string;
  /** The reason, and what it means for what's on screen. */
  message?: ReactNode;
  /** Raw detail (status line, error text). Rendered mono and dimmed. */
  detail?: string;
  /** Retry / configure / go-elsewhere. */
  action?: ReactNode;
  fill?: boolean;
  className?: string;
}

/**
 * The single failure idiom. Distinct from `Empty`: empty means the query ran
 * and found nothing, failed means the query did not run.
 */
export default function Failed({
  title = "Couldn’t load this",
  message,
  detail,
  action,
  fill = false,
  className = "",
}: FailedProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-md border border-warn/40 bg-warn/[0.06] px-6 text-center ${
        fill ? "min-h-[320px] flex-1" : "py-10"
      } ${className}`}
    >
      <span className="text-warn">
        <AlertTriangle size={24} strokeWidth={1.5} />
      </span>
      <p className="text-title text-foreground">{title}</p>
      {message && <p className="max-w-[52ch] text-body text-2">{message}</p>}
      {detail && <p className="max-w-[52ch] break-words text-data text-muted">{detail}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
