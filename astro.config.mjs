import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import clerk from "@clerk/astro";

export default defineConfig({
  site: "https://www.proupiqr.in",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "hi"],
    routing: {
      prefixDefaultLocale: false
    }
  },
  adapter: vercel(),
  integrations: [react(), tailwind(), clerk()]
});
