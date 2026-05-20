"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/agency — Phase 1d body chunk.
// Owns: TalentAgencyRelationshipDrawer, TalentLeaveAgencyDrawer,
// TalentPrivacyDrawer, TalentContactPreferencesDrawer.
// Private helpers: PresetButton.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
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
  selfLeaveAgency,
  selfSetPrimaryAgency,
  updateSelfContactPolicy,
  updateSelfPrivacy,
} from "@/lib/server-actions/talent-self-profile-sections";
import { KvRow, SaveErrorBanner, StandardFooter, ToggleRow } from "./shared";

// ─── Agency relationship ─────────────────────────────────────────

export function TalentAgencyRelationshipDrawer() {
  const { state, closeDrawer, openDrawer, toast, bridgeTalentSelfProfile, bridgeTalentAgencies } = useAdminShell();
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
    if (!talentProfileId || !agencyId) { setPrimaryError("Unable to identify profile or agency."); return; }
    setSettingPrimary(true);
    setPrimaryError(null);
    const result = await selfSetPrimaryAgency({ talent_profile_id: talentProfileId, agency_id: agencyId });
    setSettingPrimary(false);
    if (!result.ok) { setPrimaryError(result.error); return; }
    toast("Primary agency updated");
    closeDrawer();
  };

  const handleConfirmExclusivity = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    const agencyId = bridgeAgency?.id ?? payloadAgencyId;
    if (!talentProfileId || !agencyId) { setPrimaryError("Unable to identify profile or agency."); return; }
    setRespondingExclusivity(true);
    setPrimaryError(null);
    const result = await confirmAgencyExclusivity({ talent_profile_id: talentProfileId, agency_id: agencyId });
    setRespondingExclusivity(false);
    if (!result.ok) { setPrimaryError(result.error); return; }
    toast("Exclusivity confirmed");
    closeDrawer();
  };

  const handleDeclineExclusivity = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    const agencyId = bridgeAgency?.id ?? payloadAgencyId;
    if (!talentProfileId || !agencyId) { setPrimaryError("Unable to identify profile or agency."); return; }
    setRespondingExclusivity(true);
    setPrimaryError(null);
    const result = await declineAgencyExclusivity({ talent_profile_id: talentProfileId, agency_id: agencyId });
    setRespondingExclusivity(false);
    if (!result.ok) { setPrimaryError(result.error); return; }
    toast("Exclusivity declined — relationship continues as non-exclusive");
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
        title="Add another agency"
        description="On Tulala, agencies invite talent — not the other way around. Share your public profile with an agency and they can request you onto their roster."
        width={520}
        footer={<SecondaryButton onClick={closeDrawer}>Got it</SecondaryButton>}
      >
        <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }} className="text-admin-ink">
          Share this link with any agency you&apos;d like to work with. When they add you to their roster, you&apos;ll get an invite in your inbox.
        </div>
        <div className="flex items-center gap-2">
          <div style={{ flex: 1, padding: "10px 12px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.mono, fontSize: 12 }} className="bg-admin-surface-alt text-admin-ink">
            {publicUrl}
          </div>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(`https://${publicUrl}`); toast("Link copied"); }}
            style={{ padding: "8px 12px", background: COLORS.fill, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: FONTS.body, whiteSpace: "nowrap" }}
          >
            Copy
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

  const planLabel = planTier === "free" ? "Free plan" : planTier === "studio" ? "Studio plan" : "Agency plan";
  const commissionLabel = commissionRate === 0
    ? "No commission · friend / free-plan agency"
    : `${Math.round(commissionRate * 100)}% on bookings ${name} brings`;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={name}
      description={`${status === "exclusive" ? "Exclusive" : "Non-exclusive"} relationship · joined ${joinedAt}`}
      width={540}
      footer={
        <StandardFooter
          onSave={() => closeDrawer()}
          saveLabel="Done"
          destructive={{ label: "End relationship", onClick: () => openDrawer("talent-leave-agency", { agencyId: payloadAgencyId }) }}
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
                Exclusivity request pending
              </span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 10 }} className="text-admin-ink">
              <strong>{name}</strong> added you as their <strong>exclusive talent</strong>.
              Confirm to keep them as your primary agency (they pitch you to
              clients + take {commissionRate > 0 ? `${Math.round(commissionRate * 100)}%` : "their commission"} on bookings they bring),
              or decline to continue the relationship as non-exclusive.
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
                {respondingExclusivity ? "Saving…" : "Confirm exclusivity"}
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
                Decline
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <KvRow label="Status" value={status} />
          <KvRow label="Joined" value={joinedAt} />
          <KvRow label="Primary" value={isPrimary ? "Yes" : "No"} />
          <KvRow label="Take rate" value={commissionRate === 0 ? "—" : `${Math.round(commissionRate * 100)}%`} />
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
            {settingPrimary ? "Setting…" : `Set ${name} as primary`}
          </button>
        )}
        {status === "exclusive" && (
          <div style={{ fontFamily: FONTS.body, fontSize: 11.5, fontStyle: "italic" }} className="text-admin-ink-dim">
            To switch exclusivity to a different agency, end this relationship first.
          </div>
        )}

        <Divider label="What this agency can do" />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
          <li>Pitch you to clients (you confirm before anything is booked)</li>
          <li>List you on their public roster</li>
          <li>Hold dates on your calendar with your approval</li>
          <li>Send you direct messages via the inbox</li>
          {commissionRate > 0 && (
            <li>Take {Math.round(commissionRate * 100)}% of any booking they bring you</li>
          )}
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Leave agency ───────────────────────────────────────────────

