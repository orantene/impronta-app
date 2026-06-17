"use client";

/**
 * Step components for the talent onboarding wizard. Each step writes through an
 * EXISTING talent self-* server action and reports completeness back to the
 * wizard via `onSaved` (which triggers a router.refresh() so the canonical
 * server checklist re-reads). Split out of the original single-file wizard to
 * keep each file under the 800-line lint ceiling; shared tokens/styles/types
 * live in `onboarding-shared`.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { TalentChecklistItem } from "@/lib/talent-dashboard";
import {
  updateSelfIdentity,
  updateSelfLocation,
  updateSelfAbout,
  updateSelfRates,
  saveSelfLanguages,
  syncSelfTalentTypeTaxonomyFromShell,
  updateSelfProfileWorkflowFromShell,
} from "@/lib/server-actions/talent-self-profile-sections";
import { getTalentTypesUnderParentAsTalent } from "@/lib/server-actions/talent-self-services";
import { startTalentOnboarding } from "@/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions";
import {
  C,
  FONT,
  RATE_UNITS,
  CURRENCIES,
  LANGUAGE_OPTIONS,
  LANGUAGE_LEVELS,
  GENDER_OPTIONS,
  FieldLabel,
  SaveState,
  inputStyle,
  primaryBtn,
  secondaryBtn,
  saveBtn,
  type RateRow,
  type ParentCategory,
} from "./onboarding-shared";

// ─── Step: Basics — updateSelfIdentity (name + phone + gender + DOB) ───────────

export function BasicsStep({
  talentProfileId,
  initialName,
  initialPhone,
  initialGender,
  initialDob,
  onSaved,
}: {
  talentProfileId: string;
  initialName: string;
  initialPhone: string;
  initialGender: string;
  initialDob: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [gender, setGender] = useState(initialGender);
  const [dob, setDob] = useState(initialDob ? initialDob.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const save = () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      // Single updateSelfIdentity call covers all four checklist gates this
      // step owns. stage_name maps to display_name (the "Profile name").
      const res = await updateSelfIdentity({
        talent_profile_id: talentProfileId,
        stage_name: name.trim(),
        contact_phone: phone.trim(),
        gender: gender,
        date_of_birth: dob || undefined,
      });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        onSaved();
        setTimeout(() => setSavedOk(false), 2200);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <FieldLabel>Profile name</FieldLabel>
      <input
        style={inputStyle}
        value={name}
        placeholder="e.g. Sofía Reyes"
        onChange={(e) => setName(e.target.value)}
        aria-label="Profile name"
      />

      <div style={{ marginTop: 14 }}>
        <FieldLabel>Phone (agency-private)</FieldLabel>
        <input
          style={inputStyle}
          value={phone}
          placeholder="+52 55 1234 5678"
          onChange={(e) => setPhone(e.target.value)}
          aria-label="Phone number"
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <FieldLabel>Gender</FieldLabel>
          <select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Gender">
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <FieldLabel>Date of birth</FieldLabel>
          <input style={inputStyle} type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Date of birth" />
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 8, lineHeight: 1.45 }}>
        Your name shows on the directory and your public page. Phone, gender, and date of birth are used by the agency
        for matching and records.
      </p>
      <button type="button" style={{ ...saveBtn, opacity: !name.trim() || saving ? 0.5 : 1 }} disabled={!name.trim() || saving} onClick={save}>
        Save basics
      </button>
      <SaveState saving={saving} savedOk={savedOk} error={error} />
    </div>
  );
}

// ─── Step: Bio — updateSelfAbout (bios[]) ──────────────────────────────────────

export function BioStep({ talentProfileId, initialBio, onSaved }: { talentProfileId: string; initialBio: string; onSaved: () => void }) {
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const save = () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateSelfAbout({
        talent_profile_id: talentProfileId,
        bios: [{ locale: "en", text: bio.trim() }],
      });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        onSaved();
        setTimeout(() => setSavedOk(false), 2200);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <FieldLabel>Short bio</FieldLabel>
      <textarea
        style={{ ...inputStyle, minHeight: 110, resize: "vertical", lineHeight: 1.5 }}
        value={bio}
        placeholder="A clear sentence or two on what you do and what makes you a great fit."
        onChange={(e) => setBio(e.target.value)}
        aria-label="Short bio"
      />
      <p style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 6 }}>
        This appears on your public profile. Aim for a couple of strong sentences.
      </p>
      <button type="button" style={{ ...saveBtn, opacity: !bio.trim() || saving ? 0.5 : 1 }} disabled={!bio.trim() || saving} onClick={save}>
        Save bio
      </button>
      <SaveState saving={saving} savedOk={savedOk} error={error} />
    </div>
  );
}

// ─── Step: Photo — links to the existing media editor (no self upload action) ──

export function PhotoStep({ mediaCount }: { mediaCount: number }) {
  const hasMedia = mediaCount > 0;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${hasMedia ? "rgba(22,163,74,0.3)" : C.borderSoft}`,
          background: hasMedia ? "rgba(22,163,74,0.06)" : C.surface,
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden>
          {hasMedia ? "✓" : "📷"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {hasMedia ? `${mediaCount} photo${mediaCount === 1 ? "" : "s"} uploaded` : "No photos yet"}
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
            {hasMedia
              ? "Great — your profile has imagery. Add more in the photo editor any time."
              : "Upload at least one image so review and matching can begin."}
          </div>
        </div>
      </div>
      <Link href="/talent/public-page" style={{ ...saveBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        {hasMedia ? "Manage photos" : "Add photos"} →
      </Link>
      <p style={{ fontSize: 11, color: C.inkMuted, marginTop: 10, lineHeight: 1.45 }}>
        Photo uploads use the full media editor. We&apos;ll bring you back here when you&apos;re done.
      </p>
    </div>
  );
}

// ─── Step: Discipline — syncSelfTalentTypeTaxonomyFromShell (slugs) ────────────

export function DisciplineStep({
  talentProfileId,
  parentCategories,
  initialPrimarySlug,
  initialSecondarySlugs,
  onSaved,
}: {
  talentProfileId: string;
  parentCategories: ParentCategory[];
  initialPrimarySlug: string | null;
  initialSecondarySlugs: string[];
  onSaved: () => void;
}) {
  const [parentId, setParentId] = useState<string>(parentCategories[0]?.id ?? "");
  const [types, setTypes] = useState<{ id: string; slug: string; name_en: string }[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [primarySlug, setPrimarySlug] = useState<string | null>(initialPrimarySlug);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Load the talent types under the selected parent category whenever it
  // changes. The picker action is the same one the profile-shell drawer uses.
  useEffect(() => {
    if (!parentId) {
      setTypes([]);
      return;
    }
    let cancelled = false;
    setTypesLoading(true);
    getTalentTypesUnderParentAsTalent({
      talent_profile_id: talentProfileId,
      parent_category_id: parentId,
    })
      .then((res) => {
        if (cancelled) return;
        setTypesLoading(false);
        if (res.ok) setTypes(res.types.map((t) => ({ id: t.id, slug: t.slug, name_en: t.name_en })));
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId, talentProfileId]);

  const save = () => {
    if (!primarySlug) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await syncSelfTalentTypeTaxonomyFromShell({
        talent_profile_id: talentProfileId,
        primary_slug: primarySlug,
        secondary_slugs: initialSecondarySlugs,
      });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        onSaved();
        setTimeout(() => setSavedOk(false), 2200);
      } else {
        setError(res.error);
      }
    });
  };

  if (parentCategories.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
        Your agency hasn&apos;t enabled any talent categories yet. You can set your talent type from the profile editor
        once they do.
      </p>
    );
  }

  return (
    <div>
      <FieldLabel>Category</FieldLabel>
      <select
        style={inputStyle}
        value={parentId}
        onChange={(e) => {
          setParentId(e.target.value);
          setPrimarySlug(null);
        }}
        aria-label="Category"
      >
        {parentCategories.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name_en}
          </option>
        ))}
      </select>

      <div style={{ marginTop: 14 }}>
        <FieldLabel>Primary talent type</FieldLabel>
        {typesLoading ? (
          <div style={{ fontSize: 12, color: C.inkMuted }}>Loading types…</div>
        ) : types.length === 0 ? (
          <div style={{ fontSize: 12, color: C.inkMuted }}>No types under this category.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {types.map((t) => {
              const selected = primarySlug === t.slug;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPrimarySlug(t.slug)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${selected ? C.accent : C.border}`,
                    background: selected ? C.accentSoft : "#fff",
                    color: selected ? C.accentDeep : C.ink,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: FONT,
                  }}
                >
                  {t.name_en}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button type="button" style={{ ...saveBtn, opacity: !primarySlug || saving ? 0.5 : 1 }} disabled={!primarySlug || saving} onClick={save}>
        Save talent type
      </button>
      <SaveState saving={saving} savedOk={savedOk} error={error} />
    </div>
  );
}

// ─── Step: Languages — saveSelfLanguages ───────────────────────────────────────

export function LanguagesStep({ talentProfileId, onSaved }: { talentProfileId: string; onSaved: () => void }) {
  const [rows, setRows] = useState<{ language: string; level: string }[]>([{ language: "English", level: "fluent" }]);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const addRow = () => setRows((r) => [...r, { language: "Spanish", level: "conversational" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const patch = (i: number, p: Partial<{ language: string; level: string }>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));

  const save = () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await saveSelfLanguages({
        talent_profile_id: talentProfileId,
        languages: rows.filter((r) => r.language.trim()).map((r) => ({ language: r.language, level: r.level })),
      });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        onSaved();
        setTimeout(() => setSavedOk(false), 2200);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select style={{ ...inputStyle, flex: "1 1 0" }} value={row.language} onChange={(e) => patch(i, { language: e.target.value })} aria-label="Language">
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select style={{ ...inputStyle, flex: "0 0 150px" }} value={row.level} onChange={(e) => patch(i, { level: e.target.value })} aria-label="Level">
              {LANGUAGE_LEVELS.map((lv) => (
                <option key={lv.value} value={lv.value}>
                  {lv.label}
                </option>
              ))}
            </select>
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(i)} aria-label="Remove language" style={{ ...secondaryBtn, padding: "8px 11px" }}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} style={{ ...secondaryBtn, marginTop: 10, padding: "7px 13px", fontSize: 12 }}>
        + Add language
      </button>
      <div>
        <button type="button" style={{ ...saveBtn, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
          Save languages
        </button>
      </div>
      <SaveState saving={saving} savedOk={savedOk} error={error} />
    </div>
  );
}

// ─── Step: Location — updateSelfLocation (home_base) ───────────────────────────

export function LocationStep({ talentProfileId, initialHomeBase, onSaved }: { talentProfileId: string; initialHomeBase: string; onSaved: () => void }) {
  const [homeBase, setHomeBase] = useState(initialHomeBase);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const save = () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateSelfLocation({ talent_profile_id: talentProfileId, home_base: homeBase.trim() || null });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        onSaved();
        setTimeout(() => setSavedOk(false), 2200);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <FieldLabel>Home base (city)</FieldLabel>
      <input style={inputStyle} value={homeBase} placeholder="e.g. Mexico City" onChange={(e) => setHomeBase(e.target.value)} aria-label="Home base city" />
      <p style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 6, lineHeight: 1.45 }}>
        Where you&apos;re based for travel and matching. The directory&apos;s structured &quot;Lives in&quot; / &quot;Originally
        from&quot; fields (with the city picker) are set in the full profile editor.
      </p>
      <button type="button" style={{ ...saveBtn, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
        Save location
      </button>
      <SaveState saving={saving} savedOk={savedOk} error={error} />
    </div>
  );
}

// ─── Step: Rates — updateSelfRates (RateCard[]) ────────────────────────────────

export function RatesStep({ talentProfileId, initialRates, onSaved }: { talentProfileId: string; initialRates: RateRow[]; onSaved: () => void }) {
  const first = initialRates[0];
  const [amount, setAmount] = useState<string>(first?.amount ? String(first.amount) : "");
  const [currency, setCurrency] = useState<string>(first?.currency ?? "USD");
  const [unit, setUnit] = useState<string>(first?.unit ?? "day");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const save = () => {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a rate greater than 0.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      // Preserve any extra rate rows the talent built in the full editor; only
      // replace the first (the wizard's "starting rate").
      const rest = initialRates.slice(1);
      const res = await updateSelfRates({
        talent_profile_id: talentProfileId,
        rates_data: [{ typeId: first?.typeId ?? "default", amount: num, currency, unit }, ...rest],
      });
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        onSaved();
        setTimeout(() => setSavedOk(false), 2200);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <FieldLabel>Starting rate</FieldLabel>
      <div style={{ display: "flex", gap: 8 }}>
        <select style={{ ...inputStyle, flex: "0 0 100px" }} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          style={{ ...inputStyle, flex: "1 1 0" }}
          value={amount}
          inputMode="numeric"
          placeholder="500"
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          aria-label="Rate amount"
        />
        <select style={{ ...inputStyle, flex: "0 0 130px" }} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Rate unit">
          {RATE_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <p style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 6, lineHeight: 1.45 }}>
        A starting rate gives clients a reference. Add tiers, packages, and per-service pricing later in your full profile.
      </p>
      <button type="button" style={{ ...saveBtn, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
        Save rate
      </button>
      <SaveState saving={saving} savedOk={savedOk} error={error} />
    </div>
  );
}

// ─── Step: Payout — startTalentOnboarding (Stripe Connect link) ────────────────

export function PayoutStep({ tenantSlug, payoutStatus }: { tenantSlug: string | null; payoutStatus: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isSetUp = payoutStatus === "enabled";

  const connect = () => {
    if (!tenantSlug) {
      setError("Join an agency roster to set up payouts.");
      return;
    }
    setWorking(true);
    setError(null);
    startTransition(async () => {
      const res = await startTalentOnboarding(tenantSlug);
      if (res.ok) {
        window.location.href = res.url;
      } else {
        setWorking(false);
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${isSetUp ? "rgba(22,163,74,0.3)" : C.borderSoft}`,
          background: isSetUp ? "rgba(22,163,74,0.06)" : C.surface,
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden>
          {isSetUp ? "✓" : "💳"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {isSetUp ? "Payouts are set up" : "Connect a payout account"}
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
            {isSetUp
              ? "You're ready to receive booking payouts."
              : "Set up Stripe so your booking earnings can reach your bank. You can do this later, too."}
          </div>
        </div>
      </div>
      {!isSetUp && (
        <button type="button" style={{ ...saveBtn, opacity: working ? 0.6 : 1 }} disabled={working} onClick={connect}>
          {working ? "Opening Stripe…" : "Set up payouts"}
        </button>
      )}
      {error && <div style={{ fontSize: 11.5, color: C.error, marginTop: 8 }}>{error}</div>}
      <p style={{ fontSize: 11, color: C.inkMuted, marginTop: 10, lineHeight: 1.45 }}>
        This step is optional to publish — but you&apos;ll need it before a booking can pay out.
      </p>
    </div>
  );
}

// ─── Step: Review / Go live — updateSelfProfileWorkflowFromShell ───────────────

export function ReviewStep({
  talentProfileId,
  checklist,
  canSubmit,
  workflowStatus,
  previewHref,
  onSubmitted,
}: {
  talentProfileId: string;
  checklist: TalentChecklistItem[];
  canSubmit: boolean;
  workflowStatus: string;
  previewHref: string;
  onSubmitted: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const missing = checklist.filter((i) => !i.complete);
  const alreadyLive = workflowStatus === "approved";
  const alreadyPending = workflowStatus === "submitted" || workflowStatus === "under_review";

  const submit = () => {
    setWorking(true);
    setError(null);
    startTransition(async () => {
      // Canonical self-submit: "pending" maps to workflow_status=submitted.
      const res = await updateSelfProfileWorkflowFromShell({
        talent_profile_id: talentProfileId,
        profile_status: "pending",
      });
      setWorking(false);
      if (res.ok) {
        setDone(true);
        onSubmitted();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {checklist.map((item) => (
          <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                background: item.complete ? "rgba(22,163,74,0.14)" : "rgba(180,83,9,0.12)",
                color: item.complete ? C.success : C.amber,
              }}
            >
              {item.complete ? "✓" : "•"}
            </span>
            <span style={{ color: item.complete ? C.inkMuted : C.ink, fontWeight: item.complete ? 400 : 600 }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {alreadyLive ? (
          <div style={{ fontSize: 13, color: C.success, fontWeight: 600 }}>
            Your profile is live. ✓{" "}
            <Link href={previewHref} style={{ color: C.accentDeep, textDecoration: "underline", textUnderlineOffset: 3 }}>
              View it
            </Link>
          </div>
        ) : done || alreadyPending ? (
          <div style={{ fontSize: 13, color: C.accentDeep, fontWeight: 600, lineHeight: 1.5 }}>
            Submitted for review. The agency will move it forward — you&apos;ll see updates in your dashboard.
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || working}
              style={{
                ...primaryBtn,
                opacity: !canSubmit || working ? 0.5 : 1,
                cursor: !canSubmit || working ? "default" : "pointer",
              }}
            >
              {working ? "Submitting…" : "Submit for review"}
            </button>
            {!canSubmit && (
              <p style={{ fontSize: 11.5, color: C.amber, marginTop: 8, lineHeight: 1.45 }}>
                Complete the {missing.length} remaining item{missing.length === 1 ? "" : "s"} above to unlock publishing.
              </p>
            )}
            {error && <div style={{ fontSize: 11.5, color: C.error, marginTop: 8 }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
