/**
 * onboard-navigation.ts — the nav a new site actually ships with.
 *
 * WHAT WAS ACTUALLY WRONG, which is not what the brief said
 * ────────────────────────────────────────────────────────
 * The brief said navigation is never seeded because `cms_navigation_links` has
 * no writer. The truth is worse and more specific: **there is no such table.**
 * Production has `cms_navigation_items`, `cms_navigation_menus` and
 * `cms_navigation_revisions`, and the public header reads
 * `cms_navigation_items` through `cms_public_navigation_for_tenant`, filtered
 * on `visible = true`.
 *
 * `site-shell-backfill-action.ts` queried `cms_navigation_links` and wrote
 * `const { data } = await ...`, discarding the error, so a PostgREST "relation
 * does not exist" became `[]`. Every seeded shell therefore got an empty nav,
 * silently, for every tenant, forever. That read is fixed alongside this file.
 *
 * WHAT A HONEST DEFAULT NAV CAN CONTAIN
 * ────────────────────────────────────
 * Only routes that resolve for THIS workspace. That is a short list, and
 * keeping it short is the point: F1a spent a whole PR removing seeded links to
 * routes that never existed, and seeding a nav of hopeful destinations would
 * reintroduce the same bug in a new table.
 *
 *   • `/`          always resolves.
 *   • `/directory` only where `rosterEnabled`, else `assertRosterWorkspace`
 *                  404s it. This is C2, the trap the OLD dead-CTA guard used to
 *                  steer authors into.
 *   • `/contact`   only when the contact page was actually seeded, which per D7
 *                  happens only when the operator has real details to render.
 *   • `/book`      allow-listed for every workspace type.
 *
 * Deliberately NOT in the nav: the chat. A nav item is a promise about a place;
 * the chat is an action, and it belongs on the header verb, which F2b already
 * resolves through the words layer.
 *
 * Labels come from the words engine, so a workspace that picked an industry
 * gets its own nouns, in its own language, rather than English defaults.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";

import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import { normalizeWorkspaceType, rosterEnabled } from "@/lib/saas/workspace-type";
import {
  resolveWords,
  wordsInputFromSettings,
  type WordLocale,
} from "@/lib/words";

export type SeededNavItem = {
  readonly label: string;
  readonly href: string;
  readonly sort_order: number;
};

export type NavSeedInputs = {
  /** Raw `agencies.settings`, for the words layer. */
  readonly settings: unknown;
  /** Raw `agencies.workspace_type`. */
  readonly workspaceType: unknown;
  /** Did `ensureContactPageIfDetailsExist` actually create or find a page? */
  readonly hasContactPage: boolean;
  readonly locale: WordLocale;
};

/**
 * The default nav for one workspace, in one language.
 *
 * PURE, so the "every href resolves" rule can be asserted without a database.
 * Returns an empty array only if something is very wrong; Home always applies.
 */
export function buildDefaultNav(inputs: NavSeedInputs): SeededNavItem[] {
  const words = resolveWords(wordsInputFromSettings(inputs.settings), inputs.locale);
  const es = inputs.locale === "es";
  const items: Array<{ label: string; href: string }> = [
    { label: es ? "Inicio" : "Home", href: "/" },
  ];

  // THE DIRECTORY LINK NEEDS A WORD THIS WORKSPACE ACTUALLY OWNS.
  //
  // `rosterEnabled` alone was too wide as a condition on the LABEL. It is true
  // for every workspace_type except "business", and signup writes "talent" for
  // solo operators too — so a barber whose description matched no keyword
  // resolved to the "custom" preset, which supplies no words, and got a nav item
  // reading "Talent" pointing at a directory of one person. Measured before
  // changing it:
  //
  //   preset unset (-> custom)  nav = ["Home", "Talent"]
  //   preset salon_barber       nav = ["Home", "Team"]
  //
  // The owner's rule is that a business never meets talent-shaped copy, and
  // "Talent" in a barber's own navigation is the plainest breach of it.
  //
  // So the gate is on the WORD being owned, not on representing people: a salon
  // keeps "Team" and an agency keeps "Talent", because each preset supplies its
  // own noun. Only "custom" — which by construction supplies no words and would
  // fall through to the platform default — loses the item. Dropping it beats
  // shipping the wrong noun, and an unclassified workspace can add its own link
  // once it picks an industry.
  if (rosterEnabled(normalizeWorkspaceType(inputs.workspaceType)) && words.preset.id !== "custom") {
    items.push({ label: words.word("workspace.people"), href: "/directory" });
  }

  if (inputs.hasContactPage) {
    items.push({ label: es ? "Contacto" : "Contact", href: "/contact" });
  }

  return items.map((item, index) => ({ ...item, sort_order: index }));
}

export type EnsureNavResult =
  | { ok: true; action: "created" | "already_existed"; count: number }
  | { ok: false; error: string };

/**
 * Seed the header nav IF this tenant has none.
 *
 * Idempotent and non-fatal. Never touches an existing nav: an operator who has
 * arranged their own menu must not have it rewritten by a seeder, so the
 * presence of ANY row for this tenant and zone is a full stop.
 */
export async function ensureSeededNavigation(args: {
  admin: SupabaseClient;
  tenantId: string;
  settings: unknown;
  workspaceType: unknown;
  hasContactPage: boolean;
}): Promise<EnsureNavResult> {
  const { admin, tenantId } = args;
  const locale = DEFAULT_PLATFORM_LOCALE;

  try {
    const { data: existing, error: readErr } = await admin
      .from("cms_navigation_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("zone", "header")
      .limit(1);

    // Checked, not swallowed. Reading `const { data }` and discarding the error
    // is precisely how the old shell backfill turned a missing table into an
    // empty nav that nobody noticed.
    if (readErr) {
      return { ok: false, error: readErr.message };
    }
    if (existing && existing.length > 0) {
      return { ok: true, action: "already_existed", count: existing.length };
    }

    const items = buildDefaultNav({
      settings: args.settings,
      workspaceType: args.workspaceType,
      hasContactPage: args.hasContactPage,
      locale: locale === "es" ? "es" : "en",
    });

    const { error: insertErr } = await admin.from("cms_navigation_items").insert(
      items.map((item) => ({
        tenant_id: tenantId,
        locale,
        zone: "header",
        label: item.label,
        href: item.href,
        sort_order: item.sort_order,
        visible: true,
      })),
    );

    if (insertErr) {
      return { ok: false, error: insertErr.message };
    }

    try {
      revalidateTag(tagFor(tenantId, "navigation"), "default");
      revalidateTag(tagFor(tenantId, "storefront"), "default");
    } catch {
      /* test contexts */
    }

    return { ok: true, action: "created", count: items.length };
  } catch (error) {
    logServerError("onboard.ensureSeededNavigation", error);
    return { ok: false, error: "NAV_SEED_FAILED" };
  }
}
