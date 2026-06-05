"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COLORS,
  FONTS,
  useAdminShell,
} from "../state";
import {
  DrawerShell,
  Icon,
  PrimaryButton,
  SecondaryButton,
  Toggle,
} from "../primitives";
import { SaveErrorBanner } from "./shared";
import {
  representationChipCopy,
  type RepresentationEntry,
} from "@/lib/talent/representation";
import type { RepresentationLoadResult } from "@/lib/talent/load-representation";
import {
  selfPauseAgency,
  selfRemoveAgency,
  selfResumeAgency,
  selfSetGlobalHidden,
  selfSetPrimaryAgency,
  selfSetRosterVisibility,
} from "@/lib/server-actions/talent-self-profile-sections";
import { loadRepresentationForAgencyAdmin } from "@/lib/server-actions/representation-actions";
import { setRosterTalentSiteVisibility } from "@/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions";

function chipStyles(tone: "live" | "warn" | "muted" | "conflict") {
  if (tone === "live") {
    return { bg: "rgba(15,79,62,0.12)", fg: COLORS.accentDeep, prefix: "🟢" };
  }
  if (tone === "warn") {
    return { bg: "rgba(214,158,46,0.12)", fg: "#7C5A14", prefix: "🟡" };
  }
  if (tone === "conflict") {
    return { bg: "rgba(220,38,38,0.08)", fg: "#b91c1c", prefix: "🔴" };
  }
  return { bg: "rgba(11,11,13,0.06)", fg: COLORS.inkMuted, prefix: "⚪" };
}

function VisibilityChip({
  entry,
  actor,
}: {
  entry: RepresentationEntry;
  actor: "talent" | "agency";
}) {
  const copy = representationChipCopy(entry.effective, actor);
  if (!copy) return null;
  const styles = chipStyles(copy.tone);
  const label = actor === "talent" ? copy.talent : copy.agency;
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
        background: styles.bg,
        color: styles.fg,
        whiteSpace: "nowrap",
      }}
    >
      {styles.prefix} {label}
    </span>
  );
}

