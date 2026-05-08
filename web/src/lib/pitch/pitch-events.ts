/**
 * Append-only emitter for pitch_events.
 *
 * Best-effort: failure to write an event must NEVER abort the parent action.
 * Caller wraps in try/catch via the helper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PitchEventActorRole,
  PitchEventType,
} from "./pitch-types";

export type EmitPitchEventArgs = {
  tenantId: string;
  pitchId: string;
  eventType: PitchEventType | string;
  actorUserId?: string | null;
  actorRole?: PitchEventActorRole;
  payload?: Record<string, unknown>;
};

export async function emitPitchEvent(
  supabase: SupabaseClient,
  args: EmitPitchEventArgs,
): Promise<void> {
  try {
    await supabase.from("pitch_events").insert({
      tenant_id: args.tenantId,
      pitch_id: args.pitchId,
      event_type: args.eventType,
      actor_user_id: args.actorUserId ?? null,
      actor_role: args.actorRole ?? "system",
      payload: args.payload ?? {},
    });
  } catch {
    // Swallow — event emission must not crash the parent action.
    // Server-side observability picks up the failure via Supabase logs.
  }
}
