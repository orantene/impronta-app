/**
 * DESIGN ORIGIN STAMP: `props.__origin` on a node a talent Design seeded
 * (theme releases, `lib/talent-site/theme-releases/origin.ts`).
 *
 *   design   the Design slug (`maison-v2`)
 *   version  the catalog version the node was seeded from
 *   key      stable design key: the section `slotKey`, `slotKey/child/path`
 *            below it. Never the node id (ids are positional).
 *   fp       fingerprint of the node's DESIGN-OWNED props as seeded
 *   cp       optional: prop paths that carry talent CONTENT (hydrated from a
 *            `{{token}}`), excluded from `fp`
 *
 * Renderers and inspectors never read it. It lives here (not in talent-site)
 * because `validateBuilderNodeTree` rebuilds props from per-kind schemas and
 * would strip it; the carrier in `validate.ts` keeps it through every save.
 */
export const DESIGN_ORIGIN_PROP = "__origin";

export interface DesignOrigin {
  design: string;
  version: number;
  key: string;
  fp: string;
  cp?: string[];
}

export function normalizeDesignOrigin(value: unknown): DesignOrigin | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.design !== "string" || v.design.length === 0 || v.design.length > 80) return undefined;
  if (typeof v.version !== "number" || !Number.isFinite(v.version)) return undefined;
  if (typeof v.key !== "string" || v.key.length === 0 || v.key.length > 400) return undefined;
  if (typeof v.fp !== "string" || v.fp.length > 64) return undefined;
  const cp = Array.isArray(v.cp)
    ? v.cp.filter((p): p is string => typeof p === "string" && p.length > 0 && p.length < 200).slice(0, 64)
    : [];
  return {
    design: v.design,
    version: v.version,
    key: v.key,
    fp: v.fp,
    ...(cp.length > 0 ? { cp } : {}),
  };
}
