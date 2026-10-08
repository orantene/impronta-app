import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  loadFavoritesPageData,
  type FavoritesPageDeps,
} from "@/app/(workspace)/[tenantSlug]/client/favorites/load-favorites-page";
import {
  effectiveReadContext,
  mayMergeGuestActivity,
  type EffectiveReadContext,
} from "./effective-read";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const A = "aaaaaaaa-staff-actor";
const B = "bbbbbbbb-impersonated-subject";
const TENANT = "tenant-1";

const impersonating: EffectiveReadContext = effectiveReadContext(A, {
  actorUser: { id: A },
  effectiveUserId: B,
  isImpersonating: true,
});
const plain: EffectiveReadContext = effectiveReadContext(A, null);

// ── MergeGuestFavorites gate ────────────────────────────────────────────────

test("actor A impersonating B: the guest-favourites merge is skipped", () => {
  assert.equal(impersonating.impersonated, true);
  assert.equal(mayMergeGuestActivity(impersonating), false);
});

test("not impersonating: the merge still runs (unchanged)", () => {
  assert.equal(mayMergeGuestActivity(plain), true);
  assert.equal(mayMergeGuestActivity(undefined), true);
  // A claim that does not verify degrades to "not impersonating": merge runs.
  const forged = effectiveReadContext(A, {
    actorUser: { id: "someone-else" },
    effectiveUserId: B,
    isImpersonating: true,
  });
  assert.equal(mayMergeGuestActivity(forged), true);
});

test("the client layout renders MergeGuestFavorites only behind the gate", () => {
  const src = readFileSync(
    join(WEB_ROOT, "src", "app", "(workspace)", "[tenantSlug]", "client", "layout.tsx"),
    "utf8",
  );
  const uses = src.match(/<MergeGuestFavorites\b/g) ?? [];
  assert.equal(uses.length, 1, "expected exactly one MergeGuestFavorites render");
  const at = src.indexOf("<MergeGuestFavorites");
  const gate = src.lastIndexOf("mayMergeGuestActivity(readCtx)", at);
  assert.ok(gate > -1 && at - gate < 120, "MergeGuestFavorites is not directly behind mayMergeGuestActivity(readCtx)");
});

// ── Favorites page loader ───────────────────────────────────────────────────

function fakeDeps(log: string[]): FavoritesPageDeps {
  return {
    profile: (async (userId: string, _tenantId: string, ctx?: EffectiveReadContext) => {
      log.push(`profile:${userId}:${ctx?.impersonated ? "imp" : "own"}`);
      return { id: `cp-${userId}` };
    }) as unknown as FavoritesPageDeps["profile"],
    favorites: (async (userId: string) => {
      log.push(`favorites:${userId}`);
      return [{ id: `fav-of-${userId}` }];
    }) as unknown as FavoritesPageDeps["favorites"],
  };
}

test("favorites page: actor A impersonating B reads only B's profile and favourites", async () => {
  const log: string[] = [];
  const out = await loadFavoritesPageData(A, TENANT, impersonating, fakeDeps(log));
  assert.deepEqual(log, [`profile:${B}:imp`, `favorites:${B}`]);
  assert.equal((out?.favorites[0] as unknown as { id: string }).id, `fav-of-${B}`);
  assert.ok(!log.some((l) => l.includes(A)), "the actor's id leaked into a read");
});

test("favorites page: not impersonating, reads the session user's own rows", async () => {
  const log: string[] = [];
  await loadFavoritesPageData(A, TENANT, plain, fakeDeps(log));
  assert.deepEqual(log, [`profile:${A}:own`, `favorites:${A}`]);
  const log2: string[] = [];
  await loadFavoritesPageData(A, TENANT, undefined, fakeDeps(log2));
  assert.deepEqual(log2, [`profile:${A}:own`, `favorites:${A}`]);
});

test("favorites page: a context built for another actor reads as the session user", async () => {
  const log: string[] = [];
  const foreign: EffectiveReadContext = { actorUserId: "other", userId: B, impersonated: true };
  await loadFavoritesPageData(A, TENANT, foreign, fakeDeps(log));
  assert.equal(log[1], `favorites:${A}`);
});

test("favorites page: no profile for the effective user means null and no favourites read", async () => {
  const log: string[] = [];
  const deps = fakeDeps(log);
  deps.profile = (async () => null) as unknown as FavoritesPageDeps["profile"];
  assert.equal(await loadFavoritesPageData(A, TENANT, impersonating, deps), null);
  assert.deepEqual(log, []);
});

test("favorites page source routes the session user through the loader only", () => {
  const src = readFileSync(
    join(WEB_ROOT, "src", "app", "(workspace)", "[tenantSlug]", "client", "favorites", "page.tsx"),
    "utf8",
  );
  assert.ok(!src.includes("loadClientFavoritesForUser"), "page must not read favourites directly");
  assert.ok(src.includes("loadFavoritesPageData(session.user.id"));
});
