"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

interface ServiceRow {
  label: string;
  ok: boolean | null;
}

async function probeServices(): Promise<ServiceRow[]> {
  const results = await Promise.allSettled([
    fetch("/api/argus/health", { cache: "no-store" }).then((r) => r.ok),
    fetch("/api/argus/portfolio", { cache: "no-store" }).then((r) => r.ok),
  ]);

  return [
    { label: "Argus API", ok: results[0].status === "fulfilled" ? results[0].value : false },
    { label: "IBKR", ok: results[1].status === "fulfilled" ? results[1].value : false },
  ];
}

export default function StatusDot() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && rows.length === 0) {
      setLoading(true);
      probeServices()
        .then(setRows)
        .finally(() => setLoading(false));
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          className="w-4 h-4 rounded-full bg-muted/40 flex items-center justify-center focus-visible:outline-accent cursor-pointer"
          aria-label="System status"
        >
          <span className="text-muted text-[11px] leading-none">●</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          className="w-44 rounded bg-elevated border border-line p-2 text-[12px] shadow-lg z-50"
        >
          {loading && <span className="text-muted">Checking…</span>}
          {!loading &&
            rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-0.5">
                <span className="text-muted">{row.label}</span>
                <span className={row.ok ? "text-pos" : "text-neg"}>{row.ok ? "online" : "offline"}</span>
              </div>
            ))}
          <Popover.Arrow className="fill-elevated" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
