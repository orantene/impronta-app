"use client";

import type { ServicesBootstrap } from "@/lib/talent/services-bootstrap.server";
import { seedServicesBootstrap } from "./services-bootstrap";

/** Seeds the client store from the server-loaded list (no server call here). */
export function ServicesBootstrapSeed({ bundle }: { bundle: ServicesBootstrap }) {
  seedServicesBootstrap(bundle);
  return null;
}
