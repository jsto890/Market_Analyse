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
        line: "var(--border)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        pos: "var(--green)",
        neg: "var(--red)",
        warn: "var(--amber)",
        teal: "var(--teal)",
      },
      height: {
        nav: "var(--nav-h)",
      },
    },
  },
  plugins: [],
};
export default config;
