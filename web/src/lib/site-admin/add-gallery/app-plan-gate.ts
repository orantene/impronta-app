/**
 * Plan gate for App Library inserts (Nail Designer and future premium apps).
 *
 * One source of truth: premium apps need Web Office (`personalSiteSections` /
 * `talent_portfolio`). The gallery badge names that same paid tier — not the
 * folded `talent_pro` SKU. Free (non-premium) library apps are not plan-gated
 * here; free talents may still open premium app pages and try the playground.
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
import { freeSiteSectionsLockedMessage } from "@/lib/talent-site/free-site-tree-guard";

/** True when this talent plan may insert a premium library app into their site. */
export function canAddLibraryApp(planKey: string | null | undefined): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteSections");
}

/** Premium apps only (for badges and server backstops). */
export function isPremiumApp(app: Pick<AppLibraryEntry, "premium">): boolean {
  return app.premium === true;
}

/**
 * UI + server: may this plan add THIS app? Non-premium apps are not gated by
 * the premium-plan check (`isPremiumApp(app) && !canAdd` is the upgrade path).
 */
export function canAddAppToSite(
  planKey: string | null | undefined,
  app: Pick<AppLibraryEntry, "premium">,
): boolean {
  if (!isPremiumApp(app)) return true;
  return canAddLibraryApp(planKey);
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

export type PremiumAppTreeGuardResult =
  | { ok: true }
  | { ok: false; code: "premium_app_locked"; message: string };

function walkPremiumNodes(
  nodes: unknown,
  visit: (kind: string, nodeId: string) => void,
): void {
  if (!Array.isArray(nodes)) return;
  const premiumKinds = premiumAppNativeKinds();
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as { kind?: unknown; id?: unknown; children?: unknown };
    if (
      typeof n.kind === "string" &&
      premiumKinds.has(n.kind as BuilderNodeKind) &&
      typeof n.id === "string" &&
      n.id
    ) {
      visit(n.kind, n.id);
    }
    if (Array.isArray(n.children)) walkPremiumNodes(n.children, visit);
  }
}

/** Count of each premium node id under the tree. */
export function collectPremiumAppNodeCounts(
  tree: unknown,
): Map<string, { kind: string; count: number }> {
  const out = new Map<string, { kind: string; count: number }>();
  walkPremiumNodes(tree, (kind, nodeId) => {
    const prev = out.get(nodeId);
    out.set(nodeId, { kind, count: (prev?.count ?? 0) + 1 });
  });
  return out;
}

/**
 * Refuse when a save INTRODUCES a premium app node the previous tree did not
 * hold. Prop edits / removals of an already-present premium node stay allowed;
 * publish preflight is the downgrade backstop for leftover kinds.
 */
export function assertPremiumAppTreeMutation(input: {
  previousTree: unknown;
  nextTree: unknown;
  canUsePremiumApps: boolean;
  locale?: string | null;
}): PremiumAppTreeGuardResult {
  if (input.canUsePremiumApps) return { ok: true };

  const previous = collectPremiumAppNodeCounts(input.previousTree);
  const next = collectPremiumAppNodeCounts(input.nextTree);

  for (const [id, hit] of next) {
    if (hit.count > (previous.get(id)?.count ?? 0)) {
      const entry = premiumAppByNativeKind(hit.kind);
      const label = entry?.name.en ?? hit.kind;
      return {
        ok: false,
        code: "premium_app_locked",
        message: `${label}: ${freeSiteSectionsLockedMessage(input.locale)}`,
      };
    }
  }
  return { ok: true };
}
