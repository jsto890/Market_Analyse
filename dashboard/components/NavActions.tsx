"use client";

export default function NavActions() {
  function openCommandK() {
    window.dispatchEvent(new CustomEvent("commandk:open"));
  }

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <button
        onClick={openCommandK}
        className="text-[13px] text-muted hover:text-white transition-colors font-mono"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
    </div>
  );
}
