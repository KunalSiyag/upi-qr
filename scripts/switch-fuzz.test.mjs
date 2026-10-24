// Quota fuzz of the account-switch stash (switchAccountStorage, docs/spec-multi-business.md §3.6): whatever the
// free space and whatever stash is already on the device, no invoice may vanish, a failed switch keeps the previous
// owner, and no key ever attributes one account's invoices to another (the new account's books hold only its data,
// the stash only the account its meta names). Set-aside copies are unattributed downloads and may hold anything.
// Deterministic seed, bounded runtime.
import assert from "node:assert/strict";
import { installBrowser } from "./fake-storage.mjs";
import { addBook, emptyIndex, PRIMARY_BOOK_ID } from "../src/lib/workspace/books.ts";
import { canonicalJson, emptyWorkspace, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";
import { listAside, loadBook, loadShelf, OWNER_KEY, saveBook, saveIndex, STASH_KEY, STASH_V2_KEY, sweepStrayBooks, switchAccountStorage, WORKSPACE_KEY } from "../src/lib/workspace/localStore.ts";
import { loadShelf as legacyLoadShelf, switchAccountStorage as legacySwitch } from "./fixtures/legacy-localStore.ts";
import { sanitizeWorkspace as legacySanitize } from "./fixtures/legacy-model.ts";

const T = Date.UTC(2026, 9, 1);
const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);
const client = { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T };
/** Invoice ids carry their account's letter: inv_A0000012 belongs to A, inv_B… to B, inv_C… to C, inv_Z… to nobody known. */
let seq = 0;
/** foreign: that many foreign-currency invoices too (ws.intl, stored in the book's sidecar; docs/spec-foreign-clients.md §2.4). */
function book(account, name, upi, n, pad, foreign = 0) {
  let ws = upsertClient(updateBusiness(emptyWorkspace(), { name, upiId: upi }, T), client, T);
  for (let i = 0; i < n + foreign; i++) {
    const id = `inv_${account}${(++seq).toString().padStart(7, "0")}`;
    ws = upsertInvoice(ws, { id, number: `N-${seq}`, clientId: client.id, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise: 100, description: "d".repeat(pad), payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T, ...(i >= n ? { currency: "USD" } : {}) }, T);
  }
  return ws;
}
const idsIn = (value) => new Set([...(value ?? "").matchAll(/inv_[ABCZ]\d{7}/g)].map((m) => m[0]));
const accountsIn = (value) => new Set([...idsIn(value)].map((id) => id[4]));
let rng = 20261018;
const rand = (n) => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
const OWNER_LETTER = { [A]: "A", [B]: "B", [C]: "C" };

