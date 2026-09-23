"use client";

// Phase 5 — "Where I appear" account-menu section for the talent surface.
// Mounted inside `AccountMenuTrigger` (IdentityBar-1.tsx) only when the
// signed-in user is on the talent surface. New file per the file-size
// ratchet on IdentityBar-1.tsx.
//
// Data sources (no new loaders, no second source of truth):
//   - `bridgeTalentSelfProfile` (avatar photo, name, profile code) — already
//     on the admin-shell bridge.
//   - `bridgeTalentRepresentation` — the SAME `loadRepresentation()` result
//     the Representation drawer renders (Phase 5 bug fixes: the platform hub
//     is folded into the Tulala self entry, and a non-visible entry carries
//     no public URL), so "Where I appear" and the drawer never disagree.
//   - `useTalentSiteDashboardInitialLoad()` — the talent personal-site
//     dashboard state already loaded by `/talent/layout.tsx` and provided
//     via `TalentSiteDashboardProvider`, which wraps the talent shell (and
//     therefore this menu). Returns null outside that provider (e.g. on the
//     workspace surface), so this component must tolerate a null result.
//
// Styling: Tailwind utility classes only (`ratchet/no-new-inline-style`
// freezes any NEW `style={{…}}` object under `components/admin/shell`) — the
// `admin-*` classes below resolve through `src/styles/admin-color-bridge.css`,
// the same palette `COLORS`/`FONTS` expose to older files in this tree.

import type { ReactNode } from "react";
import type { EffectiveVisibility } from "@/lib/talent/representation";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";
import { useDashboardText } from "../dashboard-i18n";
import { Avatar, Icon } from "../primitives";
import { useAdminShell } from "../state";

const STAGE_LABEL_ES: Record<string, string> = {
  draft: "Borrador",
  published: "En vivo",
  unpublished: "Sin publicar",
  archived: "Archivado",
};

function siteStageLabel(status: string, isSpanish: boolean): string {
  if (isSpanish) return STAGE_LABEL_ES[status] ?? status;
  if (status === "draft") return "Draft";
  if (status === "published") return "Live";
  if (status === "unpublished") return "Unpublished";
  if (status === "archived") return "Archived";
  return status;
}

/** Tailwind background class for the visibility dot, per effective state. */
function dotClass(effective: EffectiveVisibility): string {
  if (effective === "live") return "bg-admin-green";
  if (effective === "pending") return "bg-admin-amber";
  return "bg-admin-ink-dim";
}

// Own, self-contained labels (not `representationChipCopy`, which is
// localized through the separate `useT()` catalog the Representation
// drawer uses) — this menu follows the surrounding IdentityBar code, which
// localizes through `dashboard-i18n.ts`'s literal-string dictionary. Reusing
// `representationChipCopy`'s English text here would risk colliding with an
// unrelated existing dictionary entry for the same literal string (e.g.
// "Live" is already mapped for a different surface).
const EFFECTIVE_LABEL_EN: Record<EffectiveVisibility, string> = {
  live: "Live",
  you_hid: "You hid this",
  agency_hidden: "Agency is not showing you",
  winding_down: "Winding down",
  pending: "Pending",
  global_hidden: "Hidden everywhere",
  removed: "Removed",
};
const EFFECTIVE_LABEL_ES: Record<EffectiveVisibility, string> = {
  live: "En vivo",
  you_hid: "Lo ocultaste",
  agency_hidden: "La agencia no te muestra",
  winding_down: "Terminando",
  pending: "Pendiente",
  global_hidden: "Oculto en todas partes",
  removed: "Eliminado",
};

function effectiveVisibilityLabel(effective: EffectiveVisibility, isSpanish: boolean): string {
  return (isSpanish ? EFFECTIVE_LABEL_ES : EFFECTIVE_LABEL_EN)[effective];
}

const ROW_SHELL_CLASS =
  "flex w-full min-h-[44px] items-center gap-[10px] rounded-[8px] border-none bg-transparent px-[12px] py-[8px] text-left font-admin-body cursor-pointer box-border hover:bg-[rgba(11,11,13,0.04)]";

/** A clickable menu row, 44px min height for a comfortable mobile target. */
function RowShell({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button type="button" role="menuitem" aria-label={ariaLabel} onClick={onClick} className={ROW_SHELL_CLASS}>
      {children}
    </button>
  );
}

function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] bg-admin-surface-alt"
    >
      {children}
    </span>
  );
}

