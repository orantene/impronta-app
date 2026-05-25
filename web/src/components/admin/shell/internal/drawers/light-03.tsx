"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  CatalogChips,
  ConsentTwoCol,
  FIELD_CATALOG,
  FONTS,
  LanguagesEditor,
  PROTO_TENANT_ID,
  ProfileDraft,
  ProfileLanguage,
  RegField,
  RegFieldInput,
  RegValues,
  ReviewKv,
  SKILL_CATALOG,
  TAXONOMY,
  getEnabledTaxonomyTree,
  TaxonomyParent,
  TaxonomyParentId,
  TaxonomyNode,
  WORKSPACE_TAXONOMY_DEFAULT,
  WorkspaceCustomField,
  patchProfileDraft,
  resolvedFieldsForMode,
  useAdminShell,
  useLiveTaxonomy,
  validateField
} from "./drawer-shared";
import { buildNewTalentPickerTaxonomy } from "./profile-shell/profile-shell-modules/new-talent-taxonomy";

// Phase 1d (remediation §4): 1 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TalentRegistrationDrawer() {
  const { state, closeDrawer, toast, effectiveTenant, bridgeTenantIdentity } = useAdminShell();
  const open = state.drawer.drawerId === "talent-registration";
  const liveTaxonomy = useLiveTaxonomy();
  const [step, setStep] = useState(0);
  const [stageName, setStageName] = useState("");
  const [parents, setParents] = useState<Set<TaxonomyParentId>>(new Set());
  const [children, setChildren] = useState<Set<string>>(new Set());
  const [city, setCity] = useState("");
  const [radius, setRadius] = useState<number>(50);
  const [photoCount, setPhotoCount] = useState(0);
  const [fields, setFields] = useState<RegValues>({});
  // Structured languages — language + level + role flags (per spec).
  const [languages, setLanguages] = useState<ProfileLanguage[]>([]);
  // Skill IDs from SKILL_CATALOG (separate from Talent Types).
  const [skillIds, setSkillIds] = useState<Set<string>>(new Set());
  // Q5: hoisted above the `if (!open) return null` early return at ~L76 so
  // these two hooks are no longer called conditionally (rules-of-hooks).
  // The 2026 done-celebration screen — replaces the bare toast on submit.
  // Shows briefly: a soft confetti animation + "Visible to N {tenant}
  // clients" reveal + a 3-step "what's next" list. Auto-closes after
  // 4 seconds OR on tap. Mocked agency/client count is randomized per
  // mount so each demo feels organic.
  const [celebrating, setCelebrating] = useState(false);
  const [reachCount] = useState(() => Math.floor(Math.random() * 18) + 6);
  const [tenantTree, setTenantTree] = useState<TaxonomyNode[] | null>(null);

  useEffect(() => {
    if (!open || !bridgeTenantIdentity?.tenantId) return;
    let cancelled = false;
    getEnabledTaxonomyTree().then((res) => {
      if (cancelled) return;
      if (res.ok) setTenantTree(res.tree);
    });
    return () => { cancelled = true; };
  }, [open, bridgeTenantIdentity?.tenantId]);

  // Architecture loop closed — wizard now writes to the same draft
  // store as QuickAdd. So when admin runs Approval queue → opens shell,
  // the talent's submitted wizard data is the seed.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const firstChild = [...children][0];
      patchProfileDraft("default", {
        firstName: stageName.split(/\s+/)[0] ?? "",
        lastName: stageName.split(/\s+/).slice(1).join(" "),
        displayName: stageName,
        primaryType: firstChild ?? null,
        homeBase: city,
        photoCount,
        languages,
        fields,
        method: "invited",
        serviceArea: {
          homeBase: city, serviceCities: [],
          travelKm: radius, travelFee: false, remoteOnly: false,
        },
      } as Partial<ProfileDraft>, "wizard");
    }, 350);
    return () => clearTimeout(t);
  }, [open, stageName, parents, children, city, radius, photoCount, fields, languages]);

  if (!open) return null;

  // Filter the master taxonomy down to what the agency exposes for
  // registration. Live tenant settings win; the fixture remains only as
  // a local/no-env fallback.
  const fallbackAllowedParentIds = new Set(
    WORKSPACE_TAXONOMY_DEFAULT
      .filter(s => s.isEnabled && s.showInRegistration)
      .map(s => s.parentId as string),
  );
  const visibleParents = buildNewTalentPickerTaxonomy({
    visibleLiveParents: liveTaxonomy.visibleParents,
    restLiveParents: liveTaxonomy.restParents,
    tenantTree,
    fallbackAllowedParentIds,
    currentPlan: state.plan as "free" | "studio" | "agency" | "network",
    showMore: true,
  }).allowedParents;
  const findVisibleParent = (id: TaxonomyParentId) =>
    visibleParents.find(p => p.id === id) ?? TAXONOMY.find(p => p.id === id);

  const toggleParent = (id: TaxonomyParentId) => {
    setParents(p => {
      const next = new Set(p);
      if (next.has(id)) {
        next.delete(id);
        // Drop child selections of removed parent
        const drop = new Set(findVisibleParent(id)?.children.map(c => c.id) ?? []);
        setChildren(c => new Set([...c].filter(x => !drop.has(x))));
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleChild = (id: string) => {
    setChildren(c => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setField = (key: string, value: string | string[]) => {
    setFields(f => ({ ...f, [key]: value }));
  };

  // Phase A + A2 — wizard reads dynamic fields from the unified
  // catalog AND respects workspace overrides via resolvedFieldsForMode.
  // A field disabled by the workspace (`enabled=false`) drops out of
  // the wizard automatically; a field flipped to required gates the
  // step. Single source of truth: the catalog merged with workspace
  // settings.
  //
  // Phase A5 — within each parent's field list, recommendedFor entries
  // sort first so the most-impactful optionals show before generic
  // ones. Required fields always come first regardless.
  const dynamicFields: { parent: TaxonomyParent; fields: ReadonlyArray<RegField> }[] =
    [...parents].map(pid => {
      const parent = findVisibleParent(pid)!;
      // Mode-aware resolved catalog filtered to this parent.
      const resolved = resolvedFieldsForMode("registration", PROTO_TENANT_ID, pid)
        .filter(f => f.appliesTo?.includes(pid));
      // Sort: required → recommended → other. Required = catalog
      // requiredFor includes this parent OR workspace override flips
      // the field required.
      const ranked = [...resolved].sort((a, b) => {
        const aReq = (a.requiredFor?.includes(pid) ?? false) || a.optional === false;
        const bReq = (b.requiredFor?.includes(pid) ?? false) || b.optional === false;
        if (aReq !== bReq) return aReq ? -1 : 1;
        const aRec = a.recommendedFor?.includes(pid) ?? false;
        const bRec = b.recommendedFor?.includes(pid) ?? false;
        if (aRec !== bRec) return aRec ? -1 : 1;
        return (a.order ?? 100) - (b.order ?? 100);
      });
      // Project resolved catalog entries back to RegField shape
      // (legacy renderer expects this). Use the entry's catalog-style
      // id (`<parent>.<short>`) as the dynFields key — matches the
      // wizard + drawer storage convention post-Phase A.
      const fields: RegField[] = ranked
        .filter(f => f.kind && f.id.includes(".")) // skip placeholder dyn.<parent>
        .map(f => {
          const shortId = f.id.split(".").slice(-1)[0]!;
          return {
            id: shortId,
            label: f.label,
            kind: f.kind!,
            optional: f.optional !== false,
            placeholder: f.placeholder,
            helper: f.helper,
            options: f.options ? [...f.options] : undefined,
            sensitive: f.sensitive,
            defaultVisibility: f.defaultVisibility,
            subsection: f.subsection,
          };
        });
      return { parent, fields };
    });

  // Validation
  const canStep0 = stageName.trim().length > 0;
  const canStep1 = parents.size > 0;
  const canStep2 = children.size > 0;
  const canStep3 = city.trim().length > 0;
  const canStep4 = photoCount >= 3;
  // Phase A3 — single validation helper. Same `validateField` runs
  // in the edit drawer + add-new drawer + here. Workspace overrides
  // (Phase E) flow through automatically. The wizard's step error
  // copy now matches what the edit drawer shows for the same violation.
  const canStep5 = dynamicFields.every(g =>
    g.fields.every(f => {
      const catalogId = `${g.parent.id}.${f.id}`;
      const entry = FIELD_CATALOG.find(c => c.id === catalogId)
        ?? FIELD_CATALOG.find(c => c.id === f.id);
      if (!entry) {
        // No catalog entry — fall back to the schema's optional flag.
        if (f.optional) return true;
        const v = fields[f.id];
        if (!v) return false;
        return Array.isArray(v) ? v.length > 0 : v.toString().trim().length > 0;
      }
      const r = validateField(entry, fields[f.id], g.parent.id);
      return r.ok;
    })
  );
  const canStep6 = languages.length > 0;

  const steps: { title: string; sub: string; canNext: boolean }[] = [
    { title: `Join ${effectiveTenant.name}`, sub: "Create your talent profile in a few minutes.", canNext: canStep0 },
    { title: "What do you offer?", sub: "Pick the categories you want to be booked under.", canNext: canStep1 },
    { title: "Choose your exact Talent Type", sub: "We'll match you to the right inquiries.", canNext: canStep2 },
    { title: "Where do you work?", sub: "Home base + how far you'll travel.", canNext: canStep3 },
    { title: "Photos", sub: "At least 3 photos. Start with a clean headshot.", canNext: canStep4 },
    { title: "Profile details", sub: "A few extra fields based on your Talent Types.", canNext: canStep5 },
    { title: "Languages & skills", sub: "Languages with levels — and any extra strengths.", canNext: canStep6 },
    { title: "Review & submit", sub: `${effectiveTenant.name} reviews new profiles within 1 business day.`, canNext: true },
  ];

  const cur = steps[step]!;
  const isLast = step === steps.length - 1;

  // Q5: celebrating + reachCount useStates hoisted above the early return
  // (see top of component) so rules-of-hooks doesn't fire.
  const finish = () => {
    setCelebrating(true);
    // Auto-dismiss after 4s. Talent can also tap to dismiss earlier.
    setTimeout(() => {
      toast("Profile submitted for review");
      closeDrawer();
    }, 4000);
  };

  return (
    <div
      onClick={closeDrawer}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(11,11,13,0.42)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, maxHeight: "92vh",
        background: "#fff", borderRadius: "20px 20px 0 0",
        padding: "20px 22px max(22px, env(safe-area-inset-bottom)) 22px",
        fontFamily: FONTS.body,
        boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* 2026 step pips — smooth fill animation reveals the next
            pip only when the talent advances, gives the flow a sense
            of momentum even on the first screen.
            Confetti keyframes + reveal — fired only on the celebration
            screen. Pure CSS so no extra deps. */}
        <style dangerouslySetInnerHTML={{ __html:
          "@keyframes tulalaRegStep{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}"
          + "@keyframes tulalaRegPipFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}"
          + "@keyframes tulalaRegConfetti{0%{transform:translateY(-20vh) rotate(0deg);opacity:0}10%{opacity:1}100%{transform:translateY(120vh) rotate(720deg);opacity:0}}"
          + "@keyframes tulalaRegBigNumber{0%{transform:scale(.6);opacity:0}50%{transform:scale(1.08);opacity:1}100%{transform:scale(1);opacity:1}}"
        }} />

        {/* ── Celebration screen — replaces the wizard body when the
            talent submits. Auto-closes after 4s. ── */}
        {celebrating ? (
          <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {/* Confetti — 24 absolutely-positioned spans, randomly
                placed + 4 colors. Tap anywhere to dismiss early. */}
            <div onClick={() => { toast("Profile submitted for review"); closeDrawer(); }} style={{
              position: "absolute", inset: 0, cursor: "pointer", zIndex: 0,
            }}>
              {Array.from({ length: 28 }).map((_, i) => {
                const colors = [COLORS.accent, COLORS.indigo, "#D9A441", COLORS.coral];
                return (
                  <span key={i} aria-hidden style={{
                    position: "absolute",
                    left: `${(i * 37) % 100}%`,
                    top: "-10vh",
                    width: 8, height: 14,
                    background: colors[i % 4],
                    borderRadius: 2,
                    animation: `tulalaRegConfetti ${2.4 + (i % 5) * 0.3}s linear ${(i % 8) * 0.15}s 1`,
                  }} />
                );
              })}
            </div>
            <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 18px" }}>
              <div style={{
                fontFamily: FONTS.display, fontSize: 56, fontWeight: 700,
                color: COLORS.accentDeep ?? COLORS.accent,
                letterSpacing: -1.5, lineHeight: 1,
                animation: "tulalaRegBigNumber .55s cubic-bezier(.32,.72,0,1) both",
                fontVariantNumeric: "tabular-nums",
              }}>
                {reachCount}
              </div>
              <div style={{ fontSize: 14, marginTop: 8, fontWeight: 500 }} className="text-admin-ink-muted">
                clients on the {effectiveTenant.name} hub will see your profile
              </div>
              <h2 style={{ margin: "20px 0 6px", fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }} className="text-admin-ink">
                You&apos;re in
              </h2>
              <ol style={{
                listStyle: "none", padding: 0, margin: "16px 0 0",
                display: "flex", flexDirection: "column", gap: 10,
                textAlign: "left",
              }}>
                {[
                  { n: 1, label: `${effectiveTenant.name} reviews your profile`, sub: "Usually within 1 business day" },
                  { n: 2, label: "We publish you to the hub", sub: "Visible to verified clients only" },
                  { n: 3, label: "Your first inquiry lands", sub: "We'll email + push you when it does" },
                ].map(item => (
                  <li key={item.n} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "10px 12px",
                    background: COLORS.surfaceAlt, borderRadius: 10,
                  }}>
                    <span aria-hidden style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: COLORS.accent, color: "#fff",
                      fontSize: 11, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>{item.n}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }} className="text-admin-ink">{item.label}</div>
                      <div style={{ fontSize: 11.5, marginTop: 1, lineHeight: 1.3 }} className="text-admin-ink-muted">{item.sub}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div style={{ marginTop: 16, fontSize: 11 }} className="text-admin-ink-dim">
                Tap anywhere to close
              </div>
            </div>
          </div>
        ) : (<>
        <div style={{ display: "flex", gap: 4, marginBottom: 18, flexShrink: 0 }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? COLORS.accent : "rgba(11,11,13,0.08)",
              transition: "background .25s cubic-bezier(.4,0,.2,1)",
              transformOrigin: "left",
              animation: i === step ? "tulalaRegPipFill .35s cubic-bezier(.4,0,.2,1)" : "none",
            }} />
          ))}
        </div>

        <h2
          key={`title-${step}`}
          style={{
            margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
            color: COLORS.ink, letterSpacing: -0.3, lineHeight: 1.15, flexShrink: 0,
            animation: "tulalaRegStep .26s cubic-bezier(.32,.72,0,1)",
          }}
        >{cur.title}</h2>
        <p style={{ margin: "6px 0 16px", fontSize: 13.5, lineHeight: 1.5, flexShrink: 0 }} className="text-admin-ink-muted">
          {cur.sub}
        </p>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16, marginRight: -8, paddingRight: 8 }}>
          {step === 0 && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink-muted">
                Stage / professional name
              </label>
              <input type="text" value={stageName} onChange={e => setStageName(e.target.value)}
                placeholder="First Last"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "14px 16px",
                  borderRadius: 12, border: `1.5px solid ${COLORS.borderSoft}`,
                  fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink, outline: "none",
                }}
              />
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid rgba(91,107,160,0.18)`, fontSize: 11.5, lineHeight: 1.5 }} className="bg-admin-indigo-soft text-admin-indigo-deep">
                You&apos;re registering with <strong>{effectiveTenant.name}</strong>. They&apos;ll review your profile before publishing.
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-2">
              {visibleParents.length === 0 ? (
                <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5 }} className="bg-admin-surface text-admin-ink-muted">
                  This agency hasn&apos;t enabled any talent categories yet.
                </div>
              ) : visibleParents.map(p => {
                const active = parents.has(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleParent(p.id)} style={{
                    padding: "13px 14px", borderRadius: 12,
                    border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                    background: active ? "rgba(15,79,62,0.06)" : "#fff",
                    fontFamily: FONTS.body, textAlign: "left", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-admin-ink text-admin-13h font-semibold">{p.label}</div>
                      <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{p.helper}</div>
                    </div>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      border: `1.5px solid ${active ? COLORS.accent : "rgba(11,11,13,0.18)"}`,
                      background: active ? COLORS.accent : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3.5">
              {[...parents].map(pid => {
                const parent = findVisibleParent(pid)!;
                return (
                  <div key={pid}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
                      {parent.emoji}  {parent.label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parent.children.map(c => {
                        const active = children.has(c.id);
                        return (
                          <button key={c.id} type="button" onClick={() => toggleChild(c.id)} style={{
                            padding: "8px 13px", borderRadius: 999,
                            border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                            background: active ? "rgba(15,79,62,0.08)" : "#fff",
                            color: active ? COLORS.accentDeep : COLORS.ink,
                            fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                          }}>
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3.5">
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink-muted">
                  Home city
                </label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  placeholder="e.g. Madrid, Tulum, Berlin"
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "14px 16px",
                    borderRadius: 12, border: `1.5px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink, outline: "none",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink-muted">
                  Travel radius — {radius === 999 ? "Anywhere" : `${radius} km`}
                </label>
                <input type="range" min={10} max={999} step={10} value={radius}
                  onChange={e => setRadius(Number(e.target.value))}
                  style={{ width: "100%", accentColor: COLORS.accent }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginTop: 4 }} className="text-admin-ink-muted">
                  <span>Local only</span>
                  <span>Worldwide</span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const filled = i < photoCount;
                  return (
                    <button key={i} type="button" onClick={() => setPhotoCount(c => Math.min(6, c + 1))} style={{
                      aspectRatio: "3 / 4", borderRadius: 10,
                      border: `1.5px ${filled ? "solid" : "dashed"} ${filled ? COLORS.accent : COLORS.borderSoft}`,
                      background: filled ? "rgba(15,79,62,0.06)" : "#fff",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: FONTS.body, fontSize: 11, color: filled ? COLORS.accentDeep : COLORS.inkMuted,
                      fontWeight: 600,
                    }}>
                      {filled ? `Photo ${i + 1}` : "+ Add"}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
                Tip: One clean headshot, one full body, then 3–4 work samples.
                {photoCount > 0 && photoCount < 3 && (
                  <span style={{ display: "block", marginTop: 4 }} className="text-admin-amber-deep">
                    Need {3 - photoCount} more.
                  </span>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Audit fix #7 — Skip vs Required summary at the top of
                  the dynamic-fields step. Counts what's required vs
                  what's optional so the talent can scan-and-decide:
                  "I have to fill 3 things; the other 5 are optional."
                  Drives the Skip-step nav button below. */}
              {(() => {
                const allFields = dynamicFields.flatMap(g => g.fields);
                const required = allFields.filter(f => !f.optional).length;
                const optional = allFields.filter(f => f.optional).length;
                if (allFields.length === 0) return null;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 11.5 }} className="bg-admin-surface-alt text-admin-ink-muted">
                    <span style={{ padding: "2px 7px", borderRadius: 999, color: "#fff", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }} className="bg-admin-accent">{required} required</span>
                    {optional > 0 && (
                      <span style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(11,11,13,0.06)", fontSize: 10.5, fontWeight: 600 }} className="text-admin-ink-muted">{optional} optional</span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 10.5 }}>
                      You can fill optional fields later from your dashboard.
                    </span>
                  </div>
                );
              })()}
              {dynamicFields.map(g => (
                <div key={g.parent.id}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">
                    {g.parent.emoji}  {g.parent.label}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {g.fields.map(f => (
                      <RegFieldInput key={f.id} field={f}
                        value={fields[f.id] ?? (f.kind === "multiselect" || f.kind === "chips" ? [] : "")}
                        onChange={(v) => setField(f.id, v)}
                        primaryType={g.parent.id}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-4">
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
                  Languages
                </div>
                <LanguagesEditor value={languages} onChange={setLanguages} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
                  Skills & strengths · optional
                </div>
                <CatalogChips
                  items={SKILL_CATALOG}
                  selected={skillIds}
                  onToggle={(id) => setSkillIds(s => {
                    const next = new Set(s);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })}
                />
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="flex flex-col gap-3.5">
              {/* Summary card — what gets submitted */}
              <div style={{
                padding: 14, borderRadius: 12,
                border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                fontFamily: FONTS.body,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }} className="text-admin-ink">
                  {stageName || "Your profile"}
                </div>
                <ReviewKv label="Categories"
                  value={[...parents].map(id => findVisibleParent(id)?.label).filter(Boolean).join(" · ") || "—"} />
                <ReviewKv label="Talent Types"
                  value={[...children].map(id => {
                    for (const p of visibleParents.length > 0 ? visibleParents : TAXONOMY) {
                      const c = p.children.find(x => x.id === id);
                      if (c) return c.label;
                    }
                    return null;
                  }).filter(Boolean).join(" · ") || "—"} />
                <ReviewKv label="Home base"
                  value={city || "—"} />
                <ReviewKv label="Travel"
                  value={radius === 999 ? "Anywhere" : `${radius} km`} />
                <ReviewKv label="Languages"
                  value={languages.map(l => `${l.language} (${l.level})`).join(" · ") || "—"} />
                <ReviewKv label="Photos"
                  value={`${photoCount} uploaded`} />
              </div>

              {/* Privacy / consent — two-column "what this agency will use" */}
              <ConsentTwoCol agencyName={effectiveTenant.name} />

              <div style={{ padding: "12px 14px", borderRadius: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.5 }} className="bg-admin-success-soft text-admin-success-deep">
                Tap <strong>Submit for review</strong> to agree to the above and join {effectiveTenant.name}. You&apos;ll get an email when they approve you — usually within 1 business day.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <button type="button" onClick={closeDrawer} style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, fontWeight: 500,
          }}>Cancel</button>
          <div className="flex gap-2">
            {step > 0 && !isLast && (
              <button type="button" onClick={() => setStep(s => s - 1)} style={{
                padding: "10px 14px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Back</button>
            )}
            {!isLast && step < steps.length - 2 ? (
              <button type="button" disabled={!cur.canNext} onClick={() => setStep(s => s + 1)} style={{
                padding: "10px 18px", borderRadius: 999,
                border: "none", background: cur.canNext ? COLORS.accent : "rgba(11,11,13,0.10)",
                color: cur.canNext ? "#fff" : COLORS.inkDim,
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
                cursor: cur.canNext ? "pointer" : "default",
              }}>Continue</button>
            ) : !isLast ? (
              <button type="button" disabled={!cur.canNext} onClick={() => setStep(s => s + 1)} style={{
                padding: "10px 18px", borderRadius: 999,
                border: "none", background: cur.canNext ? COLORS.fill : "rgba(11,11,13,0.10)",
                color: cur.canNext ? "#fff" : COLORS.inkDim,
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
                cursor: cur.canNext ? "pointer" : "default",
              }}>Submit for review</button>
            ) : (
              <button type="button" onClick={finish} style={{
                padding: "10px 18px", borderRadius: 999,
                border: "none", background: COLORS.accent, color: "#fff",
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Done</button>
            )}
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}

/**
 * Renders a custom workspace field (defined in the Field Catalog) as
 * the right input for its kind. Mirrors RegFieldInput but reads its
 * shape from WorkspaceCustomField rather than the type-specific RegField.
 */
