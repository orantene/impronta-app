import { Suspense } from "react";

import { CatalogBootstrapExpected, CatalogBootstrapSeed } from "@/components/talent/services/CatalogBootstrapSeed";
import { loadCatalogBootstrap } from "@/lib/talent/catalog-bootstrap.server";

/**
 * B5 (TUL-1271 #12): the Catalog's first-paint list, loaded here on the server
 * so the editor does not queue a server action behind the shell's (the 10 to
 * 18 s wait; see catalog-bootstrap.server.ts).
 *
 * The marker renders at once; the list streams in its own Suspense boundary,
 * so the page itself never waits on it. This is an OPTIONAL seed: a rail click
 * reaches /catalog and /menu with history.pushState (spa-segments.ts) and
 * renders no page, and then the editor calls its action exactly as before.
 * That is why page.tsx stays a bare, synchronous PageRouteSyncer page.
 */
async function CatalogBootstrapLoader() {
  const bundle = await loadCatalogBootstrap();
  return <CatalogBootstrapSeed bundle={bundle} />;
}

export function CatalogBootstrap() {
  return (
    <>
      <CatalogBootstrapExpected />
      <Suspense fallback={null}>
        <CatalogBootstrapLoader />
      </Suspense>
    </>
  );
}
