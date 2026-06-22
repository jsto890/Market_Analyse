"""Trade-overlay state machine (design spec §6). Pure: step_overlay(prev, ctx) →
(next_state, exit_reason, events). FLAT→ARMED→LONG→EXIT→COOLDOWN, long-only.
EXIT is a transient one-bar event that settles to COOLDOWN. ARMED fills at the
NEXT bar's open (no same-bar FLAT→LONG = no lookahead). bar_index is an integer
bar counter used for min-hold / cooldown windows."""
from dataclasses import dataclass, field

from .params import EngineParams, DEFAULT

MIN_HOLD_BARS = 3
COOLDOWN_BARS = 5


@dataclass(frozen=True)
class OverlayState:
    overlay: str = "FLAT"          # FLAT | ARMED | LONG | EXIT | COOLDOWN
    entry_index: int | None = None
    cooldown_until: int | None = None


@dataclass
class OverlayCtx:
    bias: str
    armed_eligible: bool
    entry_signal: bool
    bar_open: float
    bar_high: float
    bar_low: float
    bar_close: float
    levels: dict
    bar_index: int
    cooldown_until: int | None = None


def step_overlay(prev: OverlayState, ctx: OverlayCtx, params: EngineParams = DEFAULT):
    events: list[dict] = []

    # invariant: any non-flat overlay under a non-LONG bias force-exits
    if ctx.bias != "LONG" and prev.overlay in ("ARMED", "LONG"):
        return OverlayState("EXIT", prev.entry_index), "bias_flip", events
    if ctx.bias != "LONG" and prev.overlay == "ARMED":
        return OverlayState("FLAT"), None, events

    if prev.overlay == "FLAT":
        if ctx.armed_eligible and ctx.entry_signal and ctx.levels.get("armed", True):
            return OverlayState("ARMED"), None, events
        return OverlayState("FLAT"), None, events

    if prev.overlay == "ARMED":
        # fill at THIS bar's open (T+1 of the signal bar)
        events.append({"kind": "entry", "fill_px": ctx.bar_open, "ts_index": ctx.bar_index})
        return OverlayState("LONG", entry_index=ctx.bar_index), None, events

    if prev.overlay == "LONG":
        stop, target = ctx.levels["stop"], ctx.levels["target"]
        held = ctx.bar_index - (prev.entry_index or ctx.bar_index)
        # stop always allowed (even inside min-hold); target/time gated by min-hold
        if ctx.bar_low <= stop:
            return OverlayState("EXIT", prev.entry_index), "stop", events
        if held >= MIN_HOLD_BARS and ctx.bar_high >= target:
            return OverlayState("EXIT", prev.entry_index), "target", events
        return OverlayState("LONG", entry_index=prev.entry_index), None, events

    if prev.overlay == "EXIT":
        return OverlayState("COOLDOWN", cooldown_until=ctx.bar_index + params.cooldown_bars), None, events

    if prev.overlay == "COOLDOWN":
        if prev.cooldown_until is not None and ctx.bar_index >= prev.cooldown_until and ctx.bias == "LONG":
            return OverlayState("FLAT"), None, events
        return OverlayState("COOLDOWN", cooldown_until=prev.cooldown_until), None, events

    return OverlayState("FLAT"), None, events
