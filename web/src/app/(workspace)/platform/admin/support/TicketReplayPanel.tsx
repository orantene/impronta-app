"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { unpack } from "@rrweb/packer/unpack";
import type { eventWithTime } from "@rrweb/types";
import rrwebPlayer from "rrweb-player";
import { useT } from "@/i18n/use-t";
import { HQ } from "../tenants/hq-kit";
import { hqRequestLiveViewAction } from "@/lib/support/replay/live-actions";
import { sendLiveGuidance, subscribeLiveViewer } from "@/lib/support/replay/live-client";
import {
  hqListReplaySessionsAction,
  hqViewReplayAction,
} from "@/lib/support/replay/replay-actions";

type PlayerHandle = {
  pause?: () => void;
  addEvent?: (event: eventWithTime) => void;
};

function unpackLines(text: string): eventWithTime[] {
  const events: eventWithTime[] = [];
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
  return events;
}

export function TicketReplayPanel({ ticketId }: { ticketId: string }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const [sessions, setSessions] = useState<
    Array<{ id: string; kind: string; status: string; durationMs: number | null; createdAt: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"pointer" | "highlight" | "draw">("pointer");
  const drawing = useRef(false);
  const drawPath = useRef<Array<{ xPct: number; yPct: number }>>([]);

  useEffect(() => {
    const load = () =>
      hqListReplaySessionsAction({ ticketId }).then((r) => {
        if (r.ok) setSessions(r.sessions);
      });
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      window.clearInterval(timer);
      playerRef.current?.pause?.();
      playerRef.current = null;
    };
  }, [ticketId]);

  useEffect(() => {
    if (!liveId) return;
    const unsub = subscribeLiveViewer(liveId, (msg) => {
      const events = unpackLines(msg.packedEvents);
      if (!hostRef.current || events.length === 0) return;
      if (!playerRef.current) {
        hostRef.current.innerHTML = "";
        playerRef.current = new rrwebPlayer({
          target: hostRef.current,
          props: { events, width: 640, height: 400, autoPlay: true, showController: true },
        });
        return;
      }
      for (const ev of events) playerRef.current.addEvent?.(ev);
    });
    return unsub;
  }, [liveId]);

  const play = async (sessionId: string) => {
    setError(null);
    const view = await hqViewReplayAction({ sessionId });
    if (!view.ok) {
      setError(view.error);
      return;
    }
    const events: eventWithTime[] = [];
    for (const url of view.urls) events.push(...unpackLines(await (await fetch(url)).text()));
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

  const btn: CSSProperties = {
    border: `1px solid ${HQ.border}`,
    background: HQ.card,
    color: HQ.ink,
    borderRadius: 7,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: 16, color: HQ.ink, overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button" style={btn} onClick={() => void hqRequestLiveViewAction({ ticketId })}>
          {t("dashboard.platform.support.requestLive")}
        </button>
        {([
          { id: "pointer" as const, label: t("dashboard.platform.support.livePointer") },
          { id: "highlight" as const, label: t("dashboard.platform.support.liveHighlight") },
          { id: "draw" as const, label: t("dashboard.platform.support.liveDraw") },
        ]).map((m) => (
          <button
            key={m.id}
            type="button"
            style={{ ...btn, borderColor: mode === m.id ? HQ.green : HQ.border }}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {sessions.length === 0 ? (
        <div style={{ fontSize: 13, color: HQ.inkDim }}>{t("dashboard.platform.support.noReplay")}</div>
      ) : (
        sessions.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12 }}>
              {s.kind} · {s.status}
            </span>
            {s.status === "uploaded" ? (
              <button type="button" style={btn} onClick={() => void play(s.id)}>
                {t("dashboard.platform.support.playReplay")}
              </button>
            ) : null}
            {s.kind === "live" && s.status === "recording" ? (
              <button type="button" style={btn} onClick={() => setLiveId(s.id)}>
                {t("dashboard.platform.support.watchLive")}
              </button>
            ) : null}
          </div>
        ))
      )}
      {error ? <div style={{ color: HQ.red, fontSize: 12, marginTop: 8 }}>{error}</div> : null}
      <div
        ref={hostRef}
        style={{ marginTop: 12 }}
        onMouseMove={(e) => {
          if (!liveId) return;
          const r = e.currentTarget.getBoundingClientRect();
          const xPct = (e.clientX - r.left) / r.width;
          const yPct = (e.clientY - r.top) / r.height;
          if (mode === "pointer") sendLiveGuidance(liveId, "support.pointer", { xPct, yPct });
          if (mode === "draw" && drawing.current) {
            drawPath.current.push({ xPct, yPct });
            sendLiveGuidance(liveId, "support.draw", { path: drawPath.current, color: "#C23A3A" });
          }
        }}
        onMouseDown={(e) => {
          if (!liveId || mode !== "draw") return;
          const r = e.currentTarget.getBoundingClientRect();
          const xPct = (e.clientX - r.left) / r.width;
          const yPct = (e.clientY - r.top) / r.height;
          drawing.current = true;
          drawPath.current = [{ xPct, yPct }];
        }}
        onMouseUp={() => {
          drawing.current = false;
        }}
        onClick={(e) => {
          if (!liveId) return;
          const r = e.currentTarget.getBoundingClientRect();
          const xPct = (e.clientX - r.left) / r.width;
          const yPct = (e.clientY - r.top) / r.height;
          if (mode === "highlight") sendLiveGuidance(liveId, "support.highlight", { xPct, yPct });
        }}
      />
    </div>
  );
}
