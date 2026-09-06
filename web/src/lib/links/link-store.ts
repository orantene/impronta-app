/**
 * QR & Links Q1 — the server-side reads and writes for `links` and `link_scans`.
 *
 * Everything here runs service-role. That is deliberate: `/q/<code>` is an
 * unauthenticated edge surface, so there is no session to scope by, and the
 * tenant is established from the resolved HOST rather than from anything the
 * caller sent. Every function therefore takes `tenantId` as its first argument
 * and every query filters on it — a service-role client with no tenant
 * predicate is how this codebase has previously served one workspace's data on
 * another workspace's domain.
 */
import "server-only";

import { createHmac } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import type { TargetRule } from "./resolve-target";
import { validateTargets } from "./resolve-target";
import { type CodeMode, validateCode } from "./code";

export type LinkKind =
  | "table" | "event" | "session" | "appointment" | "campaign"
  | "person" | "reserve" | "bill" | "profile" | "menu" | "other";

/** What rides along to whatever the guest does next. FK-free by design. */
export type LinkContext = {
  space_id?: string;
  session_id?: string;
  promo_code?: string;
  talent_profile_id?: string;
  campaign?: string;
};

export type LinkRow = {
  id: string;
  tenant_id: string;
  code: string;
  code_mode: CodeMode;
  name: string;
  kind: LinkKind;
  targets: TargetRule[];
  context: LinkContext;
  status: "active" | "paused";
  printed_count: number;
};

export type DeviceClass = "phone" | "tablet" | "desktop" | "bot" | "unknown";

/**
 * Look up a link by its printed code.
 *
 * Lowercases first: a guest typing "T7" off a card in a dark bar must land
 * where a guest scanning `/q/t7` lands, and the unique index is on
 * `lower(code)` so this matches how the row is actually keyed.
 *
 * Returns null for unknown AND for paused, because from the outside those are
 * the same thing — a code that does not currently point anywhere — and the
 * resolver renders one branded 404 for both. Distinguishing them for an
 * unauthenticated caller would confirm which codes exist.
 */
export async function findActiveLinkByCode(
  tenantId: string,
  code: string,
): Promise<LinkRow | null> {
  if (!tenantId || !code) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("links")
    .select("id, tenant_id, code, code_mode, name, kind, targets, context, status, printed_count")
    .eq("tenant_id", tenantId)
    .eq("code", code.trim().toLowerCase())
    .eq("status", "active")
    .maybeSingle();

  // A failed read is not "no such link". Logging it separately is the
  // difference between "this code was never created" and "the database was
  // unreachable for ninety seconds during a dinner service".
  if (error) {
    logServerError("links/findActiveLinkByCode", error);
    return null;
  }
  return (data as LinkRow | null) ?? null;
}

/** One row as a picker needs it: enough to choose, nothing more. */
export type LinkSummary = {
  id: string;
  code: string;
  name: string;
  kind: LinkKind;
  status: "active" | "paused";
};

/**
 * A tenant's links, for a picker — the `qr_code` block's inspector binding a
 * design to a link, and the QR and links page.
 *
 * Returns PAUSED links as well as active ones, with `status` on every row.
 * `findActiveLinkByCode` deliberately hides paused links because a guest
 * scanning one must get an honest refusal; an operator choosing which link to
 * print must see them, or a paused code is invisible in the picker and they
 * design a tent around a link that currently resolves to nothing. Two callers,
 * two truths, and conflating them is how a code gets printed dead.
 *
 * Ordered by name so the picker is stable between renders. Capped, because an
 * inspector dropdown is not a place to stream a thousand rows; a workspace
 * that outgrows this needs search, not a longer list.
 */
export async function listLinksForTenant(
  tenantId: string,
  options: { limit?: number } = {},
): Promise<LinkSummary[]> {
  if (!tenantId) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("links")
    .select("id, code, name, kind, status")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .limit(options.limit ?? 200);

  // A failed read is not "this tenant has no links". Returning [] on an error
  // would render an empty picker that looks like an empty workspace, and the
  // operator would create a duplicate link rather than find the one they have.
  if (error) {
    logServerError("links/listLinksForTenant", error);
    throw new Error("Could not load this workspace's links.");
  }
  return (data ?? []) as LinkSummary[];
}

/**
 * Look up a link by code REGARDLESS of status.
 *
 * The resolver needs this because a refusal is a scan (CEO ruling, 2026-09-05):
 * a paused code must still record that someone scanned it, or an operator
 * never learns a retired table tent is still on a table. `findActiveLinkByCode`
 * cannot serve that — it returns null for a paused link, which is correct for
 * deciding what the GUEST sees and useless for deciding what to RECORD.
 *
 * Two questions, two functions. Do not merge them: the guest-facing one must
 * keep hiding paused links.
 */
