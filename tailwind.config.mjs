/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16211f",
        mint: "#dff6e7",
        sun: "#f8b84e",
        leaf: "#287a57",
        forest: "#113b2c",
        cream: "#f6f8f5", // Retuned for the white canvas: a cool near-white for fields and inner panels.
        coral: "#ef6f58",
        // Direction A ("Plain money"): white canvas, heavy display ink, quiet body text.
        obsidian: "#0d1f17",
        charcoal: "#3d4541",
        muted: "#626a66",
        pebble: "#c3cac6",
        fog: "#eef1ec"
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Noto Sans", "sans-serif"],
        display: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Noto Sans", "sans-serif"]
      }
    }
  },
  plugins: []
};