export function TalentAccountMenuSection({ onNavigate }: { onNavigate: () => void }) {
  const { bridgeTalentSelfProfile, bridgeTalentRepresentation, openDrawer } = useAdminShell();
  const copy = useDashboardText();
  const siteLoad = useTalentSiteDashboardInitialLoad();

  const name = bridgeTalentSelfProfile?.displayName?.trim() || copy.t("Talent");
  const photoUrl = bridgeTalentSelfProfile?.headshotUrl ?? undefined;
  const initials = (() => {
    const parts = name.split(/\s+/u).filter(Boolean);
    const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
    return (letters || name.slice(0, 2)).toUpperCase();
  })();

  const site = siteLoad && siteLoad.ok ? siteLoad.state : null;
  const hasSite = Boolean(site?.site && site.publicSiteUrl);

  const selfEntry = bridgeTalentRepresentation?.entries.find((e) => e.kind === "self_page") ?? null;
  const appearances = (bridgeTalentRepresentation?.entries ?? []).filter((e) => e.kind !== "self_page");

  return (
    <div data-tulala-talent-account-menu>
      {/* Signed-in header — headshot avatar instead of the generic text-only
          header, since a talent is proud to see their own photo here. */}
      <div className="mb-[4px] flex items-center gap-[10px] border-b border-admin-border-soft px-[12px] pt-[10px] pb-[12px]">
        <Avatar initials={initials} size={40} tone="ink" hashSeed={name} photoUrl={photoUrl} />
        <div className="min-w-0">
          <div className="text-admin-13 font-semibold text-admin-ink">{name}</div>
          <div className="mt-px text-admin-11h text-admin-ink-muted">{copy.t("Talent")}</div>
        </div>
      </div>

      {/* My website */}
      <RowShell
        ariaLabel={copy.t("My website")}
        onClick={() => {
          onNavigate();
          if (hasSite && site?.publicSiteUrl) {
            window.open(site.publicSiteUrl, "_blank", "noopener,noreferrer");
          } else {
            window.location.assign("/talent/public-page");
          }
        }}
      >
        <RowIcon>
          <Icon name="globe" size={14} stroke={1.7} color="var(--color-admin-ink-muted)" />
        </RowIcon>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-admin-ink">{copy.t("My website")}</span>
          <span className="mt-px block overflow-hidden text-admin-11 text-ellipsis whitespace-nowrap text-admin-ink-muted">
            {hasSite && site?.publicSiteUrl
              ? `${site.publicSiteUrl.replace(/^https:\/\//, "")} · ${siteStageLabel(site.site!.status, copy.isSpanish)}`
              : copy.t("Set up your public page")}
          </span>
        </span>
      </RowShell>

      {/* My Tulala profile */}
      {selfEntry?.publicUrl ? (
        <RowShell
          ariaLabel={copy.t("My Tulala profile")}
          onClick={() => {
            onNavigate();
            window.open(selfEntry.publicUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <RowIcon>
            <Icon name="external" size={14} stroke={1.7} color="var(--color-admin-ink-muted)" />
          </RowIcon>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-admin-ink">{copy.t("My Tulala profile")}</span>
            <span className="mt-px block overflow-hidden text-admin-11 text-ellipsis whitespace-nowrap text-admin-ink-muted">
              {selfEntry.publicUrl.replace(/^https:\/\//, "")}
            </span>
          </span>
        </RowShell>
      ) : null}

      {/* Where I appear */}
      {appearances.length > 0 && (
        <div className="mt-[4px]">
          <div className="px-[12px] pt-[6px] pb-[4px] text-admin-10h font-bold tracking-[0.6px] text-admin-ink-muted uppercase">
            {copy.t("Where I appear")}
          </div>
          {appearances.map((entry) => {
            const statusLabel = effectiveVisibilityLabel(entry.effective, copy.isSpanish);
            return (
              <div key={entry.tenantId} className="box-border flex min-h-[44px] items-center gap-[8px] px-[12px] py-[6px]">
                <span aria-hidden className={`h-[7px] w-[7px] shrink-0 rounded-full ${dotClass(entry.effective)}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-[6px] overflow-hidden text-admin-12h font-medium text-ellipsis whitespace-nowrap text-admin-ink">
                    {entry.name}
                    <span className="shrink-0 rounded-[4px] bg-admin-surface-alt px-[5px] py-px text-admin-9 font-bold tracking-[0.4px] text-admin-ink-muted uppercase">
                      {copy.t("Agency")}
                    </span>
                  </span>
                  <span className="mt-px block text-admin-10h text-admin-ink-muted">{statusLabel}</span>
                </span>
                {entry.publicUrl ? (
                  <a
                    href={entry.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    aria-label={`${copy.t("View")} ${entry.name}`}
                    onClick={onNavigate}
                    className="shrink-0 px-[4px] py-[6px] text-admin-11h font-semibold text-admin-accent-deep no-underline"
                  >
                    {copy.t("View")}
                  </a>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`${copy.t("Manage")} ${entry.name}`}
                  onClick={() => {
                    onNavigate();
                    openDrawer("representation", {
                      actor: "talent",
                      focusAgencyId: entry.tenantId,
                    });
                  }}
                  className="shrink-0 cursor-pointer border-none bg-transparent px-[4px] py-[6px] font-admin-body text-admin-11h font-semibold text-admin-ink-muted"
                >
                  {copy.t("Manage")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-1 mb-1 border-t border-admin-border-soft" />
    </div>
  );
}
