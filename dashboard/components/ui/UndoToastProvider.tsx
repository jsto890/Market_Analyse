// dashboard/components/ui/UndoToastProvider.tsx
"use client";
import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

export interface UndoActionArgs {
  /** Toast message, e.g. "Removed AAPL from watchlist". */
  label: string;
  /** Fires immediately (the action is optimistic — already applied to local state before this is called). */
  commit: () => Promise<unknown>;
  /** Fires if `commit` rejects/fails — caller reconciles local state (e.g. re-fetch). */
  onError: () => void;
  /** Fires if user clicks Undo within the window — caller reverts local state; `commit`'s server effect is also reversed by re-issuing an inverse call inside this function. */
  undo: () => void;
  /** Milliseconds before the toast auto-dismisses and the action becomes permanent. Default: 6000. */
  windowMs?: number;
}

interface UndoContextValue {
  run: (args: UndoActionArgs) => void;
  /** A notice with nothing to reverse — same transient surface, no Undo button.
   *  For one-time events that would otherwise become permanent page furniture. */
  notify: (label: string, windowMs?: number) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

export function useUndoAction(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndoAction must be used within UndoToastProvider");
  return ctx;
}

interface ToastState {
  id: number;
  label: string;
  undo?: () => void;
}

export default function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const run = useCallback((args: UndoActionArgs) => {
    const id = ++nextId.current;
    args.commit().catch(args.onError);
    setToast({ id, label: args.label, undo: args.undo });
    const windowMs = args.windowMs ?? 6000;
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), windowMs);
  }, []);

  const notify = useCallback((label: string, windowMs = 6000) => {
    const id = ++nextId.current;
    setToast({ id, label });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), windowMs);
  }, []);

  return (
    <UndoContext.Provider value={{ run, notify }}>
      {children}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-body text-foreground shadow-lg">
          <span>{toast.label}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              className="font-medium text-accent hover:underline"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </UndoContext.Provider>
  );
}
