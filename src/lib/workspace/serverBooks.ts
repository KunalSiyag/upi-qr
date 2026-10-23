import { planForStrict } from "../billing/plans";
import { recordMetric } from "../metrics";
import type { BooksDeps } from "./booksApi";
import { bookIndexStore, cloudStore, projectionStore } from "./kvCloudStore";
import { paylinkStore } from "./kvPaylinkStore";

/** The real stores behind the multi-business routes (KV in production, memory only in local dev without KV). */
export function serverBooks(): BooksDeps {
  return {
    docs: cloudStore(),
    books: bookIndexStore(),
    projections: projectionStore(),
    paylinks: paylinkStore(),
    plan: (owner) => planForStrict(owner),
    now: () => Date.now(),
    metric: (name, by) => recordMetric(name, by),
  };
}
