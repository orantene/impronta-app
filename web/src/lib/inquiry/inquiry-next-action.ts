/**
 * Pure helper for documenting next_action_by transitions.
 * Engine remains source of truth for persisted values.
 */
export type NextActionParty = "coordinator" | "admin" | "client" | "talent" | "system" | null;

export function computeNextActionAfterMessage(fromRole: "staff" | "client"): NextActionParty {
  return fromRole === "client" ? "coordinator" : "client";
}
