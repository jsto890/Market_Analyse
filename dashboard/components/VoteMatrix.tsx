"use client";

import { AgentVote, AgentFamily, FAMILY_ORDER, FAMILY_LABEL } from "@/types/argus";

const VOTE_COLOR: Record<AgentVote["verdict"], string> = {
  LONG: "#22c55e",
  SHORT: "#ef4444",
  WAIT: "#374151",
};

export default function VoteMatrix({ votes }: { votes: AgentVote[] }) {
  const byFamily = (family: AgentFamily) =>
    votes.filter((v) => v.family === family);

  return (
    <div className="flex gap-3">
      {FAMILY_ORDER.map((family) => {
        const familyVotes = byFamily(family);
        return (
          <div key={family} className="flex flex-col items-center">
            <div className="text-[10px] font-mono text-gray-500 text-center mb-1">
              {FAMILY_LABEL[family]}
            </div>
            <div className="flex flex-col gap-1">
              {familyVotes.map((v) => (
                <div
                  key={v.agent}
                  className="w-5 h-5 rounded-sm"
                  style={{ backgroundColor: VOTE_COLOR[v.verdict] }}
                  title={`${v.agent}: ${v.note} (${Math.round(v.confidence * 100)}%)`}
                />
              ))}
              {familyVotes.length === 0 && (
                <div className="w-5 h-5 rounded-sm bg-gray-800" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
