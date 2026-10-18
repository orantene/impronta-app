/**
 * Client store for the Servicios first-paint list (TUL-824). The
 * `/talent/services` server route loads it and seeds it through
 * `ServicesBootstrapSeed`, so the editor mounts with its list instead of
 * queueing a server action behind the shell's own. Taken once, only for the
 * same talent, only while fresh; every reload calls the real action.
 */
import type { ServicesBootstrap } from "@/lib/talent/services-bootstrap.server";

const FRESH_MS = 30_000;

let seeded: ServicesBootstrap = null;
let seededAt = 0;
let taken = false;

export function seedServicesBootstrap(bundle: ServicesBootstrap): void {
  // Browser only: module state on the server would outlive the request.
  if (typeof window === "undefined" || bundle === seeded) return;
  seeded = bundle;
  seededAt = Date.now();
  taken = false;
}

/** The seeded list for this talent, once; otherwise null (caller calls the action). */
export function takeServicesSeed(talentProfileId: string) {
  if (!seeded || taken || seeded.talentProfileId !== talentProfileId) return null;
  if (Date.now() - seededAt >= FRESH_MS) return null;
  taken = true;
  return seeded.result.ok ? seeded.result : null;
}

/** Test seam. */
export function resetServicesBootstrap(): void {
  seeded = null;
  seededAt = 0;
  taken = false;
}
