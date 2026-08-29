"use client";

/**
 * Business-only staff and resources. Server enforces workspace_type=business.
 * Lives OUTSIDE components/admin/shell.
 */

import { useEffect, useState, useTransition } from "react";
import {
  archiveStaffResource,
  createStaffResource,
  listStaffResources,
  type StaffResource,
} from "@/lib/server-actions/staff-resources";
import { useT } from "@/i18n/use-t";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  error: "#dc2626",
  success: "#16a34a",
} as const;
const FONT = '"Inter", system-ui, sans-serif';
const K = "dashboard.adminWorkspace.appointments";

export function StaffResourcesCard() {
  const t = useT();
  const [resources, setResources] = useState<StaffResource[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    listStaffResources().then((res) => {
      if (res.ok) setResources(res.resources);
      else setError(res.error);
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await createStaffResource(trimmed);
      setSaving(false);
      if (res.ok) {
        setResources((cur) => [...cur, res.resource]);
        setName("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      data-testid="staff-resources-card"
      style={{
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONT,
        borderRadius: 10,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t(`${K}.staffTitle`)}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{t(`${K}.staffDesc`)}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          aria-label={t(`${K}.staffName`)}
          placeholder={t(`${K}.staffName`)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          disabled={saving}
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: FONT,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "6px 10px",
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={saving || !name.trim()}
          style={{
            fontSize: 13,
            fontFamily: FONT,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "6px 12px",
            background: "#fff",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {t(`${K}.staffAdd`)}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: C.inkMuted }}>{t(`${K}.loading`)}</div>
      ) : resources.length === 0 ? (
        <div style={{ fontSize: 12, color: C.inkMuted }}>{t(`${K}.staffEmpty`)}</div>
      ) : (
        resources.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderTop: `1px solid ${C.borderSoft}`,
              fontSize: 13,
              color: C.ink,
            }}
          >
            <span>{row.name}</span>
            <button
              type="button"
              onClick={() => {
                startTransition(async () => {
                  const res = await archiveStaffResource(row.id);
                  if (res.ok) setResources((cur) => cur.filter((r) => r.id !== row.id));
                  else setError(res.error);
                });
              }}
              style={{
                fontSize: 12,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: C.inkMuted,
                fontFamily: FONT,
              }}
            >
              {t(`${K}.staffRemove`)}
            </button>
          </div>
        ))
      )}
      {error && <div style={{ fontSize: 11, color: C.error, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
