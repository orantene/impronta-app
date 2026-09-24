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

import { useState } from "react";
import { setOfferingImages, listTalentPortfolioPhotos, type PortfolioPhoto } from "@/lib/talent/offerings-actions";
import { setMenuItemStockAction } from "@/lib/talent/menu-offerings-actions";
import { useOfferingsEditor } from "./use-offerings-editor";
import { actionUploadAndAssignMedia } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { uploadTalentMedia } from "@/lib/client/signed-upload";
import {
  offeringPriceLabel,
  IDENTITY_REASONS,
  IDENTITY_REASON_LABELS,
  type IdentityReason,
  type TalentOffering,
  type OfferingKind,
  type OfferingOwner,
  type OfferingReserveMode,
  type OfferingVariant,
  type OfferingAddOn,
} from "@/lib/talent/offerings-types";
import { OfferingOptionsEditor } from "./OfferingOptionsEditor";
import type { ServicePricingType } from "@/lib/talent/services-menu-types";
import { DEFAULT_CURRENCY_OPTIONS, CURRENCY_LABELS, TALENT_CURRENCY_OPTIONS } from "@/lib/billing/currencies";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";

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

type SellFilter = "all" | OfferingKind | "attention";
const SELL_FILTERS: { id: SellFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "service", label: "Services" },
  { id: "package", label: "Packages" },
  { id: "product", label: "Products" },
  { id: "attention", label: "Needs attention" },
];
const KIND_ADD_LABEL: Record<OfferingKind, string> = {
  service: "A service",
  package: "A package",
  product: "A product",
};
const KIND_HELP: Record<OfferingKind, { what: string; eg: string }> = {
  service: { what: "Something you do at an agreed time. It goes on your calendar.", eg: "acrylic set, lash lift, a haircut" },
  package: { what: "Several visits or sessions sold together for one price.", eg: "3 gel appointments, bridal trial + wedding day" },
  product: { what: "A thing the client takes home or you send. No appointment.", eg: "press-on sets, cuticle oil, a print" },
};
/** Live with no photo, or anything still missing its price. */
function needsAttention(i: TalentOffering): boolean {
  const missingPrice = i.amountCents == null && i.priceDisplay !== "quote" && i.priceType !== "custom";
  return missingPrice || (i.status === "published" && i.imageUrls.length === 0) || (i.kind === "product" && i.inventoryQty === 0);
}

