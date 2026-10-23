import { readFile, writeFile } from "node:fs/promises";
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

// The Vercel adapter's first routes answer every slashless path with a 308, and
// vercel.json rewrites only run after them. So MCP clients that drop the slash got
// a redirect on POST /mcp, and Claude's directory probe of /mcp/.well-known/* (OAuth
// discovery; this server has no sign-in) got a 308 instead of a 404. Put both routes
// ahead of the redirect in the build output. The function still sees the original
// /mcp, which Astro would redirect before any page code runs, so a small entry
// wrapper hands it /mcp/ instead. The adapter's hook runs first (Astro moves the
// adapter to the front of the integrations), so its output exists here.
const MCP_ROUTES = [
  { src: "^/mcp$", dest: "/mcp/", continue: true },
  { src: "^/mcp/\\.well-known(?:/.*)?$", dest: "/404.html", status: 404 }
];

const MCP_ENTRY = "proupiqr-entry.mjs";
const mcpEntry = (handler) => `import app from "./${handler}";

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") return app.fetch(request);
    url.pathname = "/mcp/";
    return app.fetch(new Request(url, { method: request.method, headers: request.headers, ...(request.body ? { body: request.body, duplex: "half" } : {}) }));
  }
};
`;

function mcpWithoutRedirects() {
  return {
    name: "proupiqr:mcp-without-redirects",
    hooks: {
      "astro:build:done": async () => {
        const file = new URL("./.vercel/output/config.json", import.meta.url);
        const config = JSON.parse(await readFile(file, "utf8"));
        config.routes = [...MCP_ROUTES, ...config.routes.filter((route) => !MCP_ROUTES.some((mcp) => mcp.src === route.src))];
        await writeFile(file, JSON.stringify(config, null, "\t"));

        const func = new URL("./.vercel/output/functions/_render.func/", import.meta.url);
        const vcConfig = JSON.parse(await readFile(new URL(".vc-config.json", func), "utf8"));
        if (vcConfig.handler !== MCP_ENTRY) {
          await writeFile(new URL(MCP_ENTRY, func), mcpEntry(vcConfig.handler));
          vcConfig.handler = MCP_ENTRY;
          await writeFile(new URL(".vc-config.json", func), JSON.stringify(vcConfig, null, "\t"));
        }
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
  integrations: [react(), tailwind({ applyBaseStyles: false }), clerkOnlyWhereNeeded(), mcpWithoutRedirects()],
  build: {
    inlineStylesheets: "auto"
  },
  vite: {
    plugins: [stripDeprecatedEsbuildOptions()]
  }
});
