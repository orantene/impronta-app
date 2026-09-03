"use client";

/**
 * Rooms, tables and groups — without drawing anything.
 *
 * THE EXIT PROOF IS THE DESIGN. "A restaurant defines four two-tops and six
 * four-tops in under two minutes." Adding tables one at a time cannot meet that
 * and a floor plan certainly cannot, so the primitive here is a single sentence
 * with four blanks: add [4] tables seating [1] to [2], called [Two-tops]. One
 * submit creates the tables, bands them, and binds the capacity.
 *
 * The floor plan is S4 and it is an UPGRADE, never a prerequisite. Everything a
 * consumer needs — Reservations booking against a band — works from this screen
 * alone, which is the whole reason the area is sliced this way.
 *
 * Lives OUTSIDE components/admin/shell (inline-style ratchet).
 */

import { useEffect, useState, useTransition } from "react";
import {
  addRoomAction,
  addTablesAction,
  loadSpacesSnapshot,
  type SpacesSnapshot,
} from "@/lib/server-actions/spaces-editor";
import { useT } from "@/i18n/use-t";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface: "rgba(24,24,27,0.03)",
  error: "#dc2626",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const K = "dashboard.adminWorkspace.venue";

export function SpacesEditor({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [snapshot, setSnapshot] = useState<SpacesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [pending, startTransition] = useTransition();

  // The bulk-add sentence, one set of blanks shared by every room.
  const [targetRoomId, setTargetRoomId] = useState<string>("");
  const [count, setCount] = useState(4);
  const [partyMin, setPartyMin] = useState(1);
  const [partyMax, setPartyMax] = useState(2);
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadSpacesSnapshot(tenantSlug)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setSnapshot(res.snapshot);
        else setError(res.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const rooms = (snapshot?.spaces ?? []).filter((s) => s.kind === "room");
  const tablesByRoom = new Map<string, number>();
  for (const s of snapshot?.spaces ?? []) {
    if (s.kind === "table" && s.parent_id) {
      tablesByRoom.set(s.parent_id, (tablesByRoom.get(s.parent_id) ?? 0) + 1);
    }
  }

  function apply(run: () => Promise<{ ok: boolean; snapshot?: SpacesSnapshot; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await run();
      if (res.ok && res.snapshot) setSnapshot(res.snapshot);
      else setError(res.error ?? "Something went wrong.");
    });
  }

  if (loading) {
    return (
      <div style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, padding: "8px 0" }}>
        {t(`${K}.loading`)}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 18 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>
          {t(`${K}.roomsTitle`)}
        </h4>
        <p style={{ margin: 0, fontSize: 12.5, color: C.inkMuted }}>{t(`${K}.roomsHint`)}</p>

        {rooms.length === 0 ? (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.inkMuted }}>
            {t(`${K}.noRoomsYet`)}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {rooms.map((room) => (
              <li
                key={room.id}
                style={{
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>{room.name}</span>
                <span style={{ color: C.inkMuted }}>
                  {tablesByRoom.get(room.id) ?? 0} {t(`${K}.tablesWord`)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={roomName}
            placeholder={t(`${K}.roomNamePlaceholder`)}
            onChange={(e) => setRoomName(e.target.value)}
            style={{ ...inputStyle, maxWidth: 240 }}
          />
          <button
            type="button"
            disabled={pending || !roomName.trim()}
            onClick={() =>
              apply(async () => {
                const res = await addRoomAction(tenantSlug, roomName);
                if (res.ok) setRoomName("");
                return res;
              })
            }
            style={buttonStyle(pending || !roomName.trim())}
          >
            {t(`${K}.addRoom`)}
          </button>
        </div>
      </section>

      {rooms.length > 0 ? (
        <section
          style={{
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>
            {t(`${K}.addTablesTitle`)}
          </h4>
          <p style={{ margin: 0, fontSize: 12.5, color: C.inkMuted }}>
            {t(`${K}.addTablesHint`)}
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span>{t(`${K}.addWord`)}</span>
            <input
              type="number"
              min={1}
              max={60}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ ...inputStyle, width: 72 }}
            />
            <span>{t(`${K}.tablesSeatingWord`)}</span>
            <input
              type="number"
              min={1}
              value={partyMin}
              onChange={(e) => setPartyMin(Number(e.target.value))}
              style={{ ...inputStyle, width: 64 }}
            />
            <span>{t(`${K}.toWord`)}</span>
            <input
              type="number"
              min={1}
              value={partyMax}
              onChange={(e) => setPartyMax(Number(e.target.value))}
              style={{ ...inputStyle, width: 64 }}
            />
            <span>{t(`${K}.inWord`)}</span>
            <select
              value={targetRoomId || rooms[0]?.id || ""}
              onChange={(e) => setTargetRoomId(e.target.value)}
              style={{ ...inputStyle, width: "auto", minWidth: 140 }}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <span>{t(`${K}.calledWord`)}</span>
            <input
              type="text"
              value={groupName}
              placeholder={t(`${K}.groupPlaceholder`)}
              onChange={(e) => setGroupName(e.target.value)}
              style={{ ...inputStyle, width: 160 }}
            />
            <button
              type="button"
              disabled={pending || !groupName.trim()}
              onClick={() =>
                apply(async () => {
                  const res = await addTablesAction(tenantSlug, {
                    roomId: targetRoomId || rooms[0]?.id || "",
                    count,
                    partyMin,
                    partyMax,
                    codePrefix: "T",
                    groupName,
                  });
                  if (res.ok) setGroupName("");
                  return res;
                })
              }
              style={buttonStyle(pending || !groupName.trim())}
            >
              {pending ? t(`${K}.saving`) : t(`${K}.addTables`)}
            </button>
          </div>
        </section>
      ) : null}

      {(snapshot?.groups.length ?? 0) > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.ink }}>
            {t(`${K}.groupsTitle`)}
          </h4>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {snapshot?.groups.map((g) => (
              <li
                key={g.id}
                style={{
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>{g.name}</span>
                <span style={{ color: C.inkMuted }}>
                  {g.member_count} {t(`${K}.tablesWord`)} · {t(`${K}.partiesOf`)} {g.party_min}
                  {"–"}
                  {g.party_max}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <div style={{ fontSize: 13, color: C.error }}>{error}</div> : null}
    </div>
  );
}

const inputStyle = {
  minWidth: 0,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: FONT,
  color: C.ink,
  background: "#fff",
} as const;

function buttonStyle(disabled: boolean) {
  return {
    background: C.ink,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  } as const;
}
