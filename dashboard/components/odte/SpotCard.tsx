"use client";

import CompanionCard from "@/components/odte/CompanionCard";
import { companionSymbol, pctFrom } from "@/lib/odteCompanion";
import type { OdteSymbol } from "@/lib/odte";

interface SpotCardProps {
  symbol: OdteSymbol;
  spot: number | null;
  zeroGamma: number | null;
}

export default function SpotCard({ symbol, spot, zeroGamma }: SpotCardProps) {
  const empty = spot == null;

  return (
    <CompanionCard symbol={symbol} title="Spot" loading={false} empty={empty}>
      <div className="space-y-1">
        <div className="flex justify-between font-mono text-micro tabular-nums">
          <span className="text-muted">{companionSymbol(symbol)}</span>
          <span className="text-foreground text-subhead">{spot?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-mono text-micro tabular-nums">
          <span className="text-muted">dist to zero-gamma</span>
          <span className="text-foreground">{pctFrom(spot, zeroGamma)}</span>
        </div>
      </div>
    </CompanionCard>
  );
}
