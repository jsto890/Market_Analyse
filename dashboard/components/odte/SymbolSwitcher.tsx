"use client";

import SegmentedControl, { type SegmentedOption } from "@/components/ui/SegmentedControl";
import { odteEtfSymbols, odteIndexSymbols } from "@/lib/odte";
import type { OdteSymbol } from "@/lib/odte-core";

export interface SymbolSwitcherProps {
  active: OdteSymbol;
  onChange: (symbol: OdteSymbol) => void;
  className?: string;
}

const toOptions = (symbols: readonly OdteSymbol[]): SegmentedOption<OdteSymbol>[] =>
  symbols.map((symbol) => ({ key: symbol, label: symbol }));

const ETF_OPTIONS = toOptions(odteEtfSymbols);
const INDEX_OPTIONS = toOptions(odteIndexSymbols);

/**
 * Underlying switch for the whole options group. Two `SegmentedControl`s rather
 * than one: the mock draws five segments, but the app answers for eight
 * underlyings and the ETF/index split is the axis that separates them.
 */
export default function SymbolSwitcher({ active, onChange, className }: SymbolSwitcherProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <SegmentedControl label="ETF" value={active} options={ETF_OPTIONS} onChange={onChange} />
      <SegmentedControl label="Index" value={active} options={INDEX_OPTIONS} onChange={onChange} />
    </div>
  );
}
