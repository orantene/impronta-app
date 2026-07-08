"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/agency — Phase 1d body chunk.
// Owns: TalentAgencyRelationshipDrawer, TalentLeaveAgencyDrawer,
// TalentPrivacyDrawer, TalentContactPreferencesDrawer.
// Private helpers: PresetButton.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  CLIENT_TRUST_LEVELS,
  CLIENT_TRUST_META,
  COLORS,
  DEFAULT_CONTACT_POLICY,
  FONTS,
  MY_AGENCIES,
  MY_TALENT_PROFILE,
  SELECTIVE_CONTACT_POLICY,
  useAdminShell,
  type TalentContactPolicy,
} from "../state";
import {
  CapsLabel,
  ClientTrustChip,
  Divider,
  DrawerShell,
  Icon,
  PrimaryButton,
  SecondaryButton,
  Toggle,
} from "../primitives";
import {
  confirmAgencyExclusivity,
  declineAgencyExclusivity,
  selfSetPrimaryAgency,
  updateSelfContactPolicy,
  updateSelfPrivacy,
} from "@/lib/server-actions/talent-self-profile-sections";
import { KvRow, SaveErrorBanner, StandardFooter, ToggleRow } from "./shared";

// ─── Agency relationship ─────────────────────────────────────────

export function TalentAgencyRelationshipDrawer() {
  const { state, closeDrawer, openDrawer, toast, bridgeTalentSelfProfile, bridgeTalentAgencies } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-agency-relationship";
  const mode = state.drawer.payload?.mode;

  // payload may use "agencyId" (from AgenciesPage) or "id" (legacy paths)
  const payloadAgencyId = (state.drawer.payload?.agencyId ?? state.drawer.payload?.id) as string | undefined;

  // Resolve agency from bridge data when available, fall back to mock.
  const bridgeAgency = bridgeTalentAgencies && payloadAgencyId
    ? bridgeTalentAgencies.find((a) => a.id === payloadAgencyId)
    : null;

  const [settingPrimary, setSettingPrimary] = useState(false);
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [respondingExclusivity, setRespondingExclusivity] = useState(false);

  const handleSetPrimary = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    const agencyId = bridgeAgency?.id ?? payloadAgencyId;
    if (!talentProfileId || !agencyId) { setPrimaryError(t("dashboard.talentDrawers.agency.cannotIdentify")); return; }
    setSettingPrimary(true);
    setPrimaryError(null);
    const result = await selfSetPrimaryAgency({ talent_profile_id: talentProfileId, agency_id: agencyId });
    setSettingPrimary(false);
    if (!result.ok) { setPrimaryError(result.error); return; }
    toast(t("dashboard.talentDrawers.agency.primaryUpdated"));
    closeDrawer();
  };

  const handleConfirmExclusivity = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    const agencyId = bridgeAgency?.id ?? payloadAgencyId;
    if (!talentProfileId || !agencyId) { setPrimaryError(t("dashboard.talentDrawers.agency.cannotIdentify")); return; }
    setRespondingExclusivity(true);
    setPrimaryError(null);
    const result = await confirmAgencyExclusivity({ talent_profile_id: talentProfileId, agency_id: agencyId });
    setRespondingExclusivity(false);
    if (!result.ok) { setPrimaryError(result.error); return; }
    toast(t("dashboard.talentDrawers.agency.exclusivityConfirmed"));
    closeDrawer();
  };

  const handleDeclineExclusivity = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    const agencyId = bridgeAgency?.id ?? payloadAgencyId;
    if (!talentProfileId || !agencyId) { setPrimaryError(t("dashboard.talentDrawers.agency.cannotIdentify")); return; }
    setRespondingExclusivity(true);
    setPrimaryError(null);
    const result = await declineAgencyExclusivity({ talent_profile_id: talentProfileId, agency_id: agencyId });
    setRespondingExclusivity(false);
    if (!result.ok) { setPrimaryError(result.error); return; }
    toast(t("dashboard.talentDrawers.agency.exclusivityDeclined"));
    closeDrawer();
  };

  if (mode === "add") {
    const publicUrl = bridgeTalentSelfProfile?.profileCode
      ? `tulala.digital/t/${bridgeTalentSelfProfile.profileCode}`
      : MY_TALENT_PROFILE.publicUrl;
    return (
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title={t("dashboard.talentDrawers.agency.addAnother")}
        description={t("dashboard.talentDrawers.agency.addAnotherDesc")}
        width={520}
        footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.gotIt")}</SecondaryButton>}
      >
        <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }} className="text-admin-ink">
          {t("dashboard.talentDrawers.agency.addAnotherBody")}
        </div>
        <div className="flex items-center gap-2">
          <div style={{ flex: 1, padding: "10px 12px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.mono, fontSize: 12 }} className="bg-admin-surface-alt text-admin-ink">
            {publicUrl}
          </div>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(`https://${publicUrl}`); toast(t("dashboard.talentDrawers.agency.linkCopied")); }}
            style={{ padding: "8px 12px", background: COLORS.fill, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: FONTS.body, whiteSpace: "nowrap" }}
          >
            {t("dashboard.talentDrawers.copy")}
          </button>
        </div>
      </DrawerShell>
    );
  }

  // Resolve display data — prefer bridge, fall back to mock fixture.
  const mockAgency = MY_AGENCIES.find((x) => x.id === payloadAgencyId) ?? MY_AGENCIES[0];
  const name       = bridgeAgency?.agencyName ?? mockAgency.name;
  const status     = bridgeAgency?.rosterStatus ?? mockAgency.status;
  const joinedAt   = bridgeAgency?.addedAt ?? mockAgency.joinedAt;
  const isPrimary  = bridgeAgency?.isPrimary ?? mockAgency.isPrimary;
  const planTier   = (bridgeAgency?.plan ?? mockAgency.planTier) as "free" | "studio" | "agency";
  const commissionRate = mockAgency.commissionRate; // bridge doesn't carry this yet

  const planLabel = planTier === "free" ? t("dashboard.talentDrawers.agency.planFree") : planTier === "studio" ? t("dashboard.talentDrawers.agency.planStudio") : t("dashboard.talentDrawers.agency.planAgency");
  const commissionLabel = commissionRate === 0
    ? t("dashboard.talentDrawers.agency.commissionNone")
    : interpolate(t("dashboard.talentDrawers.agency.commissionOnBookings"), { pct: Math.round(commissionRate * 100), name });

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={name}
      description={interpolate(t("dashboard.talentDrawers.agency.relDescription"), { relationship: status === "exclusive" ? t("dashboard.talentDrawers.agency.relExclusive") : t("dashboard.talentDrawers.agency.relNonExclusive"), date: joinedAt })}
      width={540}
      footer={
        <StandardFooter
          onSave={() => closeDrawer()}
          saveLabel={t("dashboard.talentDrawers.done")}
          destructive={{ label: t("dashboard.talentDrawers.agency.pauseOrLeave"), onClick: () => openDrawer("representation", { focusAgencyId: payloadAgencyId }) }}
        />
      }
    >
      {primaryError && (
        <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, marginBottom: 14, fontFamily: FONTS.body, fontSize: 12.5, color: "#b91c1c" }}>
          {primaryError}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {/* Plan + commission summary chip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: planTier === "free" ? "rgba(11,11,13,0.04)" : COLORS.indigoSoft,
            border: `1px solid ${planTier === "free" ? COLORS.borderSoft : "rgba(91,107,160,0.18)"}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 12,
          }}
        >
          <Icon name="info" size={12} stroke={1.7} color={COLORS.inkMuted} />
          <span style={{ fontWeight: 500 }} className="text-admin-ink">
            {planLabel} · {commissionLabel}
          </span>
        </div>

        {/* Exclusivity confirmation prompt — only when admin auto-flagged
            this agency as primary and talent hasn't responded yet.
            Per project_agency_exclusivity_model.md. */}
        {bridgeAgency?.exclusivityStatus === "auto_assigned" && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(214,158,46,0.08)",
              border: "1px solid rgba(214,158,46,0.30)",
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="text-sm" aria-hidden>🔔</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#7C5A14" }}>
                {t("dashboard.talentDrawers.agency.exclusivityPending")}
              </span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }} className="text-admin-ink">
              {interpolate(t("dashboard.talentDrawers.agency.exclusivityPrompt"), { name, commission: commissionRate > 0 ? `${Math.round(commissionRate * 100)}%` : t("dashboard.talentDrawers.agency.exclusivityCommissionFallback") })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmExclusivity}
                disabled={respondingExclusivity}
                style={{
                  padding: "7px 14px",
                  background: COLORS.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 7,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: respondingExclusivity ? "wait" : "pointer",
                  opacity: respondingExclusivity ? 0.7 : 1,
                }}
              >
                {respondingExclusivity ? t("dashboard.talentDrawers.saving") : t("dashboard.talentDrawers.agency.confirmExclusivity")}
              </button>
              <button
                type="button"
                onClick={handleDeclineExclusivity}
                disabled={respondingExclusivity}
                style={{
                  padding: "7px 14px",
                  background: "transparent",
                  color: COLORS.ink,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 7,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: respondingExclusivity ? "wait" : "pointer",
                  opacity: respondingExclusivity ? 0.7 : 1,
                }}
              >
                {t("dashboard.talentDrawers.agency.decline")}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <KvRow label={t("dashboard.talentDrawers.agency.statusLabel")} value={status} />
          <KvRow label={t("dashboard.talentDrawers.agency.joinedLabel")} value={joinedAt} />
          <KvRow label={t("dashboard.talentDrawers.agency.primaryLabel")} value={isPrimary ? t("dashboard.talentDrawers.agency.yes") : t("dashboard.talentDrawers.agency.no")} />
          <KvRow label={t("dashboard.talentDrawers.agency.takeRateLabel")} value={commissionRate === 0 ? "—" : `${Math.round(commissionRate * 100)}%`} />
        </div>

        {!isPrimary && (
          <button
            type="button"
            onClick={handleSetPrimary}
            disabled={settingPrimary}
            style={{
              alignSelf: "flex-start",
              padding: "7px 12px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 7,
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              color: COLORS.ink,
              cursor: "pointer",
            }}
          >
            {settingPrimary ? t("dashboard.talentDrawers.agency.setting") : interpolate(t("dashboard.talentDrawers.agency.setAsPrimary"), { name })}
          </button>
        )}
        {status === "exclusive" && (
          <div style={{ fontFamily: FONTS.body, fontSize: 11.5, fontStyle: "italic" }} className="text-admin-ink-dim">
            {t("dashboard.talentDrawers.agency.switchExclusivityNote")}
          </div>
        )}

        <Divider label={t("dashboard.talentDrawers.agency.whatAgencyCanDo")} />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
          <li>{t("dashboard.talentDrawers.agency.canDoBullet1")}</li>
          <li>{t("dashboard.talentDrawers.agency.canDoBullet2")}</li>
          <li>{t("dashboard.talentDrawers.agency.canDoBullet3")}</li>
          <li>{t("dashboard.talentDrawers.agency.canDoBullet4")}</li>
          {commissionRate > 0 && (
            <li>{interpolate(t("dashboard.talentDrawers.agency.canDoBullet5"), { pct: Math.round(commissionRate * 100) })}</li>
          )}
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Leave agency ───────────────────────────────────────────────

