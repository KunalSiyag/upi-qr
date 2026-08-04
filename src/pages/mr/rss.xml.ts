import type { APIRoute } from "astro";
import { createRssFeed } from "../../lib/rssFeed";
export const GET: APIRoute = ({ site }) => createRssFeed(site, "mr");