export function TalentLeaveAgencyDrawer() {
  const { state, closeDrawer, toast, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-leave-agency";
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSendNotice = async () => {
    const talentProfileId = bridgeTalentSelfProfile?.id;
    if (!talentProfileId) { setSendError("No talent profile — reload and try again."); return; }
    setSending(true);
    setSendError(null);
    const result = await selfLeaveAgency({ talent_profile_id: talentProfileId });
    setSending(false);
    if (!result.ok) { setSendError(result.error); return; }
    toast("Notice sent — agency informed. Active bookings continue through the wind-down period.");
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="End relationship"
      description="This is a serious step. Your agency is notified and has 14 days to wind down active bookings."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer} disabled={sending}>Keep working with them</SecondaryButton>
          <button
            onClick={handleSendNotice}
            disabled={sending}
            style={{
              background: sending ? COLORS.inkDim : COLORS.red,
              color: "#fff",
              border: "none",
              padding: "9px 16px",
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? "Sending…" : "Send 14-day notice"}
          </button>
        </>
      }
    >
      {sendError && (
        <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, marginBottom: 14, fontFamily: FONTS.body, fontSize: 12.5, color: "#b91c1c" }}>
          {sendError}
        </div>
      )}
      <div style={{ fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 1.6 }} className="text-admin-ink">
        Active bookings stay confirmed and get paid out. New pitches stop immediately. Past
        earnings remain in your activity log. Your agency can&apos;t see your inbox or calendar
        once the 14 days are up.
      </div>
    </DrawerShell>
  );
}

// ─── Privacy ────────────────────────────────────────────────────

export function TalentPrivacyDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-privacy";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;

  const [hubVisible, setHubVisible] = useState(true);
  const [searchIndexable, setSearchIndexable] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError("No talent profile loaded — reload and try again."); return; }
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
      title="Privacy"
      description="Where you appear, and who can see your full profile."
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-2">
        <ToggleRow label="Tulala hub (curated discovery)" hint="Only featured talent are shown." defaultOn={hubVisible} onChange={setHubVisible} />
        <ToggleRow label="Acme Models public roster" defaultOn={true} />
        <ToggleRow label="Praline London public roster" defaultOn={true} />
        <ToggleRow
          label="Search engines (Google etc.)"
          hint="Lets people find your public page from a Google search."
          defaultOn={searchIndexable}
          onChange={setSearchIndexable}
        />
        <Divider label="Sensitive data" />
        <ToggleRow
          label="Show measurements publicly"
          hint="Off = only agencies + clients you accept can see them."
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
      setSaveError("No talent profile loaded — reload and try again.");
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
      title="Contact preferences"
      description="Decide which client trust tiers can send you inquiries. Your agency still sees everything internally — this gates inbound contact, not visibility."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer} disabled={saving}>Close</SecondaryButton>
          <PrimaryButton onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
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
        <CapsLabel>How this works</CapsLabel>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, marginTop: 6, lineHeight: 1.55 }} className="text-admin-ink">
          Higher-trust clients have completed verification or funded their
          account on Tulala. You decide which tiers can reach you. Lower-trust
          tiers always have your agency&apos;s roster page available — they just
          can&apos;t drop straight into your inbox.
        </div>
      </div>

      {/* Presets — quick way to flip without micromanaging four toggles. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <PresetButton
          label="Open to everyone"
          active={JSON.stringify(policy) === JSON.stringify(DEFAULT_CONTACT_POLICY)}
          onClick={() => setPolicy({ ...DEFAULT_CONTACT_POLICY })}
        />
        <PresetButton
          label="Verified clients only"
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
                  Allow inquiries from {meta.label} clients
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
          Blocked tiers can still see your roster page. They&apos;ll be invited to
          verify or fund their account before they can send you a direct
          inquiry. Your agency&apos;s coordinator inbox is unaffected.
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
