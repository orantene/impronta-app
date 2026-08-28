"use client";

import { createClient } from "@/lib/supabase/client";
import { snapshotReplayBuffer, takeReplayCheckpoint } from "./recorder";
import { replayChannelName, type LiveReplayMessage } from "./transport";

type Channel = ReturnType<NonNullable<ReturnType<typeof createClient>>["channel"]>;

let channel: Channel | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let lastSentSeq = -1;
let liveSessionId: string | null = null;

export function getLiveSessionId(): string | null {
  return liveSessionId;
}

export async function startLiveTransport(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  if (!supabase) return false;
  await stopLiveTransport();
  liveSessionId = sessionId;
  seq = 0;
  lastSentSeq = -1;
  const ch = supabase.channel(replayChannelName(sessionId), {
    config: { broadcast: { ack: false } },
  });
  ch.on("broadcast", { event: "viewer.request_snapshot" }, () => {
    takeReplayCheckpoint();
    void flushLive();
  });
  await new Promise<void>((resolve) => {
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve();
    });
  });
  channel = ch;
  flushTimer = setInterval(() => void flushLive(), 500);
  return true;
}

async function flushLive(): Promise<void> {
  if (!channel || !liveSessionId) return;
  const chunks = snapshotReplayBuffer();
  const pending = chunks.filter((c) => c.seq > lastSentSeq);
  if (pending.length === 0) return;
  let packed = "";
  const fromTs = pending[0]!.fromTs;
  let toTs = pending[0]!.toTs;
  for (const c of pending) {
    if (packed.length + c.packed.length > 200_000 && packed.length > 0) break;
    packed = packed ? `${packed}\n${c.packed}` : c.packed;
    toTs = c.toTs;
    lastSentSeq = c.seq;
  }
  const msg: LiveReplayMessage = {
    seq,
    sessionId: liveSessionId,
    packedEvents: packed,
    fromTs,
    toTs,
  };
  seq += 1;
  await channel.send({ type: "broadcast", event: "batch", payload: msg });
}

export async function stopLiveTransport(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (channel) {
    await channel.unsubscribe();
    channel = null;
  }
  liveSessionId = null;
}

export function subscribeLiveViewer(
  sessionId: string,
  onBatch: (msg: LiveReplayMessage) => void,
): () => void {
  const supabase = createClient();
  if (!supabase) return () => undefined;
  const ch = supabase.channel(replayChannelName(sessionId), {
    config: { broadcast: { ack: false } },
  });
  ch.on("broadcast", { event: "batch" }, (e) => {
    const p = e.payload as LiveReplayMessage;
    if (p && typeof p.packedEvents === "string") onBatch(p);
  });
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void ch.send({ type: "broadcast", event: "viewer.request_snapshot", payload: {} });
    }
  });
  return () => {
    void ch.unsubscribe();
  };
}

export function sendLiveGuidance(
  sessionId: string,
  event: "support.pointer" | "support.highlight" | "support.draw",
  payload: Record<string, unknown>,
): void {
  const supabase = createClient();
  if (!supabase) return;
  const ch = supabase.channel(replayChannelName(sessionId));
  void ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void ch.send({ type: "broadcast", event, payload });
      void ch.unsubscribe();
    }
  });
}

export function subscribeLiveGuidance(
  sessionId: string,
  handlers: {
    pointer?: (p: { xPct: number; yPct: number }) => void;
    highlight?: (p: { rrNodeId?: number; xPct?: number; yPct?: number }) => void;
    draw?: (p: { path: Array<{ xPct: number; yPct: number }>; color?: string }) => void;
  },
): () => void {
  const supabase = createClient();
  if (!supabase) return () => undefined;
  const ch = supabase.channel(replayChannelName(sessionId));
  ch.on("broadcast", { event: "support.pointer" }, (e) => {
    const p = e.payload as { xPct?: number; yPct?: number };
    if (typeof p.xPct === "number" && typeof p.yPct === "number") handlers.pointer?.(p as { xPct: number; yPct: number });
  });
  ch.on("broadcast", { event: "support.highlight" }, (e) => {
    handlers.highlight?.(e.payload as { rrNodeId?: number; xPct?: number; yPct?: number });
  });
  ch.on("broadcast", { event: "support.draw" }, (e) => {
    handlers.draw?.(e.payload as { path: Array<{ xPct: number; yPct: number }>; color?: string });
  });
  ch.subscribe();
  return () => {
    void ch.unsubscribe();
  };
}
