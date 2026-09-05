"use client";

// ShortlistsShell — viewer + send-inquiry surface for /client/shortlists.
//
// Each shortlist card shows the talents on it as canonical <TalentCard>
// tiles (editorial monogram fallback · name · type · favorite heart) plus a
// "Send inquiry" button that opens an inline form. Submitting POSTs
// /api/discover/inquiry with the full talent array — the server groups by
// primary tenant and fans out, so one shortlist with talents from 3 agencies
// → 3 inquiries.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  DiscoverShortlistWithTalents,
  DiscoverShortlistTalent,
} from "../../_data-bridge/discover";
import { CompareDrawer } from "./CompareDrawer";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { TalentCard } from "@/components/talent-cards/TalentCard";
import type { CanonicalTalentCardData } from "@/components/talent-cards/talent-card-shape";
import {
  cardDesignToCssVars,
  familyToTalentCardStyle,
  type CardDesign,
} from "@/lib/site-admin/server/card-design-shape";
import { useT } from "@/i18n/use-t";
import { interpolate, withPluralization, type Translator } from "@/i18n/interpolate";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  accentDeep: "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function ShortlistsShell({
  shortlists,
  tenantSlug,
  tier,
  hasPro,
  cardDesign,
  locale = "en",
}: {
  shortlists: DiscoverShortlistWithTalents[];
  tenantSlug: string;
  tier: "standard" | "pro" | "enterprise";
  hasPro: boolean;
  /** Workspace UI locale (request locale) so the remove-undo toast localizes. */
  locale?: string;
  /**
   * Shell-tenant card palette (load-card-design bridge → resolveCardDesign).
   * Spread as inline `--token-card-*` vars on each canonical talent tile so the
   * shortlist tiles paint the dashboard tenant's palette (they escape the
   * storefront `<html>` cascade). Optional — un-wired pages inherit the theme
   * through the `var(--token-card-*, …)` fallback chain.
   */
  cardDesign?: CardDesign;
}) {
  const t = useT();
  const cardCssVars = useMemo(
    () => (cardDesign ? cardDesignToCssVars(cardDesign) : undefined),
    [cardDesign],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>
      {!hasPro && <ProUpsellBanner tier={tier} tenantSlug={tenantSlug} />}
      {shortlists.map((s) => (
        <ShortlistCard
          key={s.id}
          shortlist={s}
          tenantSlug={tenantSlug}
          hasPro={hasPro}
          cardCssVars={cardCssVars}
          cardDesign={cardDesign}
          locale={locale}
        />
      ))}
      <div style={{
        padding: 16, borderRadius: 12,
        background: C.surface, border: `1px dashed ${C.borderSoft}`,
        textAlign: "center", color: C.inkMuted, fontSize: 12.5,
      }}>
        {t("client.shortlists.needMorePrefix")}<Link href={`/${tenantSlug}/client/discover`} style={{ color: C.accent, fontWeight: 600 }}>{t("dashboard.clientNav.discover")}</Link>{t("client.shortlists.needMoreSuffix")}
      </div>
    </div>
  );
}

/**
 * Start the Pro checkout: POST to the subscription checkout route and redirect
 * to the returned Stripe Checkout URL. When checkout isn't configured yet
 * (no price id) we fall back to the subscription page, which explains the tiers
 * and the sales-assisted path. The server-side 402 gate is the real enforcement;
 * this is just the upgrade entry point.
 */
