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
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  loadTalentServicesMenu,
  updateTalentServicesMenu,
  importLegacyServicesMenu,
  loadTalentServicePerformance,
  type TalentDiscipline,
  type ServicePerformanceStat,
} from "@/lib/talent/services-menu-actions";
import {
  SERVICE_PRICING_TYPES,
  SERVICE_PRICING_LABEL_KEYS,
  SERVICE_PRICING_SUFFIX_KEYS,
  SERVICE_VISIBILITIES,
  pricingTypeRequiresAmount,
  type ServiceMenuItem,
  type ServicePricingType,
  type ServiceVisibility,
  type ServiceAddOn,
  type ServiceTier,
} from "@/lib/talent/services-menu-types";

import { DEFAULT_CURRENCY_OPTIONS, CURRENCY_LABELS } from "@/lib/billing/currencies";

const VISIBILITY_LABEL_KEYS: Record<ServiceVisibility, string> = {
  public: "dashboard.talentServices.visibilityPublic",
  agency_only: "dashboard.talentServices.visibilityAgencyOnly",
  on_request: "dashboard.talentServices.visibilityOnRequest",
};

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
  const t = useT();
  const [items, setItems] = useState<ServiceMenuItem[]>([]);
  const [disciplines, setDisciplines] = useState<TalentDiscipline[]>([]);
  const [perf, setPerf] = useState<Record<string, ServicePerformanceStat>>({});
  const [legacyImportable, setLegacyImportable] = useState(false);
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
          setLegacyImportable(res.legacyImportable);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [talentId]);

  // S18 consumer — per-service performance counts (non-blocking; best-effort).
  useEffect(() => {
    let cancelled = false;
    loadTalentServicePerformance(talentId)
      .then((res) => { if (!cancelled && res.ok) setPerf(res.stats); })
      .catch(() => {});
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
  const importLegacy = () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await importLegacyServicesMenu(talentId);
      setSaving(false);
      if (res.ok) {
        setItems(res.items);
        setLegacyImportable(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 1800);
      } else {
        setError(res.error);
      }
    });
  };
  const removeService = (id: string) => persist(items.filter((it) => it.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((it) => it.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    persist(next.map((it, i) => ({ ...it, sortOrder: i })));
  };

  if (loading) {
    return (
      <div
        aria-hidden
        style={{ width: "100%", minHeight: 132, marginBottom: 16, borderRadius: 12, background: "#fff", border: `1px solid ${C.borderSoft}`, fontFamily: FONT }}
      />
    );
  }

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
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("dashboard.talentServices.cardTitle")}</div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
            {t("dashboard.talentServices.cardDescription")}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 10, background: C.surface, border: `1px dashed ${C.border}`, fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
          {t("dashboard.talentServices.emptyBody")}
          {legacyImportable && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                disabled={saving}
                onClick={importLegacy}
                style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.accentDeep, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: saving ? "wait" : "pointer" }}
              >
                {t("dashboard.talentServices.importPackages")}
              </button>
              <div style={{ fontSize: 10.5, color: C.inkMuted, marginTop: 5 }}>
                {t("dashboard.talentServices.importHint")}
              </div>
            </div>
          )}
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
                    placeholder={t("dashboard.talentServices.serviceNamePlaceholder")}
                    defaultValue={it.name}
                    disabled={saving}
                    onBlur={(e) => { if (e.target.value.trim() !== it.name) patchItem(it.id, { name: e.target.value.trim() }); }}
                    style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
                  />
                  <button type="button" aria-label={t("dashboard.talentServices.moveUp")} disabled={saving || idx === 0} onClick={() => move(it.id, -1)} style={{ ...inputStyle, padding: "6px 8px", cursor: "pointer", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                  <button type="button" aria-label={t("dashboard.talentServices.moveDown")} disabled={saving || idx === items.length - 1} onClick={() => move(it.id, 1)} style={{ ...inputStyle, padding: "6px 8px", cursor: "pointer", opacity: idx === items.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button type="button" aria-label={t("dashboard.talentServices.removeService")} disabled={saving} onClick={() => removeService(it.id)} style={{ ...inputStyle, padding: "6px 9px", cursor: "pointer", color: C.error, borderColor: C.errorSoft }}>✕</button>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {/* pricing unit (S5) */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 150px", minWidth: 0 }}>
                    <span style={labelStyle}>{t("dashboard.talentServices.priced")}</span>
                    <select
                      value={it.pricingType}
                      disabled={saving}
                      onChange={(e) => {
                        const pt = e.target.value as ServicePricingType;
                        patchItem(it.id, { pricingType: pt, amountCents: pt === "custom" ? null : it.amountCents });
                      }}
                      style={{ ...inputStyle, width: "100%", cursor: saving ? "wait" : "pointer" }}
                    >
                      {SERVICE_PRICING_TYPES.map((pt) => (
                        <option key={pt} value={pt}>{t(SERVICE_PRICING_LABEL_KEYS[pt])}</option>
                      ))}
                    </select>
                  </label>

                  {/* amount (hidden for custom) */}
                  {needsAmount && (
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px", minWidth: 0 }}>
                      <span style={labelStyle}>{t("dashboard.talentServices.price")}</span>
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
                      <span style={labelStyle}>{t("dashboard.talentServices.currency")}</span>
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
                  placeholder={t("dashboard.talentServices.descriptionPlaceholder")}
                  defaultValue={it.description ?? ""}
                  disabled={saving}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== it.description) patchItem(it.id, { description: v }); }}
                  style={{ ...inputStyle, width: "100%", marginTop: 10 }}
                />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: saving ? "wait" : "pointer", fontSize: 11.5, color: C.inkMuted }}>
                    <input type="checkbox" checked={it.isActive} disabled={saving} onChange={(e) => patchItem(it.id, { isActive: e.target.checked })} style={{ accentColor: C.accentDeep, width: 15, height: 15 }} />
                    {t("dashboard.talentServices.activeLabel")}
                  </label>
                  <span style={{ fontSize: 12, fontWeight: 600, color: it.pricingType === "custom" ? C.inkMuted : C.accentDeep }}>
                    {it.pricingType === "custom"
                      ? t("dashboard.talentServices.quoteOnRequest")
                      : `${fmtMoney(it.amountCents, it.currency)} ${t(SERVICE_PRICING_SUFFIX_KEYS[it.pricingType])}`.trim()}
                  </span>
                </div>

                {/* S18 consumer — performance counts from offer line items stamped
                    with this service id (shown only once it's been quoted). */}
                {perf[it.id] && perf[it.id].timesQuoted > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.inkMuted }}>
                    <span style={{ fontWeight: 600, color: C.accentDeep }}>
                      {interpolate(t("dashboard.talentServices.quotedTimes"), { count: perf[it.id].timesQuoted })}
                    </span>
                    {" · "}
                    {interpolate(t("dashboard.talentServices.bookedTimes"), { count: perf[it.id].timesBooked })}
                    <span style={{ color: C.inkMuted }}>
                      {" "}{interpolate(t("dashboard.talentServices.convertSuffix"), { percent: Math.round((perf[it.id].timesBooked / perf[it.id].timesQuoted) * 100) })}
                    </span>
                  </div>
                )}

                {/* Richness (Phase C): visibility S7 · add-ons S8 · tiers S9 · bundle S10 */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${C.borderSoft}`, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* S7 — visibility */}
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>{t("dashboard.talentServices.visibility")}</span>
                    <select
                      value={it.visibility}
                      disabled={saving}
                      onChange={(e) => patchItem(it.id, { visibility: e.target.value as ServiceVisibility })}
                      style={{ ...inputStyle, width: "100%", cursor: saving ? "wait" : "pointer" }}
                    >
                      {SERVICE_VISIBILITIES.map((v) => (
                        <option key={v} value={v}>{t(VISIBILITY_LABEL_KEYS[v])}</option>
                      ))}
                    </select>
                  </label>

                  {/* S8 — add-ons */}
                  <div>
                    <span style={labelStyle}>{t("dashboard.talentServices.addOnsLabel")}</span>
                    {it.addOns.map((a) => (
                      <div key={a.id} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text" placeholder={t("dashboard.talentServices.addOnPlaceholder")} defaultValue={a.label} disabled={saving}
                          onBlur={(e) => patchItem(it.id, { addOns: it.addOns.map((x) => x.id === a.id ? { ...x, label: e.target.value.trim() } : x) })}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <input
                          key={`ao-${a.id}-${a.amountCents ?? "x"}`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0"
                          defaultValue={a.amountCents == null ? "" : (a.amountCents / 100).toString()} disabled={saving}
                          onBlur={(e) => { const c = inputToCents(e.target.value); patchItem(it.id, { addOns: it.addOns.map((x) => x.id === a.id ? { ...x, amountCents: c } : x) }); }}
                          style={{ ...inputStyle, width: 92 }}
                        />
                        <button type="button" aria-label={t("dashboard.talentServices.removeAddOn")} disabled={saving} onClick={() => patchItem(it.id, { addOns: it.addOns.filter((x) => x.id !== a.id) })} style={{ ...inputStyle, padding: "6px 9px", cursor: "pointer", color: C.error, borderColor: C.errorSoft }}>✕</button>
                      </div>
                    ))}
                    <button type="button" disabled={saving} onClick={() => patchItem(it.id, { addOns: [...it.addOns, { id: clientId(), label: "", pricingType: "flat_package" as ServicePricingType, amountCents: null } as ServiceAddOn] })} style={{ marginTop: 6, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "#fff", color: C.inkMuted, fontSize: 11.5, cursor: saving ? "wait" : "pointer", fontFamily: FONT }}>{t("dashboard.talentServices.addAddOn")}</button>
                  </div>

                  {/* S9 — tiers */}
                  <div>
                    <span style={labelStyle}>{t("dashboard.talentServices.tiersLabel")}</span>
                    {it.tiers.map((tier) => (
                      <div key={tier.id} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text" placeholder={t("dashboard.talentServices.tierPlaceholder")} defaultValue={tier.label} disabled={saving}
                          onBlur={(e) => patchItem(it.id, { tiers: it.tiers.map((x) => x.id === tier.id ? { ...x, label: e.target.value.trim() } : x) })}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <input
                          key={`tr-${tier.id}-${tier.amountCents ?? "x"}`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0"
                          defaultValue={tier.amountCents == null ? "" : (tier.amountCents / 100).toString()} disabled={saving}
                          onBlur={(e) => { const c = inputToCents(e.target.value); patchItem(it.id, { tiers: it.tiers.map((x) => x.id === tier.id ? { ...x, amountCents: c } : x) }); }}
                          style={{ ...inputStyle, width: 92 }}
                        />
                        <button type="button" aria-label={t("dashboard.talentServices.removeTier")} disabled={saving} onClick={() => patchItem(it.id, { tiers: it.tiers.filter((x) => x.id !== tier.id) })} style={{ ...inputStyle, padding: "6px 9px", cursor: "pointer", color: C.error, borderColor: C.errorSoft }}>✕</button>
                      </div>
                    ))}
                    <button type="button" disabled={saving} onClick={() => patchItem(it.id, { tiers: [...it.tiers, { id: clientId(), label: "", amountCents: null } as ServiceTier] })} style={{ marginTop: 6, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "#fff", color: C.inkMuted, fontSize: 11.5, cursor: saving ? "wait" : "pointer", fontFamily: FONT }}>{t("dashboard.talentServices.addTier")}</button>
                  </div>

                  {/* S6 — discipline scoping (only when the talent has >1 discipline) */}
                  {disciplines.length > 1 && (
                    <div>
                      <span style={labelStyle}>{t("dashboard.talentServices.appliesTo")}</span>
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
                        {t("dashboard.talentServices.appliesToHint")}
                      </div>
                    </div>
                  )}

                  {/* S10 — bundle: pick included services (flat_package only) */}
                  {it.pricingType === "flat_package" && items.length > 1 && (
                    <div>
                      <span style={labelStyle}>{t("dashboard.talentServices.includedInPackage")}</span>
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
                              {o.name || t("dashboard.talentServices.unnamed")}
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
        {t("dashboard.talentServices.addService")}
      </button>

      <div style={{ minHeight: 16, marginTop: 10 }}>
        {saving && <span style={{ fontSize: 11, color: C.inkMuted }}>{t("dashboard.talentServices.saving")}</span>}
        {savedOk && !saving && <span style={{ fontSize: 11, color: C.success }}>{t("dashboard.talentServices.saved")}</span>}
        {error && <span style={{ fontSize: 11, color: C.error }}>{error}</span>}
      </div>
    </div>
  );
}
