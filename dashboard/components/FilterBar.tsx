"use client";

import type { Alignment } from "@/types/bridge";
import { useFilterContext } from "@/components/FilterContext";

const ALIGNMENT_OPTIONS: Array<Alignment | "ALL"> = ["ALL", "ALIGNED", "CONTRARIAN", "DIVERGING", "TECH_WAIT", "NEUTRAL"];

const ALIGNMENT_LABEL: Record<Alignment | "ALL", string> = {
  ALL: "All",
  ALIGNED: "Aligned",
  CONTRARIAN: "Contrarian",
  DIVERGING: "Diverging",
  TECH_WAIT: "Wait",
  NEUTRAL: "Neutral",
};

export default function FilterBar() {
  const {
    alignment, hcOnly, search, tableMode, compassOpen,
    setAlignment, setHcOnly, setSearch, setTableMode, setCompassOpen,
  } = useFilterContext();

  return (
    <div className="bg-[#161b22] border-b border-[#30363d] sticky top-[44px] z-30">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        {/* Alignment buttons */}
        <div className="flex items-center gap-1">
          {ALIGNMENT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setAlignment(opt)}
              className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                alignment === opt
                  ? "bg-[#1f6feb] text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {ALIGNMENT_LABEL[opt]}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-[#30363d]" />

        {/* HC toggle */}
        <button
          onClick={() => setHcOnly(!hcOnly)}
          className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
            hcOnly
              ? "bg-amber-500/20 text-amber-400"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          ⚡ HC Only
        </button>

        {/* Divider */}
        <div className="h-4 w-px bg-[#30363d]" />

        {/* Search */}
        <input
          type="text"
          placeholder="Search ticker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-900 border border-[#30363d] rounded px-2.5 py-1 text-xs text-white placeholder-gray-600 font-mono focus:outline-none focus:border-[#1f6feb] w-36"
        />

        {/* Divider */}
        <div className="h-4 w-px bg-[#30363d]" />

        {/* Table/Cards toggle */}
        <button
          onClick={() => setTableMode(!tableMode)}
          className="text-xs font-semibold px-2.5 py-1 rounded transition-colors text-gray-400 hover:text-white hover:bg-gray-800"
          title={tableMode ? "Switch to card view" : "Switch to table view"}
        >
          {tableMode ? "⊟ Cards" : "⊞ Table"}
        </button>

        {/* Compass toggle */}
        <button
          onClick={() => setCompassOpen(!compassOpen)}
          className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
            compassOpen
              ? "bg-[#1f6feb]/20 text-[#58a6ff]"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
          title="Alignment Compass scatter plot"
        >
          ⊕ Compass
        </button>
      </div>
    </div>
  );
}
