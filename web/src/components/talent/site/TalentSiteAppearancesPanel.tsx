"use client";

import { useState } from "react";

import { useAdminShell } from "@/components/admin/shell/internal/state";
import { setTalentSiteVisibility } from "@/app/(workspace)/[tenantSlug]/talent/settings/actions";
import { agencyRosterProfileUrl } from "@/lib/talent/agency-roster-profile-url";
import {
  resolveEffectiveVisibility,
  type RosterStatus,
  type AgencyVisibility,
} from "@/lib/talent/representation";
import {
  displayUrl,
  placementControl,
  placementLabel,
  placementStatus,
  placementSummary,
  placementTone,
  splitPlacements,
  type PlacementKind,
  type PlacementStatus,
  type StatusTone,
} from "@/lib/talent/presence-placements";
import type { TalentSiteLocale } from "@/lib/talent-site/talent-site-i18n";
import { PlacementShareTools } from "@/components/talent/studio/PlacementShareTools";
import { usePresenceText } from "@/components/talent/studio/presence-i18n";

type Placement = {
  id: string;
  kind: PlacementKind;
  name: string;
  /** One line under the name: who manages it and how. */
  detail: string;
  url: string | null;
  status: PlacementStatus;
  isPrimary: boolean;
};

// Normalize raw DB values to the resolver's enums, kept byte-identical to
// load-representation.ts so the list chip and the drawer chip never disagree.
function asAgencyVisibility(v: string): AgencyVisibility {
  if (v === "site_visible" || v === "featured") return v;
  return "roster_only";
}
function asRosterStatus(v: string): RosterStatus {
  if (v === "active" || v === "pending" || v === "inactive" || v === "removed") {
    return v;
  }
  return "active";
}

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-admin-success-soft text-admin-success-deep",
  warn: "bg-admin-amber-soft text-admin-amber-deep",
  risk: "bg-admin-critical-soft text-admin-critical-deep",
  idle: "bg-admin-surface-alt text-admin-ink-muted",
};

