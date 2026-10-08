import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TUL-245. Which user a dashboard loader reads FOR, and which client it may
 * read WITH.
 *
 * The id never comes from a request. It comes only from
 * `resolveDashboardIdentity()`, which verifies the signed cookie, that the
 * actor is `super_admin`, and that the target is an allow-listed QA persona.
 * That result is passed through {@link effectiveReadContext}, which also
 * re-checks it against the actor the loader sees, so a context built for
 * another actor (or an identity that merely claims impersonation) degrades to
 * "read as the actor".
 */
export type EffectiveReadContext = {
  /** The signed-in staff member (the session user). */
  actorUserId: string;
  /** Whose rows to read: the impersonated user, or the actor when not impersonating. */
  userId: string;
  /** True only for a verified impersonation of exactly `userId`. */
  impersonated: boolean;
};

/** The part of `DashboardIdentity` this module needs (structural, so tests need no cookies). */
export type EffectiveIdentityLike = {
  actorUser: { id: string };
  effectiveUserId: string;
  isImpersonating: boolean;
};

/**
 * Build the context for the actor the layout sees. Anything short of a clean,
 * self-consistent impersonation identity falls back to the actor.
 */
export function effectiveReadContext(
  actorUserId: string,
  identity: EffectiveIdentityLike | null | undefined,
): EffectiveReadContext {
  const own: EffectiveReadContext = {
    actorUserId,
    userId: actorUserId,
    impersonated: false,
  };
  if (!identity || !identity.isImpersonating) return own;
  if (identity.actorUser.id !== actorUserId) return own;
  const target = identity.effectiveUserId;
  if (!target || target === actorUserId) return own;
  return { actorUserId, userId: target, impersonated: true };
}

/**
 * The user id a loader should key on. With no context it is the real user
 * (`sessionUserId`). With a context it is `ctx.userId`, but only when the
 * context was built for this very session user.
 */
export function readUserId(
  sessionUserId: string,
  ctx: EffectiveReadContext | undefined,
): string {
  if (!ctx || !ctx.impersonated || ctx.actorUserId !== sessionUserId) return sessionUserId;
  return ctx.userId;
}

/** True when `ctx` is a verified impersonation of exactly `userId` for this session user. */
export function isVerifiedImpersonationOf(
  sessionUserId: string,
  userId: string,
  ctx: EffectiveReadContext | undefined,
): boolean {
  return (
    ctx !== undefined &&
    ctx.impersonated &&
    ctx.actorUserId === sessionUserId &&
    ctx.userId === userId &&
    userId !== sessionUserId
  );
}

/**
 * Pick the client for a read keyed on `userId`. RLS would deny a staff actor
 * the target's rows, so the admin client is used ONLY for a verified
 * impersonation of exactly that target. Every other case keeps the RLS client.
 * Returns null when the admin client is required but unavailable (fail closed).
 */
export function pickReadClient(input: {
  sessionUserId: string;
  userId: string;
  ctx: EffectiveReadContext | undefined;
  rlsClient: SupabaseClient;
  adminClient: () => SupabaseClient | null;
}): SupabaseClient | null {
  if (isVerifiedImpersonationOf(input.sessionUserId, input.userId, input.ctx)) {
    return input.adminClient();
  }
  return input.rlsClient;
}

/** Client factories a loader reads through. Injected by tests; real ones are the defaults. */
export type ReadDeps = {
  rlsClient: () => Promise<SupabaseClient | null>;
  adminClient: () => SupabaseClient | null;
};

/**
 * Resolve the session user, the id to read for, and the client to read with.
 * Null when there is no client, no signed-in user, or the admin client is
 * required and missing. Without a context this is exactly the actor's own
 * session client and id.
 */
export async function resolveReadTarget(
  ctx: EffectiveReadContext | undefined,
  deps: ReadDeps,
): Promise<{ client: SupabaseClient; userId: string } | null> {
  const rls = await deps.rlsClient();
  if (!rls) return null;
  const { data, error } = await rls.auth.getUser();
  const user = data?.user;
  if (error || !user) return null;
  const userId = readUserId(user.id, ctx);
  const client = pickReadClient({
    sessionUserId: user.id,
    userId,
    ctx,
    rlsClient: rls,
    adminClient: deps.adminClient,
  });
  return client ? { client, userId } : null;
}
