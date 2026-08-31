import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import clerk from "@clerk/astro";

// @clerk/astro still injects the deprecated Vite option
// optimizeDeps.esbuildOptions (Vite 7 / Rolldown no longer uses esbuild for dep
// optimization). Strip it after Clerk sets it so dev logs stay clean; the old
// es2022 target is redundant on modern browser targets.
function stripDeprecatedEsbuildOptions() {
  return {
    name: "proupiqr:strip-deprecated-esbuild-options",
    config(viteConfig) {
      if (viteConfig.optimizeDeps?.esbuildOptions) {
        delete viteConfig.optimizeDeps.esbuildOptions;
      }
    }
  };
}

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
  integrations: [react(), tailwind({ applyBaseStyles: false }), clerk()],
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    plugins: [stripDeprecatedEsbuildOptions()]
  }
});
