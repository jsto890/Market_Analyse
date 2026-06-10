"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function GKeySpotlight() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;

      if (e.key === "g" && !isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
        setQuery("");
      }

      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      // Small delay to let the DOM render before focusing
      const id = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const ticker = query.toUpperCase().trim();
      if (ticker) {
        router.push(`/action/${ticker}`);
      }
      setOpen(false);
      setQuery("");
    }
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => { setOpen(false); setQuery(""); }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter ticker..."
          className="bg-gray-900 border border-[#1f6feb] rounded px-3 py-2 text-sm font-mono text-white w-64 outline-none"
        />
      </div>
    </div>
  );
}
