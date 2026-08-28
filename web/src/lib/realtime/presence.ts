"use client";

/**
 * useThreadPresence — ephemeral typing indicators over a Supabase Realtime
 * broadcast channel. No DB tables involved; nothing is persisted.
 *
 * Shared CONTRACT (consumed by the message shells):
 *   useThreadPresence({ channelKey, userId, displayName })
 *     -> { typingUsers, setTyping }
 *
 * Behaviour:
 *   • One broadcast channel per `channelKey`. Pass `null` to disable (the hook
 *     becomes a safe no-op — e.g. when no thread is selected, or Supabase env
 *     is missing).
 *   • `setTyping(true)` broadcasts a debounced "typing" beat; a peer is
 *     auto-cleared from `typingUsers` after ~4s of silence. `setTyping(false)`
 *     broadcasts an immediate "stopped".
 *   • `typingUsers` EXCLUDES the local `userId`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type TypingUser = { id: string; name: string };
export type PresencePeer = { id: string; name: string; role: string };

type PresenceArgs = {
  channelKey: string | null;
  userId: string;
  displayName: string;
  role?: string;
};

const TYPING_EVENT = "typing";
const IDLE_TIMEOUT_MS = 4000;
const BROADCAST_THROTTLE_MS = 1500;

type Payload = { id: string; name: string; typing: boolean };

export function useThreadPresence(args: PresenceArgs): {
  typingUsers: TypingUser[];
  setTyping: (isTyping: boolean) => void;
  peers: PresencePeer[];
} {
  const { channelKey, userId, displayName, role = "peer" } = args;

  const [typingMap, setTypingMap] = useState<Map<string, TypingUser>>(
    () => new Map(),
  );
  const [peers, setPeers] = useState<PresencePeer[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  // Per-peer expiry timers, so a silent peer auto-clears after IDLE_TIMEOUT_MS.
  const peerTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Local "I stopped typing" debounce.
  const selfIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPeerTimer = useCallback((id: string) => {
    const t = peerTimersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      peerTimersRef.current.delete(id);
    }
  }, []);

  // Subscribe / teardown on channelKey change.
  useEffect(() => {
    setTypingMap(new Map());
    const timers = peerTimersRef.current;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();

    if (!channelKey) return;
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase.channel(`tulala.presence.${channelKey}`, {
      config: { broadcast: { self: false }, presence: { key: userId } },
    });

    channel.on("broadcast", { event: TYPING_EVENT }, (msg) => {
      const payload = (msg?.payload ?? {}) as Partial<Payload>;
      const id = typeof payload.id === "string" ? payload.id : "";
      if (!id || id === userId) return; // never show ourselves
      const name = typeof payload.name === "string" ? payload.name : "Someone";

      if (payload.typing === false) {
        clearPeerTimer(id);
        setTypingMap((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        return;
      }

      setTypingMap((prev) => {
        const next = new Map(prev);
        next.set(id, { id, name });
        return next;
      });
      // (Re)arm this peer's idle expiry.
      clearPeerTimer(id);
      const timer = setTimeout(() => {
        peerTimersRef.current.delete(id);
        setTypingMap((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }, IDLE_TIMEOUT_MS);
      peerTimersRef.current.set(id, timer);
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ userId?: string; displayName?: string; role?: string }>
      >;
      const next: PresencePeer[] = [];
      for (const metas of Object.values(state)) {
        for (const meta of metas) {
          const id = typeof meta.userId === "string" ? meta.userId : "";
          if (!id || id === userId) continue;
          next.push({
            id,
            name: typeof meta.displayName === "string" ? meta.displayName : "Someone",
            role: typeof meta.role === "string" ? meta.role : "peer",
          });
        }
      }
      setPeers(next);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ userId, displayName: displayName || "Someone", role });
      }
    });
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      setPeers([]);
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      if (selfIdleTimerRef.current) {
        clearTimeout(selfIdleTimerRef.current);
        selfIdleTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [channelKey, userId, displayName, role, clearPeerTimer]);

  const broadcast = useCallback(
    (typing: boolean) => {
      const channel = channelRef.current;
      if (!channel) return;
      void channel.send({
        type: "broadcast",
        event: TYPING_EVENT,
        payload: { id: userId, name: displayName || "Someone", typing } as Payload,
      });
    },
    [userId, displayName],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current) return;

      if (!isTyping) {
        if (selfIdleTimerRef.current) {
          clearTimeout(selfIdleTimerRef.current);
          selfIdleTimerRef.current = null;
        }
        broadcast(false);
        return;
      }

      // Throttle the "typing" beats so we don't flood the channel per keystroke.
      const now = Date.now();
      if (now - lastBroadcastRef.current >= BROADCAST_THROTTLE_MS) {
        lastBroadcastRef.current = now;
        broadcast(true);
      }

      // Auto-send "stopped" after the local user goes idle.
      if (selfIdleTimerRef.current) clearTimeout(selfIdleTimerRef.current);
      selfIdleTimerRef.current = setTimeout(() => {
        selfIdleTimerRef.current = null;
        broadcast(false);
      }, IDLE_TIMEOUT_MS);
    },
    [broadcast],
  );

  const typingUsers = useMemo(() => Array.from(typingMap.values()), [typingMap]);

  return { typingUsers, setTyping, peers };
}
