# UI Audit — Foundations Contract

> **Status:** FROZEN. This is an interface contract, not an implementation plan. Every signature, token, and gloss below is a final decision, not a suggestion. Five downstream plans build tasks against this document; none of them may change a signature defined here — if a downstream plan needs something different, it must say so explicitly and get this file amended, not silently diverge.
>
> Scope: tokens (`globals.css`), new shared primitives (`components/ui/`), `lib/format.ts`, `lib/labels.ts`, the localStorage key registry, and migration notes. No source file outside this one markdown file was modified to produce it.

---

## A. Tokens — `dashboard/app/globals.css`

### A.1 New custom properties

Add to the existing `:root` block (after `--teal`):

```css
--muted-2: #737b8c;   /* real de-emphasis color — replaces `opacity-*` on text */
```

**Why a new token, not a Tailwind opacity utility:** A11Y-02 flags `opacity-60`/`text-muted/70` etc. on *text* as a contrast bug — opacity scales toward the surface behind it, so contrast is theme- and stacking-dependent and untestable. `--muted-2` is a fixed, pre-computed color, verified ≥4.5:1 (WCAG AA, normal text) against both surfaces the app actually renders text on:

| Pair | Contrast |
|---|---|
| `#737b8c` on `--bg` (`#06090f`) | 4.69:1 |
| `#737b8c` on `--surface` (`#0c1017`) | 4.48:1 |

(sRGB relative luminance, `L = 0.2126·R + 0.7152·G + 0.0722·B` on linearized channels, `contrast = (L1+0.05)/(L2+0.05)`.)

`--muted` (`#7d8698`, ~5.1:1) remains the primary secondary-text color and is unchanged. `--muted-2` is strictly for the *de-emphasized-below-muted* tier (currently faked with `opacity-60`/`/70` on `--muted` or `--foreground`) — e.g. RotationPanel's `THIN_TOOLTIP`-flagged rows (`text-muted` + implicit further dimming), timestamps, disabled-but-visible affordances. **Rule: no `opacity-*` utility may ever be applied to an element containing text.** Opacity remains allowed on non-text decorative elements (dots, dividers) where a fixed contrast ratio doesn't apply — e.g. `ConvictionDot.tsx`'s unfilled-dot `opacity: 0.3` stays as-is (shape encoding, not text).

### A.2 Type-scale floor

No new size token is added — Tailwind's default scale already has the right rung (`text-xs` = 12px = the prose floor). The fix is a **hard rule**, enforced by grep in CI (downstream plans own wiring the lint, not this contract):

- **Data (tabular/mono figures, badges, chips):** floor is `text-[11px]` (0.6875rem). This is already the dominant size in `DataTable.tsx`, `Badge.tsx`, `StatChip.tsx` — it stays.
- **Prose (labels, tooltips, body copy, headers):** floor is `text-xs` (12px, Tailwind default). Never drop to `text-[11px]` or below for non-tabular text.
- **Banned outright:** `text-[10px]`, `text-[9px]`, or any arbitrary value below 11px, anywhere, for any purpose. Existing violators (migration list, not exhaustive — full sweep is a downstream task): `components/today/SignalGroups.tsx:129` (`ChipTooltip` earnings badge), `:125` (`RowFlags` "ext" badge) — both currently `text-[10px]`, must move to `text-[11px]`.

No CSS variable is needed for this because Tailwind's arbitrary-value escape hatch is the thing being restricted, not extended — the "token" is the *rule*, not a new class.

### A.3 Semantic state tone classes (OL-09)

`app/odte/strikes/page.tsx` currently hardcodes raw Tailwind palette classes (`text-emerald-400`, `text-amber-400`, `bg-zinc-800`, etc., at lines 142, 157, 172, 199-203, 292-293) for the LIVE/FROZEN/EOD source badge and other state indicators, bypassing every existing token. No new CSS custom properties are needed — `--teal`, `--amber`, `--muted` already exist and are the correct hues. Add three composed utility classes to the existing `@layer components` block in `globals.css`, next to `.eyebrow`/`.tick`/`.card`:

```css
@layer components {
  .tone-live {
    @apply border border-teal/40 bg-teal/10 text-teal;
  }
  .tone-frozen {
    @apply border border-warn/40 bg-warn/10 text-warn;
  }
  .tone-eod {
    @apply border border-line bg-elevated text-muted;
  }
}
```

Mapping (fixed, not configurable per-callsite): `LadderSnapshot.source === "LIVE"` → `.tone-live`; `"FROZEN"` → `.tone-frozen`; `"EOD"` → `.tone-eod`. Chart positive/negative series (candles, GEX curve, return cells) continue to use the existing `text-pos`/`text-neg`/`bg-pos`/`bg-neg` Tailwind aliases (already correctly wired to `--green`/`--red` in `tailwind.config.ts`) — no change needed there; `GexChart.tsx:55` (`"#10b981"`/`"#ef4444"` literals) and `components/charts/CandleChart.tsx`'s `LEVEL_STYLE`/`EMA_STYLE` hex literals must migrate to `var(--green)`/`var(--red)` (or the `pos`/`neg` Tailwind classes where the consumer is JSX, not an SVG/Recharts `stroke`/`fill` prop) — listed in §F.

### A.4 Zebra striping (PF-04) — arbitration, no new token

The audit asks for "a surface/border token for PF-04's zebra striping." **Decision: no new token.** `components/ui/DataTable.tsx:232` already has the canonical, correct pattern — `isEven ? "bg-surface" : "bg-bg"` — using two tokens that already exist. `app/portfolio/page.tsx:169`'s `bg-white/[0.02]` is a bespoke, non-token, low-contrast fake of the same idea on a hand-rolled `<table>`. The real fix is **migration, not a new token**: Portfolio's table must be rebuilt on `DataTable` (out of scope for this contract to implement, but it is the stated arbitration — no zebra token will exist because `DataTable` already owns this pattern and every table should route through it).

### A.5 Focus treatment (Input/Select conflict groundwork)

No new token. `globals.css`'s existing `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }` (already present, unmodified) is confirmed as *the* focus indicator for every interactive primitive in this contract. See §B.2/§B.3 for the arbitration this resolves.

---

## B. New shared primitives — `dashboard/components/ui/`

All examples use the codebase's existing conditional-class idiom — a plain array joined with `.join(" ")` (confirmed idiom: `DataTable.tsx`, `CandleChart.tsx`; no `clsx`/`cva`/`cn()` exists anywhere in this repo and none is introduced here). All primitives are function components with a named props interface (`XProps`), default export, `"use client"` only where the primitive uses state/effects/refs.