async function startProCheckout(tenantSlug: string): Promise<void> {
  try {
    const res = await fetch("/api/discover/subscriptions/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantSlug }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string };
    if (res.ok && typeof json.url === "string") {
      window.location.href = json.url;
      return;
    }
  } catch {
    /* fall through to the subscription page */
  }
  // Not configured / error → send them to the tier comparison page.
  window.location.href = `/${tenantSlug}/client/subscription`;
}

/** Inline upsell shown to standard-tier clients on the shortlists page. The CTA
 *  starts a real Pro checkout (Stripe), falling back to the subscription page. */
function ProUpsellBanner({
  tier,
  tenantSlug,
}: {
  tier: "standard" | "pro" | "enterprise";
  tenantSlug: string;
}) {
  const t = useT();
  if (tier !== "standard") return null;
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "linear-gradient(135deg, rgba(15,79,62,0.08), rgba(15,79,62,0.02))",
        border: `1px solid rgba(15,79,62,0.20)`,
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
        fontFamily: FONT,
      }}
    >
      <div className="min-w-0">
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          textTransform: "uppercase", color: C.accent, marginBottom: 4,
        }}>
          {t("client.shortlists.upgradeTitle")}
        </div>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
          {t("client.shortlists.upgradeBody")}
        </div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 4 }}>
          {t("client.shortlists.upgradeNote")}
        </div>
      </div>
      <button
        type="button"
        onClick={() => { void startProCheckout(tenantSlug); }}
        style={{
          padding: "8px 14px", borderRadius: 8,
          background: C.accent, color: "#fff", border: "none",
          display: "inline-block",
          fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {t("client.shortlists.upgradeCta")} →
      </button>
    </div>
  );
}

