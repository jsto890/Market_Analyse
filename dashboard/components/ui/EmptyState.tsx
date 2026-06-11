import { ReactNode } from "react";
import { SearchX } from "lucide-react";

interface EmptyStateProps {
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  message = "No data available",
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="text-muted">
        {icon ?? <SearchX size={28} strokeWidth={1.5} />}
      </span>
      <p className="text-[13px] text-muted">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