### B.1 `components/ui/Button.tsx`

**Arbitration — height:** the audit found `h-8`, `h-9`, and `py-1.5` (≈36px with 13px text) coexisting as "primary action" heights (screener's Run button is `h-9`, Today's filters are `h-8`). **Decision: `h-8` (32px) app-wide, no exceptions.** `h-8` is already the majority pattern (every filter/select/small-button in `SignalGroups.tsx`, `RotationPanel.tsx`) and matches the row height used throughout `DataTable.tsx`; `h-9` on Screener's Run/Full-universe buttons is the outlier and migrates down.

**Arbitration — solid vs. ghost (SC-09):** the audit found `bg-accent text-white` solid buttons (Screener's Run button) alongside the "active chip" bordered-ghost look (`border-accent bg-accent-dim text-accent`, used everywhere else — filter chips, active tabs). **Decision: bordered-ghost is the ONE visual language for every button in this app; no solid-fill variant exists.** Rationale: the app has exactly one accent hue used for both "selected state" and "primary action," and using a filled block for actions while using a border+tint for selection created two different visual grammars for the same color. Collapsing to one (border+tint, at two intensities via `variant`) removes the inconsistency instead of picking a side.

```tsx
// dashboard/components/ui/Button.tsx
import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual treatment. Default: "secondary". */
  variant?: ButtonVariant;
  /** Height/padding. Default: "md" (h-8/32px). "sm" is h-7/28px for dense inline contexts (table row actions). */
  size?: ButtonSize;
  /** Shows a spinner in place of the leading icon slot and disables the button. Default: false. */
  loading?: boolean;
  /** Optional leading icon (e.g. lucide-react component), hidden while loading. */
  icon?: React.ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent-dim text-accent hover:bg-accent/20",
  secondary: "border-line bg-raised text-foreground hover:border-line-strong",
  danger: "border-neg/50 bg-neg/10 text-neg hover:bg-neg/20",
  ghost: "border-transparent bg-transparent text-muted hover:text-foreground hover:bg-elevated",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3.5 text-[13px]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, disabled, className, children, ...rest },
  ref
) {
  const cls = [
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
    className ?? "",
  ].join(" ");

  return (
    <button ref={ref} type="button" disabled={disabled || loading} className={cls} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default Button;
```

DOM/ARIA: renders a native `<button type="button">`; `disabled` maps to the native `disabled` attribute (also set while `loading`); focus indicator is the global `*:focus-visible` outline — **no `focus:outline-none` is ever applied inside this component**, and no consumer may add one when using it.

Usage:
```tsx
<Button variant="primary" onClick={handleRun} loading={loading} icon={<ArrowRight size={14} />}>
  Run
</Button>
<Button variant="secondary" onClick={() => runScreener(null)}>Full universe</Button>
<Button variant="danger" size="sm" onClick={() => deleteRule(rule.id)}>Delete</Button>
```

### B.2 `components/ui/Input.tsx`

**Arbitration — focus treatment:** the audit frames this as `focus:border-accent` vs. `focus:ring-1` needing a pick. **Decision: neither wins — both are wrong to add.** The global `*:focus-visible` outline (globals.css, credited as correct in audit §18) already provides the indicator; the actual bug is individual inputs setting `focus:outline-none` (screener `app/screener/page.tsx:277,289`, Today's `FilterSelect` in `SignalGroups.tsx:231`) which *suppresses* the correct global behavior. `Input` therefore adds **zero** focus styling of its own and never sets `outline-none`. `focus:border-accent` is kept only as a supplementary, non-load-bearing color shift (border tint on focus, layered under the outline, not replacing it) since it reads as intentional polish, not a competing indicator.

```tsx
// dashboard/components/ui/Input.tsx
import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders a leading icon slot (e.g. <Search size={14} />). Default: none. */
  icon?: React.ReactNode;
  /** Marks the field invalid — red border + aria-invalid. Default: false. */
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, invalid = false, className, ...rest },
  ref
) {
  const inputCls = [
    "h-8 w-full rounded border bg-raised text-[13px] text-foreground placeholder-muted",
    "transition-colors focus:border-accent",
    invalid ? "border-neg" : "border-line",
    icon ? "pl-8 pr-3" : "px-3",
    className ?? "",
  ].join(" ");

  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
      )}
      <input ref={ref} aria-invalid={invalid || undefined} className={inputCls} {...rest} />
    </div>
  );
});

export default Input;
```

Usage:
```tsx
<Input
  icon={<Search size={14} />}
  placeholder="Filter tickers — AAPL, TSLA, NVDA…"
  value={tickerInput}
  onChange={(e) => setTickerInput(e.target.value)}
  onKeyDown={handleKeyDown}
/>
```

### B.3 `components/ui/Select.tsx`

Same focus-treatment ruling as Input (§B.2). **Arbitration — height/radius:** `SignalGroups.tsx`'s `FilterSelect` uses `h-8`/`rounded`; nothing in the codebase conflicts on Select specifically (the audit's complaint is that no shared Select exists at all, so every consumer reinvented it) — `h-8`/`rounded` is adopted as canonical since it already matches Button/Input.

```tsx
// dashboard/components/ui/Select.tsx
import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, className, ...rest },
  ref
) {
  const cls = [
    "h-8 w-full cursor-pointer appearance-none rounded border border-line bg-raised",
    "pl-2.5 pr-7 text-[13px] text-foreground focus:border-accent",
    className ?? "",
  ].join(" ");

  return (
    <div className="relative">
      <select ref={ref} className={cls} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
});

export default Select;
```

Usage:
```tsx
<Select
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
  options={[
    { value: "all", label: "All groups" },
    { value: "prime", label: "Prime long" },
  ]}
/>
```

### B.4 `components/ui/Collapsible.tsx`

**Arbitration:** replaces four independent implementations — `Panel.tsx` (`max-height:9999px`), `DiffStrip.tsx:80-81` (`max-height:9999px`/`0px`, duplicating Panel's storage-key convention but not its component), `VerdictCard.tsx` (`open`/`canExpand` state, no persistence, no `overflow-hidden` transition at all), and `WhyPanel.tsx`'s votes accordion (lines 152-153, 417-423, 434 — `votesOpen`/`votesId`, correctly wired ARIA but hand-rolled). **Decision: one primitive, CSS grid-rows animation (`grid-template-rows: 0fr → 1fr`) instead of magic-number `max-height`** — this removes the clip risk UI-04 calls out (content taller than a hardcoded `600px`/`9999px` ceiling) and animates height without knowing content height ahead of time.

```tsx
// dashboard/components/ui/Collapsible.tsx
"use client";
import { useEffect, useId, useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleDisabled =
  | { disabled?: false; disabledReason?: never }
  | { disabled: true; disabledReason: string };

export type CollapsibleProps = {
  /** Trigger content (rendered inside the toggle button, left of the chevron). */
  trigger: ReactNode;
  children: ReactNode;
  /** Uncontrolled initial state when no persistKey (or no stored value yet). Default: false. */
  defaultOpen?: boolean;
  /** localStorage key suffix — persisted at `dash:collapsible:{persistKey}`. Omit for non-persisted (e.g. per-row) instances. */
  persistKey?: string;
  className?: string;
  triggerClassName?: string;
} & CollapsibleDisabled;

export default function Collapsible({
  trigger,
  children,
  defaultOpen = false,
  persistKey,
  disabled,
  disabledReason,
  className,
  triggerClassName,
}: CollapsibleProps) {
  const id = useId();
  const storageKey = persistKey ? `dash:collapsible:${persistKey}` : null;
  const [open, setOpen] = useState(defaultOpen);

  // Hydration-safe: render `defaultOpen` on the server and the first client
  // pass (matching), then reconcile from localStorage post-mount — same
  // pattern as the Panel.tsx implementation this replaces.
  useEffect(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) setOpen(stored === "true");
    }
  }, [storageKey]);

  function toggle() {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    if (storageKey) localStorage.setItem(storageKey, String(next));
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-expanded={open}
        aria-controls={id}
        className={[
          "flex w-full items-center gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed",
          triggerClassName ?? "",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1">{trigger}</span>
        {!disabled && (
          <ChevronDown
            size={14}
            className="ml-auto shrink-0 text-muted transition-transform duration-200"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        )}
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
```

DOM/ARIA: single `<button aria-expanded aria-controls>` + content `<div id>` pair — matches the pattern already correct in `Panel.tsx`/`WhyPanel.tsx`'s votes block, now shared. `disabled` (OD-08) is compile-time paired with a required `disabledReason` string via the discriminated union — `<Collapsible disabled>` with no reason is a **TypeScript error**, not a runtime footgun; the reason renders as a native `title` tooltip on the (still-focusable, `aria-disabled`-via-native-`disabled`) trigger button.

Usage:
```tsx
<Collapsible
  persistKey="rotation"
  trigger={<span className="tick text-[13px] font-semibold">Sector rotation</span>}
  defaultOpen={false}
>
  <RotationTable rows={rows} />
</Collapsible>

// VerdictCard.tsx's currently-unpersisted, conditionally-disabled case:
<Collapsible
  trigger={<VerdictSummary verdict={verdict} />}
  disabled={!canExpand}
  disabledReason="No detail available until the verdict finishes loading"
>
  <VerdictDetail detail={detail} />
</Collapsible>
```

### B.5 `components/ui/PinToggle.tsx`

**Arbitration:** replaces `screener/page.tsx:38-65` (`PinCell`), `ticker/Header.tsx:66-` (`PinButton`), and `watchlist/WatchlistClient.tsx:327-341` (bare unpin text-button). All three do the same optimistic POST/DELETE against `/api/watchlist` with slightly different error handling (screener's `PinCell` re-fetches on error via `mutateWatchlist()` with no args; Header's `PinButton` and Watchlist's unpin link have their own copies). **Decision: one primitive owns the optimistic update, the error rollback (SC-08), and the undo affordance (A11Y-07)** — see §B.9 for the shared undo mechanism this composes with.

```tsx
// dashboard/components/ui/PinToggle.tsx
"use client";
import useSWR from "swr";
import { useUndoAction } from "./UndoToastProvider";

export interface PinToggleProps {
  symbol: string;
  /** "chip" (bordered pill, Screener/Watchlist table cells) or "text" (inline link, ticker header). Default: "chip". */
  variant?: "chip" | "text";
  className?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PinToggle({ symbol, variant = "chip", className }: PinToggleProps) {
  const { data, mutate } = useSWR<{ watchlist: { ticker: string }[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: false,
  });
  const pinned = data?.watchlist?.some((w) => w.ticker === symbol) ?? false;
  const { run } = useUndoAction();

  function toggle() {
    const wasPinned = pinned;
    mutate(
      (prev) => {
        if (!prev) return prev;
        const wl = wasPinned
          ? prev.watchlist.filter((w) => w.ticker !== symbol)
          : [...prev.watchlist, { ticker: symbol }];
        return { watchlist: wl };
      },
      false
    );
    run({
      label: wasPinned ? `Removed ${symbol} from watchlist` : `Added ${symbol} to watchlist`,
      commit: () =>
        fetch("/api/watchlist", {
          method: wasPinned ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: symbol }),
        }),
      onError: () => mutate(),
      undo: () =>
        mutate(
          (prev) => {
            if (!prev) return prev;
            const wl = wasPinned
              ? [...prev.watchlist, { ticker: symbol }]
              : prev.watchlist.filter((w) => w.ticker !== symbol);
            return { watchlist: wl };
          },
          false
        ),
    });
  }

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={["text-[12px] underline-offset-2 hover:underline", pinned ? "text-warn" : "text-muted", className ?? ""].join(" ")}
        aria-pressed={pinned}
      >
        {pinned ? "Unpin" : "Pin"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
      className={[
        "px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors",
        pinned ? "border-warn text-warn bg-warn/10" : "border-line text-muted hover:border-line-strong hover:text-foreground",
        className ?? "",
      ].join(" ")}
    >
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}
```

DOM/ARIA: native `<button aria-pressed>` (toggle-button semantics, not `role="switch"` — this is a binary action button reflecting state, matching existing `PinCell`/`PinButton` markup, not a settings switch). Error surface (SC-08): on a failed commit, `onError` re-fetches from the server to reconcile (same fallback already used by `PinCell`); the undo toast (§B.9) additionally lets the user explicitly reverse a *successful* toggle within its window.

Usage:
```tsx
<PinToggle symbol={r.symbol} variant="chip" />          {/* screener/watchlist table cell */}
<PinToggle symbol={ticker} variant="text" />              {/* ticker page header */}
```

### B.6 `components/ui/CenterBar.tsx`

**Arbitration:** replaces `MicroBar.tsx` (56×8, table-cell use), `ScoreBar.tsx` (100×8 + optional value label), and `WhyPanel.tsx`'s inline `NetBar` (80×8, lines ~52-95) — three near-identical center-anchored diverging bars with different fixed widths and duplicated pos/neg logic. **Decision: one component, `width` becomes a prop instead of three copy-pasted magic numbers**; default `width=56` matches `MicroBar`'s (the highest-frequency call site, one per row × 3 in `SignalGroups.tsx`'s `LegBars`).

```tsx
// dashboard/components/ui/CenterBar.tsx
export interface CenterBarProps {
  /** Value in [-1, 1]; clamped. */
  value: number;
  /** Pixel width. Default: 56 (table-cell size; use 100 for WhyPanel's NetBar, 80 for the old NetBar exactly). */
  width?: number;
  /** Pixel height. Default: 8. */
  height?: number;
  /** Show the numeric value to the right, e.g. "+0.42". Default: false. */
  showValue?: boolean;
}

export default function CenterBar({ value, width = 56, height = 8, showValue = false }: CenterBarProps) {
  if (!Number.isFinite(value)) {
    return <span className="font-mono text-[13px] tabular-nums text-muted">—</span>;
  }
  const clamped = Math.max(-1, Math.min(1, value));
  const isPos = clamped >= 0;
  const pct = Math.abs(clamped) * 50;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="relative inline-block rounded-sm bg-elevated overflow-hidden"
        style={{ width, height }}
      >
        <span
          className="absolute top-0 h-full"
          style={{ left: isPos ? "50%" : `${50 - pct}%`, width: `${pct}%`, background: isPos ? "var(--green)" : "var(--red)" }}
        />
        <span className="absolute top-0 h-full w-px bg-muted/50" style={{ left: "50%" }} />
      </span>
      {showValue && (
        <span className="font-mono text-[13px] tabular-nums text-muted w-[38px] text-right">
          {clamped > 0 ? "+" : ""}
          {clamped.toFixed(2)}
        </span>
      )}
    </span>
  );
}
```

Usage:
```tsx
<CenterBar value={leg.score} />                          {/* table cell, default 56×8 */}
<CenterBar value={netScore} width={100} showValue />      {/* ScoreBar replacement */}
<CenterBar value={net} width={80} />                       {/* WhyPanel NetBar replacement */}
```

### B.7 `components/ui/InfoTip.tsx` (UI-09 / A11Y-01)

**Arbitration:** the audit's single biggest accessibility finding — every tooltip trigger in the app (`SignalGroups.tsx`'s `HeaderTip`/`ChipTooltip`/`InfoTip`(local), `WhyPanel.tsx`'s `InfoTooltip`, `RotationPanel.tsx`'s `Th`/`QuadrantDot`, `ConvictionDot.tsx`, `StatChip.tsx`) wraps Radix `Tooltip.Trigger asChild` around a non-interactive `<span className="cursor-default">`, so the tip is **mouse-only and unreachable by keyboard**. **Decision: one primitive, trigger is always a real `<button type="button">`** (Radix `Tooltip.Trigger` needs no `asChild` — a button is already a valid trigger element), which is keyboard-focusable, shows the global focus-visible outline, and opens the tooltip on both hover and focus (Radix's default behavior once the trigger is natively focusable).

```tsx
// dashboard/components/ui/InfoTip.tsx
"use client";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { ReactNode } from "react";

export interface InfoTipProps {
  /** Tooltip body text (or short JSX, e.g. a <ul> of catalyst names). */
  content: ReactNode;
  /** Trigger content. Default: a small Info glyph (12px), matching the existing header/inline icon usage. */
  children?: ReactNode;
  /** aria-label for icon-only triggers (required when children is omitted or non-text). */
  label?: string;
  className?: string;
}

export default function InfoTip({ content, children, label, className }: InfoTipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={children ? undefined : label ?? "More info"}
          className={["inline-flex cursor-default items-center text-muted hover:text-foreground", className ?? ""].join(" ")}
        >
          {children ?? <Info size={12} />}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 max-w-xs rounded border border-line bg-elevated px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-muted shadow-lg"
          sideOffset={4}
        >
          {content}
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
```

Note: `asChild` is retained here (wrapping the real `<button>`) purely so Radix merges its own ARIA/event props onto that button rather than inserting a wrapper `<span>`, preserving one focusable DOM node — this is different from every current call site, which uses `asChild` to merge onto a `<span>`, which is the bug.

Usage:
```tsx
<InfoTip content="Conviction — model confidence in the call. More filled dots = higher conviction.">
  <span className="text-[13px] font-semibold">C</span>
</InfoTip>
<InfoTip content={<ul className="space-y-0.5">{catalysts.map((c) => <li key={c}>{c}</li>)}</ul>} label={`${count} catalysts`}>
  <span className="font-mono text-[11px]">{count}</span>
</InfoTip>
```

### B.8 `components/ui/Toggle.tsx` (A11Y-04 / OL-10)

True on/off switch — distinct from `Button`'s `aria-pressed` toggle-button (a switch represents a persistent binary setting; a pressed button represents "this filter/tab is currently selected," which stays as `aria-pressed` per §B.1/B.5). Uses `role="switch"` + `aria-checked`, per the audit's OL-10 (0DTE ladder view toggles) and A11Y-04 (any settings-style on/off, e.g. alerts `enabled` field).

```tsx
// dashboard/components/ui/Toggle.tsx
"use client";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name — required, since the visual track carries no text. */
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-accent bg-accent-dim" : "border-line bg-raised",
        className ?? "",
      ].join(" ")}
    >
      <span
        className={["inline-block h-3.5 w-3.5 rounded-full bg-foreground transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]"].join(" ")}
      />
    </button>
  );
}
```

Usage:
```tsx
<Toggle checked={rule.enabled} onChange={(v) => updateRule(rule.id, { enabled: v })} label={`Enable ${rule.kind} alert`} />
<Toggle checked={logScale} onChange={setLogScale} label="Logarithmic Y-axis" />
```

### B.9 Undo mechanism (A11Y-07) — `UndoToastProvider` + `useUndoAction`

**Arbitration — confirm-dialog vs. optimistic+undo-toast:** **Decision: undo-toast, not a confirm dialog.** Rationale: (1) this is a single-user, local, daily-use tool — friction from a modal on every pin/unpin or alert-delete is a worse trade than an occasional accidental action that's trivially reversible; (2) the entire app is already built around optimistic mutate-then-revert (`PinCell`, watchlist unpin, `ScreenerPage.togglePin`) — a confirm dialog would be a second, contradictory interaction pattern layered on top; (3) no Dialog primitive exists in this codebase today (`@radix-ui/react-dialog` is not installed; `@radix-ui/react-popover` is, but is unused and not dialog-semantic) — introducing one is a bigger footprint than a toast for a reversible, low-stakes action. Destructive-and-*irreversible* actions (there are none in scope here — alert-rule delete and watchlist unpin are both trivially re-creatable) would warrant a confirm dialog instead; if a future feature needs one, that's a new primitive, not a reuse of this one.

```tsx
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
  /** Fires if the user clicks Undo within the window — caller reverts local state; `commit`'s server effect is also reversed by re-issuing the inverse call inside this function. */
  undo: () => void;
  /** Milliseconds before the toast auto-dismisses and the action becomes permanent. Default: 6000. */
  windowMs?: number;
}

interface UndoContextValue {
  run: (args: UndoActionArgs) => void;
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
  undo: () => void;
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

  return (
    <UndoContext.Provider value={{ run }}>
      {children}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-[13px] text-foreground shadow-lg">
          <span>{toast.label}</span>
          <button
            type="button"
            onClick={() => {
              toast.undo();
              setToast(null);
            }}
            className="font-medium text-accent hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}
```

Mount once in `app/layout.tsx`, wrapping the existing body content (alongside `TooltipProvider`). Consumers call `useUndoAction().run(...)` — see `PinToggle` (§B.5) for the reference integration; `alerts/page.tsx`'s rule-delete button migrates to the same pattern.

Usage:
```tsx
// app/layout.tsx
<TooltipProvider>
  <UndoToastProvider>{children}</UndoToastProvider>
</TooltipProvider>
```

---

## C. `dashboard/lib/format.ts` (new file)

**Relationship to `tz-display.ts`: `format.ts` wraps it, does not absorb it.** `tz-display.ts`'s `dualClock()` is timezone/locale display logic (AEST + local dual-clock strings) — a distinct concern from numeric formatting. `format.ts` imports and re-exports nothing from it; `relativeAge()` (below) is new and unrelated to `dualClock()`. Both files are imported independently by consumers as needed.

**Precision policy (OL-13), stated once, applied by every function below:**
- **Price:** 2 decimals always (`$142.37`), regardless of magnitude. **This deliberately does *not* match `components/rails/QuoteRow.tsx`'s local `formatPrice(symbol, price)`**, which is instrument-aware (forex → 4dp, ≥1000 → thousands-separated with 0dp, else 2dp) and never prefixes `$`. `QuoteRow` is excluded from this migration — see §F.
- **Percent/return:** 1 decimal (`+2.3%`) for returns and ratios; **0 decimals** (whole-number, no decimal point) only for `agreement_pct`-class "how many agents agree" figures, because the source data is itself a discretized `n/total` ratio where sub-1% precision is noise — this exception is why `pctWhole()` exists as a separate function rather than a `decimals` param silently defaulting differently per caller.
- **Greeks (OL-12):** delta/gamma/vega/rho at 3 decimals, theta at 2 decimals (theta is already in same-day-decay dollar terms and is typically ≥0.01; delta/gamma/vega/rho routinely need 3dp to be distinguishable near zero) — see `greek()` below.
- **Large numbers (GEX, OI, volume):** compact SI notation at 1 decimal above 1,000 (`12.3K`, `4.7M`), integer below.
- **Timestamps:** relative age always rendered from seconds (not ms) at the API boundary — see `relativeAge()`.

```ts
// dashboard/lib/format.ts

/** Price, always 2dp with a leading "$". Returns "—" for null/non-finite. */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

/**
 * Percent/return, 1dp, signed. Handles both storage conventions found in the
 * backend: some fields are already ×100 percents (bridge `ret_1d`), others are
 * raw fractions (screener `ret_1d`, `agreement_pct` in some payloads). The
 * caller must declare which it holds — no more `agrPct >= 2 ? round(x) : round(x*100)`
 * heuristics (the pattern `WhyPanel.tsx` currently reinvents inline).
 * Returns "—" for null/non-finite.
 */
export function pct(v: number | null | undefined, unit: "percent" | "fraction"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const asPercent = unit === "fraction" ? v * 100 : v;
  const sign = asPercent >= 0 ? "+" : "";
  return `${sign}${asPercent.toFixed(1)}%`;
}

/** Whole-number percent (agreement/coverage figures) — see precision policy. Unsigned. */
export function pctWhole(v: number | null | undefined, unit: "percent" | "fraction"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const asPercent = unit === "fraction" ? v * 100 : v;
  return `${Math.round(asPercent)}%`;
}

/** Signed currency delta, e.g. "+$1,204.50" / "-$88.00". 2dp, thousands-separated. */
export function signedCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact large number (GEX notional, OI, volume): "842", "12.3K", "4.7M", "1.2B". */
export function compactNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

export type GreekKind = "delta" | "gamma" | "theta" | "vega" | "rho";

/** Option greek, precision per-kind per the stated policy. Returns "—" for null/non-finite. */
export function greek(v: number | null | undefined, kind: GreekKind): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const dp = kind === "theta" ? 2 : 3;
  const sign = v >= 0 ? "" : "-"; // greeks carry their own natural sign (delta/theta negative is meaningful); no forced "+"
  return `${sign}${Math.abs(v).toFixed(dp)}`;
}

/**
 * Relative age from a duration already expressed in **seconds** (OL-06 — the
 * API/UI boundary for staleness is always seconds, never ms, to remove the
 * unit-mismatch class of bug entirely). "3s", "42s", "5m", "2h", "3d".
 */
export function relativeAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
```

Every `*Cell`/`fmt*` helper duplicated in consumers (`screener/page.tsx:14-30`, `WatchlistClient.tsx`'s `fmtPct`/`fmtPrice`/`fmtDate`/`daysSince`/`sincePercent`) migrates to call these — see §F for the full list.

**Two exclusions, both verified against source (corrections applied 2026-07-29, see `08-reconciliation.md` §B):**
- **`app/portfolio/page.tsx` has no `fmtPct`.** An earlier draft of this contract cited one; `grep -n "fmtPct" dashboard/app/portfolio/page.tsx` returns zero matches. The file's only numeric helpers are two bare `.toFixed(2)` call sites (`avg_cost` at `:190`, `pos.score` at `:194`). `avg_cost` migrates to `format.price`; `pos.score` is a raw ensemble score — outside `format.ts`'s price/percent/greek/large-number/timestamp scope — and stays on `.toFixed(2)`.
- **`components/rails/QuoteRow.tsx` is excluded entirely.** Its `formatPrice()` (`:15-39`) is instrument-aware — forex (`*=X`) → 4dp, ≥1000 → thousands-separated 0dp, else 2dp, and **never** a `$` prefix — per its own in-file spec comment. Its `formatPct()` (`:42-45`) is 2dp signed, matching the rail's compact display grammar. Migrating either would be a visible regression (forex quotes losing 2 significant decimals; index quotes gaining a spurious `$` and false precision; every rail % losing a decimal). The rail's numeric grammar is a legitimate local contract, not duplication. **No task in any phase migrates this file, and none should.**

---

## D. `dashboard/lib/labels.ts` (new file)

Single source of truth for every abbreviated header, code, and status value the audit flags as unexplained. Structure: flat exported `const` maps, one per concept, all `Record<string, string>` or typed literal unions where the value set is closed. No JSX — plain strings, consumed by `InfoTip`'s `content` prop or as `<option>`/badge text directly.

```ts
// dashboard/lib/labels.ts

/**
 * Today/Screener/Rotation table header glosses (X-06/X-07, TD-05, RO-04).
 *
 * **This map is ADDITIVE, not closed.** The entries below are the floor, not the
 * ceiling: a downstream phase that needs a gloss for a header not listed here
 * adds one (same voice, same honesty register) rather than falling back to a bare
 * unexplained header or inventing a second gloss map. What is frozen is the
 * *shape* (`Record<string, string>`, keyed by the header's literal rendered text)
 * and the *location* (this file — never a page-local constant).
 * Phase 4 Task 14 adds Screener's `L`/`S`/`W`/`HC`/`Agree%`/`R:R` on this basis.
 */
export const HEADER_GLOSS: Record<string, string> = {
  C: "Conviction — model confidence in the call. More filled dots = higher conviction. Display-only, not blended into the composite score.",
  "⚑": "Flags — extended move (ext) and/or an earnings date inside the typical hold window (E{n}d).",
  Cat: "Catalysts — count of named events (earnings, guidance, index changes, etc.) behind this signal. Hover/focus for the list.",
  Sent: "Sentiment leg — X/Twitter chatter score, validated independently of price action.",
  Tech: "Technical leg — the ~70-agent ensemble's price/volume-based score.",
  Fund: "Fundamental/catalyst leg — earnings proximity, guidance, and other event-driven inputs.",
  "RS-Ratio": "Relative Strength Ratio (JdK RRG) — this industry's price strength vs. the benchmark, normalized to 100. >100 = outperforming.",
  "RS-Mom": "Relative Strength Momentum (JdK RRG) — the rate of change of RS-Ratio. >100 = the strength trend is accelerating.",
  Breadth: "% of names in this industry basket trading above their 50-day moving average. Improving quadrant + low breadth = one name is carrying the move, unconfirmed.",
  n: "Basket size — number of names sampled for this industry's RS/breadth figures. Below 20, the row is flagged thin (values are noisier than the shrinkage-adjusted rank suggests).",
  "◉": "Quadrant — Leading / Improving / Weakening / Lagging (JdK RRG rotation quadrant). Hover/focus the dot for the current quadrant.",
  Δrank: "Change in rank since the prior session. ~72% of ±1-place moves are noise — treat single-step changes with caution.",
  Industry: "Industry basket — a yfinance industry group, or a hand-built theme basket where no native industry exists. Equal-weighted across up to 50 US-listed constituents, so breadth drives it, not the largest name.",
  "1W": "Trailing 1-week % change of this industry's equal-weighted basket. Absolute price return, not relative to the benchmark — RS-Ratio is the relative measure.",
  "1M": "Trailing 1-month (~21 session) % change of the equal-weighted basket. Absolute, not benchmark-relative. Context for the quadrant, not a forecast.",
  "3M": "Trailing 3-month (~63 session) % change of the equal-weighted basket. Absolute, not benchmark-relative. A long window will lag a quadrant that has only just turned.",
};

/** Quadrant dot tone + label (RotationPanel QuadrantDot). */
export const QUADRANT_LABEL: Record<string, string> = {
  leading: "Leading",
  improving: "Improving",
  weakening: "Weakening",
  lagging: "Lagging",
};

/**
 * Combo code decode (TK-07). Ground truth: `argus/argus/action_card/builder.py`
 * `_combo_string()` builds a 5-character string, one char per vote family, in
 * this fixed order: ma_trend, breakout, squeeze, momentum_osc, weekly_structure.
 * Each char is 'L' (long-dominant), 'S' (short-dominant), or 'N' (no dominant
 * side — mixed/neutral), decided by `_family_dominant()`'s confidence-weighted
 * 1.3x-margin rule. The dashboard (and the backend's own `_WEAK_COMBOS` check,
 * `builder.py` — `combo[:4] not in _WEAK_COMBOS`) only classifies the first 4
 * characters; the 5th (weekly_structure) exists in the raw string but is not
 * part of the STRONG/WEAK classification either side of the stack currently
 * uses. This corrects the prior UI copy's guess of "trend/squeeze/oscillator/
 * structure" — the real 2nd position is breakout, not squeeze.
 */
export const COMBO_POSITION_LABEL: [family: string, gloss: string][] = [
  ["ma_trend", "Moving-average trend — is price above/below its trend MAs."],
  ["breakout", "Breakout — is price breaking out of a recent range."],
  ["squeeze", "Volatility squeeze — is the market compressed ahead of a move."],
  ["momentum_osc", "Momentum oscillator — RSI/Stochastic-style overbought/oversold read."],
];
export const COMBO_LETTER_LABEL: Record<"L" | "S" | "N", string> = {
  L: "Long-dominant",
  S: "Short-dominant",
  N: "Mixed / no dominant side",
};

/** Options ladder header codes (OL-13/OD-06 "how to read this ladder" footer). */
export const LADDER_CODE_LABEL: Record<string, string> = {
  SPOT: "Current underlying spot price — the row this ladder auto-scrolls to on load.",
  ZG: "Zero Gamma — the strike where dealer net gamma exposure flips sign; price tends to accelerate away from it and pin near it depending on side.",
  CW: "Call Wall — the strike with the largest positive call gamma concentration; often acts as resistance.",
  PW: "Put Wall — the strike with the largest positive put gamma concentration; often acts as support.",
};

/** Option greek header glosses + unit, keyed to lib/format.ts's GreekKind (OL-12). */
export const GREEK_LABEL: Record<"delta" | "gamma" | "theta" | "vega" | "rho", { symbol: string; gloss: string }> = {
  delta: { symbol: "Δ", gloss: "Delta — dollar change in option price per $1 move in the underlying." },
  gamma: { symbol: "Γ", gloss: "Gamma — rate of change of delta per $1 move in the underlying." },
  theta: { symbol: "Θ", gloss: "Theta — dollar decay in option price per day, all else equal." },
  vega: { symbol: "ν", gloss: "Vega — dollar change in option price per 1-point move in implied volatility." },
  rho: { symbol: "ρ", gloss: "Rho — dollar change in option price per 1-point move in interest rates." },
};

/** Portfolio "edge" values (PF-08). Ground truth: argus/argus/portfolio/tracker.py:56-69. */
export const PORTFOLIO_EDGE_LABEL: Record<string, string> = {
  "HOLD/ADD": "The current Argus verdict agrees with your position direction — hold, or add on strength.",
  "CONSIDER SELLING": "You're long and the current Argus verdict has flipped SHORT — the original thesis is being contradicted.",
  "CONSIDER COVERING": "You're short and the current Argus verdict has flipped LONG — the original thesis is being contradicted.",
  NEUTRAL: "The current Argus verdict is WAIT — no directional edge either way right now.",
  "N/A": "Not a stock position (option/future/etc.) — Argus's equity verdict doesn't apply.",
  "NO DATA": "Price history unavailable for this symbol right now — edge can't be computed.",
};

/** Verdict values (Badge variant="verdict", screener/portfolio/ticker). */
export const VERDICT_LABEL: Record<string, string> = {
  LONG: "Ensemble leans long — long-side agents dominate on a confidence-weighted basis.",
  SHORT: "Ensemble leans short — short-side agents dominate on a confidence-weighted basis.",
  WAIT: "No dominant side — agents are split or below the confidence margin required to call a direction.",
};

/** Conviction tier values (Badge variant="tier", screener/today). */
export const TIER_LABEL: Record<string, string> = {
  PRIME_LONG: "Highest-conviction long setup — passes every tightened gate (agreement, R:R, catalyst clearance).",
  BREAKOUT_LONG: "Long setup driven primarily by a live breakout signal.",
  STANDARD_LONG: "Long setup that clears the baseline bar but isn't prime or breakout-flagged.",
  WATCH: "Below the actionable bar — worth tracking, not yet a call.",
  AVOID: "Setup actively argues against a long position right now.",
  WAIT: "No actionable read either direction.",
};

/** Watchlist "Still in?" column rename (WL-05) — declarative, not a question. */
export const WATCHLIST_STATUS_LABEL: Record<"in" | "out", string> = {
  in: "Still in setup",
  out: "Setup invalidated",
};
```

---

## E. localStorage key registry — `dashboard/lib/storageKeys.ts` (new file)

**Convention:** `dash:{domain}:{instance}[:{sub}]`, all lowercase, colon-delimited, no spaces. `domain` is the primitive/feature area (`panel` retired in favor of `collapsible` going forward — see migration note below); `instance` is the `persistKey` the consumer passes; `sub` is an optional qualifier (`:sort`, `:filters`). This is the naming rule; the registry below is the enforced, closed list — new keys are added here, not invented ad hoc at call sites, so G-14's future "reset all stored prefs" page has one file to enumerate and clear.

```ts
// dashboard/lib/storageKeys.ts

/**
 * Every localStorage key this app writes. Keep this list exhaustive — it is
 * the source G-14's "reset all stored preferences" action reads to know what
 * to clear. Do not construct a `dash:*` key anywhere except via the helpers
 * below (or, for truly dynamic per-instance keys like `dash:collapsible:{key}`,
 * by matching the *prefix* patterns listed in `DYNAMIC_KEY_PREFIXES`).
 */
export const STATIC_KEYS = {
  todayFilters: "dash:today:filters",
} as const;

/**
 * Prefixes for dynamically-suffixed keys (one per persisted component
 * instance). `resetAllStoredPrefs()` clears every localStorage key starting
 * with any of these, plus every key in STATIC_KEYS.
 */
export const DYNAMIC_KEY_PREFIXES = [
  "dash:collapsible:", // Collapsible primitive (replaces dash:panel: below)
  "dash:table:",         // DataTable sort state — "dash:table:{persistKey}:sort"
  "dash:chart:",         // per-ticker chart settings — "dash:chart:{ticker}"
] as const;

/** Retired prefix, still read (one-time migration) but never written after the Collapsible rollout — see §F. */
export const LEGACY_KEY_PREFIXES = [
  "dash:panel:",         // Panel.tsx / DiffStrip.tsx pre-Collapsible key — migrate value into dash:collapsible: on first read, then stop writing this prefix.
  "argus_watchlist",     // pre-API-backed watchlist (WL-07) — one-time read-and-clear on the watchlist page, per existing migration code in WatchlistClient.tsx.
] as const;

export function resetAllStoredPrefs(): void {
  const prefixes = [...DYNAMIC_KEY_PREFIXES, ...LEGACY_KEY_PREFIXES];
  const staticKeys = Object.values(STATIC_KEYS) as string[];
  for (const key of Object.keys(localStorage)) {
    if (staticKeys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
      localStorage.removeItem(key);
    }
  }
}
```

Migration note on the `dash:panel:` → `dash:collapsible:` rename: `Collapsible` (§B.4) reads `dash:collapsible:{persistKey}`, not `dash:panel:{persistKey}` — this is a deliberate breaking rename (Collapsible is a new, stricter contract, not a drop-in), so existing users' collapsed/expanded state for Panel-backed sections (rotation, diff strip, etc.) resets once on rollout. This is an accepted, explicitly-called-out UX regression (one-time, low-stakes — a UI open/closed preference, not data) in exchange for not perpetuating the `panel` name for a primitive that no longer is one.

---

## F. Migration / compat notes

Exact existing call sites each primitive/function replaces. This is the map downstream implementation plans use to scope their tasks — it does not itself schedule the work.

| New primitive/fn | Existing file:line | What's there today |
|---|---|---|
| `Button` | `app/screener/page.tsx:293-296` (Run), `:308-317` (Full universe) | `h-9` solid `bg-accent text-white` / bordered `bg-raised` buttons |
| `Button` | `app/alerts/page.tsx:~215-221` | icon-only delete button, no shared styling |
| `Input` | `app/screener/page.tsx:271-279` (ticker filter), `:282-290` (min score) | raw `<input>` with inline `focus:outline-none` |
| `Input`/`Select` | `app/alerts/page.tsx` `inputCls` hardcoded string | shared literal, not a component |
| `Select` | `components/today/SignalGroups.tsx:217-245` (`FilterSelect`) | local component, `focus:outline-none` |
| `Collapsible` | `components/ui/Panel.tsx` (whole file) | `max-height:9999px`, `dash:panel:{key}` |
| `Collapsible` | `components/today/DiffStrip.tsx:43,80-81` | duplicates Panel's key scheme without using Panel |
| `Collapsible` | `components/odte/VerdictCard.tsx:34,36,42-43,58,62,78` | `open`/`canExpand` state, not persisted |
| `Collapsible` | `components/ticker/WhyPanel.tsx:152-153,417-423,434` | votes accordion, correct ARIA, hand-rolled |
| `PinToggle` | `app/screener/page.tsx:38-65` (`PinCell`) | bespoke optimistic pin cell |
| `PinToggle` | `components/ticker/Header.tsx:66-` (`PinButton`) | bespoke optimistic pin button |
| `PinToggle` | `app/watchlist/WatchlistClient.tsx:327-341` | bare unpin text-button, no undo |
| `CenterBar` | `components/ui/MicroBar.tsx` (whole file) | 56×8 fixed-width bar |
| `CenterBar` | `components/ui/ScoreBar.tsx` (whole file) | 100×8 bar + value label |
| `CenterBar` | `components/ticker/WhyPanel.tsx:52-95` (`NetBar`) | 80×8 inline bar |
| `InfoTip` | `components/today/SignalGroups.tsx:80-118` (`HeaderTip`, `ChipTooltip`), `:172-191` (local `InfoTip`) | Radix trigger on non-focusable `<span>` |
| `InfoTip` | `components/ticker/WhyPanel.tsx:27-` (`InfoTooltip`) | same pattern |
| `InfoTip` | `components/today/RotationPanel.tsx:39-77` (`Th`), `:79-102` (`QuadrantDot`), `:104-130` (`DRank`), `:188-207` (thin-basket industry cell) | same pattern, 4 separate call sites |
| `InfoTip` | `components/ui/ConvictionDot.tsx:44-59`, `components/ui/StatChip.tsx:32-46` | same pattern |
| `Toggle` | `components/charts/CandleChart.tsx` log-scale toggle (~line 407) | active-state button masquerading as a toggle, no `role="switch"` |
| `Toggle` | `app/alerts/page.tsx` rule `enabled` field | currently unused/unwired (AL-01) — wire through Toggle when AL-01 is addressed |
| `UndoToastProvider`/`useUndoAction` | `app/watchlist/WatchlistClient.tsx:327-341` | unpin has no undo |
| `UndoToastProvider`/`useUndoAction` | `app/alerts/page.tsx:~215-221` | delete has no confirm/undo |
| `format.price` | `app/watchlist/WatchlistClient.tsx` `fmtPrice`, `app/portfolio/page.tsx:190` (`avg_cost` bare `.toFixed(2)`) | duplicated logic |
| `format.pct`/`pctWhole` | `app/screener/page.tsx:26-30` (`fmtPct`), `app/watchlist/WatchlistClient.tsx` `fmtPct`, `components/ticker/WhyPanel.tsx` `agrPct` inline heuristic | 3 independent, slightly-different implementations |
| **NOT** `format.price`/`format.pct` | `components/rails/QuoteRow.tsx:15-39` (`formatPrice`), `:42-45` (`formatPct`) | **Excluded by design.** Instrument-aware forex-4dp / ≥1000-0dp / no-`$` grammar; migrating is a visible regression. See §C. |
| **NOT** `format.pct` | `app/portfolio/page.tsx` | **No `fmtPct` exists in this file** (verified — zero grep matches). Earlier draft error. `pos.score`'s `.toFixed(2)` is a raw ensemble score, outside `format.ts`'s scope; leave it. |
| `format.compactNumber` | `components/GexChart.tsx:58-67` (`formatYAxis`) | inline, GEX-chart-only |
| `format.relativeAge` | *(new — OL-06 currently has no shared implementation; ms/seconds unit mismatches are the finding)* | — |
| `labels.HEADER_GLOSS` | `components/today/SignalGroups.tsx:406` (`C` — has a tooltip today, kept verbatim), `:443` (`⚑`, no tooltip today), `:448` (`Cat`, no tooltip today) | inconsistent per audit TD-05 |
| `labels.COMBO_POSITION_LABEL`/`COMBO_LETTER_LABEL` | `components/ticker/WhyPanel.tsx` `COMBO_NOTE` map + `combo.slice(0,4)`, `lib/groups.ts` `comboClass()` | ad hoc 4-combo lookup table, no positional gloss |
| `labels.LADDER_CODE_LABEL` | `app/odte/strikes/page.tsx` "How to read this ladder" footer copy | copy exists but isn't reused as structured data (headers themselves stay unglossed) |
| `labels.GREEK_LABEL` | `app/odte/strikes/page.tsx:265-269,277-281` (23-column headers) | bare `Δ Γ Θ ν ρ` symbols, no gloss |
| `labels.PORTFOLIO_EDGE_LABEL` | `app/portfolio/page.tsx:197` — the `edge` cell (`{pos.edge ?? "—"}`) | bare uppercase string, no gloss. **Not** `verdictChip`/`scoreClass` (an earlier draft named those): this map's six keys (`HOLD/ADD`, `CONSIDER SELLING`, `CONSIDER COVERING`, `NEUTRAL`, `N/A`, `NO DATA`) match `pos.edge`'s value set exactly, and match none of `pos.verdict`'s (`LONG`/`SHORT`/`WAIT`). |
| `labels.VERDICT_LABEL` | `app/portfolio/page.tsx:35-48` (`verdictChip`), `:192` (its call site) | `verdictChip` is a hand-rolled re-implementation of `Badge variant="verdict"`; the verdict cell is colour-only with no gloss. `scoreClass` (`:50`, `:193`) is a numeric-tone class, **not** a label concern — leave it. |
| `.tone-live`/`.tone-frozen`/`.tone-eod` | `app/odte/strikes/page.tsx:142,157,172,199-203,292-293` | raw Tailwind palette classes (`text-emerald-400` etc.) |
| `var(--green)`/`var(--red)` (replacing hex literals) | `components/GexChart.tsx:55` (`"#10b981"`/`"#ef4444"`), `components/charts/CandleChart.tsx` `LEVEL_STYLE`/`EMA_STYLE` | hardcoded hex matching but not referencing tokens |
| `--muted-2` | `components/today/RotationPanel.tsx` thin-basket `rowCls` (`text-muted`, itself already the weaker tier — verify against final visual pass), any `opacity-60`/`text-muted/70`-on-text site found in a full sweep (not exhaustively enumerated here — downstream task) | opacity-based dimming |
| DataTable zebra (§A.4) | `app/portfolio/page.tsx:169` | `bg-white/[0.02]` fake zebra on bespoke `<table>` |

---

**End of contract.**