function RepresentationRow({
  entry,
  actor,
  expanded,
  onToggle,
  globalHidden,
  talentProfileId,
  tenantSlug,
  focusTenantId,
  onMutated,
}: {
  entry: RepresentationEntry;
  actor: "talent" | "agency";
  expanded: boolean;
  onToggle: () => void;
  globalHidden: boolean;
  talentProfileId: string;
  tenantSlug: string | undefined;
  focusTenantId: string | undefined;
  onMutated: () => void;
}) {
  const { toast } = useAdminShell();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isSelf = entry.kind === "self_page";
  const rosterHidden = entry.talentSiteHidden;
  const shown = !rosterHidden && !globalHidden && entry.effective === "live";
  const agencyBlocksEye = entry.agencyVisibility === "roster_only";

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setPending(true);
    setError(null);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }
    toast("Saved");
    onMutated();
  };

  const kindLabel =
    entry.kind === "hub" ? "HUB" : entry.kind === "self_page" ? "YOUR PAGE" : "AGENCY";

  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{entry.name}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                padding: "2px 6px",
                borderRadius: 4,
                background: COLORS.surfaceAlt,
                color: COLORS.inkMuted,
              }}
            >
              {kindLabel}
            </span>
            {entry.planTier ? (
              <span style={{ fontSize: 10, color: COLORS.inkMuted, textTransform: "uppercase" }}>
                {entry.planTier}
              </span>
            ) : null}
          </div>
          {entry.publicUrl ? (
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2, fontFamily: FONTS.mono }}>
              {entry.publicUrl.replace(/^https:\/\//, "")}
            </div>
          ) : null}
        </div>
        <VisibilityChip entry={entry} actor={actor} />
        <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : undefined }}>
          <Icon name="chevron-down" size={14} stroke={1.7} />
        </span>
      </button>

      {expanded ? (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.borderSoft}` }}>
          {error ? (
            <SaveErrorBanner error={error} onDismiss={() => setError(null)} />
          ) : null}

          <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.55, margin: "12px 0" }}>
            {isSelf
              ? "Owned by you · Controlled by your Talent plan."
              : "Pitch to clients (you confirm), list on public roster, hold dates (with your approval), DM via inbox."}
          </div>

          {entry.publicUrl ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <a
                href={entry.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, fontWeight: 600, color: COLORS.accentDeep }}
              >
                Preview / Visit profile →
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(entry.publicUrl);
                  toast("Link copied");
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.inkMuted,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                Copy URL
              </button>
            </div>
          ) : null}

          {actor === "talent" && !isSelf ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Show on this site</span>
                <Toggle
                  on={shown}
                  onChange={(next) => {
                    if (
                      pending ||
                      globalHidden ||
                      agencyBlocksEye ||
                      entry.status === "inactive"
                    ) {
                      return;
                    }
                    void run(() =>
                      selfSetRosterVisibility({
                        talent_profile_id: talentProfileId,
                        agency_id: entry.tenantId,
                        hidden: !next,
                      }),
                    );
                  }}
                />
              </div>
              {globalHidden ? (
                <p style={{ fontSize: 11, color: "#b91c1c", margin: 0 }}>
                  You&apos;re hidden everywhere — turn that off first.
                </p>
              ) : agencyBlocksEye ? (
                <p style={{ fontSize: 11, color: "#b91c1c", margin: 0 }}>
                  {entry.name} controls this — they haven&apos;t published you on their site. Ask them to feature you.
                </p>
              ) : null}

              {!entry.isPrimary ? (
                <SecondaryButton
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      selfSetPrimaryAgency({
                        talent_profile_id: talentProfileId,
                        agency_id: entry.tenantId,
                      }),
                    )
                  }
                >
                  Set as primary
                </SecondaryButton>
              ) : null}

              {entry.status === "inactive" ? (
                <PrimaryButton
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      selfResumeAgency({
                        talent_profile_id: talentProfileId,
                        agency_id: entry.tenantId,
                      }),
                    )
                  }
                >
                  Resume distribution
                </PrimaryButton>
              ) : (
                <SecondaryButton
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      selfPauseAgency({
                        talent_profile_id: talentProfileId,
                        agency_id: entry.tenantId,
                      }),
                    )
                  }
                >
                  Pause distribution
                </SecondaryButton>
              )}

              {confirmRemove ? (
                <div style={{ padding: 10, background: "rgba(220,38,38,0.06)", borderRadius: 8 }}>
                  <p style={{ fontSize: 12, margin: "0 0 8px", lineHeight: 1.5 }}>
                    This removes you from {entry.name}&apos;s roster permanently. They&apos;d have to re-invite you.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <PrimaryButton
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          selfRemoveAgency({
                            talent_profile_id: talentProfileId,
                            agency_id: entry.tenantId,
                          }),
                        )
                      }
                    >
                      Leave permanently
                    </PrimaryButton>
                    <SecondaryButton size="sm" onClick={() => setConfirmRemove(false)}>
                      Cancel
                    </SecondaryButton>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  style={{
                    fontSize: 12,
                    color: "#b91c1c",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 0,
                    fontFamily: FONTS.body,
                  }}
                >
                  Leave permanently…
                </button>
              )}
            </div>
          ) : null}

          {actor === "agency" && focusTenantId === entry.tenantId && tenantSlug ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>List on your public site</span>
                <Toggle
                  on={entry.agencyVisibility !== "roster_only"}
                  onChange={(next) => {
                    if (pending || entry.talentSiteHidden) return;
                    void run(async () => {
                      const res = await setRosterTalentSiteVisibility(
                        tenantSlug,
                        talentProfileId,
                        next,
                      );
                      if (!res) return { ok: false as const, error: "Update failed" };
                      return res.success
                        ? { ok: true as const }
                        : { ok: false as const, error: res.error ?? "Update failed" };
                    });
                  }}
                />
              </div>
              {entry.talentSiteHidden ? (
                <p style={{ fontSize: 11, color: "#b91c1c", margin: 0 }}>
                  Talent hid their profile on your roster — you can&apos;t override that.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RepresentationDrawer() {
  const {
    state,
    closeDrawer,
    toast,
    bridgeTalentSelfProfile,
    bridgeTalentRepresentation,
    tenantSlug,
    bridgeTenantIdentity,
  } = useAdminShell();

  const router = useRouter();
  const open = state.drawer.drawerId === "representation";
  const payload = state.drawer.payload ?? {};
  const actor: "talent" | "agency" =
    payload.actor === "agency" ? "agency" : "talent";
  const focusAgencyId = (payload.focusAgencyId ?? payload.agencyId ?? payload.id) as
    | string
    | undefined;
  const adminTalentId = payload.talentProfileId as string | undefined;

  const talentProfileId =
    actor === "agency"
      ? adminTalentId
      : bridgeTalentSelfProfile?.id;

  const [agencyData, setAgencyData] = useState<RepresentationLoadResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [globalPending, setGlobalPending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const talentData = bridgeTalentRepresentation;
  const data = actor === "agency" ? agencyData : talentData;
  const globalHidden =
    data?.globalHidden ?? bridgeTalentSelfProfile?.isPubliclyHidden ?? false;

  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => e.effective !== "removed"),
    [data?.entries],
  );

  const loadAgency = useCallback(async () => {
    if (!open || actor !== "agency" || !talentProfileId) return;
    const res = await loadRepresentationForAgencyAdmin({
      talent_profile_id: talentProfileId,
    });
    if (!res.ok) {
      toast(res.error);
      return;
    }
    setAgencyData(res.data);
  }, [actor, open, talentProfileId, toast]);

  useEffect(() => {
    void loadAgency();
  }, [loadAgency, reloadKey]);

  useEffect(() => {
    if (!open) return;
    if (focusAgencyId) {
      setExpandedId(focusAgencyId);
    }
  }, [open, focusAgencyId]);

  const onMutated = () => {
    setReloadKey((k) => k + 1);
    if (actor === "agency") void loadAgency();
    // Talent mode reads `bridgeTalentRepresentation` from the server-rendered
    // shell layout; refresh server components so the chips reflect the new
    // roster/visibility state instead of going stale until a full reload.
    else router.refresh();
  };

  const toggleGlobal = async (nextVisible: boolean) => {
    if (!talentProfileId || globalPending) return;
    setGlobalPending(true);
    setGlobalError(null);
    const res = await selfSetGlobalHidden({
      talent_profile_id: talentProfileId,
      hidden: !nextVisible,
    });
    setGlobalPending(false);
    if (!res.ok) {
      setGlobalError(res.error);
      return;
    }
    toast("Visibility updated");
    onMutated();
  };

  if (!talentProfileId && open) {
    return (
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title="Representation"
        description="Sign in as a talent to manage where you appear."
        width={520}
        footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
      >
        <p style={{ fontSize: 13, color: COLORS.inkMuted }}>No talent profile in context.</p>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={actor === "agency" ? "Talent representation" : "Where you appear"}
      description={
        actor === "agency"
          ? "How this talent appears on your roster and across Tulala."
          : "Every place your profile is listed, with true visibility."
      }
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Done</SecondaryButton>}
    >
      {actor === "talent" ? (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              background: globalHidden ? "rgba(82,96,109,0.08)" : "#fff",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Hide my profile everywhere</div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>
                Overrides every roster and directory listing.
              </div>
            </div>
            <Toggle
              on={!globalHidden}
              onChange={(next) => {
                if (globalPending) return;
                void toggleGlobal(next);
              }}
            />
          </div>
          {globalError ? (
            <SaveErrorBanner
              error={globalError}
              onDismiss={() => setGlobalError(null)}
            />
          ) : null}
          <p style={{ fontSize: 11, color: COLORS.inkMuted, margin: "8px 0 0" }}>
            Directory search updates within ~15 minutes after changes.
          </p>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.inkMuted }}>No representation entries yet.</p>
        ) : (
          entries.map((entry) => (
            <RepresentationRow
              key={entry.tenantId}
              entry={entry}
              actor={actor}
              expanded={expandedId === entry.tenantId}
              onToggle={() =>
                setExpandedId((id) => (id === entry.tenantId ? null : entry.tenantId))
              }
              globalHidden={globalHidden}
              talentProfileId={talentProfileId!}
              tenantSlug={tenantSlug}
              focusTenantId={
                actor === "agency" ? bridgeTenantIdentity?.tenantId : undefined
              }
              onMutated={onMutated}
            />
          ))
        )}
      </div>
    </DrawerShell>
  );
}
