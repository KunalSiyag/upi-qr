import { defineMiddleware, sequence } from "astro:middleware";
import { clerkMiddleware } from "@clerk/astro/server";
import { routeExistsInLang } from "./data/validRoutes";

const PRIVATE_ROUTE_PREFIXES = ["/sign-in", "/sign-up", "/dashboard", "/c", "/api", "/embed", "/r"];

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

export const onRequest = sequence(searchIndexPolicy, localeFallback, clerk);