function StatusChip({ status }: { status: PlacementStatus }) {
  const { t } = usePresenceText();
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[placementTone(status)]}`}
    >
      {t(placementLabel(status))}
    </span>
  );
}

/**
 * My presence › Where I appear. Answers four questions on one screen: where
 * am I visible, which link do I share, who manages each listing, and what I
 * can do about each one. Figures are named as unavailable, never zeroed.
 */
export function TalentSiteAppearancesPanel(_props: { locale?: TalentSiteLocale }) {
  const { openDrawer, bridgeTalentSelfProfile, bridgeTalentAgencies, tenantSlug } = useAdminShell();
  const { t, es } = usePresenceText();
  // Local overrides after a hide / show so the row answers immediately.
  const [hiddenOverride, setHiddenOverride] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);

  const talentId = bridgeTalentSelfProfile?.id ?? null;
  const profileCode = bridgeTalentSelfProfile?.profileCode ?? null;
  const globalHidden = bridgeTalentSelfProfile?.isPubliclyHidden ?? false;

  const placements: Placement[] = [];
  if (profileCode) {
    placements.push({
      id: "tulala",
      kind: "tulala",
      name: t("Tulala profile"),
      detail: t("Your profile on Tulala · managed by you"),
      url: `https://tulala.digital/t/${encodeURIComponent(profileCode)}`,
      status: globalHidden ? "hidden_everywhere" : "live",
      isPrimary: false,
    });
  }
  for (const a of bridgeTalentAgencies ?? []) {
    const kind: PlacementKind = a.plan === "free" ? "hub" : "agency";
    const url = agencyRosterProfileUrl(a.agencySlug, profileCode);
    const effective = resolveEffectiveVisibility({
      status: asRosterStatus(a.rosterStatus),
      agencyVisibility: asAgencyVisibility(a.agencyVisibility),
      talentSiteHidden: hiddenOverride[a.id] ?? a.talentSiteHidden,
      globalHidden,
    });
    placements.push({
      id: a.id,
      kind,
      name: a.agencyName,
      detail:
        kind === "hub"
          ? t("Directory · enquiries come to you")
          : `${t("Agency-managed")} · ${a.agencyName} ${t("decides what it publishes")}`,
      url,
      status: placementStatus(effective, Boolean(url)),
      isPrimary: a.isPrimary,
    });
  }

  const { live, other } = splitPlacements(placements);

  const setHidden = async (p: Placement, hidden: boolean) => {
    if (!talentId || !tenantSlug) return;
    setBusyId(p.id);
    setErrorId(null);
    const res = await setTalentSiteVisibility(tenantSlug, talentId, p.id, hidden);
    setBusyId(null);
    setConfirmId(null);
    if (res.ok) setHiddenOverride((m) => ({ ...m, [p.id]: hidden }));
    else setErrorId(p.id);
  };

  const confirmTarget = placements.find((p) => p.id === confirmId) ?? null;

  const renderRow = (p: Placement) => {
    const control = placementControl(p.kind, p.status);
    const busy = busyId === p.id;
    return (
      <li key={p.id} className="px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[220px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-admin-ink">{p.name}</span>
              <StatusChip status={p.status} />
              {p.isPrimary && (
                <span className="rounded-full bg-admin-surface-alt px-2 py-0.5 text-[11px] font-semibold text-admin-ink-muted">
                  {t("Primary")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-admin-ink-muted">{p.detail}</p>
            <p className="mt-0.5 break-all text-[12px] text-admin-ink-dim">
              {p.url && p.status !== "not_published" ? displayUrl(p.url) : t("No public address")}
            </p>
            <p className="mt-1 text-[12px] text-admin-ink-dim">
              {p.status === "not_published"
                ? t("No public page, so there is nothing to link to and no views to show. That is not a zero.")
                : t("Views and enquiries for this place are not available yet.")}
            </p>
            {p.status === "hidden_by_you" && (
              <p className="mt-1 text-[12px] text-admin-ink-muted">
                {t("Nobody can open it. Your Tulala profile and your own website are untouched.")}
              </p>
            )}
            {p.kind === "tulala" && (
              <p className="mt-1 text-[12px] text-admin-ink-muted">
                {t("Hiding your whole profile lives in Settings, under things that are hard to undo.")}
              </p>
            )}
            {errorId === p.id && (
              <p role="alert" className="mt-1 text-[12px] text-admin-critical">
                {t("Could not change it. Your listing is as it was and nothing was lost.")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {p.url && p.status === "live" && (
              <>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink"
                >
                  {t("View")}
                </a>
                <button
                  type="button"
                  aria-expanded={shareId === p.id}
                  onClick={() => setShareId((cur) => (cur === p.id ? null : p.id))}
                  className="inline-flex min-h-11 items-center rounded-full border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink"
                >
                  {t("Share")}
                </button>
              </>
            )}
            {control === "hide" && (
              <button
                type="button"
                disabled={busy || !talentId || !tenantSlug}
                onClick={() => setConfirmId(p.id)}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-admin-ink-muted disabled:opacity-50"
              >
                {t("Hide")}
              </button>
            )}
            {control === "show_again" && (
              <button
                type="button"
                disabled={busy || !talentId || !tenantSlug}
                onClick={() => void setHidden(p, false)}
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-4 text-[13px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)] disabled:opacity-50"
              >
                {busy ? t("Working…") : t("Show it again")}
              </button>
            )}
            {control === "request_change" && (
              <button
                type="button"
                onClick={() => openDrawer("representation", { focusAgencyId: p.id })}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-admin-ink-muted"
              >
                {t("Request a change")}
              </button>
            )}
          </div>
        </div>
        {shareId === p.id && p.url && <PlacementShareTools url={p.url} label={p.name} />}
      </li>
    );
  };

  return (
    <section data-tulala-talent-where-you-appear className="font-admin-body">
      <div className="mb-4">
        <h2 className="font-admin-display text-[20px] font-semibold text-admin-ink">{t("Where you appear")}</h2>
        <p className="mt-1 text-[13px] text-admin-ink-muted">
          {placements.length > 0 ? placementSummary(live.length, other.length, es) : t("Where clients can find you")}
        </p>
      </div>

      {placements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-admin-border-soft bg-admin-surface-alt px-4 py-6 text-center">
          <p className="text-[14px] font-semibold text-admin-ink">{t("Nothing yet")}</p>
          <p className="mt-1 text-[12px] text-admin-ink-muted">
            {t("Places that list you, and your Tulala profile once it has an address, appear here.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {live.length > 0 && (
            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-muted">
                {t("Live listings")}
              </h3>
              <ul className="divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
                {live.map(renderRow)}
              </ul>
            </div>
          )}
          {other.length > 0 && (
            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-muted">
                {t("Other connections")}
              </h3>
              <ul className="divide-y divide-admin-border-soft overflow-hidden rounded-2xl border border-admin-border-soft bg-white">
                {other.map(renderRow)}
              </ul>
            </div>
          )}
          <p className="rounded-xl bg-admin-surface-alt px-4 py-3 text-[12px] leading-relaxed text-admin-ink-muted">
            {t("Views are counted separately by each place and are not added together. Hiding a page never cancels a booking, refunds a payment or ends a relationship.")}
          </p>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-[440px] rounded-2xl bg-white p-5">
            <h3 className="font-admin-display text-[20px] text-admin-ink">
              {t("Hide this listing?")} · {confirmTarget.name}
            </h3>
            <ul className="mt-3 space-y-2 text-[13px] text-admin-ink">
              <li>{t("The page stops being public within a few minutes. Search engines take longer to forget it.")}</li>
              <li>{t("Your bookings from this place are untouched. Payments and conversations stay as they are.")}</li>
              <li>{t("You are not leaving. You can show it again in one tap, at the same address.")}</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 px-3 text-[13px] text-admin-ink"
                onClick={() => setConfirmId(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                disabled={busyId === confirmTarget.id}
                className="min-h-11 rounded-full border border-[var(--tulala-primary-fill)] bg-[var(--tulala-primary-fill)] px-4 text-[13px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep)] hover:bg-[var(--tulala-primary-fill-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill)] disabled:opacity-50"
                onClick={() => void setHidden(confirmTarget, true)}
              >
                {busyId === confirmTarget.id ? t("Hiding…") : t("Hide it")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
