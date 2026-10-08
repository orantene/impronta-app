import type { TalentClientRow } from "@/lib/talent/clients-merge";

/**
 * Clients list prefetched on the server render of /talent/clients, handed to
 * the (client-only) shell page so the first paint needs no request after
 * mount. One-shot per talent: refresh, edits and reloads fetch normally.
 */
export type InitialClients =
  | { ok: true; items: TalentClientRow[] }
  | { ok: false; error: string };

let seeded: { talentId: string; result: InitialClients } | null = null;

export function seedInitialClients(talentId: string, result: InitialClients): void {
  seeded = { talentId, result };
}

/** Returns the seed once, and only for the same talent. */
export function takeInitialClients(talentId: string | null): InitialClients | null {
  if (!talentId || !seeded || seeded.talentId !== talentId) return null;
  const { result } = seeded;
  seeded = null;
  return result;
}
