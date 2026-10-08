import { cookies } from "next/headers";

import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { IMPERSONATION_READ_ONLY_ERROR } from "@/lib/impersonation/write-policy";

/**
 * TUL-256. Staff impersonation is READ-ONLY for the target. Page loaders read
 * as the effective user; every client-portal and talent-portal server action
 * must refuse while the signed impersonation cookie is live, because actions
 * otherwise run as (and write rows for) the staff ACTOR.
 *
 * Importable from `"use server"` files: it exposes no `EffectiveReadContext`,
 * and nothing in its signature is caller-controlled. The answer comes from the
 * HttpOnly cookie, verified server-side by `resolveDashboardIdentity`.
 */

export const IMPERSONATION_READ_ONLY_REFUSAL = `${IMPERSONATION_READ_ONLY_ERROR} / Sal de 'ver como' para hacer cambios`;

export type ReadOnlyGuardResult = { ok: true } | { ok: false; error: string };

/** The two things the guard looks at; injectable so tests need no request scope. */
export type ReadOnlyProbe = {
  /** True when the impersonation cookie is present at all (cheap, no I/O). */
  hasCookie: () => Promise<boolean>;
  /** True when the cookie verifies and the actor may impersonate the target. */
  isImpersonating: () => Promise<boolean>;
};

const requestProbe: ReadOnlyProbe = {
  hasCookie: async () => Boolean((await cookies()).get(IMPERSONATION_COOKIE_NAME)?.value),
  isImpersonating: async () => (await resolveDashboardIdentity())?.isImpersonating === true,
};

let probeOverride: ReadOnlyProbe | null = null;

/** Test seam only. Pass null to restore the request-scoped probe. */
export function setReadOnlyProbeForTests(probe: ReadOnlyProbe | null): void {
  probeOverride = probe;
}

/**
 * Cookie first: with no impersonation cookie (every ordinary user, every guest)
 * this is one cookie read and no auth or DB round trip. Only when the cookie is
 * present is the identity resolved in full. If that resolution throws while the
 * cookie is present we cannot prove the caller is not impersonating, so refuse.
 */
export async function assertNotImpersonatingWith(probe: ReadOnlyProbe): Promise<ReadOnlyGuardResult> {
  let present: boolean;
  try {
    present = await probe.hasCookie();
  } catch {
    // No request scope to read cookies from: nothing can be impersonating.
    return { ok: true };
  }
  if (!present) return { ok: true };
  try {
    if (await probe.isImpersonating()) return { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL };
  } catch {
    return { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL };
  }
  return { ok: true };
}

/** Result form, for actions that return `{ ok: false; error: string }`. */
export async function assertNotImpersonating(): Promise<ReadOnlyGuardResult> {
  return assertNotImpersonatingWith(probeOverride ?? requestProbe);
}

export class ImpersonationReadOnlyError extends Error {
  constructor() {
    super(IMPERSONATION_READ_ONLY_REFUSAL);
    this.name = "ImpersonationReadOnlyError";
  }
}

/** Throwing form, for actions whose return type has no error channel. */
export async function requireNotImpersonating(): Promise<void> {
  const r = await assertNotImpersonating();
  if (!r.ok) throw new ImpersonationReadOnlyError();
}
