import { isProxied } from "@/lib/odteCompanion";
import type { OdteSymbol } from "@/lib/odte";
import Loading from "@/components/ui/Loading";
import Empty from "@/components/ui/Empty";
import Stale from "@/components/ui/Stale";

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
          <span className="eyebrow">{title}</span>
          {isProxied(symbol) && (
            <span className="text-micro bg-elevated px-1 rounded text-muted">PROXY</span>
          )}
        </div>
        {asOf && <Stale asOf={asOf} variant="line" />}
      </div>
      {loading ? (
        <Loading variant="lines" count={3} />
      ) : empty ? (
        <Empty message={emptyLabel} />
      ) : (
        children
      )}
    </div>
  );
}
