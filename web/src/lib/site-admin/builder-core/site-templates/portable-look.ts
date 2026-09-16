/**
 * portable-look.ts — one Look = one JSON (D-TPL-5).
 *
 * `toPortableLook` serialises a Look for export; `parsePortableLook` is the
 * zod gate for import: every page tree and both shell trees must pass
 * `validateBuilderNodeTree` with zero issues and the theme patch must pass
 * `validateThemePatch`. Nothing is repaired on import; a Look that needs
 * salvage is rejected with the reasons, mirroring template-import.ts.
 */

import { z } from "zod";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";

import { LOOK_IDS, SITE_PAGE_ROLES, type Look, type SitePageRole } from "./types";

export const PORTABLE_LOOK_VERSION = 1 as const;

export interface PortableLook {
  kind: "look";
  version: typeof PORTABLE_LOOK_VERSION;
  id: string;
  title: { es: string; en: string };
  axis: { es: string; en: string };
  themePatch: Record<string, string>;
  shell: { header: BuilderNode[]; footer: BuilderNode[] };
  pages: Record<SitePageRole, BuilderNode[]>;
  copy: Record<string, { es: string; en: string }>;
}

export function toPortableLook(look: Look): PortableLook {
  return {
    kind: "look",
    version: PORTABLE_LOOK_VERSION,
    id: look.id,
    title: { ...look.title },
    axis: { ...look.axis },
    themePatch: { ...look.themePatch },
    shell: { header: look.shell.header, footer: look.shell.footer },
    pages: Object.fromEntries(SITE_PAGE_ROLES.map((r) => [r, look.pages[r]])) as Record<SitePageRole, BuilderNode[]>,
    copy: Object.fromEntries(Object.entries(look.copy).map(([k, v]) => [k, { ...v }])),
  };
}

const bilingual = z.object({ es: z.string().max(2000), en: z.string().max(2000) });
const MAX_NODES = 2_000;

const shape = z.object({
  kind: z.literal("look"),
  version: z.literal(PORTABLE_LOOK_VERSION),
  id: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "id must be a lowercase slug"),
  title: bilingual,
  axis: bilingual,
  themePatch: z.record(z.string(), z.string()),
  shell: z.object({ header: z.array(z.unknown()), footer: z.array(z.unknown()) }),
  pages: z.object(Object.fromEntries(SITE_PAGE_ROLES.map((r) => [r, z.array(z.unknown())])) as Record<SitePageRole, z.ZodArray<z.ZodUnknown>>),
  copy: z.record(z.string(), bilingual),
});

export type ParsePortableLookResult =
  | { ok: true; look: PortableLook; builtIn: boolean }
  | { ok: false; reasons: string[] };

function countNodes(nodes: unknown[]): number {
  let n = 0;
  const walk = (x: unknown) => {
    n += 1;
    const c = (x as { children?: unknown[] } | null)?.children;
    if (Array.isArray(c)) c.forEach(walk);
  };
  nodes.forEach(walk);
  return n;
}

/**
 * Validate an unknown JSON value as a PortableLook. Trees are validated
 * RAW (markers intact): `{{copy.*}}` and `look://image/*` are legal strings
 * to the registry, and slot containers are empty containers.
 */
export function parsePortableLook(input: unknown): ParsePortableLookResult {
  const parsed = shape.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reasons: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`) };
  }
  const reasons: string[] = [];
  const trees: Array<[string, unknown[]]> = [
    ["shell.header", parsed.data.shell.header],
    ["shell.footer", parsed.data.shell.footer],
    ...SITE_PAGE_ROLES.map((r) => [`pages.${r}`, parsed.data.pages[r]] as [string, unknown[]]),
  ];
  for (const [name, tree] of trees) {
    if (tree.length === 0) reasons.push(`${name}: empty tree`);
    if (countNodes(tree) > MAX_NODES) reasons.push(`${name}: more than ${MAX_NODES} nodes`);
    const v = validateBuilderNodeTree(tree);
    if (!v.ok) for (const issue of v.issues) reasons.push(`${name}: ${issue.path} ${issue.message}`);
  }
  const theme = validateThemePatch(parsed.data.themePatch);
  if (!theme.ok) for (const key of theme.rejected) reasons.push(`themePatch.${key}: ${theme.reasons[key]}`);
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    look: parsed.data as unknown as PortableLook,
    builtIn: (LOOK_IDS as readonly string[]).includes(parsed.data.id),
  };
}