const scenarios = ["none", "prevV2", "nextV2", "nextV2extras", "ownerlessPrev", "ownerlessNext", "ownerlessNeither", "ownerlessSameNameNoUpi", "thirdV2"];
const TRIALS = 900;
let runs = 0;
let switched = 0;
let legacyRuns = 0;
let roundTrips = 0;
let leftovers = 0;
let stashLeftovers = 0;
let bSaves = 0;
/** A sidecar written for account C (an older switch left it): not a book of whoever is on the device. */
const isC = (v) => { try { return JSON.parse(v).owner === C; } catch { return false; } };
const problems = [];
const started = Date.now();
for (let trial = 0; trial < TRIALS; trial++) {
  const scenario = scenarios[trial % scenarios.length];
  const nExtras = rand(3);
  const pad = 40 + rand(400);
  const foreign = trial % 2 === 0 ? 1 + rand(2) : 0;
  // Every 5th device is switched by old code (an old tab or PWA), which leaves sidecars where they are.
  const old = trial % 5 === 4 && scenario !== "thirdV2";
  const store = installBrowser();
  store.setItem(OWNER_KEY, A);
  let index = { ...emptyIndex(), owner: A };
  const extras = [];
  for (let i = 0; i < nExtras; i++) { const id = `biz_x${trial}e${i}aaaa`; extras.push(id); index = addBook(index, id, T + i); }
  saveIndex(index);
  // Every 4th device never stored A's primary (A signed in to an empty account and changed nothing), and B's
  // primary is mostly foreign, so its sidecar is the write that runs out of room: a failed switch must not leave
  // B's book key behind under A (review: fail() restored WORKSPACE_KEY only when it had held something).
  const neverStored = trial % 4 === 1;
  if (!neverStored) saveBook(index, PRIMARY_BOOK_ID, book("A", "A shop", "a@okaxis", 1 + rand(4), pad, foreign));
  for (const id of extras) saveBook(index, id, book("A", `A extra ${id}`, `${id}@ok`, 1 + rand(3), pad, foreign));
  const newPrimary = book("B", "B shop", scenario === "ownerlessSameNameNoUpi" ? "" : "b@okaxis", neverStored ? 1 : 1 + rand(4), pad + rand(300), old ? 0 : neverStored ? 3 + rand(3) : rand(2));
  if (foreign && (!neverStored || nExtras) && ![...store.map.keys()].some((k) => k.startsWith("proupiqr-intl-v1:"))) problems.push({ scenario, what: "no sidecar written" });
  const stash = (account, name, upi) => store.setItem(STASH_KEY, canonicalJson(book(account, name, upi, 2, pad)));
  if (scenario === "prevV2") { stash("A", "A shop", "a@okaxis"); store.setItem(STASH_V2_KEY, JSON.stringify({ owner: A, at: 1, ids: [] })); }
  if (scenario === "nextV2" || scenario === "nextV2extras") {
    stash("B", "B shop", "b@okaxis");
    const ids = [];
    if (scenario === "nextV2extras") for (let i = 0; i < 2; i++) { const id = `biz_y${trial}s${i}bbbb`; ids.push(id); store.setItem(`proupiqr-stash-v2:${id}`, canonicalJson(book("B", "B extra", `${id}@ok`, 2, pad))); }
    store.setItem(STASH_V2_KEY, JSON.stringify({ owner: B, at: 1, ids }));
  }
  if (scenario === "ownerlessPrev") stash("A", "A shop", "a@okaxis");
  if (scenario === "ownerlessNext") stash("B", "B shop", "b@okaxis");
  if (scenario === "ownerlessNeither") stash("Z", "Z shop", "z@okaxis");
  // Same business name as the account signing in, a real UPI ID it doesn't have: never attributed to it.
  if (scenario === "ownerlessSameNameNoUpi") stash("Z", "B shop", "z@okaxis");
  if (scenario === "thirdV2") { stash("C", "C shop", "c@okaxis"); store.setItem(STASH_V2_KEY, JSON.stringify({ owner: C, at: 1, ids: [] })); }
  // Every 7th new-code device holds C's foreign section, left on one of A's books by an older switch C→A, which
  // can't be set aside at low quotas: it stays where it is, never removed and never joined (review round 3).
  if (!old && trial % 7 === 3 && scenario !== "thirdV2") {
    const where = nExtras && rand(2) ? extras[0] : PRIMARY_BOOK_ID;
    store.setItem(`proupiqr-intl-v1:${where}`, canonicalJson({ owner: C, intl: book("C", "C shop", "c@okaxis", 0, pad, 1 + rand(2)).intl }));
    leftovers++;
  }
  // Every 7th new-code device (another residue) holds C's stashed foreign section in the stash slot of one of A's
  // books: a new-code switch C→A stashed it and an older tab's "Discard" left it (it never reads that key). At low
  // quotas it can't be set aside: the switch must then fail rather than merge it into A's stash (review round 5).
  if (!old && trial % 7 === 5 && scenario !== "thirdV2") {
    const where = nExtras && rand(2) ? extras[0] : PRIMARY_BOOK_ID;
    store.setItem(`proupiqr-stash-intl-v1:${where}`, canonicalJson({ owner: C, intl: book("C", "C shop", "c@okaxis", 0, pad, 1 + rand(2)).intl }));
    stashLeftovers++;
  }

  const base = new Map(store.map);
  const before = new Set([...base.values()].flatMap((v) => [...idsIn(v)]));
  const foreignOfA = new Set([...base].filter(([k, v]) => k.startsWith("proupiqr-intl-v1:") && !isC(v)).flatMap(([, v]) => [...idsIn(v)]));
  let used = 0;
  for (const [k, v] of base) used += k.length + v.length;
  const newIds = idsIn(JSON.stringify(newPrimary));
  for (let extra = 0; extra < 12000; extra += 1 + rand(160)) {
    store.map = new Map(base);
    store.quota = used + extra;
    const fail = (what) => problems.push({ scenario, nExtras, extra, what });
    let result;
    try { result = old ? legacySwitch(A, B, index, legacySanitize(JSON.parse(JSON.stringify(newPrimary))), T + 5) : switchAccountStorage(A, B, index, newPrimary, T + 5); } catch (error) { fail(`threw ${error}`); continue; }
    runs++;
    if (old) legacyRuns++;
    for (const [k, v] of store.map) if ((k === WORKSPACE_KEY || k.startsWith("proupiqr-book-v1:")) && v.includes('"intl"')) fail(`book key ${k} contains intl`);
    // Set-aside copies older code lists hold the INR part only; foreign sections wait under proupiqr-aside-intl-v1:.
    for (const [k, v] of store.map) if (k.startsWith("proupiqr-aside-v1:") && v.includes('"intl"')) fail(`set-aside key ${k} contains intl`);
    const after = new Set([...store.map.values()].flatMap((v) => [...idsIn(v)]));
    const lost = [...before].filter((id) => !after.has(id));
    if (lost.length) fail(`lost ${lost.length}`);
    // A new-code switch moves sidecars with their books, so they count as books; old code leaves them (checked below).
    const books = [...store.map].filter(([k, v]) => k === WORKSPACE_KEY || k.startsWith("proupiqr-book-v1:") || (!old && k.startsWith("proupiqr-intl-v1:") && !isC(v))).map(([, v]) => v).join(" ");
    const stashed = [...store.map].filter(([k]) => k === STASH_KEY || k.startsWith("proupiqr-stash-v2:")).map(([, v]) => v).join(" ");
    // Stash keys hold what older code would write; each stashed foreign section is tagged with its own account.
    if (!old) for (const [k, v] of store.map) if ((k === STASH_KEY || k.startsWith("proupiqr-stash-v2:")) && v.includes('"intl"')) fail(`stash key ${k} contains intl`);
    for (const [k, v] of store.map) {
      if (!k.startsWith("proupiqr-stash-intl-v1:")) continue;
      const owner = JSON.parse(v).owner;
      if ([...accountsIn(v)].some((letter) => letter !== OWNER_LETTER[owner])) fail(`${k} of ${OWNER_LETTER[owner]} holds ${[...accountsIn(v)]}`);
    }
    const meta = JSON.parse(store.getItem(STASH_V2_KEY) ?? "null");
    const stashAccounts = accountsIn(stashed);
    if (meta && [...stashAccounts].some((letter) => letter !== OWNER_LETTER[meta.owner])) fail(`stash meta ${OWNER_LETTER[meta.owner]} holds ${[...stashAccounts]}`);
    if (!meta && stashAccounts.size > 1) fail(`ownerless stash mixes ${[...stashAccounts]}`);
    if (meta && Array.isArray(meta.ids) && meta.ids.some((id) => store.getItem(`proupiqr-stash-v2:${id}`) === null)) fail("stash meta lists a missing book");
    if (result.ok) {
      switched++;
      if (store.getItem(OWNER_KEY) !== B) fail("owner not adopted");
      if ([...accountsIn(books)].some((letter) => letter !== "B")) fail(`B's books hold ${[...accountsIn(books)]}`);
      if ([...newIds].some((id) => !idsIn(store.getItem(WORKSPACE_KEY) + (store.getItem("proupiqr-intl-v1:biz_primary") ?? "")).has(id))) fail("new primary missing");
      // What new code then loads for B: never A's foreign section, whoever switched; nothing lost while setting it aside.
      const loaded = loadShelf();
      sweepStrayBooks(loaded.shelf.index);
      if ([...accountsIn(JSON.stringify(loadBook(PRIMARY_BOOK_ID)))].some((letter) => letter !== "B")) fail(`B's joined primary holds ${[...accountsIn(JSON.stringify(loadBook(PRIMARY_BOOK_ID)))]}`);
      const kept = new Set([...store.map.values()].flatMap((v) => [...idsIn(v)]));
      if ([...before].some((id) => !kept.has(id))) fail("lost after the joined load");
      // Then an old tab or PWA switches back to A, and new code loads A: every foreign invoice of A is back in
      // A's books (or a set-aside copy), none lost, and A's books never gain B's.
      // On every third device B's own foreign section is saved first (sync brought it), so the switch back finds
      // B's sidecar in the primary's slot (review round 6); every old-code device is switched back too.
      {
        store.quota = Infinity;
        const bForeign = [];
        if (trial % 3 === 0) {
          const id = `inv_B${(++seq).toString().padStart(7, "0")}`;
          const bPrimary = loadBook(PRIMARY_BOOK_ID);
          if (!saveBook(loadShelf().shelf.index, PRIMARY_BOOK_ID, upsertInvoice(bPrimary, { id, number: `N-${seq}`, clientId: client.id, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise: 100, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T, currency: "EUR" }, T))) fail("B's foreign save failed");
          bForeign.push(id);
          bSaves++;
        }
        const back = legacySwitch(B, A, legacyLoadShelf().shelf.index, legacySanitize(JSON.parse(JSON.stringify(book("A", "A shop", "a@okaxis", 0, pad)))), T + 9);
        if (!back.ok) { fail(`legacy switch back failed: ${back.reason}`); break; }
        roundTrips++;
        const home = loadShelf();
        sweepStrayBooks(home.shelf.index);
        const onDevice = new Set([...store.map.values()].flatMap((v) => [...idsIn(v)]));
        const lostBack = [...before].filter((id) => !onDevice.has(id));
        if (lostBack.length) fail(`lost ${lostBack.length} after old code switched back`);
        if (bForeign.some((id) => !onDevice.has(id))) fail("B's foreign invoice lost after old code switched back");
        const reachable = idsIn(JSON.stringify(loadShelf().shelf.books) + JSON.stringify(listAside()));
        const unreachable = [...foreignOfA].filter((id) => !reachable.has(id));
        if (unreachable.length) fail(`${unreachable.length} foreign invoices of A neither in A's books nor set aside`);
        const aBooks = JSON.stringify(loadShelf().shelf.books);
        if ([...accountsIn(aBooks)].some((letter) => letter !== "A")) fail(`A's books hold ${[...accountsIn(aBooks)]} after switching back`);
      }
      break;
    }
    if (store.getItem(OWNER_KEY) !== A) fail("owner changed on failure");
    if (neverStored && store.getItem(WORKSPACE_KEY) !== null) fail("a failed switch left a primary book key on a device that had none");
    if ([...accountsIn(books)].some((letter) => letter !== "A")) fail(`A's books hold ${[...accountsIn(books)]} after a failed switch`);
    if (scenario === "thirdV2") break;
  }
}
const seconds = (Date.now() - started) / 1000;
assert.deepEqual(problems.slice(0, 10), [], `${problems.length} problems`);
assert.ok(runs > 20_000, `expected a wide quota sweep (ran ${runs})`);
assert.equal(switched, TRIALS - TRIALS / scenarios.length, "every switch except the third-account one succeeds once there is room");
assert.ok(legacyRuns > 1000, `old-code switches interleaved (${legacyRuns})`);
assert.ok(bSaves > 200, `B's foreign section in the slot before the switch back (${bSaves})`);
assert.ok(roundTrips > 500, `new switch then old switch back (${roundTrips})`);
assert.ok(leftovers > 80, `another account's leftover sidecar on some devices (${leftovers})`);
assert.ok(stashLeftovers > 80, `another account's leftover stashed foreign section on some devices (${stashLeftovers})`);
console.log(`[switch-fuzz] ${runs} quota cases over ${TRIALS} devices (${switched} switches, ${legacyRuns} by old code, foreign sidecars on half, ${leftovers} with a third account's leftover sidecar, ${stashLeftovers} with its stashed foreign section, ${roundTrips} switched back by old code, ${bSaves} with B's foreign section in the slot): 0 losses, 0 cross-account keys, no "intl" in a book key (${seconds.toFixed(1)} s)`);
