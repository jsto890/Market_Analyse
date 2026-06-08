"use client";

import type { BridgeRow } from "@/types/bridge";
import SignalCard from "@/components/SignalCard";
import SignalTable from "@/components/SignalTable";
import { useFilterContext } from "@/components/FilterContext";

interface SignalListBodyProps {
  hcRows: BridgeRow[];
  nonHcRows: BridgeRow[];
}

export default function SignalListBody({ hcRows, nonHcRows }: SignalListBodyProps) {
  const { tableMode } = useFilterContext();
  const allRows = [...hcRows, ...nonHcRows];

  if (tableMode) {
    return <SignalTable rows={allRows} />;
  }

  return (
    <>
      <section className="space-y-2">
        {hcRows.map((row) => (
          <SignalCard key={row.ticker} row={row} />
        ))}
      </section>

      <div className="my-6 text-center text-sm text-gray-500">
        — non-HC below —
      </div>

      <section className="space-y-2">
        {nonHcRows.map((row) => (
          <SignalCard key={row.ticker} row={row} />
        ))}
      </section>
    </>
  );
}