function ShortlistCard({
  shortlist,
  tenantSlug,
  hasPro,
  cardCssVars,
  cardDesign,
  locale = "en",
}: {
  shortlist: DiscoverShortlistWithTalents;
  tenantSlug: string;
  hasPro: boolean;
  cardCssVars: Record<string, string> | undefined;
  cardDesign?: CardDesign;
  locale?: string;
}) {
  const t = useT();
  const tp = useMemo(() => withPluralization(t), [t]);
  const [inquireOpen, setInquireOpen] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareState, setShareState] = useState<
    | { kind: "idle" }
    | { kind: "pending" }
    | { kind: "ok"; url: string }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  async function handleShare() {
    setShareState({ kind: "pending" });
    try {
      const res = await fetch(`/api/discover/shortlists/${shortlist.id}/share`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || typeof json.url !== "string") {
        setShareState({
          kind: "err",
          message: json.error === "forbidden" ? t("client.shortlists.shareForbidden") : t("client.shortlists.shareFailed"),
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(json.url);
      } catch {
        /* clipboard write may fail in restricted contexts; URL still shown */
      }
      setShareState({ kind: "ok", url: json.url });
    } catch {
      setShareState({ kind: "err", message: t("client.shortlists.shareNetworkError") });
    }
  }

  // Per-tenant tally for the fan-out preview line. Uses routesToTenantId
  // (= the actual fallback ladder used by /api/discover/inquiry) so the
  // preview matches what happens on submit. Talents on a Free workspace
  // roster route to that workspace; only talents with NO active roster
  // anywhere are truly "not routable."
  const tenantBuckets = new Map<string, { name: string; count: number }>();
  let noRosterCount = 0;
  for (const t of shortlist.talents) {
    if (t.routesToTenantId && t.routesToTenantName) {
      const existing = tenantBuckets.get(t.routesToTenantId);
      tenantBuckets.set(t.routesToTenantId, {
        name: t.routesToTenantName,
        count: (existing?.count ?? 0) + 1,
      });
    } else {
      noRosterCount += 1;
    }
  }
  const routableCount = shortlist.talents.length - noRosterCount;

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: 16,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="min-w-0">
          <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            {shortlist.name}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted }}>
            {tp("client.discover.talentCount", shortlist.talents.length)}
            {tenantBuckets.size > 0 && (
              <span>
                {" · "}
                {tp("client.shortlists.routesTo", tenantBuckets.size)}
              </span>
            )}
            {noRosterCount > 0 && (
              <span style={{ color: C.inkDim }}>
                {" · "}
                {interpolate(t("client.shortlists.needDirectOutreach"), { count: noRosterCount })}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleShare}
            disabled={shortlist.talents.length === 0 || shareState.kind === "pending"}
            title={t("client.shortlists.shareTitle")}
            style={{
              height: 36, padding: "0 12px", borderRadius: 8,
              background: "transparent",
              border: `1px solid ${shortlist.talents.length === 0 ? C.borderSoft : C.border}`,
              color: shortlist.talents.length === 0 ? C.inkDim : C.ink,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              cursor: shortlist.talents.length === 0 || shareState.kind === "pending" ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {shareState.kind === "pending"
              ? t("client.shortlists.shareGenerating")
              : shareState.kind === "ok"
                ? `✓ ${t("client.shortlists.shareCopied")}`
                : `↗ ${t("client.shortlists.share")}`}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!hasPro) {
                // Pro gate is enforced server-side for sends; compare is a
                // client-only view, so route the upgrade here instead of an
                // alert(). The subscription page starts checkout.
                window.location.href = `/${tenantSlug}/client/subscription`;
                return;
              }
              setCompareOpen(true);
            }}
            disabled={shortlist.talents.length < 2}
            title={
              !hasPro
                ? t("client.shortlists.compareProTitle")
                : shortlist.talents.length < 2
                  ? t("client.shortlists.compareNeedTwoTitle")
                  : t("client.shortlists.compareOpenTitle")
            }
            style={{
              height: 36, padding: "0 12px", borderRadius: 8,
              background: "transparent",
              border: `1px solid ${shortlist.talents.length < 2 ? C.borderSoft : C.border}`,
              color: shortlist.talents.length < 2 ? C.inkDim : C.ink,
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              cursor: shortlist.talents.length < 2 ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            ⇄ {t("client.shortlists.compare")}
            {!hasPro && <ProTierPill />}
          </button>
          <button
            type="button"
            onClick={() => {
              const isMultiTalent = shortlist.talents.length > 1 || routableCount > 1;
              if (!hasPro && isMultiTalent) {
                // Multi-talent send is a Pro power tool — enforced server-side
                // with a 402. Route to the upgrade page instead of the old
                // alert() pretense.
                window.location.href = `/${tenantSlug}/client/subscription`;
                return;
              }
              setInquireOpen((v) => !v);
              setResult(null);
            }}
            disabled={routableCount === 0}
            style={{
              height: 36, padding: "0 14px", borderRadius: 8,
              background: routableCount === 0 ? "rgba(11,11,13,0.10)" : (inquireOpen ? C.accentSoft : C.accent),
              border: `1px solid ${inquireOpen ? C.accent : "transparent"}`,
              color: routableCount === 0 ? C.inkDim : (inquireOpen ? C.accentDeep : "#fff"),
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              cursor: routableCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {inquireOpen
                ? t("client.shortlists.cancel")
                : `${t("client.discover.inquiryForm.sendInquiry")}${routableCount > 0 ? "" : ` ${t("client.shortlists.noAgenciesSuffix")}`}`}
              {!hasPro && (shortlist.talents.length > 1 || routableCount > 1) && <ProTierPill />}
            </span>
          </button>
        </div>
      </div>

      {shareState.kind === "ok" && (
        <div style={{
          marginTop: 10,
          padding: "8px 10px",
          background: "rgba(26,115,72,0.08)",
          border: "1px solid rgba(26,115,72,0.18)",
          borderRadius: 8,
          fontSize: 11.5,
          color: "#1A7348",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}>
          <span className="font-semibold">{t("client.shortlists.sharePublicLinkCopied")}</span>
          <code style={{
            fontSize: 10.5,
            background: "rgba(11,11,13,0.04)",
            padding: "2px 6px",
            borderRadius: 4,
            color: C.ink,
            wordBreak: "break-all",
          }}>
            {shareState.url}
          </code>
          <span style={{ color: C.inkMuted }}>{t("client.shortlists.shareReadOnlyExpiry")}</span>
        </div>
      )}
      {shareState.kind === "err" && (
        <div style={{
          marginTop: 10,
          padding: "8px 10px",
          background: "rgba(180,130,20,0.10)",
          border: "1px solid rgba(180,130,20,0.20)",
          borderRadius: 8,
          fontSize: 11.5,
          color: "var(--color-admin-amber)",
        }}>
          {shareState.message}
        </div>
      )}

      {shortlist.talents.length > 0 && (
        <div style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 10,
        }}>
          {shortlist.talents.map((t) => (
            <ShortlistTalentTile
              key={t.talentId}
              talent={t}
              cardCssVars={cardCssVars}
              cardStyle={cardDesign ? familyToTalentCardStyle(cardDesign.family) : "editorial"}
              popupDisabled={cardDesign?.profilePopup === "off"}
              locale={locale}
            />
          ))}
        </div>
      )}

      {inquireOpen && routableCount > 0 && (
        <div style={{
          marginTop: 14, padding: 12,
          border: `1px solid ${C.borderSoft}`, borderRadius: 10,
          background: C.surface,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 11.5, color: C.inkMuted }}>
            {t("client.shortlists.oneInquiryPerWorkspace")} {Array.from(tenantBuckets.values())
              .map((b) => `${b.name} (${b.count})`)
              .join(" · ")}
            {noRosterCount > 0 && ` · ${tp("client.shortlists.notOnRoster", noRosterCount)}`}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
            {t("client.discover.inquiryForm.eventDate")}
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{
                height: 34, padding: "0 10px", borderRadius: 8,
                border: `1px solid ${C.borderSoft}`, background: "#fff",
                color: C.ink, fontFamily: FONT, fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
            {t("client.discover.inquiryForm.eventLocation")}
            <input
              type="text"
              placeholder={t("client.discover.inquiryForm.locationPlaceholder")}
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              style={{
                height: 34, padding: "0 10px", borderRadius: 8,
                border: `1px solid ${C.borderSoft}`, background: "#fff",
                color: C.ink, fontFamily: FONT, fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: C.inkMuted }}>
            {t("client.discover.inquiryForm.brief")}
            <textarea
              placeholder={t("client.discover.inquiryForm.briefPlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              style={{
                padding: "8px 10px", borderRadius: 8,
                border: `1px solid ${C.borderSoft}`, background: "#fff",
                color: C.ink, fontFamily: FONT, fontSize: 13,
                resize: "vertical",
              }}
            />
          </label>
          {result && (
            <div style={{
              padding: "8px 10px", borderRadius: 8, fontSize: 12,
              background: result.ok ? "rgba(46,125,91,0.10)" : "rgba(176,48,58,0.10)",
              color: result.ok ? "#1B5C45" : "#B0303A",
              border: `1px solid ${result.ok ? "rgba(46,125,91,0.30)" : "rgba(176,48,58,0.30)"}`,
            }}>
              {result.text}
            </div>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setResult(null);
              try {
                const res = await fetch("/api/discover/inquiry", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    talentIds: shortlist.talents.map((t) => t.talentId),
                    eventDate: eventDate || undefined,
                    eventLocation: eventLocation || undefined,
                    message: message || undefined,
                    sourceShortlistId: shortlist.id,
                  }),
                });
                const j = await res.json();
                if (res.status === 402 || j.error === "pro_required") {
                  setResult({
                    ok: false,
                    text: t("client.shortlists.proRequired"),
                  });
                  return;
                }
                if (res.ok && j.inquiries?.length > 0) {
                  const created = j.inquiries.length;
                  const skipped = j.skipped?.length ?? 0;
                  setResult({
                    ok: true,
                    text: `${tp("client.shortlists.sentInquiries", created)}${skipped > 0 ? ` ${tp("client.shortlists.skippedNotOnRoster", skipped)}` : ""}`,
                  });
                  setEventDate("");
                  setEventLocation("");
                  setMessage("");
                } else {
                  setResult({
                    ok: false,
                    text: j.error === "no_routable_talents"
                      ? t("client.shortlists.noAgenciesToRoute")
                      : t("client.discover.inquiryForm.sendFailed"),
                  });
                }
              } catch {
                setResult({ ok: false, text: t("client.discover.inquiryForm.networkIssue") });
              } finally {
                setSubmitting(false);
              }
            }}
            style={{
              height: 38, borderRadius: 8,
              background: submitting ? "rgba(11,11,13,0.4)" : C.accent,
              color: "#fff", border: "none",
              fontFamily: FONT, fontSize: 13, fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting
              ? t("client.discover.inquiryForm.sending")
              : tp("client.shortlists.sendNInquiries", tenantBuckets.size)}
          </button>
        </div>
      )}

      {compareOpen && (
        <CompareDrawer
          shortlistName={shortlist.name}
          talents={shortlist.talents.slice(0, 6)}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

/** Map a shortlist talent to the canonical `<TalentCard>` data shape. The
 *  tile links to the public profile (a heart still lives in badgeSlot). No
 *  availability snapshot on this surface → the line is suppressed. */
function toShortlistTileData(t: DiscoverShortlistTalent, tr: Translator): CanonicalTalentCardData {
  return {
    id: t.talentId,
    name: t.displayName,
    profileCode: t.profileCode,
    profileHref: t.profileCode ? `/t/${t.profileCode}` : "",
    primaryType: t.primaryTypeLabel,
    location: [t.homeCity, t.homeCountry].filter(Boolean).join(" · ") || null,
    photoUrl: t.headshotUrl,
    agencyName: t.agencyName,
    isExclusive: t.isExclusive,
    availabilityLabel: tr("dashboard.clientFavorites.availabilityOnRequest"),
    availabilityKnown: false,
    availableDaysInNext30: null,
  };
}

/**
 * One talent on a shortlist, rendered as the canonical compact card. Editorial
 * style, 1:1 aspect (matches the prior bespoke tile). rootMode="button" (NOT
 * "link") so the favorite <button> nested in badgeSlot stays valid HTML — a
 * <button> inside an <a> warns at hydrate. onActivate navigates to the public
 * profile (the tile was previously inert); the favorite heart rides in
 * badgeSlot and stops its own propagation so the heart never triggers
 * navigation. Tiles with no profile code are non-navigating (empty href).
 */
function ShortlistTalentTile({
  talent,
  cardCssVars,
  cardStyle = "editorial",
  popupDisabled = false,
  locale = "en",
}: {
  talent: DiscoverShortlistTalent;
  cardCssVars: Record<string, string> | undefined;
  /** Tenant card family → TalentCard style branch (no more hardcoded editorial). */
  cardStyle?: "portrait" | "editorial";
  /** Tenant `directory.card.profile-popup` ceiling: "off" = hard-navigate so the @modal intercept never fires. */
  popupDisabled?: boolean;
  locale?: string;
}) {
  const t = useT();
  const router = useRouter();
  const profileHref = talent.profileCode ? `/t/${talent.profileCode}` : "";
  return (
    <TalentCard
      data={toShortlistTileData(talent, t)}
      style={cardStyle}
      aspect="1:1"
      cssVars={cardCssVars}
      nameFallback="first_name"
      rootMode="button"
      onActivate={
        profileHref
          ? () => {
              // Tenant popup ceiling — same rationale as FavoritesShell.
              if (popupDisabled) {
                window.location.assign(profileHref);
                return;
              }
              router.push(profileHref);
            }
          : undefined
      }
      show={{
        showName: true,
        showTalentType: true,
        showLocation: false,
        showBadges: true,
        showAvailability: false,
      }}
      badgeSlot={
        // Canonical favorite control — heart a talent straight from the
        // shortlist tile, wired to client_favorites. stopPropagation on keydown
        // so Enter/Space on the heart doesn't also fire the card's onActivate.
        <div
          style={{ position: "absolute", top: 4, right: 4, pointerEvents: "auto" }}
          onKeyDown={(e) => { e.stopPropagation(); }}
        >
          <TalentCardActions
            talentProfileId={talent.talentId}
            profileCode={talent.profileCode ?? ""}
            displayName={talent.displayName}
            sourcePage="client-dashboard"
            variant="compact"
            locale={locale}
            hideInquiry
          />
        </div>
      }
    />
  );
}

/** Inline "PRO" pill shown next to gated CTAs for standard-tier clients. */
function ProTierPill() {
  return (
    <span
      style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "1px 5px", borderRadius: 3,
        background: "rgba(125,92,255,0.12)", color: "#5C3FCC",
      }}
    >
      Pro
    </span>
  );
}
