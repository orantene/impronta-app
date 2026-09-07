import "server-only";

/**
 * from-brief.ts — a workspace gets its menu at signup, not from an admin panel.
 *
 * `applyMenuImport` has had exactly one caller since it shipped: the admin
 * screen. So the only route to a populated menu was a human finding that panel
 * and pasting a file, and a brief carrying a menu link produced nothing. That
 * is the fourth instance this week of a capability that exists and that no path
 * a customer takes ever calls.
 *
 * WHY IT COULD NOT SIMPLY BE CALLED. `applyMenuImport` opens with
 * `requireWorkspaceStaffAction()`, and during provisioning there is no staff
 * session: the workspace is being created and its owner has no membership yet.
 * `applyParsedMenu` is the write path without that gate, and this module is the
 * provisioning-side caller.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { applyParsedMenu } from "./import-actions";
import { parseRestauradminMenu } from "./parse-restauradmin";

/**
 * EVERY OUTCOME IS NAMED. There is no silent skip.
 *
 * "The brief had no menu link" and "the fetch failed" and "the page was not a
 * menu" are three different things, and a provisioning run that quietly did
 * nothing would look identical to all three — and identical to success on a
 * workspace whose menu simply never appeared. Naming them is what lets the next
 * person answer "why is this menu empty" without re-running a signup.
 */
export type MenuFromBriefOutcome =
  | { kind: "imported"; created: number; updated: number; skipped: number }
  | { kind: "no_menu_source" }
  | { kind: "fetch_failed"; status: number | null }
  | { kind: "not_a_menu" }
  | { kind: "write_failed"; error: string };

/** Fetch cap. A menu export is a document, not a download. */
const MAX_BYTES = 2_000_000;

export async function importMenuFromBrief(input: {
  tenantId: string;
  /** `presence.website_url` from the brief, when it has one. */
  sourceUrl: string | null | undefined;
}): Promise<MenuFromBriefOutcome> {
  const url = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
  if (!url) return { kind: "no_menu_source" };

  let text: string;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { kind: "fetch_failed", status: res.status };
    const body = await res.text();
    // Truncating would produce invalid JSON and read as "not a menu", which is
    // a different and misleading answer, so an oversized body is a fetch
    // failure with no status rather than a parse attempt.
    if (body.length > MAX_BYTES) return { kind: "fetch_failed", status: null };
    text = body;
  } catch (error) {
    logServerError("menuImport.fromBrief.fetch", error);
    return { kind: "fetch_failed", status: null };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    // The intake also accepts an HTML menu page; that is the parser's problem,
    // not this one's, and until it reads HTML a non-JSON body is honestly "not
    // a menu" rather than an error we should raise to the operator.
    return { kind: "not_a_menu" };
  }

  const menu = parseRestauradminMenu(doc);
  if (menu.items.length === 0) return { kind: "not_a_menu" };

  const admin = createServiceRoleClient();
  if (!admin) return { kind: "write_failed", error: "Database not available." };

  const result = await applyParsedMenu(admin, input.tenantId, menu);
  if (!result.ok) return { kind: "write_failed", error: result.error };
  return {
    kind: "imported",
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
  };
}
