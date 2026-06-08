"use client";

import { AgentVote } from "@/types/argus";

export default function AgreeDissentList({
  agreed,
  dissented,
  votes,
}: {
  agreed: string[];
  dissented: string[];
  votes: AgentVote[];
}) {
  const noteFor = (name: string) =>
    votes.find((v) => v.agent === name)?.note ?? "";

  return (
    <div className="flex flex-col gap-2">
      <details open>
        <summary className="cursor-pointer text-xs font-mono text-gray-400 select-none">
          Agreed ({agreed.length})
        </summary>
        <div className="mt-1 flex flex-col gap-0.5 pl-2">
          {agreed.map((name) => (
            <span key={name} className="text-xs font-mono text-green-400">
              {name} — {noteFor(name)}
            </span>
          ))}
        </div>
      </details>
      <details open>
        <summary className="cursor-pointer text-xs font-mono text-gray-400 select-none">
          Dissented ({dissented.length})
        </summary>
        <div className="mt-1 flex flex-col gap-0.5 pl-2">
          {dissented.map((name) => (
            <span key={name} className="text-xs font-mono text-red-400">
              {name} — {noteFor(name)}
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}
