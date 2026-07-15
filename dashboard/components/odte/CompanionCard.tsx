import { isProxied } from "@/lib/odteCompanion";
import type { OdteSymbol } from "@/lib/odte";
import Skeleton from "@/components/ui/Skeleton";

interface CompanionCardProps {
  symbol: OdteSymbol;
  title: string;
  asOf?: string | null;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  children?: React.ReactNode;
}

export default function CompanionCard({
  symbol,
  title,
  asOf,
  loading,
  empty,
  emptyLabel = "no snapshot yet",
  children,
}: CompanionCardProps) {
  return (
    <div className="bg-surface border border-line rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted font-mono">
            {title}
          </span>
          {isProxied(symbol) && (
            <span className="text-[9px] bg-elevated px-1 rounded text-muted">PROXY</span>
          )}
        </div>
        {asOf && (
          <span className="text-[10px] text-muted font-mono tabular-nums">{asOf}</span>
        )}
      </div>
      {loading ? (
        <div className="space-y-1.5" aria-hidden="true">
          <Skeleton height={12} className="w-full" />
          <Skeleton height={12} className="w-3/4" />
          <Skeleton height={12} className="w-1/2" />
        </div>
      ) : empty ? (
        <p className="text-[11px] text-muted font-mono py-2">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  );
}
