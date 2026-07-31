"use client";

export default function NavActions() {
  function openCommandK() {
    window.dispatchEvent(new CustomEvent("commandk:open"));
  }

  function openHelp() {
    window.dispatchEvent(new CustomEvent("helpoverlay:open"));
  }

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <button
        onClick={openCommandK}
        className="text-body text-muted hover:text-foreground transition-colors font-mono"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      <button
        onClick={openHelp}
        className="text-body text-muted hover:text-foreground transition-colors font-mono"
        aria-label="Show keyboard shortcuts"
      >
        ?
      </button>
    </div>
  );
}
