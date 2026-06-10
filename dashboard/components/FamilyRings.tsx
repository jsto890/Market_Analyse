"use client";

import { AgentVote, AgentFamily, FAMILY_ORDER, FAMILY_LABEL } from "@/types/argus";

const r = 16;
const sw = 4;
const circ = 2 * Math.PI * r;

export default function FamilyRings({
  votes,
  verdict,
}: {
  votes: AgentVote[];
  verdict: "LONG" | "SHORT" | "WAIT";
}) {
  const ringData = FAMILY_ORDER.map((family: AgentFamily) => {
    const familyVotes = votes.filter((v) => v.family === family);
    const total = familyVotes.length;
    const agree = familyVotes.filter((v) => v.verdict === verdict).length;
    const fraction = total > 0 ? agree / total : 0;
    return { family, fraction };
  });

  return (
    <div className="flex gap-4 flex-wrap">
      {ringData.map(({ family, fraction }) => (
        <div key={family} className="flex flex-col items-center gap-1">
          <svg width={40} height={40}>
            <circle
              cx={20}
              cy={20}
              r={r}
              fill="none"
              stroke="#30363d"
              strokeWidth={sw}
            />
            <circle
              cx={20}
              cy={20}
              r={r}
              fill="none"
              stroke={fraction >= 0.5 ? "#22c55e" : "#ef4444"}
              strokeWidth={sw}
              strokeDasharray={`${fraction * circ} ${circ}`}
              strokeDashoffset={circ / 4}
              transform="rotate(-90 20 20)"
            />
          </svg>
          <span className="text-[10px] font-mono text-gray-500">
            {FAMILY_LABEL[family]}
          </span>
        </div>
      ))}
    </div>
  );
}
