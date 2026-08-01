import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        bg: "var(--bg)",
        surface: "var(--surface)",
        elevated: "var(--elevated)",
        raised: "var(--raised)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        pos: "var(--green)",
        neg: "var(--red)",
        warn: "var(--amber)",
        teal: "var(--teal)",
        // Options side, named rather than inferred. `put` no longer shares
        // --red with "down"; `call` is the alias of --teal.
        put: "var(--put)",
        call: "var(--call)",
        // Model output — scores, conviction, verdicts. Never P&L green/red.
        model: "var(--model)",
      },
      // Reading tones live on textColor only: a `2`/`3` key under `colors`
      // would also mint `border-2`/`border-3`, colliding with border widths.
      textColor: {
        "2": "var(--text-2)",
        "3": "var(--text-3)",
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
