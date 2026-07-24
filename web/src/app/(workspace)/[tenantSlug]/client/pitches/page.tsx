// Step 8 — Client Pitch History.
//
// Surface for the registered-client view of every pitch the user has
// received (declined / approved / converted / sent / etc.). Each row
// deep-links back to the public pitch landing `/share/pitch/<token>`
// where the client can act on the pitch.
//
// Source spec: web/docs/inquiry-funnel-execution-plan-2026-05-13.md Step 8.
//
// Scope: this page shows *all* pitches the client has received across
// agencies — not just the current tenant. A client's pitch history is
// an account-global record, but the route is namespaced by tenantSlug
// because the client shell is keyed by an agency relationship.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate, withPluralization } from "@/i18n/interpolate";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientPitches } from "../../_data-bridge";
import { formatClientDate as fmtClientDate } from "../date-format";

type Translator = (key: string) => string;

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{ status?: string }>;

/**
 * Status filter buckets surfaced as chip row above the list. Server-side
 * URL-param driven so the page stays a server component (no client
 * island, no hydration cost). Picks the bucket that matches the
 * `?status=` query, defaulting to "all".
 */
// `label` stays English as the non-UI fallback / documentation value; UI
// surfaces MUST render `t(f.labelKey)` so the chips follow the dashboard locale.
const STATUS_FILTERS = [
  { key: "all",      label: "All",       labelKey: "client.pitches.filterAll",      matches: () => true },
  { key: "open",     label: "Open",      labelKey: "client.pitches.filterOpen",     matches: (s: string) => s === "sent" || s === "viewed" || s === "edited" },
  { key: "approved", label: "Approved",  labelKey: "client.pitches.filterApproved", matches: (s: string) => s === "approved" },
  { key: "done",     label: "Done",      labelKey: "client.pitches.filterDone",     matches: (s: string) => s === "converted" },
  { key: "closed",   label: "Closed",    labelKey: "client.pitches.filterClosed",   matches: (s: string) => s === "declined" || s === "expired" || s === "cancelled" },
] as const;
type FilterKey = (typeof STATUS_FILTERS)[number]["key"];

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  accent:      "#1D4ED8",
  accentSoft:  "rgba(29,78,216,0.08)",
  blueDeep:    "#1D4ED8",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

type PitchStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "edited"
  | "approved"
  | "converted"
  | "declined"
  | "cancelled"
  | "expired";

function statusTone(status: PitchStatus, t: Translator) {
  // 4-family palette mirroring the inquiries page so the client sees
  // consistent semantics across surfaces (positive=green, in-progress=blue,
  // attention=amber, terminal-neutral=dim).
  const map: Record<PitchStatus, { bg: string; color: string; label: string }> = {
    draft:     { bg: C.surface,     color: C.inkDim,     label: t("client.pitches.statusDraft") },
    sent:      { bg: C.accentSoft,  color: C.blueDeep,   label: t("client.pitches.statusSent") },
    viewed:    { bg: C.accentSoft,  color: C.blueDeep,   label: t("client.pitches.statusViewed") },
    edited:    { bg: C.amberSoft,   color: C.amberDeep,  label: t("client.pitches.statusEdited") },
    approved:  { bg: C.successSoft, color: C.successDeep, label: t("client.pitches.statusApproved") },
    converted: { bg: C.successSoft, color: C.successDeep, label: t("client.pitches.statusConverted") },
    declined:  { bg: C.surface,     color: C.inkDim,     label: t("client.pitches.statusDeclined") },
    cancelled: { bg: C.surface,     color: C.inkDim,     label: t("client.pitches.statusCancelled") },
    expired:   { bg: C.surface,     color: C.inkDim,     label: t("client.pitches.statusExpired") },
  };
  return map[status];
}

/**
 * The action verb on each row depends on the pitch's current state:
 *   sent | viewed | edited → "Open" (recipient hasn't acted)
 *   approved              → "Continue" (next step: submit as inquiry)
 *   converted             → "View" (terminal — pitch is done)
 *   declined | expired | cancelled → "View" (read-only)
 */
function actionLabel(status: PitchStatus, t: Translator): string {
  if (status === "sent" || status === "viewed" || status === "edited") return t("client.pitches.actionOpen");
  if (status === "approved") return t("client.pitches.actionContinue");
  return t("client.pitches.actionView");
}

