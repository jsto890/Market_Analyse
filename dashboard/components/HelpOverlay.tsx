"use client";

import { useState, useEffect } from "react";

const KEYS: { key: string; desc: string }[] = [
  { key: "g  /  ⌘K", desc: "Open command palette" },
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
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (e.key === "?" && !editable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
        <div className="text-[13px] font-medium text-white mb-3">Keyboard shortcuts</div>
        <table className="w-full text-[12px] border-collapse">
          <tbody>
            {KEYS.map(({ key, desc }) => (
              <tr key={key} className="border-b border-line/40 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-muted whitespace-nowrap">{key}</td>
                <td className="py-1.5 text-white/80">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
