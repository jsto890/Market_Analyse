import { loadBridgeSignals } from "@/lib/bridge";
import FilterBar from "@/components/FilterBar";
import SignalListBody from "@/components/SignalListBody";
import AlignmentCompass from "@/components/AlignmentCompass";

export default function Home() {
  const rows = loadBridgeSignals();

  const hcRows = rows
    .filter((r) => r.high_conviction)
    .sort((a, b) => b.combined_score - a.combined_score);

  const nonHcRows = rows
    .filter((r) => !r.high_conviction)
    .sort((a, b) => b.combined_score - a.combined_score);

  const allRows = [...hcRows, ...nonHcRows];

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <p className="text-sm text-gray-400 mb-4">
        {hcRows.length} HC longs · {rows.length} signals total
      </p>

      <FilterBar />

      <div className="mt-4">
        <SignalListBody hcRows={hcRows} nonHcRows={nonHcRows} />
      </div>

      <AlignmentCompass rows={allRows} />
    </main>
  );
}
