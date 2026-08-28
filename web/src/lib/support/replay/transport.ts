/**
 * Replay transport. M5 uses this module for packing/upload helpers.
 * M6 adds Supabase Broadcast on `support.replay.{sessionId}`.
 */

export const REPLAY_BROADCAST_PREFIX = "support.replay.";

export function replayChannelName(sessionId: string): string {
  return `${REPLAY_BROADCAST_PREFIX}${sessionId}`;
}

export type LiveReplayMessage = {
  seq: number;
  sessionId: string;
  packedEvents: string;
  fromTs: number;
  toTs: number;
};
