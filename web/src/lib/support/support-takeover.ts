/**
 * TUL-661: "Tomar el ticket". A takeover is stored on the ticket metadata so it
 * survives reloads and is readable on both sides. While it is set the AI never
 * answers on the ticket (checked server-side in the support-chat route).
 */
export type Takeover = { userId: string; name: string; at: string };

export function readTakeover(metadata: Record<string, unknown> | null | undefined): Takeover | null {
  const raw = metadata?.taken_over;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const userId = typeof r.user_id === "string" ? r.user_id : "";
  if (!userId) return null;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Tulala Support";
  return { userId, name, at: typeof r.at === "string" ? r.at : "" };
}

export function withTakeover(
  metadata: Record<string, unknown> | null | undefined,
  takeover: Takeover,
): Record<string, unknown> {
  return { ...(metadata ?? {}), taken_over: { user_id: takeover.userId, name: takeover.name, at: takeover.at } };
}
