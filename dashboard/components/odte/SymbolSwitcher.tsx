"use client";

import { odteEtfSymbols, odteIndexSymbols } from "@/lib/odte";
import type { OdteSymbol } from "@/lib/odte-core";

export interface SymbolSwitcherProps {
  active: OdteSymbol;
  onChange: (symbol: OdteSymbol) => void;
  className?: string;
}

function Group({
  label,
  symbols,
  active,
  onChange,
}: {
  label: string;
  symbols: readonly OdteSymbol[];
  active: OdteSymbol;
  onChange: (symbol: OdteSymbol) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="eyebrow">{label}</span>
      {symbols.map((symbol) => (
        <button
          key={symbol}
          type="button"
          onClick={() => onChange(symbol)}
          className={`px-2 py-0.5 text-data ${
            symbol === active ? "bg-accent-dim text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}

export default function SymbolSwitcher({ active, onChange, className }: SymbolSwitcherProps) {
  return (
    <div className={`flex rounded border border-line overflow-hidden ${className ?? ""}`}>
      <Group label="ETF" symbols={odteEtfSymbols} active={active} onChange={onChange} />
      <span className="w-px h-4 bg-line mx-1 self-center" />
      <Group label="INDEX" symbols={odteIndexSymbols} active={active} onChange={onChange} />
    </div>
  );
}
