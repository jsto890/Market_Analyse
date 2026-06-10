"use client";

import useSWR from "swr";
import type { AgentInfo, AgentFamily } from "@/types/argus";
import { FAMILY_ORDER, FAMILY_LABEL } from "@/types/argus";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type ApiResponse = AgentInfo[] | { error: string };

function isErrorResponse(r: ApiResponse | undefined): r is { error: string } {
  return r != null && !Array.isArray(r) && "error" in r;
}

const FAMILY_FULL_NAME: Record<AgentFamily, string> = {
  trend: "Trend",
  momentum: "Momentum",
  volume: "Volume",
  volatility: "Volatility",
  structure: "Structure",
  institutional: "Institutional",
  prefilter: "Pre-filter",
};

export default function AgentsPage() {
  const { data, isLoading } = useSWR<ApiResponse>(
    "/api/argus/agents",
    fetcher
  );

  const agents = Array.isArray(data) ? data : [];
  const total = agents.length;

  const byFamily = new Map<AgentFamily, AgentInfo[]>();
  for (const family of FAMILY_ORDER) {
    byFamily.set(family, []);
  }
  for (const agent of agents) {
    const bucket = byFamily.get(agent.family);
    if (bucket) bucket.push(agent);
  }

  const error = isErrorResponse(data) ? data.error : null;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-base font-semibold text-white mb-1">Agents</h1>

        {isLoading && (
          <p className="text-xs font-mono text-gray-500">Loading…</p>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded px-3 py-2 text-sm text-red-400 mt-2">
            {error}
          </div>
        )}

        {!isLoading && !error && (
          <>
            <p className="text-xs font-mono text-gray-500 mb-4">
              {total} agent{total !== 1 ? "s" : ""} total
            </p>

            {FAMILY_ORDER.map((family) => {
              const members = byFamily.get(family) ?? [];
              if (members.length === 0) return null;

              return (
                <div key={family}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">
                    {FAMILY_LABEL[family]} — {FAMILY_FULL_NAME[family]}{" "}
                    <span className="text-gray-600 normal-case font-normal tracking-normal">
                      ({members.length})
                    </span>
                  </p>
                  <ul className="space-y-0.5 pl-1">
                    {members.map((agent) => (
                      <li
                        key={agent.name}
                        className="text-sm text-gray-300 font-mono flex items-center gap-1.5"
                      >
                        <span className="text-gray-700 select-none">•</span>
                        {agent.name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