export function TalentLeaveAgencyDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-leave-agency";
  const agencyId = state.drawer.payload?.agencyId as string | undefined;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.agency.pauseOrLeave")}
      description={t("dashboard.talentDrawers.agency.pauseOrLeaveDesc")}
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.cancel")}</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              closeDrawer();
              openDrawer("representation", { focusAgencyId: agencyId });
            }}
          >
            {t("dashboard.talentDrawers.agency.openRepresentation")}
          </PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 1.6 }} className="text-admin-ink">
        <strong>{t("dashboard.talentDrawers.agency.leaveBodyPause")}</strong> {t("dashboard.talentDrawers.agency.leaveBodyPauseRest")}
        <br /><br />
        <strong>{t("dashboard.talentDrawers.agency.leaveBodyLeave")}</strong> {t("dashboard.talentDrawers.agency.leaveBodyLeaveRest")}
      </div>
    </DrawerShell>
  );
}

// ─── Privacy ────────────────────────────────────────────────────

export function TalentPrivacyDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-privacy";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;

  const [hubVisible, setHubVisible] = useState(true);
  const [searchIndexable, setSearchIndexable] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError(t("dashboard.talentDrawers.noProfileLoaded")); return; }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfPrivacy({
      talent_profile_id: talentProfileId,
      prefs: {
        search_engine_indexable: searchIndexable,
        show_measurements_publicly: showMeasurements,
        hub_visible: hubVisible,
      },
    });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.agency.privacy")}
      description={t("dashboard.talentDrawers.agency.privacyDesc")}
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.cancel")}</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? t("dashboard.talentDrawers.saving") : t("dashboard.talentDrawers.save")}
          </PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-2">
        <ToggleRow label={t("dashboard.talentDrawers.agency.privacyHub")} hint={t("dashboard.talentDrawers.agency.privacyHubHint")} defaultOn={hubVisible} onChange={setHubVisible} />
        <ToggleRow label={interpolate(t("dashboard.talentDrawers.agency.privacyRoster"), { agency: "Acme Models" })} defaultOn={true} />
        <ToggleRow label={interpolate(t("dashboard.talentDrawers.agency.privacyRoster"), { agency: "Praline London" })} defaultOn={true} />
        <ToggleRow
          label={t("dashboard.talentDrawers.agency.privacySearch")}
          hint={t("dashboard.talentDrawers.agency.privacySearchHint")}
          defaultOn={searchIndexable}
          onChange={setSearchIndexable}
        />
        <Divider label={t("dashboard.talentDrawers.agency.privacySensitive")} />
        <ToggleRow
          label={t("dashboard.talentDrawers.agency.privacyMeasurements")}
          hint={t("dashboard.talentDrawers.agency.privacyMeasurementsHint")}
          defaultOn={showMeasurements}
          onChange={setShowMeasurements}
        />
      </div>
    </DrawerShell>
  );
}

