/**
 * Gate for every Talent Template Factory server action (pure, testable).
 * Platform admin only; the action body never runs for anyone else.
 */
import { isPlatformAdmin, type ProfileForPlatformRole } from "@/lib/access/platform-role";

export type FactoryResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type FactoryGate = { ok: true; userId: string } | { ok: false; error: string };

export function evaluateFactoryGate(session: {
  user: { id: string } | null;
  profile: ProfileForPlatformRole | null | undefined;
}): FactoryGate {
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Super admin access required." };
  return { ok: true, userId: session.user.id };
}

/** Run `run` only when the gate passes; otherwise return the refusal untouched. */
export async function guardedFactoryRun<T>(
  gate: FactoryGate,
  run: (userId: string) => Promise<FactoryResult<T>>,
): Promise<FactoryResult<T>> {
  if (!gate.ok) return { ok: false, error: gate.error };
  return run(gate.userId);
}
