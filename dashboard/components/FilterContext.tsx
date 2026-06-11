"use client";

import { useSyncExternalStore } from "react";
import type { Alignment } from "@/types/bridge";

interface FilterState {
  alignment: Alignment | "ALL";
  hcOnly: boolean;
  search: string;
  tableMode: boolean;
  compassOpen: boolean;
}

type Listener = () => void;

let state: FilterState = {
  alignment: "ALL",
  hcOnly: false,
  search: "",
  tableMode: false,
  compassOpen: false,
};
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FilterState {
  return state;
}

function getServerSnapshot(): FilterState {
  return state;
}

function setState(patch: Partial<FilterState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useFilterContext() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...snap,
    setAlignment: (alignment: Alignment | "ALL") => setState({ alignment }),
    setHcOnly: (hcOnly: boolean) => setState({ hcOnly }),
    setSearch: (search: string) => setState({ search }),
    setTableMode: (tableMode: boolean) => setState({ tableMode }),
    setCompassOpen: (compassOpen: boolean) => setState({ compassOpen }),
  };
}
