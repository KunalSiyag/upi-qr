import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  site: "https://www.proupiqr.in",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "hi"],
    routing: {
      prefixDefaultLocale: false
    }
  },
  output: "hybrid",
  adapter: vercel(),
  integrations: [react(), tailwind()]
});