export async function findLinkByCodeAnyStatus(
  tenantId: string,
  code: string,
): Promise<LinkRow | null> {
  if (!tenantId || !code) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("links")
    .select("id, tenant_id, code, code_mode, name, kind, targets, context, status, printed_count")
    .eq("tenant_id", tenantId)
    .eq("code", code.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    logServerError("links/findLinkByCodeAnyStatus", error);
    return null;
  }
  return (data as LinkRow | null) ?? null;
}

/** What the guest actually got. A refusal is a scan. */
export type ScanOutcome = "resolved" | "paused";

/** What a Share mount needs to render, or to decide there is nothing yet. */
export type LinkForSubject = {
  id: string;
  code: string;
  name: string;
  kind: LinkKind;
  status: "active" | "paused";
  context: LinkContext;
  /** The full `https://host/q/<code>` a QR encodes and a person types. */
  url: string;
  /** Resolved scans in the last 30 days — people who got somewhere. */
  scans30d: number;
  /** Paused refusals in the last 30 days: people who scanned a retired code. */
  refusals30d: number;
  /** Other links on this tenant matching the same subject, excluding this one. */
  otherMatches: number;
};

export type SubjectQuery = {
  tenantId: string;
  /**
   * The public origin, e.g. `https://casarizo.com`. **Passed in, never guessed.**
   * The store has no request and must not infer a host: a URL composed against
   * the wrong origin produces a QR that points at another domain, and on a
   * printed card that is discovered by a guest, not by a test.
   */
  origin: string;
  kind?: LinkKind;
  talentProfileId?: string;
  offeringId?: string;
  spaceId?: string;
  sessionId?: string;
};

/**
 * The link for a thing, so a Share control can show it or offer to mint one.
 *
 * **This read never mints.** Per the CEO's ruling (2026-09-05) a thing gets a
 * link ON FIRST SHARE, by the operator's deliberate action — never on publish
 * and never as a side effect of a component mounting. A mount that minted
 * would fill `links` with a row for every profile anyone ever looked at, and
 * every one of those rows is a code somebody might print.
 *
 * Returns `null` when nothing matches. `null` means "offer to create one", and
 * it is deliberately not an empty object: an absent link and a link with no
 * scans are different states and a mount must render them differently.
 *
 * PAUSED LINKS ARE RETURNED, with `status`. Same reasoning as the picker: if a
 * subject's only link is paused, the mount must say so rather than appear to
 * have none and invite a duplicate — the operator would then have two codes for
 * one thing, one of them printed and dead.
 *
 * WHEN SEVERAL MATCH, the ordering is: active before paused, then OLDEST first.
 * Oldest because the first code made for a thing is the one most likely already
 * printed and stuck to something; a newer one is likelier to be an experiment.
 * `otherMatches` reports the rest rather than hiding them.
 */
export async function findLinkForSubject(q: SubjectQuery): Promise<LinkForSubject | null> {
  if (!q.tenantId) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  let query = admin
    .from("links")
    .select("id, code, name, kind, status, context, created_at")
    .eq("tenant_id", q.tenantId);

  if (q.kind) query = query.eq("kind", q.kind);
  // Context is JSONB; each filter narrows on one key rather than matching the
  // whole object, so a link carrying extra context still matches its subject.
  if (q.talentProfileId) query = query.eq("context->>talent_profile_id", q.talentProfileId);
  if (q.offeringId) query = query.eq("context->>offering_id", q.offeringId);
  if (q.spaceId) query = query.eq("context->>space_id", q.spaceId);
  if (q.sessionId) query = query.eq("context->>session_id", q.sessionId);

  const { data, error } = await query
    .order("status", { ascending: true })   // 'active' sorts before 'paused'
    .order("created_at", { ascending: true })
    .limit(20);

  // A failed read is not "no link". Returning null would make the mount offer
  // to create a SECOND code for a thing that already has one — and the first is
  // the one already printed.
  if (error) {
    logServerError("links/findLinkForSubject", error);
    throw new Error("Could not check whether this already has a link.");
  }

  const rows = (data ?? []) as Array<
    Pick<LinkRow, "id" | "code" | "name" | "kind" | "status" | "context">
  >;
  const best = rows[0];
  if (!best) return null;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [resolved, refused] = await Promise.all([
    admin.from("link_scans").select("id", { count: "exact", head: true })
      .eq("link_id", best.id).eq("outcome", "resolved").gte("scanned_at", since),
    admin.from("link_scans").select("id", { count: "exact", head: true })
      .eq("link_id", best.id).eq("outcome", "paused").gte("scanned_at", since),
  ]);
  if (resolved.error) logServerError("links/findLinkForSubject.scans", resolved.error);
  if (refused.error) logServerError("links/findLinkForSubject.refusals", refused.error);

  return {
    ...best,
    url: `${q.origin.replace(/\/+$/, "")}/q/${best.code}`,
    scans30d: resolved.count ?? 0,
    refusals30d: refused.count ?? 0,
    otherMatches: Math.max(0, rows.length - 1),
  };
}

