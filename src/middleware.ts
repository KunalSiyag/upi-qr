import { defineMiddleware, sequence } from "astro:middleware";
import { clerkMiddleware } from "@clerk/astro/server";
import { routeExistsInLang } from "./data/validRoutes";

const PRIVATE_ROUTE_PREFIXES = ["/sign-in", "/sign-up", "/dashboard", "/c", "/api", "/embed", "/r"];
const CLERK_ROUTE_PREFIXES = ["/sign-in", "/sign-up", "/dashboard", "/api/dynamic", "/api/internal", "/api/v1"];

const searchIndexPolicy = defineMiddleware(async (context, next) => {
  const response = await next();
  const pathname = new URL(context.request.url).pathname;
  const isPrivateRoute = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isFeed = pathname === "/rss.xml" || /^\/(hi|ta|te|mr|es|pt|fr|de|id)\/rss\.xml$/.test(pathname);

  if (isPrivateRoute) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  else if (isFeed) response.headers.set("X-Robots-Tag", "noindex, follow");

  return response;
});

const localeFallback = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const match = url.pathname.match(/^\/(hi|ta|te|mr|es|pt|fr|de|id)\/([^/?#]+?)\/?$/);
  if (!match) return next();

  const [, lang, slug] = match;
  if (slug === "rss.xml" || slug === "blog") return next();
  if (routeExistsInLang(slug, lang)) return next();
  if (routeExistsInLang(slug, "en")) {
    return context.redirect(`/${slug}/`, 301);
  }
  return next();
});

const clerk = clerkMiddleware((auth, context) => {
  const pathname = new URL(context.request.url).pathname;
  const isProtectedRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (!auth().userId && isProtectedRoute) {
    return auth().redirectToSignIn();
  }
});

const clerkOnAuthRoutes = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const needsClerk = CLERK_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!needsClerk) return next();
  return clerk(context, next);
});

const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next();
  const pathname = new URL(context.request.url).pathname;
  const isEmbed = pathname === "/embed" || pathname.startsWith("/embed/");

  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (isEmbed) {
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors *"
    );
  } else {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com https://va.vercel-scripts.com https://vitals.vercel-insights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.clerk.accounts.dev https://api.clerk.com https://clerk.com https://*.clerk.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://api.indexnow.org; frame-src 'self' https://*.clerk.accounts.dev https://clerk.com https://*.clerk.com; object-src 'none'; base-uri 'none'; form-action 'self' https://*.clerk.accounts.dev; frame-ancestors 'self'; upgrade-insecure-requests"
    );
  }
  return response;
});

export const onRequest = sequence(searchIndexPolicy, localeFallback, clerkOnAuthRoutes, securityHeaders);
