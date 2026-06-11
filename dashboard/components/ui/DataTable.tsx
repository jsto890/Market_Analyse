"use client";

import { useState, useEffect, useRef, useCallback, KeyboardEvent, Fragment } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  sortFn?: (a: T, b: T) => number;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  expandedRender?: (row: T) => React.ReactNode;
  persistKey?: string;
  onOpen?: (row: T) => void;
}

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  defaultSort,
  expandedRender,
  persistKey,
  onOpen,
}: DataTableProps<T>) {
  const storageKey = persistKey ? `dash:table:${persistKey}:sort` : null;

  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [hydrated, setHydrated] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        try {
          const parsed = JSON.parse(stored) as SortState;
          if (parsed.key && (parsed.dir === "asc" || parsed.dir === "desc")) {
            setSort(parsed);
          }
        } catch {
        }
      }
    }
    setHydrated(true);
  }, [storageKey]);

  const activeSort = hydrated ? sort : (defaultSort ?? null);

  const sortedRows = (() => {
    if (!activeSort) return rows;
    const col = columns.find((c) => c.key === activeSort.key && c.sortable);
    if (!col || !col.sortFn) return rows;
    const multiplier = activeSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => col.sortFn!(a, b) * multiplier);
  })();

  function handleHeaderClick(col: Column<T>) {
    if (!col.sortable) return;
    setSort((prev) => {
      const next: SortState =
        prev && prev.key === col.key
          ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
          : { key: col.key, dir: "asc" };
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
  }

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const handleContainerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (isEditable(e.target)) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const max = sortedRows.length - 1;
          if (e.key === "j") return Math.min(prev + 1, max);
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (focusedIndex < 0) return;
      const row = sortedRows[focusedIndex];
      if (!row) return;
      const key = rowKey(row);

      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (expandedRender) toggleExpand(key);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        onOpen?.(row);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setExpandedKeys(new Set());
        setFocusedIndex(-1);
        return;
      }
    },
    [focusedIndex, sortedRows, rowKey, expandedRender, onOpen]
  );

  const alignClass = (align?: "left" | "right" | "center") => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      className="overflow-x-auto outline-none"
    >
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky z-30 bg-surface" style={{ top: "var(--nav-h)" }}>
          <tr>
            {columns.map((col, ci) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={[
                  "px-3 py-2 font-medium text-muted border-b border-line whitespace-nowrap",
                  alignClass(col.align),
                  ci === 0
                    ? "sticky left-0 z-10 bg-surface border-r border-line"
                    : "",
                  col.sortable ? "cursor-pointer select-none hover:text-foreground" : "",
                ].join(" ")}
                onClick={() => handleHeaderClick(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && activeSort?.key === col.key ? (
                    activeSort.dir === "asc" ? (
                      <ChevronUp size={12} className="text-accent shrink-0" />
                    ) : (
                      <ChevronDown size={12} className="text-accent shrink-0" />
                    )
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, ri) => {
            const key = rowKey(row);
            const isExpanded = expandedKeys.has(key);
            const isFocused = focusedIndex === ri;
            const isEven = ri % 2 === 0;

            return (
              <Fragment key={key}>
                <tr
                  onClick={() => {
                    setFocusedIndex(ri);
                    if (expandedRender) toggleExpand(key);
                  }}
                  className={[
                    "cursor-pointer transition-colors hover:bg-elevated",
                    isEven ? "bg-surface" : "bg-bg",
                    isFocused ? "bg-elevated ring-1 ring-inset ring-accent" : "",
                  ].join(" ")}
                >
                  {columns.map((col, ci) => (
                    <td
                      key={col.key}
                      className={[
                        "px-3 py-2 border-b border-line",
                        alignClass(col.align),
                        col.align === "right" ? "tabular-nums" : "",
                        ci === 0
                          ? "sticky left-0 bg-inherit border-r border-line"
                          : "",
                      ].join(" ")}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {expandedRender && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 overflow-hidden border-b border-line bg-elevated"
                      style={{
                        maxHeight: isExpanded ? "600px" : "0px",
                        padding: isExpanded ? undefined : "0",
                        transition: "max-height 150ms ease-out",
                        display: isExpanded ? "table-cell" : "none",
                      }}
                    >
                      {isExpanded ? expandedRender(row) : null}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
