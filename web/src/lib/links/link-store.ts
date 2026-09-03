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
    .select("id, tenant_id, code, name, kind, targets, context, status, printed_count")
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

export type ScanRecord = {
  linkId: string;
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
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(code)) {
    return {
      ok: false,
      reason: "A code can use letters, numbers and hyphens, and cannot start or end with a hyphen.",
    };
  }

  const targetsCheck = validateTargets(input.targets);
  if (!targetsCheck.ok) return { ok: false, reason: targetsCheck.reason };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "The database is unavailable." };

  const { data, error } = await admin
    .from("links")
    .insert({
      tenant_id: input.tenantId,
      code,
      name: input.name.trim(),
      kind: input.kind,
      targets: input.targets,
      context: input.context ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id, tenant_id, code, name, kind, targets, context, status, printed_count")
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
