"use client";

import { useState } from "react";

import type { CatalogBootstrap } from "@/lib/talent/catalog-bootstrap.server";
import { expectCatalogBootstrap, seedCatalogBootstrap } from "./catalog-bootstrap";

/**
 * The page's marker: a server-loaded Catalog list follows (catalog-bootstrap.ts).
 * Once per mount, not per render: the route content can stay mounted after a
 * pushState rail click, and a re-render then must not announce a list again.
 */
export function CatalogBootstrapExpected() {
  useState(() => {
    expectCatalogBootstrap();
    return true;
  });
  return null;
}

/** Seeds the client store from the server-loaded list (no server call here). */
export function CatalogBootstrapSeed({ bundle }: { bundle: CatalogBootstrap }) {
  seedCatalogBootstrap(bundle);
  return null;
}