export type ScanRecord = {
  linkId: string;
  /** Defaults to "resolved" so existing callers keep their meaning. */
  outcome?: ScanOutcome;
  tenantId: string;
  deviceClass: DeviceClass;
  isNfc: boolean;
  referrer: string | null;
  country: string | null;
  sessionKey: string | null;
  resolvedTo: string | null;
};

/**
 * Record one scan.
 *
 * Never awaited on the redirect path. A guest standing at a table must not wait
 * for an analytics write, and a slow or failed write must not cost them their
 * menu: the redirect is the product, the row is the reporting. Failures are
 * logged, not thrown.
 */
export async function recordScan(scan: ScanRecord): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;

  const { error } = await admin.from("link_scans").insert({
    link_id: scan.linkId,
    tenant_id: scan.tenantId,
    device_class: scan.deviceClass,
    is_nfc: scan.isNfc,
    referrer: scan.referrer,
    country: scan.country,
    session_key: scan.sessionKey,
    resolved_to: scan.resolvedTo,
    outcome: scan.outcome ?? "resolved",
  });

  if (error) logServerError("links/recordScan", error);
}

/**
 * A stable per-visitor key that identifies nobody.
 *
 * Salted hash of IP plus user agent, truncated. Enough to tell "one person
 * refreshed five times" from "five people scanned"; not enough to reverse, and
 * never stored raw. Without `LINK_SCAN_SALT` this returns null rather than
 * falling back to an unsalted hash — an unsalted hash of an IP is an IP, and
 * degrading quietly into storing one is exactly the shape of privacy bug that
 * gets shipped by a fallback that looked harmless.
 */
export function scanSessionKey(ip: string | null, userAgent: string | null): string | null {
  const salt = process.env.LINK_SCAN_SALT;
  if (!salt || !ip) return null;
  return createHmac("sha256", salt)
    .update(`${ip}|${userAgent ?? ""}`)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * Classify the device from the user agent, coarsely and on purpose.
 *
 * The QR page answers "did people scan this with a phone", not "which phone".
 * Anything finer would be fingerprinting for no product gain.
 */
export function classifyDevice(userAgent: string | null): DeviceClass {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/bot|crawler|spider|preview|curl|wget|headless|slurp|facebookexternalhit/.test(ua)) {
    return "bot";
  }
  // Order matters: an iPad's UA contains neither "mobile" nor, on recent iPadOS,
  // "ipad" — it claims to be a Mac. Tablets are checked first so the phone test
  // does not swallow the Android ones, which DO say "mobile".
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|windows phone/.test(ua)) return "phone";
  return "desktop";
}

/** Two-letter country from the edge, or null. Never guessed from a locale. */
export function readCountry(header: string | null): string | null {
  if (!header) return null;
  const value = header.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value) ? value : null;
}

export type CreateLinkInput = {
  tenantId: string;
  code: string;
  /** Defaults to "readable". Pass "opaque" for a link that grants rather than shows. */
  codeMode?: CodeMode;
  name: string;
  kind: LinkKind;
  targets: TargetRule[];
  context?: LinkContext;
  createdBy?: string | null;
};

/**
 * Create a link. Validates the rule list here as well as in the database,
 * because the database can only say "constraint violated" and a user needs to
 * be told which destination is wrong and why.
 */
export async function createLink(
  input: CreateLinkInput,
): Promise<{ ok: true; link: LinkRow } | { ok: false; reason: string }> {
  const code = input.code.trim().toLowerCase();
  const codeMode: CodeMode = input.codeMode ?? "readable";

  // Checked here as well as by the database constraints so the caller gets a
  // sentence instead of a constraint name. A short opaque code is the one
  // failure in this file that would otherwise look like it worked.
  const codeCheck = validateCode(code, codeMode);
  if (!codeCheck.ok) return { ok: false, reason: codeCheck.reason };

  const targetsCheck = validateTargets(input.targets);
  if (!targetsCheck.ok) return { ok: false, reason: targetsCheck.reason };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "The database is unavailable." };

  const { data, error } = await admin
    .from("links")
    .insert({
      tenant_id: input.tenantId,
      code,
      code_mode: codeMode,
      name: input.name.trim(),
      kind: input.kind,
      targets: input.targets,
      context: input.context ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id, tenant_id, code, code_mode, name, kind, targets, context, status, printed_count")
    .single();

  if (error) {
    // 23505 is the unique index on (tenant_id, lower(code)). Reported as the
    // product fact it is rather than as a database error, because the user's
    // next action is to pick a different code.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: `The code "${code}" is already in use on this site.` };
    }
    logServerError("links/createLink", error);
    return { ok: false, reason: "The link could not be saved." };
  }

  return { ok: true, link: data as LinkRow };
}