/** "What kind of thing?" — the first question of Add (talent). */
function KindMenu({ onPick, onClose }: { onPick: (k: OfferingKind) => void; onClose: () => void }) {
  return (
    <div
      role="menu"
      aria-label="What kind of thing?"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, width: 320, maxWidth: "calc(100vw - 32px)", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(11,11,13,0.14)", padding: 6 }}
    >
      {(["service", "package", "product"] as OfferingKind[]).map((k) => (
        <button
          key={k}
          type="button"
          role="menuitem"
          onClick={() => onPick(k)}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.surface; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{KIND_ADD_LABEL[k]}</div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 1.4 }}>{KIND_HELP[k].what}</div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>For example: {KIND_HELP[k].eg}</div>
        </button>
      ))}
      <div style={{ fontSize: 11.5, color: C.inkMuted, padding: "8px 12px 6px", borderTop: `1px solid ${C.borderSoft}`, marginTop: 4, lineHeight: 1.45 }}>
        An extra, like glitter or nail art, is added inside the service it goes with: open the service, then Options &amp; extras.
      </div>
    </div>
  );
}

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
  usdRates = null,
  onEnsureSaved,
}: {
  value: TalentOffering;
  onPatch: (p: Partial<TalentOffering>) => void;
  isDraft: boolean;
  saving: boolean;
  defaultCurrency: string;
  /** Rates for the "about US$" preview beside a non-dollar price. */
  usdRates?: UsdRates | null;
  /**
   * Draft only: save the draft (hidden) so photos can attach before the rest
   * is filled in. Resolves to the saved row, or null when it could not save.
   */
  onEnsureSaved?: () => Promise<TalentOffering | null>;
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
  const [portfolio, setPortfolio] = useState<PortfolioPhoto[] | null>(null);
  const [picking, setPicking] = useState(false);
  async function openPortfolio() {
    const talentProfileId = value.talentProfileId;
    if (!talentProfileId) return;
    setPicking(true);
    setUploadError(null);
    if (portfolio === null) {
      const res = await listTalentPortfolioPhotos(talentProfileId);
      if (!res.ok) {
        setUploadError(res.error);
        setPicking(false);
        return;
      }
      setPortfolio(res.photos);
    }
  }
  async function togglePortfolioPhoto(p: PortfolioPhoto) {
    const talentProfileId = value.talentProfileId;
    if (!talentProfileId) return;
    const has = assets.some((a) => a.id === p.id);
    if (!has && assets.length >= 12) {
      setUploadError("A service can show up to 12 photos. Remove one first.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const offeringId = await targetId();
      if (!offeringId) {
        setUploadError("Give it a name first, then add photos.");
        return;
      }
      const next = has ? assets.filter((a) => a.id !== p.id) : [...assets, { id: p.id, url: p.url }];
      const res = await setOfferingImages(talentProfileId, offeringId, next.map((a) => a.id));
      if (!res.ok) {
        setUploadError(res.error ?? "Failed to update the photos.");
        return;
      }
      onImages?.(offeringId, next);
    } finally {
      setUploading(false);
    }
  }
  /** The row photos attach to; a new item is saved as a hidden draft first. */
  async function targetId(): Promise<string | null> {
    if (value.id) return value.id;
    if (!onEnsureSaved) return null;
    const saved = await onEnsureSaved();
    return saved?.id ?? null;
  }
  async function uploadPhoto(file: File) {
    const talentProfileId = value.talentProfileId;
    if (!talentProfileId) {
      setUploadError("Photos for workspace menu items are not available yet.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const offeringId = await targetId();
      if (!offeringId) {
        setUploadError("Give it a name first, then add photos.");
        return;
      }
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
      const res = await setOfferingImages(talentProfileId, offeringId, next.map((a) => a.id));
      if (!res.ok) {
        setUploadError(res.error ?? "Failed to attach the photo.");
        return;
      }
      onImages?.(offeringId, next);
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
  // Owner ruling 2026-09-23: a talent prices in pesos or dollars, and a peso
  // price shows its dollar equivalent. A workspace menu keeps the full list.
  // An item already saved in another code keeps it visible, so the picker
  // never displays a currency the row does not have.
  const currencyOptions: readonly string[] = workspaceTenantId
    ? DEFAULT_CURRENCY_OPTIONS
    : TALENT_CURRENCY_OPTIONS.includes(value.currency as (typeof TALENT_CURRENCY_OPTIONS)[number]) || !value.currency
      ? TALENT_CURRENCY_OPTIONS
      : [...TALENT_CURRENCY_OPTIONS, value.currency];
  const usdHint = mode === "contact" ? null : usdEquivalentLabel(value.amountCents, value.currency, usdRates, "en");
  const priceSentence =
    mode === "contact"
      ? "Clients will see “Contact for price” and message you first."
      : value.amountCents
        ? `Clients see ${offeringPriceLabel(value, "en")}${usdHint ? `, with ${usdHint} beside it` : ""}.`
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
        {(value.id || (onEnsureSaved && value.talentProfileId)) ? (
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
          <div style={{ fontSize: 12, color: C.inkSoft, padding: "8px 0 2px" }}>Photos for workspace menu items are added after saving.</div>
        )}
        {value.talentProfileId ? (
          <div style={{ marginTop: 8 }}>
            {!picking ? (
              <button type="button" disabled={uploading} onClick={() => void openPortfolio()} style={{ ...pillStyle(false) }} data-testid="offering-photos-from-portfolio">
                Choose from your portfolio
              </button>
            ) : (
              <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 10, background: C.surface }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, flex: 1 }}>
                    Your portfolio {portfolio ? `· ${portfolio.length}` : ""}
                    <span style={{ fontWeight: 400, color: C.inkMuted }}> · tap to add or remove · {assets.length} of 12</span>
                  </span>
                  <button type="button" onClick={() => setPicking(false)} style={{ ...pillStyle(false), padding: "4px 10px" }}>Done</button>
                </div>
                {portfolio === null ? (
                  <div style={{ fontSize: 12, color: C.inkMuted }}>Loading your photos…</div>
                ) : portfolio.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.inkMuted }}>No portfolio photos yet. Upload one above; it can be reused on other services later.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                    {portfolio.map((p) => {
                      const pos = assets.findIndex((a) => a.id === p.id);
                      const others = p.onOfferings.filter((o) => o.id !== value.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={uploading}
                          onClick={() => void togglePortfolioPhoto(p)}
                          title={others.length ? `Also on: ${others.map((o) => o.title).join(", ")}` : undefined}
                          aria-pressed={pos >= 0}
                          style={{ position: "relative", aspectRatio: "1", padding: 0, borderRadius: 9, overflow: "hidden", cursor: "pointer", border: pos >= 0 ? `2.5px solid ${C.accent}` : `1px solid ${C.borderSoft}`, background: "#fff" }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          {pos >= 0 ? (
                            <span style={{ position: "absolute", top: 4, left: 4, width: 18, height: 18, borderRadius: 9, background: C.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{pos + 1}</span>
                          ) : null}
                          {others.length ? (
                            <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 5px", background: "linear-gradient(transparent, rgba(11,11,13,.7))", color: "#fff", fontSize: 8.5, fontWeight: 600, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              On {others[0]!.title}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
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
              value={currencyOptions.includes(value.currency) ? value.currency : defaultCurrency}
              disabled={saving}
              onChange={(e) => onPatch({ currency: e.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {CURRENCY_LABELS[c as keyof typeof CURRENCY_LABELS] ? ` — ${CURRENCY_LABELS[c as keyof typeof CURRENCY_LABELS]}` : ""}
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
            {/*
              Identity is a property of the PRODUCT, not of the money. A cash
              walk-in buying a coffee is never asked for a name; a ticket the
              door checks always is. Ticking this is the only thing that makes
              a sale refuse for want of one, so the reason is asked for in the
              same breath and never stored on its own.
            */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.inkMuted, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={value.requiresIdentity}
                disabled={saving}
                onChange={(e) =>
                  onPatch(
                    e.target.checked
                      ? { requiresIdentity: true, identityReason: value.identityReason ?? "attendee_names" }
                      : { requiresIdentity: false, identityReason: null },
                  )
                }
                style={{ accentColor: C.accentDeep, width: 15, height: 15 }}
              />
              Needs the buyer&rsquo;s name (email or phone), whatever it costs
            </label>
            {value.requiresIdentity && (
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.inkMuted, paddingLeft: 22 }}>
                Why
                <select
                  value={value.identityReason ?? "attendee_names"}
                  disabled={saving}
                  onChange={(e) => onPatch({ identityReason: e.target.value as IdentityReason })}
                  style={{ ...inputStyle, width: "auto", flex: "1 1 auto", minWidth: 0 }}
                >
                  {IDENTITY_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {IDENTITY_REASON_LABELS[reason]}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
  // Every load, save, delete, reorder and duplicate is the shared editor
  // hook's; this component only draws the talent's Services tab over it.
  const editor = useOfferingsEditor(owner);
  const {
    isWorkspace,
    talentId,
    workspaceTenantId,
    items,
    defaultCurrency,
    usdRates,
    legacyImportable,
    loading,
    saving,
    error,
    savedOk,
    draft,
    perf,
    setError,
    setDraft,
    patchItem,
    removeItem,
    move,
    duplicate,
    importLegacy,
    syncImages,
    syncOptions,
  } = editor;
  /** One-open accordion: the id currently expanded. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** "What you sell" list filter (talent only). */
  const [filter, setFilter] = useState<SellFilter>("all");
  /** The Add menu: which kind of thing (talent only). */
  const [kindMenu, setKindMenu] = useState(false);

  /** Save a new item as a HIDDEN draft so photos can attach before the rest. */
  function ensureDraftSaved(): Promise<TalentOffering | null> {
    return editor.saveDraft({ status: "draft" }).then((saved) => {
      if (saved) {
        setDraft(null);
        setOpenId(saved.id);
      }
      return saved;
    });
  }

  function saveDraft() {
    void editor.saveDraft().then((saved) => {
      if (saved) {
        setDraft(null);
        setOpenId(null);
      }
    });
  }

  function startAdd(starter?: (typeof STARTERS)[number]) {
    const seed: Partial<TalentOffering> = {};
    if (starter) {
      seed.title = starter.title === "Custom quote" ? "" : starter.title;
      seed.priceType = starter.priceType === "custom" ? "flat_package" : starter.priceType;
    }
    const b = editor.startAdd(seed);
    if (starter) setDraft({ ...b, ...applyPriceMode(b, starter.mode) });
    setOpenId(null);
  }

  if (loading) return null;

  const { inputStyle, pillStyle } = makeStyles(saving);
  const attention = items.filter(needsAttention);
  const counts: Record<SellFilter, number> = {
    all: items.length,
    service: items.filter((i) => i.kind === "service").length,
    package: items.filter((i) => i.kind === "package").length,
    product: items.filter((i) => i.kind === "product").length,
    attention: attention.length,
  };
  const shown = isWorkspace || filter === "all"
    ? items
    : filter === "attention"
      ? attention
      : items.filter((i) => i.kind === filter);
  const noPhoto = items.filter((i) => i.status === "published" && i.imageUrls.length === 0).length;
  const noPrice = items.filter((i) => i.amountCents == null && i.priceDisplay !== "quote" && i.priceType !== "custom").length;
  const hidden = items.filter((i) => i.status !== "published").length;

  function addKind(kind: OfferingKind) {
    setKindMenu(false);
    const b = editor.startAdd({ kind });
    setDraft({ ...b, kind });
    setOpenId(null);
  }

  return (
    <div
      data-testid="talent-offerings-manager"
      style={{ width: "100%", padding: "18px 18px 20px", borderRadius: 12, background: "#fff", border: `1px solid ${C.borderSoft}`, fontFamily: FONT }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
            {isWorkspace ? "Menu" : "Your catalogue"}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 1.5 }}>
            {isWorkspace
              ? "What customers can order from your site. Each item belongs to the workspace, not to a person on the roster."
              : "Everything clients can book or buy from your page: services, packages and products. A photo on each one is what gets it booked."}
          </div>
        </div>
        {items.length > 0 && !isWorkspace && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              disabled={saving || draft !== null}
              aria-expanded={kindMenu}
              onClick={() => setKindMenu((v) => !v)}
              data-testid="sell-add"
              style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
            >
              + Add something to sell
            </button>
            {kindMenu && <KindMenu onPick={addKind} onClose={() => setKindMenu(false)} />}
          </div>
        )}
        {items.length > 0 && isWorkspace && (
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
              : "Start with the one clients ask for most. Add a photo and a price; nothing shows publicly until you publish it."}
          </div>
          {!isWorkspace ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {(["service", "package", "product"] as OfferingKind[]).map((k) => (
                <button key={k} type="button" disabled={saving} onClick={() => addKind(k)} style={{ padding: "10px 16px", borderRadius: 9, border: `1px solid ${k === "service" ? C.accent : C.border}`, background: k === "service" ? C.accent : "#fff", color: k === "service" ? "#fff" : C.ink, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                  + {KIND_ADD_LABEL[k]}
                </button>
              ))}
            </div>
          ) : null}
          {isWorkspace ? <button
            type="button"
            disabled={saving}
            onClick={() => startAdd()}
            style={{ padding: "10px 16px", borderRadius: 9, border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
          >
            {isWorkspace ? "+ Add your first menu item" : "+ Add your first service"}
          </button> : null}
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

      {/* Filter + readiness (talent) */}
      {!isWorkspace && items.length > 0 && (
        <>
          <div role="tablist" aria-label="Filter what you sell" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {SELL_FILTERS.filter((f) => f.id === "all" || f.id === "attention" || counts[f.id] > 0).map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                style={{ ...pillStyle(filter === f.id), borderRadius: 20, padding: "5px 12px", fontSize: 12, ...(f.id === "attention" && counts.attention > 0 && filter !== f.id ? { color: C.amber, borderColor: C.amberSoft } : null) }}
              >
                {f.label} · {counts[f.id]}
              </button>
            ))}
          </div>
          {(noPhoto > 0 || noPrice > 0) && (
            <div data-testid="sell-readiness" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: C.amberSoft, fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
              {[
                noPhoto > 0 ? `${noPhoto} live ${noPhoto === 1 ? "item has" : "items have"} no photo. A photo is what clients tap on.` : null,
                noPrice > 0 ? `${noPrice} ${noPrice === 1 ? "draft needs" : "drafts need"} a price before ${noPrice === 1 ? "it" : "they"} can go on your page.` : null,
                hidden > 0 ? `${hidden} hidden from your page.` : null,
              ].filter(Boolean).join(" ")}
            </div>
          )}
        </>
      )}

      {/* New-service composer */}
      {draft && (
        <div style={{ marginTop: 14, border: `1px solid ${C.accentLine}`, borderRadius: 12, padding: "14px 14px 16px", background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accentDeep, letterSpacing: 0.3, textTransform: "uppercase" }}>New {KIND_LABELS[draft.kind].toLowerCase()}</div>
          <OfferingForm
            value={draft}
            isDraft
            saving={saving}
            defaultCurrency={defaultCurrency}
            usdRates={usdRates}
            talentId={talentId}
            onPatch={(p) => setDraft((d) => (d ? { ...d, ...p } : d))}
            onEnsureSaved={isWorkspace ? undefined : ensureDraftSaved}
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
          {shown.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.inkMuted, padding: "10px 2px" }}>
              {filter === "attention" ? "Nothing needs attention. Every live item has a photo and a price." : "Nothing here yet."}
            </div>
          )}
          {shown.map((it) => {
            const idx = items.findIndex((x) => x.id === it.id);
            const open = openId === it.id;
            const live = it.status === "published";
            const missingPhoto = it.imageUrls.length === 0;
            const missingPrice = it.amountCents == null && it.priceDisplay !== "quote" && it.priceType !== "custom";
            return (
              <div key={it.id} style={{ border: `1px solid ${open ? C.accentLine : C.borderSoft}`, borderRadius: 12, background: live ? "#fff" : C.surface }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
                  {it.imageUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrls[0]} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: "cover", flexShrink: 0, border: `1px solid ${C.borderSoft}` }} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenId(it.id)}
                      aria-label={`Add a photo to ${it.title || "this item"}`}
                      style={{ width: 48, height: 48, borderRadius: 9, flexShrink: 0, border: `1.5px dashed ${C.border}`, background: C.surface, color: C.inkSoft, fontSize: 9.5, fontWeight: 600, lineHeight: 1.15, cursor: "pointer", fontFamily: FONT, padding: 2 }}
                    >
                      ＋<br />photo
                    </button>
                  )}
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
                        {live ? "Live" : "Hidden from page"}
                      </span>
                      {!isWorkspace && live && missingPhoto && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 8px", borderRadius: 20, background: C.amberSoft, color: C.amber }}>No photo</span>
                      )}
                      {!isWorkspace && missingPrice && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 8px", borderRadius: 20, background: C.amberSoft, color: C.amber }}>Needs a price</span>
                      )}
                      {it.kind === "product" && it.inventoryQty === 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 8px", borderRadius: 20, background: "rgba(220,38,38,0.10)", color: C.error }}>Sold out</span>
                      )}
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
                    {missingPrice ? "No price yet" : offeringPriceLabel(it, "en")}
                    {(() => {
                      const usd = missingPrice ? null : usdEquivalentLabel(it.amountCents, it.currency, usdRates, "en");
                      return usd ? <div style={{ fontSize: 11, fontWeight: 500, color: C.inkMuted, textAlign: "right" }}>{usd}</div> : null;
                    })()}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button type="button" aria-label="Move up" disabled={saving || idx <= 0 || (!isWorkspace && filter !== "all")} onClick={() => move(it.id, -1)} style={{ ...inputStyle, padding: "5px 8px", cursor: "pointer", opacity: idx <= 0 ? 0.35 : 1 }}>↑</button>
                    <button type="button" aria-label="Move down" disabled={saving || idx === items.length - 1 || (!isWorkspace && filter !== "all")} onClick={() => move(it.id, 1)} style={{ ...inputStyle, padding: "5px 8px", cursor: "pointer", opacity: idx === items.length - 1 ? 0.35 : 1 }}>↓</button>
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
                      usdRates={usdRates}
                      talentId={talentId}
                      onPatch={(p) => patchItem(it.id, p)}
                      onImages={syncImages}
                      onOptionsSynced={syncOptions}
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
