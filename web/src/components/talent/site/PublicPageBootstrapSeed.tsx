"use client";

import { seedPublicPageBootstrap } from "./public-page-bootstrap";
import type { PublicPageBootstrap } from "@/lib/talent-site/server/public-page-bootstrap.server";

/** Seeds the client store from the server-loaded bundle (no server call here). */
export function PublicPageBootstrapSeed({ bundle }: { bundle: PublicPageBootstrap }) {
  seedPublicPageBootstrap(bundle);
  return null;
}
