import type { Config } from "tailwindcss";

/**
 * Every theme colour is a bare `var(--x)`, and Tailwind cannot inject an alpha
 * channel into one — it emits no rule at all rather than failing, so
 * `bg-teal/15`, `border-warn/50` and the other 89 tinted call sites in the app
 * were rendering as nothing. `color-mix` gets the alpha back without moving the
 * palette out of `globals.css` into channel triplets, which is where the hex
 * literals the token contract test forbids would have had to go.
 *
 * The guard matters: for a bare utility Tailwind passes `var(--tw-bg-opacity)`
 * rather than a number, and wrapping that in `color-mix` would make every
 * untinted colour depend on a variable that is only sometimes set. Returning
 * the plain `var()` there keeps all existing output byte-identical.
 */
const tint = (name: string) =>
  (({ opacityValue }: { opacityValue?: string | number }) => {
    // Tailwind hands this back in three shapes: absent for a bare utility, a
    // number or numeric string for `/15`, and `var(--tw-bg-opacity)` on some
    // paths. Only the numeric one can become a percentage.
    if (opacityValue == null) return `var(${name})`;
    const alpha = String(opacityValue);
    if (alpha.startsWith("var(")) return `var(${name})`;
    return `color-mix(in srgb, var(${name}) calc(${alpha} * 100%), transparent)`;
    // Tailwind resolves a colour function at build time and accepts one
    // wherever a colour string goes; its published `Config` type models only
    // the string, so the cast is the narrowest way to keep tsc clean.
  }) as unknown as string;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: tint("--background"),
        foreground: tint("--foreground"),
        bg: tint("--bg"),
        surface: tint("--surface"),
        elevated: tint("--elevated"),
        raised: tint("--raised"),
        line: tint("--line"),
        "line-strong": tint("--line-strong"),
        muted: tint("--muted"),
        "muted-2": tint("--muted-2"),
        accent: tint("--accent"),
        "accent-dim": tint("--accent-dim"),
        pos: tint("--green"),
        neg: tint("--red"),
        warn: tint("--amber"),
        teal: tint("--teal"),
        // Options side, named rather than inferred. `put` no longer shares
        // --red with "down"; `call` is the alias of --teal.
        put: tint("--put"),
        call: tint("--call"),
        // Model output — scores, conviction, verdicts. Never P&L green/red.
        model: tint("--model"),
      },
      // Reading tones live on textColor only: a `2`/`3` key under `colors`
      // would also mint `border-2`/`border-3`, colliding with border widths.
      textColor: {
        "2": tint("--text-2"),
        "3": tint("--text-3"),
      },
      height: {
        nav: "var(--nav-h)",
      },
      // Six roles, declared in px so the 14px root font-size can't rescale them
      // (rem-based sizes render 10.5px/12.25px here — never use text-xs/sm).
      // 11px is an eyebrow/column-header size; it is not a content size.
      fontSize: {
        micro: ["11px", { lineHeight: "1.35", letterSpacing: "0.08em", fontWeight: "500" }],
        // `label` names a value: chip captions, card verbs, the word beside a
        // figure. Sentence case — `micro` is the uppercase role, this is not.
        label: ["12px", { lineHeight: "1.45", fontWeight: "400" }],
        body: ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        // `data`'s mono family + tabular figures are applied in globals.css —
        // a fontSize tuple cannot express font-family.
        data: ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        title: ["15px", { lineHeight: "1.35", fontWeight: "600" }],
        headline: ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        display: ["28px", { lineHeight: "1.15", fontWeight: "600" }],
        // Stock keys remapped onto the same roles so a stray text-xs can never
        // reintroduce an off-scale 10.5px/12.25px.
        xs: ["11px", { lineHeight: "1.35" }],
        sm: ["13px", { lineHeight: "1.5" }],
        base: ["13px", { lineHeight: "1.5" }],
        lg: ["15px", { lineHeight: "1.35" }],
        xl: ["20px", { lineHeight: "1.3" }],
        "2xl": ["28px", { lineHeight: "1.15" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
