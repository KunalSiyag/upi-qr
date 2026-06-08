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
        cream: "#fffaf1",
        coral: "#ef6f58"
      },
      fontFamily: {
        sans: ["Sora", "Avenir Next", "Segoe UI", "sans-serif"],
        display: ["Sora", "Avenir Next", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};
