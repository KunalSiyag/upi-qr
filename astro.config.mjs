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

// @clerk/astro injects its browser SDK into every page ("page" and
// "before-hydration" scripts), which loads clerk-js from a CDN on all public
// tool pages. Capture the page snippet instead and expose it as a virtual
// module; only pages that render <ClerkClient /> (auth pages, dashboard,
// dynamic QR) load Clerk. scripts/perf_budget_check.py enforces this.
const CLERK_CLIENT_MODULE = "virtual:proupiqr/clerk-client";

function clerkOnlyWhereNeeded() {
  const base = clerk();
  let pageSnippet = "";
  return {
    ...base,
    hooks: {
      ...base.hooks,
      "astro:config:setup": (options) => {
        base.hooks["astro:config:setup"]({
          ...options,
          injectScript(stage, content) {
            if (stage === "page") pageSnippet = content;
            else if (stage !== "before-hydration") options.injectScript(stage, content);
          }
        });
        options.updateConfig({
          vite: {
            plugins: [{
              name: "proupiqr:clerk-client",
              resolveId(id) {
                if (id === CLERK_CLIENT_MODULE) return `\0${CLERK_CLIENT_MODULE}`;
              },
              load(id) {
                if (id === `\0${CLERK_CLIENT_MODULE}`) return pageSnippet;
              }
            }]
          }
        });
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
  integrations: [react(), tailwind({ applyBaseStyles: false }), clerkOnlyWhereNeeded()],
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    plugins: [stripDeprecatedEsbuildOptions()]
  }
});
