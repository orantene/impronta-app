/**
 * Phase 5 / M2 — navigation form schemas.
 *
 * Two shapes live here:
 *   1. `navItemDraftSchema` — payload for upserting a single draft nav item
 *      into `cms_navigation_items`.
 *   2. `navTreeSchema` — the serialized tree structure saved into
 *      `cms_navigation_menus.tree_json` on publish. Enforces depth ≤ 2,
 *      unique ids within a publish, stable sort order.
 *
 * Reserved-route discipline (guardrail §6 / §11 — 3 layers):
 *   - This file (layer 1, Zod) rejects internal hrefs whose first segment is
 *     a platform-reserved slug. Complements the DB trigger + middleware log.
 *
 * Zone/locale lists match the DB CHECK constraints in migration
 * 20260620120000_saas_p5_m2_navigation.sql.
 */

import { z } from "zod";

import { localeSchema } from "../locales";
import { isReservedSlug } from "../reserved-routes";

export const NAV_ZONES = ["header", "footer"] as const;
export const navZoneSchema = z.enum(NAV_ZONES);
export type NavZone = (typeof NAV_ZONES)[number];

/** Maximum nesting depth enforced in app + DB trigger (2 levels: root + one). */
export const NAV_MAX_DEPTH = 2;
/** Soft cap on total items published in one menu — keeps rendering bounded. */
export const NAV_MAX_ITEMS_PER_MENU = 100;

// ---- href validator -------------------------------------------------------

/**
 * An href is one of:
 *   - absolute URL (https://… or http://…)
 *   - mailto: / tel:
 *   - root-relative path (/…) — rejected if first segment is reserved
 *
 * The reserved-route rule mirrors the page-slug rule; nav items pointing to
 * `/admin/foo` or `/api/bar` never make sense for public navigation.
 */
export const navHrefSchema = z
  .string()
  .trim()
  .min(1, "Link URL is required")
  .max(2048, "Link URL must be 2048 characters or fewer")
  .superRefine((value, ctx) => {
    const isExternal = /^https?:\/\//i.test(value);
    const isMailto = value.startsWith("mailto:");
    const isTel = value.startsWith("tel:");
    const isRelative = value.startsWith("/");
    if (!isExternal && !isMailto && !isTel && !isRelative) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be an absolute URL, mailto:/tel:, or a root-relative path",
      });
      return;
    }
    if (isRelative) {
      // Strip leading slashes; first segment must not collide with a
      // platform-reserved slug.
      const stripped = value.replace(/^\/+/, "");
      const first = stripped.split(/[/?#]/, 1)[0] ?? "";
      if (isReservedSlug(first)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Cannot link to reserved path "/${first}"`,
        });
      }
    }
  });

// ---- single draft item upsert --------------------------------------------

export const navItemDraftSchema = z.object({
  /** `null` on create; set on update/move/reorder. */
  id: z.string().uuid().nullable().optional(),
  zone: navZoneSchema,
  locale: localeSchema,
  parentId: z.string().uuid().nullable().optional(),
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(80, "Label must be 80 characters or fewer"),
  href: navHrefSchema,
  sortOrder: z.number().int().min(0).max(9999),
  visible: z.boolean().default(true),
  /** Optimistic concurrency — 0 on create, last-seen version on update. */
  expectedVersion: z.number().int().min(0),
});

export type NavItemDraftInput = z.input<typeof navItemDraftSchema>;
export type NavItemDraftValues = z.output<typeof navItemDraftSchema>;

// ---- bulk reorder ---------------------------------------------------------

/**
 * Reorder payload — an ordered array of `{id, parentId, sortOrder}`. The
 * server action applies them in a single transaction under CAS per item.
 * No label/href edits via this path.
 */
export const navReorderSchema = z.object({
  zone: navZoneSchema,
  locale: localeSchema,
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
        sortOrder: z.number().int().min(0).max(9999),
        expectedVersion: z.number().int().min(0),
      }),
    )
    .min(1, "Nothing to reorder")
    .max(NAV_MAX_ITEMS_PER_MENU, `Too many items (max ${NAV_MAX_ITEMS_PER_MENU})`),
});

export type NavReorderInput = z.input<typeof navReorderSchema>;
export type NavReorderValues = z.output<typeof navReorderSchema>;

// ---- delete --------------------------------------------------------------

export const navItemDeleteSchema = z.object({
  id: z.string().uuid(),
  zone: navZoneSchema,
  locale: localeSchema,
  expectedVersion: z.number().int().min(0),
});

export type NavItemDeleteInput = z.input<typeof navItemDeleteSchema>;
export type NavItemDeleteValues = z.output<typeof navItemDeleteSchema>;

// ---- published tree snapshot ---------------------------------------------

/**
 * Shape of each node in `cms_navigation_menus.tree_json`. Matches what the
 * storefront consumes — no database ids required (snapshot is self-contained).
 */
const navTreeNodeBase = z.object({
  id: z.string().uuid(),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80),
  href: navHrefSchema,
  visible: z.boolean(),
  sortOrder: z.number().int().min(0),
});

type NavTreeNode = z.infer<typeof navTreeNodeBase> & {
  children: NavTreeNode[];
};

export const navTreeNodeSchema: z.ZodType<NavTreeNode> = navTreeNodeBase.extend({
  children: z.lazy(() => z.array(navTreeNodeSchema)),
});

export const navTreeSchema = z
  .array(navTreeNodeSchema)
  .max(NAV_MAX_ITEMS_PER_MENU, `Too many nav items (max ${NAV_MAX_ITEMS_PER_MENU})`)
  .superRefine((nodes, ctx) => {
    // Depth ≤ 2: grandchildren are disallowed.
    const seenIds = new Set<string>();

    function visit(list: NavTreeNode[], depth: number, path: (number | string)[]) {
      for (let i = 0; i < list.length; i += 1) {
        const node = list[i]!;
        if (seenIds.has(node.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, i, "id"],
            message: `Duplicate nav item id ${node.id}`,
          });
        } else {
          seenIds.add(node.id);
        }
        if (node.children.length > 0) {
          // `depth` is the level of `list`; child nodes sit at `depth + 1`.
          // NAV_MAX_DEPTH = 2 allows level 1 (root) and level 2 (one nested
          // layer). Any deeper — level 3 grandchildren — is rejected.
          if (depth + 1 > NAV_MAX_DEPTH) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...path, i, "children"],
              message: `Nav depth exceeds ${NAV_MAX_DEPTH}`,
            });
            continue;
          }
          visit(node.children, depth + 1, [...path, i, "children"]);
        }
      }
    }

    visit(nodes, 1, []);
  });

export type NavTreeValues = z.output<typeof navTreeSchema>;

// ---- publish request ------------------------------------------------------

export const navPublishSchema = z.object({
  zone: navZoneSchema,
  locale: localeSchema,
  /** Menu row's current version (or 0 if no row yet). */
  expectedMenuVersion: z.number().int().min(0),
});

export type NavPublishInput = z.input<typeof navPublishSchema>;
export type NavPublishValues = z.output<typeof navPublishSchema>;
