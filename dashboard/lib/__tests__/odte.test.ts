import { describe, it, expect } from "vitest";
import { odteBadge } from "@/lib/odte";

describe("odteBadge", () => {
  it("Live when ok and ibkr connected", () => {
    expect(odteBadge({ ok: true, ibkr_connected: true })).toEqual({ label: "Live", tone: "live" });
  });
  it("IBKR disconnected when ok but ibkr down", () => {
    expect(odteBadge({ ok: true, ibkr_connected: false })).toEqual({ label: "IBKR disconnected", tone: "warn" });
  });
  it("Service down when ok is false", () => {
    expect(odteBadge({ ok: false, ibkr_connected: false })).toEqual({ label: "Service down", tone: "down" });
  });
  it("Service down when health is null (proxy failed)", () => {
    expect(odteBadge(null)).toEqual({ label: "Service down", tone: "down" });
  });
  it("Service down when health is undefined (first render)", () => {
    expect(odteBadge(undefined)).toEqual({ label: "Service down", tone: "down" });
  });
});
