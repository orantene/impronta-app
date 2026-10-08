/**
 * Gate + disconnect decision for a workspace's own captcha row (TUL-138).
 * Dependencies are injected so the platform-admin gate is unit-testable
 * without a database. The server action wires the real ones.
 */

export type CaptchaOverrideGuard =
  | { ok: true; actorId: string }
  | { ok: false; error: string };

export type CaptchaOverrideResult = { ok: true } | { ok: false; error: string };

export type DisconnectDeps = {
  guard: () => Promise<CaptchaOverrideGuard>;
  platformTenantId: () => Promise<string | null>;
  disconnect: (tenantId: string, actorId: string) => Promise<boolean>;
  onDone: () => void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function disconnectWorkspaceCaptchaWith(
  deps: DisconnectDeps,
  tenantId: string,
): Promise<CaptchaOverrideResult> {
  const guard = await deps.guard();
  if (!guard.ok) return guard;
  if (typeof tenantId !== "string" || !UUID.test(tenantId)) {
    return { ok: false, error: "Invalid workspace." };
  }
  // The platform hub's own row IS the platform default; it has its own Clear.
  const hub = await deps.platformTenantId();
  if (hub && hub === tenantId) {
    return { ok: false, error: "That is the platform default itself." };
  }
  const done = await deps.disconnect(tenantId, guard.actorId);
  if (!done) return { ok: false, error: "Could not switch to the platform default." };
  deps.onDone();
  return { ok: true };
}
