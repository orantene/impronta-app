"use client";
import { improntaLog } from "@/lib/server/structured-log";

// ============================================================================
// location-slot-panel.tsx — Canonical Service-Area editor (real-tenant, V1)
//
// Writes the canonical talent_service_areas (home_base + travel_to) that
// search-talent / AI / the destinations cache read — via the same
// saveTalentServiceAreas server action the full-page editor now uses
// (one source of truth). Same proven race-safe pattern as the Language
// panel: one authoritative desired-state ref, optimistic before await,
// monotonic sequence guard, stale-ignore, server-truth reconcile, no
// reload, [serviceAreas-ui] logs. Curated location picker uses the
// existing /api/location-countries + /api/location-cities endpoints
// (curated locations.id — NOT free text, NOT raw Google place id).
// remote_only stays a scalar; travel radius/fee reflected on the rows.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTalentServiceAreasForTalent,
  saveTalentServiceAreas,
} from "@/lib/server-actions/admin-talent-service-areas";

import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, T } from "./skill-tokens";

type City = { id: string; name: string };
export type ServiceAreaDesired = {
  homeBase: City | null;
  travelTo: City[];
  travelRadiusKm: number;
  travelFeeRequired: boolean;
  remoteOnly: boolean;
};

type Desired = ServiceAreaDesired;

function emptyDesired(): Desired {
  return {
    homeBase: null,
    travelTo: [],
    travelRadiusKm: 50,
    travelFeeRequired: false,
    remoteOnly: false,
  };
}

