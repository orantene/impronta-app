"use client";

/**
 * Workspace control for platform + hub exposure.
 *
 * Every talent on a Tulala tenant is listed on Tulala Discover by default. This
 * is where a workspace opts out of that, and — if it stays in — narrows which
 * hubs may list its talents. It is a veto: a talent who has switched themselves
 * off stays off regardless of what is chosen here.
 */

import { useState, useTransition } from "react";
import {
  saveDiscoverExposure,
  type HubOption,
} from "@/lib/server-actions/admin-discover-exposure";
import type { TenantDiscoverExposure } from "@/lib/saas/discover-exposure";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#1A7348",
  danger: "#C82828",
} as const;

export type DiscoverExposureCopy = {
  sectionTitle: string;
  platformLabel: string;
  platformHelp: string;
  optedOutNote: string;
  hubsTitle: string;
  hubsHelp: string;
  allHubs: string;
  chosenHubs: string;
  noHubsYet: string;
  save: string;
  saving: string;
  saved: string;
  refreshNote: string;
};

export function DiscoverExposureControl({
  initial,
  hubs,
  copy,
}: {
  initial: TenantDiscoverExposure;
  hubs: HubOption[];
  copy: DiscoverExposureCopy;
}) {
  const [enabled, setEnabled] = useState(initial.discoverExposureEnabled);
  const [allHubs, setAllHubs] = useState(initial.hubExposureTenantIds === null);
  const [selected, setSelected] = useState<string[]>(initial.hubExposureTenantIds ?? []);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleHub = (id: string) => {
    setStatus("idle");
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const onSave = () => {
    setStatus("idle");
    setError(null);
    startTransition(async () => {
      const res = await saveDiscoverExposure({
        discoverExposureEnabled: enabled,
        hubExposureTenantIds: allHubs ? null : selected,
      });
      if (res.ok) {
        setStatus("saved");
      } else {
        setStatus("error");
        setError(res.error);
      }
    });
  };

  return (
    <div style={{
      background: C.cardBg, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "18px 22px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 12 }}>
        {copy.sectionTitle}
      </div>

      {/* Platform-level opt out */}
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => { setEnabled(e.target.checked); setStatus("idle"); }}
          style={{ marginTop: 3 }}
        />
        <span>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.ink }}>
            {copy.platformLabel}
          </span>
          <span style={{ display: "block", fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 1.5, maxWidth: 620 }}>
            {copy.platformHelp}
          </span>
        </span>
      </label>

      {!enabled && (
        <div style={{
          marginTop: 12, padding: "10px 12px", borderRadius: 8,
          background: "rgba(200,40,40,0.06)", border: "1px solid rgba(200,40,40,0.20)",
          fontSize: 12, color: C.danger, lineHeight: 1.5, maxWidth: 620,
        }}>
          {copy.optedOutNote}
        </div>
      )}

      {/* Hub allow-list — only meaningful while opted in */}
      {enabled && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{copy.hubsTitle}</div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 1.5, maxWidth: 620 }}>
            {copy.hubsHelp}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13, color: C.ink }}>
              <input
                type="radio"
                name="hub-scope"
                checked={allHubs}
                onChange={() => { setAllHubs(true); setStatus("idle"); }}
              />
              {copy.allHubs}
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13, color: C.ink }}>
              <input
                type="radio"
                name="hub-scope"
                checked={!allHubs}
                onChange={() => { setAllHubs(false); setStatus("idle"); }}
              />
              {copy.chosenHubs}
            </label>
          </div>

          {!allHubs && (
            <div style={{ marginTop: 10, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
              {hubs.length === 0 && (
                <div style={{ fontSize: 12, color: C.inkDim }}>{copy.noHubsYet}</div>
              )}
              {hubs.map((h) => (
                <label key={h.id} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13, color: C.ink }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(h.id)}
                    onChange={() => toggleHub(h.id)}
                  />
                  {h.displayName}
                  <span style={{ fontSize: 11, color: C.inkDim }}>/{h.slug}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: C.ink, color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? copy.saving : copy.save}
        </button>
        {status === "saved" && (
          <span style={{ fontSize: 12, color: C.success }}>
            {copy.saved} · {copy.refreshNote}
          </span>
        )}
        {status === "error" && (
          <span style={{ fontSize: 12, color: C.danger }}>{error}</span>
        )}
      </div>
    </div>
  );
}
