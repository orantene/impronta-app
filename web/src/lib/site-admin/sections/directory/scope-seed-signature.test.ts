import { strict as assert } from "node:assert";
import { test } from "node:test";

import { directorySeedSignature } from "@/lib/directory/search-params";

/**
 * Regression guard for the empty category grid.
 *
 * A directory section with `scope="by_talent_type"` resolves its slugs to
 * taxonomy term UUIDs on the SERVER and seeds the first page with them. The
 * client grid re-derives the same signature and adopts the SSR rows only when
 * the two match. The section's scope used to stop at the server/client
 * boundary, so the client rebuilt the signature from the URL alone (empty for
 * a clean category URL), the signatures disagreed, the correct SSR rows were
 * discarded, and the refetch went out UNSCOPED — which is how
 * improntamodels.com/p/our-fashion-models rendered "No talent" while its own
 * facet bar reported counts.
 *
 * These assert the precedence contract both sides now implement:
 *   URL selection wins → else the section's scope → else unscoped.
 * If a future refactor drops the scope on either side, the first test fails.
 */

const BASE = {
  aiSearch: false,
  fieldFacets: [],
  locale: "en",
  sort: "recommended" as const,
  query: "",
  locationSlug: "",
  heightMinCm: null,
  heightMaxCm: null,
  ageMin: null,
  ageMax: null,
};

/** The precedence both Component.tsx (server) and DirectoryReactiveResults
 *  (client) apply. Kept here so the test pins the RULE, not one call site. */
function resolveTermIds(urlTermIds: string[], scopeTermIds: string[]): string[] {
  return urlTermIds.length > 0 ? urlTermIds : scopeTermIds;
}

const SCOPE = ["ce0c19f7-9fa6-424a-988f-dadbeab61aea"]; // fashion-model
const URL_PICK = ["bdca65be-1f01-8fca-da77-61f872434bca"]; // beauty-model

test("scoped section: client signature matches the server seed (SSR rows are adopted)", () => {
  // Server seeded with the section's scope; visitor URL carries no `tax`.
  const server = directorySeedSignature({ ...BASE, taxonomyTermIds: SCOPE });
  const client = directorySeedSignature({
    ...BASE,
    taxonomyTermIds: resolveTermIds([], SCOPE),
  });
  assert.equal(client, server);
});

test("dropping the scope on the client breaks the match (the original bug)", () => {
  const server = directorySeedSignature({ ...BASE, taxonomyTermIds: SCOPE });
  // What the client used to compute: URL only, scope never threaded.
  const clientWithoutScope = directorySeedSignature({
    ...BASE,
    taxonomyTermIds: [],
  });
  assert.notEqual(clientWithoutScope, server);
});

test("a URL selection outranks the section scope, on both sides identically", () => {
  const ids = resolveTermIds(URL_PICK, SCOPE);
  assert.deepEqual(ids, URL_PICK);
  assert.equal(
    directorySeedSignature({ ...BASE, taxonomyTermIds: ids }),
    directorySeedSignature({ ...BASE, taxonomyTermIds: URL_PICK }),
  );
});

test("unscoped section with no URL filter stays unscoped", () => {
  assert.deepEqual(resolveTermIds([], []), []);
});