// ─── Single-input curated city autocomplete (global, no country step) ──────
// Type a city → curated suggestions (city + country) → pick → onPick. Clears
// after pick so multi-add is type→pick→type→pick. Curated locations.id only.
function CityAutocomplete({
  placeholder,
  onPick,
}: {
  placeholder: string;
  onPick: (city: City) => void;
}) {
  const copy = useDashboardText();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState<
    Array<{ id: string; name: string; sub: string }>
  >([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const closeList = () => {
    setOpen(false);
    setOpts([]);
    setLoading(false);
  };

  // Only search when there's a query AND the list is open. Empty query =>
  // nothing fetched, nothing shown (kills the "everything appears a few
  // seconds later" surprise). Late results are dropped via `off` on any
  // q/open change, so a stale delayed response can't reopen the list.
  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 1) {
      setOpts([]);
      setLoading(false);
      return;
    }
    let off = false;
    setLoading(true);
    const h = setTimeout(() => {
      void improntaLog("admin_location_slot_panel.info", {
        message: `[serviceAreas-ui] search query="${query}"`,
      });
      fetch(`/api/location-cities?query=${encodeURIComponent(query)}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then(
          (d: {
            cities?: Array<{
              id: string | null;
              name_en: string;
              country_name_en?: string;
              country_iso2?: string;
            }>;
          }) => {
            if (off) return;
            const mapped = (d.cities ?? [])
              .filter((c) => !!c.id)
              .map((c) => ({
                id: c.id as string,
                name: c.name_en,
                sub: c.country_name_en || c.country_iso2 || "",
              }));
            void improntaLog("admin_location_slot_panel.info", {
              message: `[serviceAreas-ui] search results count=${mapped.length}`,
            });
            setOpts(mapped);
          },
        )
        .catch(() => !off && setOpts([]))
        .finally(() => !off && setLoading(false));
    }, 200);
    return () => {
      off = true;
      clearTimeout(h);
    };
  }, [q, open]);

  // Click-outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        closeList();
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  // Results render IN-FLOW (not an absolute dropdown): an absolutely
  // positioned overlay was clipped/unclickable inside the drawer's
  // scroll container, so selection never fired. In-flow can't be clipped.
  const showList = open && q.trim().length >= 1;
  return (
    <div ref={boxRef}>
      <div className="relative">
        <input
          value={q}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closeList();
            }
          }}
          style={{ ...inputCss, paddingRight: q ? 30 : undefined }}
        />
        {q && (
          <button
            type="button"
            aria-label={copy.t("Clear")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQ("");
              closeList();
            }}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              color: T.inkMuted,
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        )}
      </div>
      {showList && (
        <div
          style={{
            marginTop: 4,
            maxHeight: 240,
            overflowY: "auto",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: 6,
          }}
        >
          {loading && (
            <div style={{ padding: 10, color: T.inkMuted, fontSize: 12 }}>
              {copy.t("Searching…")}
            </div>
          )}
          {!loading && opts.length === 0 && (
            <div style={{ padding: 10, color: T.inkMuted, fontSize: 12 }}>
              {copy.t("City not in the supported list yet.")}
            </div>
          )}
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                void improntaLog("admin_location_slot_panel.info", {
                  message: `[serviceAreas-ui] pick city label="${o.name}" id=${o.id}`,
                });
                onPick({ id: o.id, name: o.name });
                setQ("");
                closeList();
              }}
              style={rowBtnCss}
            >
              <span className="font-semibold">{o.name}</span>
              {o.sub ? (
                <span style={{ color: T.inkMuted }}> · {o.sub}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputCss: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: F_BODY, boxSizing: "border-box", outline: "none" };
const rowBtnCss: React.CSSProperties = { width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 3, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, cursor: "pointer", fontFamily: F_BODY, fontSize: 13 };
const chipCss: React.CSSProperties = { padding: "6px 12px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surface, color: T.inkMuted, fontSize: 12, fontWeight: 600, fontFamily: F_BODY };

export function LocationSlotPanel({
  talentProfileId,
  persistMode = "immediate",
  onHydrated,
  onDesiredChange,
}: {
  talentProfileId: string;
  /** `deferred` — update parent state only; persist on profile shell Save. */
  persistMode?: "immediate" | "deferred";
  /** Fires once when server rows are loaded (does not mark dirty). */
  onHydrated?: (value: ServiceAreaDesired) => void;
  /** Fires on user edits when `persistMode` is `deferred`. */
  onDesiredChange?: (value: ServiceAreaDesired) => void;
}) {
  const copy = useDashboardText();
  const [desired, setDesired] = useState<Desired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const desiredRef = useRef<Desired | null>(null);
  const seqRef = useRef(0);
  useEffect(() => { desiredRef.current = desired; }, [desired]);

  useEffect(() => {
    void improntaLog("admin_location_slot_panel.info", {
      message: `[serviceAreas-ui] LocationSlotPanel mounted talent=${talentProfileId}`,
    });
    let off = false;
    getTalentServiceAreasForTalent({ talent_profile_id: talentProfileId }).then((res) => {
      if (off) return;
      if (!res.ok) { setError(res.error); setDesired(emptyDesired()); return; }
      const home = res.rows.find((r) => r.service_kind === "home_base") ?? null;
      const travel = res.rows.filter((r) => r.service_kind === "travel_to");
      const loaded: ServiceAreaDesired = {
        homeBase: home ? { id: home.location_id, name: home.city } : null,
        travelTo: travel.map((r) => ({ id: r.location_id, name: r.city })),
        // Radius/fee live on the home_base row, but also mirror to the
        // talent_profiles scalar — fall back to the scalar so they
        // round-trip even before a home base is set.
        travelRadiusKm: home?.travel_radius_km ?? res.travel_radius_km ?? 50,
        travelFeeRequired:
          home?.travel_fee_required ?? res.travel_fee_required ?? false,
        remoteOnly: res.remote_only,
      };
      setDesired(loaded);
      onHydrated?.(loaded);
    });
    return () => { off = true; };
  }, [talentProfileId]);

  const commit = useCallback(
    async (next: Desired, label: string) => {
      const seq = ++seqRef.current;
      const reqId = `sa-${seq}`;
      const rollback = desiredRef.current;
      desiredRef.current = next;
      setDesired(next);
      if (persistMode === "deferred") {
        onDesiredChange?.(next);
        setError(null);
        return;
      }
      setSaving(true);
      void improntaLog("admin_location_slot_panel.info", {
        message: `[serviceAreas-ui] ${reqId} seq=${seq} ${label} payload home=${next.homeBase?.id ?? "-"} travel=[${next.travelTo.map((c) => c.id).join(",")}] r=${next.travelRadiusKm} fee=${next.travelFeeRequired} remote=${next.remoteOnly}`,
      });
      const res = await saveTalentServiceAreas({
        talent_profile_id: talentProfileId,
        home_base_location_id: next.homeBase?.id ?? null,
        travel_to_location_ids: next.travelTo.map((c) => c.id),
        travel_radius_km: next.travelRadiusKm,
        travel_fee_required: next.travelFeeRequired,
        remote_only: next.remoteOnly,
      });
      setSaving(false);
      if (seq !== seqRef.current) {
        void improntaLog("admin_location_slot_panel.info", {
          message: `[serviceAreas-ui] ${reqId} seq=${seq} IGNORED stale (latest=${seqRef.current}) ok=${res.ok}`,
        });
        return;
      }
      if (!res.ok) {
        desiredRef.current = rollback;
        setDesired(rollback);
        setError(res.error);
        void improntaLog("admin_location_slot_panel.info", {
          message: `[serviceAreas-ui] ${reqId} seq=${seq} APPLIED rollback (${res.error})`,
        });
        return;
      }
      const home = res.rows.find((r) => r.service_kind === "home_base") ?? null;
      const truth: Desired = {
        homeBase: home ? { id: home.location_id, name: home.city } : null,
        travelTo: res.rows.filter((r) => r.service_kind === "travel_to").map((r) => ({ id: r.location_id, name: r.city })),
        travelRadiusKm: home?.travel_radius_km ?? next.travelRadiusKm,
        travelFeeRequired: home?.travel_fee_required ?? next.travelFeeRequired,
        remoteOnly: res.remote_only,
      };
      desiredRef.current = truth;
      setDesired(truth);
      setError(null);
      void improntaLog("admin_location_slot_panel.info", {
        message: `[serviceAreas-ui] ${reqId} seq=${seq} APPLIED server truth rows=${res.rows.length}`,
      });
    },
    [talentProfileId, persistMode, onDesiredChange],
  );

  if (!desired) {
    return <div style={{ color: T.inkMuted, fontSize: 12, padding: 8, fontFamily: F_BODY }}>{copy.t("Loading service areas…")}</div>;
  }

  const d = desired;
  const base = () => desiredRef.current ?? d;

  return (
    <div style={{ fontFamily: F_BODY }}>
      {error && (
        <div style={{ padding: 10, marginBottom: 10, borderRadius: 8, background: T.redSoft, border: `1px solid ${T.red}`, fontSize: 12, color: T.ink }}>{error}</div>
      )}

      <div className="mb-3">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: T.inkMuted, textTransform: "uppercase", marginBottom: 6 }}>{copy.t("Home base")}</div>
        {d.homeBase ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, background: T.surfaceWarm, border: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.ink, opacity: saving ? 0.6 : 1 }}>
            {d.homeBase.name}
            <button type="button" onClick={() => commit({ ...base(), homeBase: null }, "home-clear")} title={copy.t("Clear home base")} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 14, lineHeight: 1, fontWeight: 700 }}>×</button>
          </span>
        ) : (
          <CityAutocomplete
            placeholder={copy.t("Type a city…")}
            onPick={(c) => {
              void improntaLog("admin_location_slot_panel.info", {
                message: `[serviceAreas-ui] home base selected id=${c.id}`,
              });
              commit({ ...base(), homeBase: c }, "home-set");
            }}
          />
        )}
      </div>

      <div className="mb-3">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: T.inkMuted, textTransform: "uppercase", marginBottom: 6 }}>{copy.t("Also serves")}</div>
        {d.travelTo.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {d.travelTo.map((c) => (
              <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: T.surfaceWarm, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, color: T.ink, opacity: saving ? 0.6 : 1 }}>
                {c.name}
                <button type="button" onClick={() => commit({ ...base(), travelTo: base().travelTo.filter((x) => x.id !== c.id) }, "city-remove")} title={copy.t("Remove city")} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 13, lineHeight: 1, fontWeight: 700 }}>×</button>
              </span>
            ))}
          </div>
        )}
        <CityAutocomplete
          placeholder={copy.t("Add a city…")}
          onPick={(c) => {
            void improntaLog("admin_location_slot_panel.info", {
              message: `[serviceAreas-ui] service city selected id=${c.id}`,
            });
            const b = base();
            if (b.homeBase?.id === c.id || b.travelTo.some((x) => x.id === c.id)) return;
            commit({ ...b, travelTo: [...b.travelTo, c] }, "city-add");
          }}
        />
      </div>

      <div className="mb-2.5">
        <div style={{ fontSize: 12, color: T.ink, marginBottom: 4 }}>
          {copy.t("Travel radius")} — {d.travelRadiusKm >= 999 ? copy.t("Anywhere") : `${d.travelRadiusKm} km`}
        </div>
        <input
          type="range" min={10} max={999} step={10} value={d.travelRadiusKm}
          onChange={(e) => {
            const km = Number(e.target.value);
            const next = { ...(desiredRef.current ?? d), travelRadiusKm: km };
            desiredRef.current = next; // sync ref so commit sends the dragged value
            setDesired(next);
          }}
          onMouseUp={() => commit(desiredRef.current ?? d, "radius")}
          onTouchEnd={() => commit(desiredRef.current ?? d, "radius")}
          style={{ width: "100%", accentColor: T.accent }}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.ink, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={d.travelFeeRequired} onChange={(e) => commit({ ...base(), travelFeeRequired: e.target.checked }, "fee")} />
        {copy.t("Charge a travel fee outside the home area")}
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.ink, cursor: "pointer" }}>
        <input type="checkbox" checked={d.remoteOnly} onChange={(e) => commit({ ...base(), remoteOnly: e.target.checked }, "remote")} />
        {copy.t("Works remotely / online only")}
      </label>

    </div>
  );
}
