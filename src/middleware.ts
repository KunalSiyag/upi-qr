import { defineMiddleware, sequence } from "astro:middleware";
import { clerkMiddleware } from "@clerk/astro/server";
import { routeExistsInLang } from "./data/validRoutes";

const localeFallback = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const match = url.pathname.match(/^\/(hi|ta|te|mr)\/([^/?#]+?)\/?$/);
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
  const isProtectedRoute = context.request.url.includes("/dashboard");
  if (!auth().userId && isProtectedRoute) {
    return auth().redirectToSignIn();
  }
});

export const onRequest = sequence(localeFallback, clerk);
