"use client";

/**
 * TalentOfferingsManager — the Services tab editor (storefront catalog).
 *
 * One noun ("service"), one list, one add flow. First screen = title +
 * price(+mode) + how-clients-book; everything else folds behind "Add
 * details". Mirrors TalentServicesMenuCard's proven load → optimistic-persist
 * → rollback idiom against the offerings actions. Configuration only — no
 * money moves here.
 *
 * OfferingForm is MODULE-LEVEL (not nested) so parent re-renders never
 * remount it — nested definition would reset uncontrolled inputs and drop
 * focus mid-typing.
 *
 * Photos: offerings support a gallery via talent_offering_media (public render
 * + setOfferingImages action are live); the in-editor uploader is a follow-up
 * — photos can be attached by staff/seed today.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadTalentOfferingsForEditor,
  upsertTalentOffering,
  deleteTalentOffering,
  reorderTalentOfferings,
  importLegacyToOfferings,
  setOfferingImages,
} from "@/lib/talent/offerings-actions";
import {
  loadWorkspaceMenuForEditor,
  upsertWorkspaceMenuItem,
  deleteWorkspaceMenuItem,
  reorderWorkspaceMenuItems,
  setMenuItemStockAction,
} from "@/lib/talent/menu-offerings-actions";
import { loadTalentServicePerformance, type ServicePerformanceStat } from "@/lib/talent/services-menu-actions";
import { actionUploadAndAssignMedia } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { uploadTalentMedia } from "@/lib/client/signed-upload";
import {
  blankOffering,
  offeringPriceLabel,
  validateOffering,
  type TalentOffering,
  type OfferingKind,
  type OfferingOwner,
  type OfferingReserveMode,
  type OfferingVariant,
  type OfferingAddOn,
} from "@/lib/talent/offerings-types";
import { OfferingOptionsEditor } from "./OfferingOptionsEditor";
import type { ServicePricingType } from "@/lib/talent/services-menu-types";
import { DEFAULT_CURRENCY_OPTIONS, CURRENCY_LABELS } from "@/lib/billing/currencies";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkSoft: "rgba(11,11,13,0.42)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.16)",
  surface: "rgba(24,24,27,0.03)",
  accent: "#0F4F3E",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  accentLine: "rgba(15,79,62,0.22)",
  amber: "#B7791F",
  amberSoft: "rgba(183,121,31,0.12)",
  good: "#16794F",
  goodSoft: "rgba(22,121,79,0.12)",
  error: "#dc2626",
  errorSoft: "#FCA5A5",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

/** The 3-way price mode the talent actually chooses. */
type PriceMode = "fixed" | "from" | "contact";
function toPriceMode(o: TalentOffering): PriceMode {
  if (o.priceDisplay === "quote" || o.priceType === "custom") return "contact";
  return o.priceDisplay === "from" ? "from" : "fixed";
}
function applyPriceMode(o: TalentOffering, mode: PriceMode): Partial<TalentOffering> {
  if (mode === "contact") {
    // Contact-for-price: no number, uncharge-able, inquiry-only.
    return { priceDisplay: "quote", amountCents: null, bookingMode: "request" };
  }
  const priceType = o.priceType === "custom" ? "flat_package" : o.priceType;
  if (mode === "from") return { priceDisplay: "from", priceType, bookingMode: "request" };
  return { priceDisplay: "exact", priceType };
}

/** Human unit pills (map 1:1 to pricing_unit; talent never sees enum words). */
const UNIT_PILLS: { value: ServicePricingType; label: string }[] = [
  { value: "flat_package", label: "Flat price" },
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "per_contact", label: "Per session" },
  { value: "per_person", label: "Per person" },
  { value: "event", label: "Per event" },
];
const UNIT_MORE: { value: ServicePricingType; label: string }[] = [
  { value: "half_day", label: "Per half-day" },
  { value: "week", label: "Per week" },
];

const KIND_LABELS: Record<OfferingKind, string> = {
  service: "Service",
  package: "Package",
  product: "Product",
};

const STARTERS: { title: string; priceType: ServicePricingType; mode: PriceMode }[] = [
  { title: "60-min session", priceType: "per_contact", mode: "fixed" },
  { title: "Full-day rate", priceType: "day", mode: "fixed" },
  { title: "Signature package", priceType: "flat_package", mode: "from" },
  { title: "Custom quote", priceType: "custom", mode: "contact" },
];

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

