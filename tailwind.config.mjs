/** @type {import('tailwindcss').Config} */
// Direction "Ledger" (Oct 2026), Attio-led: near-white canvas, ink text, graphite for the one
// filled action, the brand green (leaf) as the single accent for links, focus and active states.
// Legacy names keep their slots so ~5,000 class usages restyle without a rewrite:
// forest = ink (text, primary fill, dark bands), mint/cream/fog = quiet grey surfaces.
const sans = ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Noto Sans", "Noto Sans Devanagari", "sans-serif"];

export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c1d1f",
        forest: "#1c1d1f",
        obsidian: "#1c1d1f",
        graphite: "#232529",
        charcoal: "#3a3f47",
        muted: "#6f7988",
        pebble: "#cad0d9",
        hairline: "#e4e7ec",
        fog: "#f4f5f6",
        cream: "#f7f8f9",
        mint: "#f4f5f6",
        leaf: "#1f7a52",
        // Status colours: used for meaning (overdue, due soon, paid), never decoration.
        coral: "#d84a3a",
        sun: "#e8a33d",
        paid: "#1f7a52"
      },
      fontFamily: {
        sans,
        display: sans
      },
      // Ledger never goes heavier than 600: the old black/extrabold/bold classes all land on 600.
      fontWeight: {
        bold: "600",
        extrabold: "600",
        black: "600"
      },
      borderRadius: {
        "2xl": "12px",
        "3xl": "14px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 40, 64, 0.06), 0 0 0 1px rgba(28, 40, 64, 0.06)",
        pop: "0 2px 6px rgba(28, 40, 64, 0.06), 0 12px 32px rgba(28, 40, 64, 0.1)"
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)"
      }
    }
  },
  plugins: []
};
