/**
 * Plan gate for App Library inserts (Nail Designer and future premium apps).
 *
 * Badge (`app.premium`) is independent of the gate. Adding any library app to
 * a talent site needs Web Office (`personalSiteSections`); free talents may
 * still open the app page and try the playground.
 *
 * PURE: reuses `talentPlanGrantsSiteCapability` — no new entitlement key.
 */
import { talentPlanGrantsSiteCapability } from "@/lib/access/talent-membership";
import {
  APP_REGISTRY,
  type AppLibraryEntry,
  type AppRegistryEntry,
} from "./apps-registry";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

/** True when this talent plan may insert a library app into their site tree. */
export function canAddLibraryApp(planKey: string | null | undefined): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteSections");
}

/** Premium apps only (for badges and publish backstop). */
export function isPremiumApp(app: Pick<AppLibraryEntry, "premium">): boolean {
  return app.premium === true;
}

/** Native builder kinds marked premium in the App Library registry. */
export function premiumAppNativeKinds(): ReadonlySet<BuilderNodeKind> {
  return new Set(
    APP_REGISTRY.filter((a) => a.premium).map((a) => a.nativeKind),
  );
}

export function premiumAppByNativeKind(
  kind: string,
): AppRegistryEntry | undefined {
  return APP_REGISTRY.find((a) => a.premium && a.nativeKind === kind);
}
