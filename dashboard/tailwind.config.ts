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
      },
      height: {
        nav: "var(--nav-h)",
      },
      // Six-step scale, declared in px so the 14px root font-size can't rescale
      // them (rem-based sizes render 10.5px/12.25px here — never use text-xs/sm).
      fontSize: {
        micro: ["11px", { lineHeight: "1.35" }],
        dense: ["12px", { lineHeight: "1.4" }],
        body: ["13px", { lineHeight: "1.5" }],
        subhead: ["15px", { lineHeight: "1.35" }],
        title: ["18px", { lineHeight: "1.3" }],
        display: ["24px", { lineHeight: "1.2" }],
        // Stock keys remapped onto the same six steps so a stray text-xs can
        // never reintroduce an off-scale 10.5px/12.25px.
        xs: ["11px", { lineHeight: "1.35" }],
        sm: ["13px", { lineHeight: "1.5" }],
        base: ["13px", { lineHeight: "1.5" }],
        lg: ["15px", { lineHeight: "1.35" }],
        xl: ["18px", { lineHeight: "1.3" }],
        "2xl": ["24px", { lineHeight: "1.2" }],
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
