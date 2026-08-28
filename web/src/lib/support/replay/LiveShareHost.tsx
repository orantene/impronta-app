"use client";

import { useEffect, useRef, useState } from "react";
import { acceptLiveViewAction, stopLiveViewAction } from "./live-actions";
import { startLiveTransport, stopLiveTransport, subscribeLiveGuidance } from "./live-client";
import { isReplayBufferRunning, startReplayBuffer, stopReplayBuffer } from "./recorder";
import { persistLiveReplay } from "./upload-replay";
import { LiveGuidanceOverlay, LiveSharePill } from "./LiveShareChrome";

const EVENT = "tulala-support-live";

export function requestLocalLiveShare(sessionId: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { sessionId } }));
}

export function LiveShareHost() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ xPct: number; yPct: number } | null>(null);
  const [ring, setRing] = useState<{ xPct: number; yPct: number } | null>(null);
  const [ink, setInk] = useState<Array<{ xPct: number; yPct: number }> | null>(null);
  const startedForLive = useRef(false);
  const tearingDown = useRef(false);

  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      if (id) setSessionId(id);
    };
    window.addEventListener(EVENT, onStart);
    return () => window.removeEventListener(EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    tearingDown.current = false;
    if (!isReplayBufferRunning()) {
      startReplayBuffer();
      startedForLive.current = true;
    }
    void startLiveTransport(sessionId);
    const unsub = subscribeLiveGuidance(sessionId, {
      pointer: (p) => setPointer(p),
      highlight: (p) => {
        if (typeof p.xPct === "number" && typeof p.yPct === "number") setRing({ xPct: p.xPct, yPct: p.yPct });
      },
      draw: (p) => {
        setInk(p.path ?? null);
        window.setTimeout(() => setInk(null), 6000);
      },
    });
    const endLive = async () => {
      if (tearingDown.current) return;
      tearingDown.current = true;
      await stopLiveTransport();
      await persistLiveReplay(sessionId);
      await stopLiveViewAction({ sessionId });
      if (startedForLive.current) {
        stopReplayBuffer();
        startedForLive.current = false;
      }
    };
    return () => {
      unsub();
      void endLive();
    };
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <>
      <LiveSharePill
        onStop={() => {
          void (async () => {
            if (tearingDown.current) {
              setSessionId(null);
              return;
            }
            tearingDown.current = true;
            await stopLiveTransport();
            await persistLiveReplay(sessionId);
            await stopLiveViewAction({ sessionId });
            if (startedForLive.current) {
              stopReplayBuffer();
              startedForLive.current = false;
            }
            setSessionId(null);
          })();
        }}
      />
      <LiveGuidanceOverlay pointer={pointer} ring={ring} ink={ink} />
    </>
  );
}

export async function acceptLiveShareFromCard(ticketId: string): Promise<void> {
  const r = await acceptLiveViewAction({ ticketId });
  if (r.ok) requestLocalLiveShare(r.sessionId);
}