function makeStyles(saving: boolean) {
  const inputStyle = {
    fontSize: 13,
    color: C.ink,
    fontFamily: FONT,
    background: saving ? C.surface : "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    outline: "none",
  } as const;
  const labelStyle = {
    fontSize: 10.5,
    fontWeight: 600 as const,
    color: C.inkMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
    display: "block" as const,
    marginBottom: 6,
  };
  const pillStyle = (on: boolean) =>
    ({
      padding: "7px 12px",
      borderRadius: 9,
      border: `1px solid ${on ? C.accent : C.border}`,
      background: on ? C.accentSoft : "#fff",
      color: on ? C.accentDeep : C.inkMuted,
      fontSize: 12.5,
      fontWeight: 600,
      fontFamily: FONT,
      cursor: saving ? ("wait" as const) : ("pointer" as const),
    }) as const;
  return { inputStyle, labelStyle, pillStyle };
}

/**
 * Stock for a workspace menu item.
 *
 * Its own control with its own save, deliberately NOT part of the offering
 * patch: a stock edit is an RPC, not a column write. Typing 20 means twenty
 * AVAILABLE, so the pool total becomes 20 + held under a row lock. Writing the
 * number into the row would either shrink the ceiling below what live orders
 * hold or desync the mirror the public board reads, which is why
 * `inventory_qty` is absent from `offeringToRowPatch`'s return type.
 *
 * Held is shown only when it is non-zero. Without it the field looks broken on
 * reload: set 20, the pool becomes 23, a bare field reads 20, and someone
 * "fixes" it by typing 23 and oversells by three.
 */
function StockControl({
  tenantId,
  offeringId,
  initialAvailable,
  saving,
  inputStyle,
  labelStyle,
}: {
  tenantId: string;
  offeringId: string;
  initialAvailable: number | null;
  saving: boolean;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const [raw, setRaw] = useState(initialAvailable == null ? "" : String(initialAvailable));
  const [held, setHeld] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function commit() {
    const trimmed = raw.trim();
    // Empty means UNLIMITED (null), not zero. Zero is a real value meaning sold
    // out, so the two must never collapse.
    const next = trimmed === "" ? null : Math.max(0, Math.trunc(Number(trimmed)));
    if (trimmed !== "" && !Number.isFinite(next)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await setMenuItemStockAction(tenantId, offeringId, next);
      if (!res.ok) {
        setNote(res.error);
        return;
      }
      setHeld(res.held);
      setRaw(res.available == null ? "" : String(res.available));
    } finally {
      setBusy(false);
    }
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 190px" }}>
      <span style={labelStyle}>Stock left</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        placeholder="Unlimited"
        disabled={saving || busy}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => void commit()}
        style={{ ...inputStyle, width: "100%" }}
      />
      {note ? (
        <span style={{ fontSize: 11, color: "#B0303A" }}>{note}</span>
      ) : held != null && held > 0 ? (
        <span style={{ fontSize: 11, opacity: 0.7 }}>{held} held by open orders</span>
      ) : null}
    </label>
  );
}

