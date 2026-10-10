import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import clerk from "@clerk/astro";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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

// The Vercel adapter writes .vercel/output/config.json but ignores vercel.json
// "crons". Copy them in after the adapter finishes so the 09:00 IST digest
// (/api/cron/digest/) is part of the deployment. vercel.json stays the single
// source; the digest is idempotent per account per day, so a duplicate merge is harmless.
function withVercelCrons(adapter) {
  const buildDone = adapter.hooks["astro:build:done"];
  return {
    ...adapter,
    hooks: {
      ...adapter.hooks,
      "astro:build:done": async (options) => {
        await buildDone?.(options);
        const outputConfig = ".vercel/output/config.json";
        if (!existsSync(outputConfig) || !existsSync("vercel.json")) return;
        const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons;
        if (!Array.isArray(crons) || crons.length === 0) return;
        const config = JSON.parse(readFileSync(outputConfig, "utf8"));
        config.crons = crons;
        writeFileSync(outputConfig, JSON.stringify(config, null, 2));
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
  adapter: withVercelCrons(vercel()),
  integrations: [react(), tailwind({ applyBaseStyles: false }), clerkOnlyWhereNeeded()],
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    plugins: [stripDeprecatedEsbuildOptions()]
  }
});
