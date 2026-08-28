"use client";

import { useEffect, useRef, useState } from "react";
import { unpack } from "@rrweb/packer/unpack";
import type { eventWithTime } from "@rrweb/types";
import rrwebPlayer from "rrweb-player";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import {
  hqListReplaySessionsAction,
  hqViewReplayAction,
} from "@/lib/support/replay/replay-actions";

export function TicketReplayPanel({ ticketId }: { ticketId: string }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ pause?: () => void } | null>(null);
  const [sessions, setSessions] = useState<
    Array<{ id: string; kind: string; status: string; durationMs: number | null; createdAt: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hqListReplaySessionsAction({ ticketId }).then((r) => {
      if (r.ok) setSessions(r.sessions);
    });
    return () => {
      playerRef.current?.pause?.();
      playerRef.current = null;
    };
  }, [ticketId]);

  const play = async (sessionId: string) => {
    setError(null);
    const view = await hqViewReplayAction({ sessionId });
    if (!view.ok) {
      setError(view.error);
      return;
    }
    const events: eventWithTime[] = [];
    for (const url of view.urls) {
      const text = await (await fetch(url)).text();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          events.push(unpack(line) as eventWithTime);
        } catch {
          try {
            events.push(JSON.parse(line) as eventWithTime);
          } catch {
            /* skip */
          }
        }
      }
    }
    if (!hostRef.current || events.length === 0) {
      setError(t("dashboard.platform.support.replayEmpty"));
      return;
    }
    hostRef.current.innerHTML = "";
    playerRef.current = new rrwebPlayer({
      target: hostRef.current,
      props: { events, width: 640, height: 400, autoPlay: false, showController: true },
    });
  };

  return (
    <div style={{ padding: 16, color: HQ.ink, overflow: "auto", height: "100%" }}>
      {sessions.length === 0 ? (
        <div style={{ fontSize: 13, color: HQ.inkDim }}>{t("dashboard.platform.support.noReplay")}</div>
      ) : (
        sessions.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12 }}>
              {s.kind} · {s.status}
            </span>
            <button
              type="button"
              disabled={s.status !== "uploaded"}
              onClick={() => void play(s.id)}
              style={{
                border: `1px solid ${HQ.border}`,
                background: HQ.card,
                color: HQ.ink,
                borderRadius: 7,
                padding: "4px 8px",
                fontSize: 12,
                cursor: s.status === "uploaded" ? "pointer" : "not-allowed",
              }}
            >
              {t("dashboard.platform.support.playReplay")}
            </button>
          </div>
        ))
      )}
      {error ? <div style={{ color: HQ.red, fontSize: 12, marginTop: 8 }}>{error}</div> : null}
      <div ref={hostRef} style={{ marginTop: 12 }} />
    </div>
  );
}