/** The shared form body (draft-mode or edit-mode). MODULE-LEVEL on purpose. */
function OfferingForm({
  value,
  onPatch,
  isDraft,
  saving,
  defaultCurrency,
  talentId,
  onSaveDraft,
  onCancelDraft,
  onImages,
  onOptionsSynced,
  workspaceTenantId,
}: {
  value: TalentOffering;
  onPatch: (p: Partial<TalentOffering>) => void;
  isDraft: boolean;
  saving: boolean;
  defaultCurrency: string;
  talentId: string;
  /** When false, hide photo/options that require a talent profile id. */
  allowTalentMedia?: boolean;
  onSaveDraft?: () => void;
  onCancelDraft?: () => void;
  /** Local-state updater after an image attach/remove (join rows, not the row). */
  onImages?: (offeringId: string, assets: { id: string; url: string }[]) => void;
  /** Local-state updater after variants/add-ons persist (child rows, not the row). */
  onOptionsSynced?: (offeringId: string, variants: OfferingVariant[], addOns: OfferingAddOn[]) => void;
  /** Set for a workspace menu item; enables the stock control. */
  workspaceTenantId?: string;
}) {
  const { inputStyle, labelStyle, pillStyle } = makeStyles(saving);
  const mode = toPriceMode(value);
  const showAmount = mode !== "contact";
  const [detailsOpen, setDetailsOpen] = useState(!isDraft);
  const [moreUnits, setMoreUnits] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const assets = value.imageAssets ?? [];
  async function uploadPhoto(file: File) {
    if (!value.id) return; // drafts save first
    const talentProfileId = value.talentProfileId;
    if (!talentProfileId) {
      setUploadError("Photos for workspace menu items are not available yet.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      // Signed pipeline first (works for staff AND talent-self since the
      // sign/register actions are dual-auth) — the legacy FormData action
      // rejects photos over the 4 MB Server Action body cap before it runs.
      let up:
        | { ok: true; data: { id: string; publicUrl: string } }
        | { ok: false; error: string };
      const fast = await uploadTalentMedia({
        file,
        variantKind: "gallery",
        talentProfileId,
      });
      if (fast.ok) {
        up = { ok: true, data: { id: fast.id, publicUrl: fast.publicUrl } };
      } else if (!fast.fallbackToLegacy) {
        up = { ok: false, error: fast.error };
      } else {
        const fd = new FormData();
        fd.set("file", file);
        up = await actionUploadAndAssignMedia(fd, talentProfileId, "gallery");
      }
      if (!up.ok) {
        setUploadError(up.error);
        return;
      }
      const next = [...assets, { id: up.data.id, url: up.data.publicUrl }];
      const res = await setOfferingImages(talentProfileId, value.id, next.map((a) => a.id));
      if (!res.ok) {
        setUploadError(res.error ?? "Failed to attach the photo.");
        return;
      }
      onImages?.(value.id, next);
    } finally {
      setUploading(false);
    }
  }
  async function removePhoto(assetId: string) {
    if (!value.id) return;
    const talentProfileId = value.talentProfileId;
    if (!talentProfileId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const next = assets.filter((a) => a.id !== assetId);
      const res = await setOfferingImages(talentProfileId, value.id, next.map((a) => a.id));
      if (!res.ok) {
        setUploadError(res.error ?? "Failed to remove the photo.");
        return;
      }
      onImages?.(value.id, next);
    } finally {
      setUploading(false);
    }
  }
  const unitOptions = moreUnits ? [...UNIT_PILLS, ...UNIT_MORE] : UNIT_PILLS;
  const priceSentence =
    mode === "contact"
      ? "Clients will see “Contact for price” and message you first."
      : value.amountCents
        ? `Clients see ${offeringPriceLabel(value, "en")}.`
        : "Type a price to see how clients will read it.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
      {/* What do you offer? */}
      <div>
        <span style={labelStyle}>What do you offer?</span>
        <input
          type="text"
          placeholder="e.g. 60-min massage · Skin fade · Private dinner"
          defaultValue={value.title}
          disabled={saving}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t !== value.title) onPatch({ title: t });
          }}
          style={{ ...inputStyle, width: "100%", fontWeight: 600, fontSize: 14 }}
        />
      </div>

      {/* Photos — optional, but it sells */}
      <div data-testid="offering-photos">
        <span style={labelStyle}>
          Photos <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— optional, but it sells. First photo is the cover.</span>
        </span>
        {value.id ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {assets.map((a, i) => (
              <span key={a.id} style={{ position: "relative", display: "inline-block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="" style={{ width: 64, height: 64, borderRadius: 9, objectFit: "cover", border: `1px solid ${C.borderSoft}` }} />
                {i === 0 && (
                  <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 8.5, fontWeight: 700, background: C.accentDeep, color: "#fff", padding: "2px 5px", borderRadius: 4, letterSpacing: 0.3 }}>
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  disabled={uploading}
                  onClick={() => void removePhoto(a.id)}
                  style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", color: C.error, fontSize: 10, lineHeight: "15px", cursor: "pointer", padding: 0 }}
                >
                  ✕
                </button>
              </span>
            ))}
            <label
              style={{ width: 64, height: 64, borderRadius: 9, border: `1.5px dashed ${C.border}`, background: C.surface, display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.inkSoft, fontSize: 20, cursor: uploading ? "wait" : "pointer" }}
            >
              {uploading ? "…" : "＋"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={uploading}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadPhoto(f);
                }}
              />
            </label>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.inkSoft, padding: "8px 0 2px" }}>Save the service first, then add photos.</div>
        )}
        <div style={{ minHeight: 13, marginTop: 4 }}>
          {uploading && <span style={{ fontSize: 11, color: C.inkMuted }}>Uploading…</span>}
          {uploadError && <span style={{ fontSize: 11, color: C.error }}>{uploadError}</span>}
        </div>
      </div>

      {/* Price + mode */}
      <div>
        <span style={labelStyle}>Price</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {(
            [
              { v: "fixed", l: "Fixed" },
              { v: "from", l: "From (starting at)" },
              { v: "contact", l: "Contact for price" },
            ] as { v: PriceMode; l: string }[]
          ).map((m) => (
            <button key={m.v} type="button" disabled={saving} onClick={() => onPatch(applyPriceMode(value, m.v))} style={pillStyle(mode === m.v)}>
              {m.l}
            </button>
          ))}
        </div>
        {showAmount && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <input
              key={`amt-${value.id}-${value.amountCents ?? "x"}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0"
              defaultValue={centsToInput(value.amountCents)}
              disabled={saving}
              onBlur={(e) => {
                const cents = inputToCents(e.target.value);
                if (cents !== value.amountCents) onPatch({ amountCents: cents });
              }}
              style={{ ...inputStyle, width: 120, fontWeight: 700, fontSize: 15 }}
            />
            <select
              value={(DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes(value.currency) ? value.currency : defaultCurrency}
              disabled={saving}
              onChange={(e) => onPatch({ currency: e.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {DEFAULT_CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {CURRENCY_LABELS[c] ? ` — ${CURRENCY_LABELS[c]}` : ""}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {unitOptions.map((u) => (
                <button key={u.value} type="button" disabled={saving} onClick={() => onPatch({ priceType: u.value })} style={pillStyle(value.priceType === u.value)}>
                  {u.label}
                </button>
              ))}
              {!moreUnits && (
                <button type="button" disabled={saving} onClick={() => setMoreUnits(true)} style={{ ...pillStyle(false), borderStyle: "dashed" }}>
                  More…
                </button>
              )}
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 8 }}>{priceSentence}</div>
      </div>

      {/* How clients book — the selling mode the TALENT chooses */}
      <div>
        <span style={labelStyle}>How clients book this</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => onPatch({ bookingMode: "request" })}
            style={pillStyle(value.bookingMode === "request")}
          >
            Inquiry to book — you confirm first
          </button>
          <button
            type="button"
            disabled={saving || mode !== "fixed"}
            title={mode !== "fixed" ? "Direct booking needs one fixed price" : undefined}
            onClick={() => onPatch({ bookingMode: "instant" })}
            style={{ ...pillStyle(value.bookingMode === "instant"), opacity: mode !== "fixed" ? 0.5 : 1 }}
          >
            Direct booking — clients reserve instantly
          </button>
        </div>
        {value.bookingMode === "instant" && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>To reserve, clients pay</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(
                [
                  { v: "full", l: "Full amount" },
                  { v: "deposit", l: "A deposit" },
                  { v: "free", l: "Nothing — free reserve" },
                ] as { v: OfferingReserveMode; l: string }[]
              ).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  disabled={saving}
                  onClick={() => onPatch({ reserveMode: m.v, depositPct: m.v === "deposit" ? (value.depositPct ?? 30) : null })}
                  style={pillStyle(value.reserveMode === m.v)}
                >
                  {m.l}
                </button>
              ))}
              {value.reserveMode === "deposit" && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.inkMuted }}>
                  <input
                    key={`dep-${value.id}-${value.depositPct ?? "x"}`}
                    type="number"
                    min={1}
                    max={99}
                    defaultValue={value.depositPct ?? 30}
                    disabled={saving}
                    onBlur={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (Number.isFinite(n) && n > 0 && n < 100 && n !== value.depositPct) onPatch({ depositPct: n });
                    }}
                    style={{ ...inputStyle, width: 64, fontWeight: 700 }}
                  />
                  % up front, balance later
                </label>
              )}
              {value.reserveMode === "free" && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.inkMuted }}>
                  Hold for
                  <input
                    key={`fre-${value.id}-${value.freeReserveExpiresDays ?? "x"}`}
                    type="number"
                    min={1}
                    placeholder="7"
                    defaultValue={value.freeReserveExpiresDays ?? ""}
                    disabled={saving}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const n = raw === "" ? null : Math.round(Number(raw));
                      const v = n != null && Number.isFinite(n) && n > 0 ? n : null;
                      if (v !== value.freeReserveExpiresDays) onPatch({ freeReserveExpiresDays: v });
                    }}
                    style={{ ...inputStyle, width: 60, fontWeight: 700 }}
                  />
                  days, then auto-release
                </label>
              )}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.inkMuted, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={value.allowPayInPerson}
                disabled={saving}
                onChange={(e) => onPatch({ allowPayInPerson: e.target.checked })}
                style={{ accentColor: C.accentDeep, width: 15, height: 15 }}
              />
              Also allow “pay at the appointment” (cash / in person) — card stays the default
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.inkMuted, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={value.requireAccountToBook}
                disabled={saving}
                onChange={(e) => onPatch({ requireAccountToBook: e.target.checked })}
                style={{ accentColor: C.accentDeep, width: 15, height: 15 }}
              />
              Require an account to book
            </label>
          </div>
        )}
      </div>

      {/* Add details (collapsed) */}
      {!detailsOpen ? (
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 13px",
            borderRadius: 10,
            border: `1px dashed ${C.border}`,
            background: C.surface,
            color: C.inkMuted,
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: FONT,
            cursor: "pointer",
            width: "100%",
            textAlign: "left" as const,
          }}
        >
          + Add details
          <span style={{ fontSize: 11, fontWeight: 500, color: C.inkSoft }}>description · duration · type · visibility</span>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: `1px dashed ${C.borderSoft}`, paddingTop: 12 }}>
          <div>
            <span style={labelStyle}>Short description (optional)</span>
            <textarea
              placeholder="What's included, who it's for…"
              defaultValue={value.description ?? ""}
              disabled={saving}
              rows={2}
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== value.description) onPatch({ description: v });
              }}
              style={{ ...inputStyle, width: "100%", resize: "vertical" as const }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 140px" }}>
              <span style={labelStyle}>Duration (min)</span>
              <input
                key={`dur-${value.id}-${value.durationMinutes ?? "x"}`}
                type="number"
                min={0}
                placeholder="e.g. 60"
                defaultValue={value.durationMinutes ?? ""}
                disabled={saving}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  const v = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
                  if (v !== value.durationMinutes) onPatch({ durationMinutes: v });
                }}
                style={{ ...inputStyle, width: "100%" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 150px" }}>
              <span style={labelStyle}>Type</span>
              <select
                value={value.kind}
                disabled={saving}
                onChange={(e) => onPatch({ kind: e.target.value as OfferingKind })}
                style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              >
                {(Object.keys(KIND_LABELS) as OfferingKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {workspaceTenantId && value.id ? (
              <StockControl
                tenantId={workspaceTenantId}
                offeringId={value.id}
                initialAvailable={value.inventoryQty}
                saving={saving}
                inputStyle={inputStyle}
                labelStyle={labelStyle}
              />
            ) : null}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 170px" }}>
              <span style={labelStyle}>Who sees it</span>
              <select
                value={value.visibility}
                disabled={saving}
                onChange={(e) => onPatch({ visibility: e.target.value as TalentOffering["visibility"] })}
                style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              >
                <option value="public">Public — on your page</option>
                <option value="on_request">Price on request</option>
                <option value="agency_only">Agency only</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 170px" }}>
              <span style={labelStyle}>Free cancel until (h)</span>
              <input
                key={`cx-${value.id}-${value.cancellationHours ?? "x"}`}
                type="number"
                min={0}
                placeholder="e.g. 48"
                defaultValue={value.cancellationHours ?? ""}
                disabled={saving}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const n = raw === "" ? null : Math.round(Number(raw));
                  const v = n != null && Number.isFinite(n) && n >= 0 ? n : null;
                  if (v !== value.cancellationHours) onPatch({ cancellationHours: v });
                }}
                style={{ ...inputStyle, width: "100%" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 150px" }}>
              <span style={labelStyle}>Category (optional)</span>
              <input
                type="text"
                placeholder="e.g. Bridal, Bodywork"
                defaultValue={value.category ?? ""}
                disabled={saving}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null;
                  if (v !== value.category) onPatch({ category: v });
                }}
                style={{ ...inputStyle, width: "100%" }}
              />
            </label>
          </div>

          {/* D4 — options (client picks one) + extras (stack on top). Children
              tables need a saved offering id, so drafts get a hint instead. */}
          {value.id ? (
            <OfferingOptionsEditor
              talentId={talentId}
              offeringId={value.id}
              currency={value.currency}
              variants={value.variants ?? []}
              addOns={value.addOns ?? []}
              saving={saving}
              onSynced={(v, a) => onOptionsSynced?.(value.id, v, a)}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 11.5, color: C.inkSoft, fontFamily: FONT }}>
              Save first to add options (sizes/tiers) and extras.
            </p>
          )}
        </div>
      )}

      {isDraft && (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            disabled={saving}
            onClick={onSaveDraft}
            style={{
              padding: "11px 18px",
              borderRadius: 9,
              border: `1px solid ${C.accent}`,
              background: C.accent,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: FONT,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            Save — add to my services
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onCancelDraft}
            style={{ padding: "11px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", color: C.inkMuted, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function TalentOfferingsManager(
  props: { talentId: string; owner?: never } | { owner: OfferingOwner; talentId?: never },
) {
  const owner: OfferingOwner =
    "owner" in props && props.owner
      ? props.owner
      : { kind: "talent", talentProfileId: (props as { talentId: string }).talentId };
  const isWorkspace = owner.kind === "workspace";
  const talentId = owner.kind === "talent" ? owner.talentProfileId : "";
  const workspaceTenantId = owner.kind === "workspace" ? owner.tenantId : "";

  const [items, setItems] = useState<TalentOffering[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [legacyImportable, setLegacyImportable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  /** One-open accordion: the id currently expanded. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** The new-item draft being composed (not yet persisted). */
  const [draft, setDraft] = useState<TalentOffering | null>(null);
  /** Per-offering quoted/booked stats (source_service_id analytics). */
  const [perf, setPerf] = useState<Record<string, ServicePerformanceStat>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const load = isWorkspace
      ? loadWorkspaceMenuForEditor(workspaceTenantId)
      : loadTalentOfferingsForEditor(talentId);
    load
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setItems(res.items);
          setDefaultCurrency(res.defaultCurrency);
          setLegacyImportable("legacyImportable" in res ? !!res.legacyImportable : false);
        } else {
          setError(res.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isWorkspace, talentId, workspaceTenantId]);

  useEffect(() => {
    if (isWorkspace) return;
    let cancelled = false;
    loadTalentServicePerformance(talentId)
      .then((res) => {
        if (!cancelled && res.ok) setPerf(res.stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isWorkspace, talentId]);

  function flashSaved() {
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 1800);
  }

  async function upsertOne(next: TalentOffering) {
    if (isWorkspace) return upsertWorkspaceMenuItem(workspaceTenantId, next);
    return upsertTalentOffering(talentId, next);
  }
  async function deleteOne(id: string) {
    if (isWorkspace) return deleteWorkspaceMenuItem(workspaceTenantId, id);
    return deleteTalentOffering(talentId, id);
  }
  async function reorderAll(ids: string[]) {
    if (isWorkspace) return reorderWorkspaceMenuItems(workspaceTenantId, ids);
    return reorderTalentOfferings(talentId, ids);
  }

  /** Persist one item (existing id) with optimistic replace + rollback. */
  function persistItem(next: TalentOffering) {
    const previous = items;
    setItems(items.map((it) => (it.id === next.id ? next : it)));
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await upsertOne(next);
      setSaving(false);
      if (res.ok) {
        setItems((cur) => cur.map((it) => (it.id === res.item.id ? res.item : it)));
        flashSaved();
      } else {
        setItems(previous);
        setError(res.error);
      }
    });
  }

  const patchItem = (id: string, patch: Partial<TalentOffering>) => {
    const target = items.find((it) => it.id === id);
    if (target) persistItem({ ...target, ...patch });
  };

  /** Save the composed new draft (insert). */
  function saveDraft() {
    if (!draft) return;
    const errors = validateOffering(draft);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await upsertOne(draft);
      setSaving(false);
      if (res.ok) {
        setItems((cur) => [...cur, res.item]);
        setDraft(null);
        setOpenId(null);
        flashSaved();
      } else {
        setError(res.error);
      }
    });
  }

  function removeItem(id: string) {
    const previous = items;
    setItems(items.filter((it) => it.id !== id));
    setSaving(true);
    startTransition(async () => {
      const res = await deleteOne(id);
      setSaving(false);
      if (!res.ok) {
        setItems(previous);
        setError(res.error ?? "Failed to delete.");
      } else {
        flashSaved();
      }
    });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((it) => it.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const reindexed = next.map((it, i) => ({ ...it, sortOrder: i }));
    setItems(reindexed);
    setSaving(true);
    startTransition(async () => {
      const res = await reorderAll(reindexed.map((it) => it.id));
      setSaving(false);
      if (!res.ok) setError(res.error ?? "Failed to reorder.");
      else flashSaved();
    });
  }

  function duplicate(it: TalentOffering) {
    setSaving(true);
    startTransition(async () => {
      const res = await upsertOne({
        ...it,
        id: "",
        title: `${it.title} (copy)`,
        status: "draft",
        sortOrder: items.length,
        imageUrls: [],
      });
      setSaving(false);
      if (res.ok) {
        setItems((cur) => [...cur, res.item]);
        flashSaved();
      } else setError(res.error);
    });
  }

  function startAdd(starter?: (typeof STARTERS)[number]) {
    const b = blankOffering(owner, defaultCurrency, items.length);
    if (starter) {
      b.title = starter.title === "Custom quote" ? "" : starter.title;
      b.priceType = starter.priceType === "custom" ? "flat_package" : starter.priceType;
      Object.assign(b, applyPriceMode(b, starter.mode));
    }
    setDraft(b);
    setOpenId(null);
    setError(null);
  }

  function importLegacy() {
    if (isWorkspace) return;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await importLegacyToOfferings(talentId);
      setSaving(false);
      if (res.ok) {
        setItems(res.items);
        setLegacyImportable(false);
        flashSaved();
      } else setError(res.error);
    });
  }

  if (loading) return null;

  const { inputStyle, pillStyle } = makeStyles(saving);

  return (
    <div
      data-testid="talent-offerings-manager"
      style={{ width: "100%", padding: "18px 18px 20px", borderRadius: 12, background: "#fff", border: `1px solid ${C.borderSoft}`, fontFamily: FONT }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
            {isWorkspace ? "Menu" : "Your services"}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 1.5 }}>
            {isWorkspace
              ? "What customers can order from your site. Each item belongs to the workspace, not to a person on the roster."
              : "What clients can book or buy from your page. You choose per service how they book — send an inquiry first, or reserve instantly."}
          </div>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            disabled={saving || draft !== null}
            onClick={() => startAdd()}
            style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer", flexShrink: 0 }}
          >
            {isWorkspace ? "+ Add a menu item" : "+ Add a service"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && !draft && (
        <div style={{ marginTop: 14, padding: "22px 18px", borderRadius: 12, background: C.surface, border: `1px dashed ${C.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
            {isWorkspace ? "Build your menu" : "Show people what they can book"}
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted, margin: "6px auto 14px", maxWidth: 380, lineHeight: 1.5 }}>
            {isWorkspace
              ? "Add your first menu item. It will only appear on your site once you publish it."
              : "Add your first service — it takes about twenty seconds. Nothing shows publicly until you save it."}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => startAdd()}
            style={{ padding: "10px 16px", borderRadius: 9, border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
          >
            {isWorkspace ? "+ Add your first menu item" : "+ Add your first service"}
          </button>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
            {STARTERS.map((s) => (
              <button key={s.title} type="button" disabled={saving} onClick={() => startAdd(s)} style={{ ...pillStyle(false), borderRadius: 20 }}>
                ＋ {s.title}
              </button>
            ))}
          </div>
          {legacyImportable && !isWorkspace && (
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                disabled={saving}
                onClick={importLegacy}
                style={{ padding: "8px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.accentDeep, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
              >
                Import my existing rates &amp; packages
              </button>
              <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 5 }}>
                We&rsquo;ll turn your old rates, packages and menu into editable services.
              </div>
            </div>
          )}
        </div>
      )}

      {/* New-service composer */}
      {draft && (
        <div style={{ marginTop: 14, border: `1px solid ${C.accentLine}`, borderRadius: 12, padding: "14px 14px 16px", background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accentDeep, letterSpacing: 0.3, textTransform: "uppercase" }}>New service</div>
          <OfferingForm
            value={draft}
            isDraft
            saving={saving}
            defaultCurrency={defaultCurrency}
            talentId={talentId}
            onPatch={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
            onSaveDraft={saveDraft}
            onCancelDraft={() => {
              setDraft(null);
              setError(null);
            }}
          />
        </div>
      )}

      {/* Rows */}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {items.map((it, idx) => {
            const open = openId === it.id;
            const live = it.status === "published";
            return (
              <div key={it.id} style={{ border: `1px solid ${open ? C.accentLine : C.borderSoft}`, borderRadius: 12, background: live ? "#fff" : C.surface }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                  {it.imageUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrls[0]} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1px solid ${C.borderSoft}` }} />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : it.id)}
                    style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: FONT }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title || "(untitled)"}</span>
                      {it.isFeatured && <span title="Featured" style={{ color: C.amber, fontSize: 13 }}>★</span>}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: live ? C.goodSoft : C.amberSoft,
                          color: live ? C.good : C.amber,
                        }}
                      >
                        {live ? "Live" : "Hidden"}
                      </span>
                      {it.bookingMode === "instant" && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 8px", borderRadius: 20, background: C.accentSoft, color: C.accentDeep }}>
                          Direct booking
                          {it.reserveMode === "deposit" ? ` · ${it.depositPct ?? ""}% deposit` : it.reserveMode === "free" ? " · free reserve" : ""}
                          {it.allowPayInPerson ? " · cash ok" : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                      {KIND_LABELS[it.kind]}
                      {it.durationMinutes ? ` · ${it.durationMinutes} min` : ""}
                      {it.category ? ` · ${it.category}` : ""}
                      {perf[it.id] && perf[it.id].timesQuoted > 0 ? (
                        <span style={{ color: C.accentDeep, fontWeight: 600 }}>
                          {" "}· Quoted {perf[it.id].timesQuoted}× · Booked {perf[it.id].timesBooked}×
                        </span>
                      ) : null}
                    </div>
                  </button>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {offeringPriceLabel(it, "en")}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button type="button" aria-label="Move up" disabled={saving || idx === 0} onClick={() => move(it.id, -1)} style={{ ...inputStyle, padding: "5px 8px", cursor: "pointer", opacity: idx === 0 ? 0.35 : 1 }}>↑</button>
                    <button type="button" aria-label="Move down" disabled={saving || idx === items.length - 1} onClick={() => move(it.id, 1)} style={{ ...inputStyle, padding: "5px 8px", cursor: "pointer", opacity: idx === items.length - 1 ? 0.35 : 1 }}>↓</button>
                  </div>
                </div>

                {open && (
                  <div style={{ padding: "0 12px 14px" }}>
                    <OfferingForm
                      workspaceTenantId={isWorkspace ? workspaceTenantId : undefined}
                      value={it}
                      isDraft={false}
                      saving={saving}
                      defaultCurrency={defaultCurrency}
                      talentId={talentId}
                      onPatch={(p) => patchItem(it.id, p)}
                      onImages={(id, assets) =>
                        setItems((cur) =>
                          cur.map((x) =>
                            x.id === id ? { ...x, imageAssets: assets, imageUrls: assets.map((a) => a.url) } : x,
                          ),
                        )
                      }
                      onOptionsSynced={(id, variants, addOns) =>
                        setItems((cur) => cur.map((x) => (x.id === id ? { ...x, variants, addOns } : x)))
                      }
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", borderTop: `1px dashed ${C.borderSoft}`, paddingTop: 12 }}>
                      <button type="button" disabled={saving} onClick={() => patchItem(it.id, { status: live ? "draft" : "published" })} style={{ ...pillStyle(false) }}>
                        {live ? "Hide from page" : "Show on page"}
                      </button>
                      <button type="button" disabled={saving} onClick={() => patchItem(it.id, { isFeatured: !it.isFeatured })} style={{ ...pillStyle(it.isFeatured) }}>
                        ★ {it.isFeatured ? "Featured" : "Feature on top"}
                      </button>
                      <button type="button" disabled={saving} onClick={() => duplicate(it)} style={{ ...pillStyle(false) }}>
                        Duplicate
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removeItem(it.id)}
                        style={{ ...pillStyle(false), color: C.error, borderColor: C.errorSoft, marginLeft: "auto" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ minHeight: 16, marginTop: 10 }}>
        {saving && <span style={{ fontSize: 11, color: C.inkMuted }}>Saving…</span>}
        {savedOk && !saving && <span style={{ fontSize: 11, color: C.good }}>Saved</span>}
        {error && <span style={{ fontSize: 11, color: C.error }}>{error}</span>}
      </div>
    </div>
  );
}