// ─── Contact preferences ────────────────────────────────────────
//
// Per-tier on/off gate for inbound inquiries. Default = all tiers on
// (open marketplace). Selectivity is opt-in. The "Most selective"
// preset offers a one-click move to Verified+. Copy is plain English —
// never frames it as "pay to message". See project_client_trust_badges.md.

export function TalentContactPreferencesDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-contact-preferences";
  const defaultPolicy = bridgeTalentSelfProfile?.contactPolicy ?? MY_TALENT_PROFILE.contactPolicy;
  const [policy, setPolicy] = useState<TalentContactPolicy>(defaultPolicy as TalentContactPolicy);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync from bridge whenever drawer opens
  useEffect(() => {
    if (open && bridgeTalentSelfProfile?.contactPolicy) {
      setPolicy(bridgeTalentSelfProfile.contactPolicy as TalentContactPolicy);
    }
    if (!open) { setSaveError(null); setSaving(false); }
  }, [open, bridgeTalentSelfProfile]);

  const allowedCount = (Object.values(policy) as boolean[]).filter(Boolean).length;
  const allOn = allowedCount === CLIENT_TRUST_LEVELS.length;

  const onSave = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    if (!talentProfileId) {
      setSaveError(t("dashboard.talentDrawers.noProfileLoaded"));
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfContactPolicy({ talent_profile_id: talentProfileId, policy: policy as Record<string, boolean> });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.agency.contactPreferences")}
      description={t("dashboard.talentDrawers.agency.contactPreferencesDesc")}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer} disabled={saving}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
          <PrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t("dashboard.talentDrawers.saving") : t("dashboard.talentDrawers.save")}
          </PrimaryButton>
        </>
      }
    >
      {saveError && (
        <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, marginBottom: 14, fontFamily: FONTS.body, fontSize: 12.5, color: "#b91c1c" }}>
          {saveError}
        </div>
      )}
      {/* Framing card — explains the principle without leaking the
          "pay to DM" anti-pattern. */}
      <div
        style={{
          padding: "14px 16px",
          background: "rgba(11,11,13,0.03)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          marginBottom: 18,
        }}
      >
        <CapsLabel>{t("dashboard.talentDrawers.agency.howThisWorks")}</CapsLabel>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, marginTop: 6, lineHeight: 1.55 }} className="text-admin-ink">
          {t("dashboard.talentDrawers.agency.howThisWorksBody")}
        </div>
      </div>

      {/* Presets — quick way to flip without micromanaging four toggles. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <PresetButton
          label={t("dashboard.talentDrawers.agency.presetOpen")}
          active={JSON.stringify(policy) === JSON.stringify(DEFAULT_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...DEFAULT_CONTACT_POLICY })}
        />
        <PresetButton
          label={t("dashboard.talentDrawers.agency.presetVerified")}
          active={JSON.stringify(policy) === JSON.stringify(SELECTIVE_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...SELECTIVE_CONTACT_POLICY })}
        />
      </div>

      {/* Per-tier toggles — the actual control surface. */}
      <div className="flex flex-col gap-2">
        {CLIENT_TRUST_LEVELS.map((tier) => {
          const meta = CLIENT_TRUST_META[tier];
          return (
            <div
              key={tier}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
              }}
            >
              <div className="flex-1 min-w-0">
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
                  <ClientTrustChip level={tier} compact withDot={false} />
                  {interpolate(t("dashboard.talentDrawers.agency.allowInquiriesFrom"), { tier: meta.label })}
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 4, lineHeight: 1.5 }} className="text-admin-ink-muted">
                  {meta.rationale}
                </div>
              </div>
              <Toggle
                on={policy[tier]}
                onChange={(next) => setPolicy({ ...policy, [tier]: next })}
              />
            </div>
          );
        })}
      </div>

      {/* What changes — a soft note about the consequence of selectivity. */}
      {!allOn && (
        <div style={{ marginTop: 14, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
          {t("dashboard.talentDrawers.agency.selectivityNote")}
        </div>
      )}
    </DrawerShell>
  );
}

function PresetButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? COLORS.fill : "#fff",
        color: active ? "#fff" : COLORS.ink,
        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: FONTS.body,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: 0.2,
      }}
    >
      {label}
    </button>
  );
}
