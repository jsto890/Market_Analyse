"use client";

import { useState, useEffect } from "react";
import { isEditableTarget } from "@/components/CommandK";

const KEYS: { key: string; desc: string }[] = [
  { key: "⌘K", desc: "Open command palette" },
  { key: "j  /  k", desc: "Move row down / up" },
  { key: "Enter", desc: "Navigate to ticker" },
  { key: "Space", desc: "Expand / collapse row" },
  { key: "Esc", desc: "Close overlay / palette" },
  { key: "?", desc: "Show this help" },
];

export default function HelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "?" && !isEditableTarget() && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    function onOpen() {
      setOpen((v) => !v);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("helpoverlay:open", onOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("helpoverlay:open", onOpen);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-elevated border border-line rounded-lg p-5 w-72 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-title text-foreground mb-3">Keyboard shortcuts</div>
        <table className="w-full text-body border-collapse">
          <tbody>
            {KEYS.map(({ key, desc }) => (
              <tr key={key} className="border-b border-line/40 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-muted whitespace-nowrap">{key}</td>
                <td className="py-1.5 text-foreground/80">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-title text-foreground mt-4 mb-2">FX session legend</div>
        <table className="w-full text-body border-collapse">
          <tbody>
            {[
              { key: "ASIA", desc: "00:00 – 09:00 UTC" },
              { key: "LDN", desc: "07:00 – 16:00 UTC" },
              { key: "NY", desc: "12:00 – 21:00 UTC" },
              { key: "OPEN", desc: "Weekday, between sessions" },
              { key: "CLOSED", desc: "Fri 21:00 UTC – Sun 21:00 UTC" },
            ].map(({ key, desc }) => (
              <tr key={key} className="border-b border-line/40 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-muted whitespace-nowrap">{key}</td>
                <td className="py-1.5 text-foreground/80">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
