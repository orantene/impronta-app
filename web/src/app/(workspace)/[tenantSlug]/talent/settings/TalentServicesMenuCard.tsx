"use client";

/**
 * TalentServicesMenuCard — the talent's MENU OF SERVICES (Phase B: S4/S5/S17).
 *
 * A repeater: add / edit / reorder / remove services, each priced by a unit
 * (per hour/day/half-day/event/person/session, flat package, or custom quote)
 * with an optional per-service currency. Mirrors CommercialBookingTermsCard's
 * load → optimistic-persist → rollback idiom; edits talent_profiles.services_menu
 * via the focused load/update server actions.
 *
 * Configuration only — no money is charged here. A selected service later
 * pre-fills an offer line / instant-book. Richer per-service controls
 * (discipline scoping, visibility, add-ons, tiers) land in later phases; this
 * card preserves those fields untouched when saving.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadTalentServicesMenu,
  updateTalentServicesMenu,
  type TalentDiscipline,
} from "@/lib/talent/services-menu-actions";
import {
  SERVICE_PRICING_TYPES,
  SERVICE_PRICING_LABELS,
  SERVICE_PRICING_SUFFIX,
  SERVICE_VISIBILITIES,
  pricingTypeRequiresAmount,
  type ServiceMenuItem,
  type ServicePricingType,
  type ServiceVisibility,
  type ServiceAddOn,
  type ServiceTier,
} from "@/lib/talent/services-menu-types";

const VISIBILITY_LABELS: Record<ServiceVisibility, string> = {
  public: "Public — shown on your page",
  agency_only: "Agency only — staff see it, clients don't",
  on_request: "On request — name shown, price hidden",
};
import { DEFAULT_CURRENCY_OPTIONS, CURRENCY_LABELS } from "@/lib/billing/currencies";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.16)",
  surface: "rgba(24,24,27,0.03)",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  error: "#dc2626",
  errorSoft: "#FCA5A5",
  success: "#16a34a",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

function centsToInput(c: number | null): string {
  return c === null ? "" : (c / 100).toString();
}
function inputToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function fmtMoney(cents: number | null, currency: string): string {
  if (cents === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency} ${Math.round(cents / 100)}`;
  }
}

let _seq = 0;
function clientId(): string {
  _seq += 1;
  return `svc_new_${_seq}_${(typeof performance !== "undefined" ? Math.floor(performance.now()) : _seq).toString(36)}`;
}

function blankService(defaultCurrency: string, sortOrder: number): ServiceMenuItem {
  return {
    id: clientId(),
    name: "",
    description: null,
    pricingType: "event",
    amountCents: null,
    currency: defaultCurrency,
    taxonomyTermIds: null,
    addOns: [],
    tiers: [],
    isActive: true,
    visibility: "public",
    sortOrder,
    isInstantBook: false,
    childServiceIds: null,
  };
}

export function TalentServicesMenuCard({ talentId }: { talentId: string }) {
  const [items, setItems] = useState<ServiceMenuItem[]>([]);
  const [disciplines, setDisciplines] = useState<TalentDiscipline[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadTalentServicesMenu(talentId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setItems(res.items);
          setDefaultCurrency(res.defaultCurrency);
          setDisciplines(res.disciplines);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [talentId]);

  function persist(next: ServiceMenuItem[]) {
    const previous = items;
    setItems(next); // optimistic
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateTalentServicesMenu(talentId, next);
      setSaving(false);
      if (res.ok) {
        setItems(res.items);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 1800);
      } else {
        setItems(previous); // rollback
        setError(res.error);
      }
    });
  }

  const patchItem = (id: string, patch: Partial<ServiceMenuItem>) =>
    persist(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const addService = () => persist([...items, blankService(defaultCurrency, items.length)]);
  const removeService = (id: string) => persist(items.filter((it) => it.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((it) => it.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    persist(next.map((it, i) => ({ ...it, sortOrder: i })));
  };

  if (loading) return null;

  const inputStyle = {
    fontSize: 13,
    color: C.ink,
    fontFamily: FONT,
    background: saving ? C.surface : "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "6px 10px",
    outline: "none",
  } as const;
  const labelStyle = { fontSize: 10.5, fontWeight: 600 as const, color: C.inkMuted, letterSpacing: 0.3 };

  return (
    <div
      data-testid="talent-services-menu-card"
      style={{ width: "100%", padding: "16px 16px 18px", marginBottom: 16, borderRadius: 12, background: "#fff", border: `1px solid ${C.borderSoft}`, fontFamily: FONT }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: C.accentSoft, color: C.accentDeep, fontSize: 15 }}>≡</span>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Services &amp; pricing</div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
            Your menu of services — each priced by hour, day, event, person, package, or as a custom quote.
            Clients see these on your page; a selected service pre-fills an offer.
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 10, background: C.surface, border: `1px dashed ${C.border}`, fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
          No services yet. Add your first — e.g. &ldquo;DJ set&rdquo; at a per-hour rate, or a flat-package &ldquo;Full wedding&rdquo;.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {items.map((it, idx) => {
            const needsAmount = pricingTypeRequiresAmount(it.pricingType);
            return (
              <div key={it.id} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: "12px 12px 14px", background: it.isActive ? "#fff" : C.surface }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <input
                    type="text"
                    placeholder="Service name (e.g. DJ set)"
                    defaultValue={it.name}
                    disabled={saving}
                    onBlur={(e) => { if (e.target.value.trim() !== it.name) patchItem(it.id, { name: e.target.value.trim() }); }}
                    style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
                  />
                  <button type="button" aria-label="Move up" disabled={saving || idx === 0} onClick={() => move(it.id, -1)} style={{ ...inputStyle, padding: "6px 8px", cursor: "pointer", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                  <button type="button" aria-label="Move down" disabled={saving || idx === items.length - 1} onClick={() => move(it.id, 1)} style={{ ...inputStyle, padding: "6px 8px", cursor: "pointer", opacity: idx === items.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button type="button" aria-label="Remove service" disabled={saving} onClick={() => removeService(it.id)} style={{ ...inputStyle, padding: "6px 9px", cursor: "pointer", color: C.error, borderColor: C.errorSoft }}>✕</button>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {/* pricing unit (S5) */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 150px", minWidth: 0 }}>
                    <span style={labelStyle}>Priced</span>
                    <select
                      value={it.pricingType}
                      disabled={saving}
                      onChange={(e) => {
                        const pt = e.target.value as ServicePricingType;
                        patchItem(it.id, { pricingType: pt, amountCents: pt === "custom" ? null : it.amountCents });
                      }}
                      style={{ ...inputStyle, width: "100%", cursor: saving ? "wait" : "pointer" }}
                    >
                      {SERVICE_PRICING_TYPES.map((t) => (
                        <option key={t} value={t}>{SERVICE_PRICING_LABELS[t]}</option>
                      ))}
                    </select>
                  </label>

                  {/* amount (hidden for custom) */}
                  {needsAmount && (
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px", minWidth: 0 }}>
                      <span style={labelStyle}>Price</span>
                      <input
                        key={`amt-${it.id}-${it.amountCents ?? "x"}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="0"
                        defaultValue={centsToInput(it.amountCents)}
                        disabled={saving}
                        onBlur={(e) => {
                          const cents = inputToCents(e.target.value);
                          if (cents !== it.amountCents) patchItem(it.id, { amountCents: cents });
                        }}
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </label>
                  )}

                  {/* currency (S17) */}
                  {needsAmount && (
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 110px", minWidth: 0 }}>
                      <span style={labelStyle}>Currency</span>
                      <select
                        value={(DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes(it.currency) ? it.currency : defaultCurrency}
                        disabled={saving}
                        onChange={(e) => patchItem(it.id, { currency: e.target.value })}
                        style={{ ...inputStyle, width: "100%", cursor: saving ? "wait" : "pointer" }}
                      >
                        {DEFAULT_CURRENCY_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}{CURRENCY_LABELS[c] ? ` — ${CURRENCY_LABELS[c]}` : ""}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Short description (optional)"
                  defaultValue={it.description ?? ""}
                  disabled={saving}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== it.description) patchItem(it.id, { description: v }); }}
                  style={{ ...inputStyle, width: "100%", marginTop: 10 }}
                />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: saving ? "wait" : "pointer", fontSize: 11.5, color: C.inkMuted }}>
                    <input type="checkbox" checked={it.isActive} disabled={saving} onChange={(e) => patchItem(it.id, { isActive: e.target.checked })} style={{ accentColor: C.accentDeep, width: 15, height: 15 }} />
                    Active (shown to clients)
                  </label>
                  <span style={{ fontSize: 12, fontWeight: 600, color: it.pricingType === "custom" ? C.inkMuted : C.accentDeep }}>
                    {it.pricingType === "custom"
                      ? "Quote on request"
                      : `${fmtMoney(it.amountCents, it.currency)} ${SERVICE_PRICING_SUFFIX[it.pricingType]}`.trim()}
                  </span>
                </div>

                {/* Richness (Phase C): visibility S7 · add-ons S8 · tiers S9 · bundle S10 */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${C.borderSoft}`, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* S7 — visibility */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>Visibility</span>
                    <select
                      value={it.visibility}
                      disabled={saving}
                      onChange={(e) => patchItem(it.id, { visibility: e.target.value as ServiceVisibility })}
                      style={{ ...inputStyle, width: "100%", cursor: saving ? "wait" : "pointer" }}
                    >
                      {SERVICE_VISIBILITIES.map((v) => (
                        <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>
                      ))}
                    </select>
                  </label>

                  {/* S8 — add-ons */}
                  <div>
                    <span style={labelStyle}>Add-ons (optional extras)</span>
                    {it.addOns.map((a) => (
                      <div key={a.id} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text" placeholder="e.g. Overtime, Travel" defaultValue={a.label} disabled={saving}
                          onBlur={(e) => patchItem(it.id, { addOns: it.addOns.map((x) => x.id === a.id ? { ...x, label: e.target.value.trim() } : x) })}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <input
                          key={`ao-${a.id}-${a.amountCents ?? "x"}`} type="number" min={0} step="0.01" placeholder="0"
                          defaultValue={a.amountCents == null ? "" : (a.amountCents / 100).toString()} disabled={saving}
                          onBlur={(e) => { const c = inputToCents(e.target.value); patchItem(it.id, { addOns: it.addOns.map((x) => x.id === a.id ? { ...x, amountCents: c } : x) }); }}
                          style={{ ...inputStyle, width: 92 }}
                        />
                        <button type="button" aria-label="Remove add-on" disabled={saving} onClick={() => patchItem(it.id, { addOns: it.addOns.filter((x) => x.id !== a.id) })} style={{ ...inputStyle, padding: "6px 9px", cursor: "pointer", color: C.error, borderColor: C.errorSoft }}>✕</button>
                      </div>
                    ))}
                    <button type="button" disabled={saving} onClick={() => patchItem(it.id, { addOns: [...it.addOns, { id: clientId(), label: "", pricingType: "flat_package" as ServicePricingType, amountCents: null } as ServiceAddOn] })} style={{ marginTop: 6, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "#fff", color: C.inkMuted, fontSize: 11.5, cursor: saving ? "wait" : "pointer", fontFamily: FONT }}>+ Add-on</button>
                  </div>

                  {/* S9 — tiers */}
                  <div>
                    <span style={labelStyle}>Tiers (e.g. 2h / 4h / full-day)</span>
                    {it.tiers.map((t) => (
                      <div key={t.id} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text" placeholder="Tier label" defaultValue={t.label} disabled={saving}
                          onBlur={(e) => patchItem(it.id, { tiers: it.tiers.map((x) => x.id === t.id ? { ...x, label: e.target.value.trim() } : x) })}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <input
                          key={`tr-${t.id}-${t.amountCents ?? "x"}`} type="number" min={0} step="0.01" placeholder="0"
                          defaultValue={t.amountCents == null ? "" : (t.amountCents / 100).toString()} disabled={saving}
                          onBlur={(e) => { const c = inputToCents(e.target.value); patchItem(it.id, { tiers: it.tiers.map((x) => x.id === t.id ? { ...x, amountCents: c } : x) }); }}
                          style={{ ...inputStyle, width: 92 }}
                        />
                        <button type="button" aria-label="Remove tier" disabled={saving} onClick={() => patchItem(it.id, { tiers: it.tiers.filter((x) => x.id !== t.id) })} style={{ ...inputStyle, padding: "6px 9px", cursor: "pointer", color: C.error, borderColor: C.errorSoft }}>✕</button>
                      </div>
                    ))}
                    <button type="button" disabled={saving} onClick={() => patchItem(it.id, { tiers: [...it.tiers, { id: clientId(), label: "", amountCents: null } as ServiceTier] })} style={{ marginTop: 6, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "#fff", color: C.inkMuted, fontSize: 11.5, cursor: saving ? "wait" : "pointer", fontFamily: FONT }}>+ Tier</button>
                  </div>

                  {/* S6 — discipline scoping (only when the talent has >1 discipline) */}
                  {disciplines.length > 1 && (
                    <div>
                      <span style={labelStyle}>Applies to</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                        {disciplines.map((d) => {
                          const checked = (it.taxonomyTermIds ?? []).includes(d.id);
                          return (
                            <label key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.inkMuted }}>
                              <input
                                type="checkbox" checked={checked} disabled={saving}
                                onChange={(e) => { const cur = it.taxonomyTermIds ?? []; const next = e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id); patchItem(it.id, { taxonomyTermIds: next.length ? next : null }); }}
                                style={{ accentColor: C.accentDeep }}
                              />
                              {d.label}
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.inkMuted, marginTop: 5 }}>
                        Leave all unchecked to apply to every discipline.
                      </div>
                    </div>
                  )}

                  {/* S10 — bundle: pick included services (flat_package only) */}
                  {it.pricingType === "flat_package" && items.length > 1 && (
                    <div>
                      <span style={labelStyle}>Included in this package</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                        {items.filter((o) => o.id !== it.id).map((o) => {
                          const checked = (it.childServiceIds ?? []).includes(o.id);
                          return (
                            <label key={o.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.inkMuted }}>
                              <input
                                type="checkbox" checked={checked} disabled={saving}
                                onChange={(e) => { const cur = it.childServiceIds ?? []; const next = e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id); patchItem(it.id, { childServiceIds: next.length ? next : null }); }}
                                style={{ accentColor: C.accentDeep }}
                              />
                              {o.name || "(unnamed)"}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={addService}
        style={{ marginTop: 14, padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.accentSoft, color: C.accentDeep, fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: saving ? "wait" : "pointer" }}
      >
        + Add service
      </button>

      <div style={{ minHeight: 16, marginTop: 10 }}>
        {saving && <span style={{ fontSize: 11, color: C.inkMuted }}>Saving…</span>}
        {savedOk && !saving && <span style={{ fontSize: 11, color: C.success }}>Saved</span>}
        {error && <span style={{ fontSize: 11, color: C.error }}>{error}</span>}
      </div>
    </div>
  );
}