export default async function ClientPitchesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const { status: rawStatus } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const tPlural = withPluralization(t);

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Same gate as the inquiries page — must be a registered client with
  // an existing relationship to this agency.
  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const allPitches = await loadClientPitches(session.user.id);
  const activeFilter: FilterKey =
    STATUS_FILTERS.find((f) => f.key === rawStatus)?.key ?? "all";
  const matcher = STATUS_FILTERS.find((f) => f.key === activeFilter)!.matches;
  const pitches = allPitches.filter((p) => matcher(p.status));

  // Per-bucket counts so the chips can show "Approved (3)" — recomputed
  // server-side from the unfiltered list.
  const counts = new Map<FilterKey, number>();
  for (const f of STATUS_FILTERS) {
    counts.set(f.key, allPitches.filter((p) => f.matches(p.status)).length);
  }

  return (
    <div style={{ fontFamily: FONT, color: C.ink }}>
      {/* ── Header ── */}
      <header className="mb-7">
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.4,
            margin: 0,
            color: C.ink,
          }}
        >
          {t("client.pitches.title")}
        </h1>
        <p style={{ fontSize: 14, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
          {t("client.pitches.subtitle")}
        </p>
      </header>

      {/* Status filter chips — links so the page stays a server component */}
      {allPitches.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {STATUS_FILTERS.map((f) => {
            const isActive = f.key === activeFilter;
            const count = counts.get(f.key) ?? 0;
            const href =
              f.key === "all"
                ? `/${tenantSlug}/client/pitches`
                : `/${tenantSlug}/client/pitches?status=${f.key}`;
            return (
              <a
                key={f.key}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  textDecoration: "none",
                  fontSize: 12.5,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#fff" : C.inkMuted,
                  background: isActive ? C.ink : "rgba(11,11,13,0.04)",
                  border: `1px solid ${isActive ? C.ink : C.borderSoft}`,
                  transition: "all 100ms",
                  whiteSpace: "nowrap",
                }}
              >
                {t(f.labelKey)}
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: isActive ? "rgba(255,255,255,0.65)" : C.inkDim,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {pitches.length === 0 ? (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: "36px 24px",
            textAlign: "center",
            color: C.inkMuted,
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            {allPitches.length === 0 ? t("client.pitches.emptyTitle") : t("client.pitches.emptyFilteredTitle")}
          </div>
          <p style={{ margin: 0 }}>
            {allPitches.length === 0
              ? t("client.pitches.emptyBody")
              : t("client.pitches.emptyFilteredBody")}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {pitches.map((pitch, idx) => {
            const s = statusTone(pitch.status, t);
            const sentDate = pitch.sentAt ?? pitch.createdAt;
            // Approved pitches that haven't converted yet are the
            // "needs me" rows — surface them with a soft tint, matching
            // the inquiries page's needsAction convention.
            const needsAction = pitch.status === "approved";
            return (
              <a
                key={pitch.id}
                href={pitch.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom:
                    idx < pitches.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  background: needsAction ? "rgba(26,115,72,0.04)" : "transparent",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background 0.1s",
                }}
              >
                <div className="min-w-0">
                  {/* Status pill */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: s.bg,
                        color: s.color,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.label}
                    </span>
                    {needsAction && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          color: C.successDeep,
                        }}
                      >
                        {t("client.pitches.nextStepReady")}
                      </span>
                    )}
                  </div>

                  {/* Agency name + talent count */}
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: C.ink,
                      letterSpacing: -0.1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pitch.agencyName}
                  </div>

                  {/* Meta line */}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.inkMuted,
                      marginTop: 3,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>
                      {tPlural("client.pitches.talentCount", pitch.talentCount)}
                    </span>
                    <span aria-hidden style={{ color: C.inkDim }}>·</span>
                    <span>{interpolate(t("client.pitches.sentOn"), { date: fmtClientDate(sentDate) })}</span>
                    {pitch.expiresAt && pitch.status !== "converted" && (
                      <>
                        <span aria-hidden style={{ color: C.inkDim }}>·</span>
                        <span>{interpolate(t("client.pitches.expiresOn"), { date: fmtClientDate(pitch.expiresAt) })}</span>
                      </>
                    )}
                  </div>

                  {/* Personal note preview */}
                  {pitch.personalNotePreview && (
                    <p
                      style={{
                        fontSize: 12.5,
                        color: C.inkMuted,
                        marginTop: 8,
                        marginBottom: 0,
                        lineHeight: 1.45,
                        fontStyle: "italic",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      “{pitch.personalNotePreview}”
                    </p>
                  )}
                </div>

                {/* Action verb */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: needsAction ? C.successDeep : C.accent,
                    whiteSpace: "nowrap",
                  }}
                >
                  {actionLabel(pitch.status, t)} <span aria-hidden>→</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
