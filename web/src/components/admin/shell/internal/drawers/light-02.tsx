"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  COLORS,
  DrawerShell,
  FONTS,
  FieldRow,
  GhostButton,
  LegacyTalentTypesDrawer,
  LiveTalentTypesDrawer,
  PAYOUT_RECEIVER_CANDIDATES,
  PayoutStatusChip,
  Plan,
  PrimaryButton,
  Role,
  RoleChip,
  SecondaryButton,
  Section,
  StateChipMini,
  TextInput,
  getFieldsForTalent,
  getTeam,
  meetsRole,
  useAdminShell
} from "./drawer-shared";

// Phase 1d (remediation §4): 2 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TeamDrawer() {
  const { state, closeDrawer, toast, effectiveTeamMembers, effectiveRoster, bridgeTenantIdentity, bridgeSessionIdentity } = useAdminShell();
  const router = useRouter();
  // Phase 3.12 — use live team members when available, fall back to mock.
  const isLiveTeam = effectiveTeamMembers.length > 0;
  const team = isLiveTeam ? effectiveTeamMembers : getTeam(state.plan);
  const canManage = meetsRole(state.role, "admin");
  const selfUserId = bridgeSessionIdentity?.userId ?? null;

  // F.1 — invite form local state.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor" | "manager" | "admin">("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ url: string; expiresAt: string } | null>(null);

  // Phase 5 — multi-select inquiry-coordinator talent (Agency-tier only).
  // Roster talent designated here auto-join every new inquiry as a
  // coordinator. Optimistic: the local set updates immediately and reverts
  // if the save fails.
  const isAgencyTier = state.plan === "agency" || state.plan === "network";
  const [coordinatorTalentIds, setCoordinatorTalentIds] = useState<string[]>(
    bridgeTenantIdentity?.inquiryCoordinatorTalentIds ?? [],
  );
  const [savingCoordinators, setSavingCoordinators] = useState(false);

  // Inline role editing for existing members. `roleOverrides` holds the
  // optimistic value while the server action is in flight; it reverts on
  // failure and a router.refresh() reconciles on success.
  const [roleOverrides, setRoleOverrides] = useState<Record<string, Role>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  const handleRoleChange = async (
    memberId: string,
    nextRole: "viewer" | "editor" | "manager" | "admin",
    prevRole: Role,
  ) => {
    setRoleOverrides((o) => ({ ...o, [memberId]: nextRole }));
    setSavingRoleId(memberId);
    try {
      const { changeTeamMemberRole } = await import("@/lib/server-actions/team-management");
      const r = await changeTeamMemberRole(memberId, nextRole);
      if (r.ok) {
        toast(`Role updated to ${nextRole}.`);
        router.refresh();
      } else {
        toast(r.error);
        setRoleOverrides((o) => ({ ...o, [memberId]: prevRole }));
      }
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast("Enter an email address.");
      return;
    }
    setInviting(true);
    setInviteResult(null);
    try {
      const { inviteTeamMember } = await import("@/lib/server-actions/team-management");
      const r = await inviteTeamMember(inviteEmail.trim(), inviteRole);
      if (r.ok) {
        toast(`Invite created for ${inviteEmail.trim()}. Copy the link below.`);
        setInviteResult({ url: r.data.redeemUrl, expiresAt: r.data.expiresAt });
        setInviteEmail("");
      } else {
        toast(r.error);
      }
    } finally {
      setInviting(false);
    }
  };

  const handleToggleCoordinatorTalent = async (talentProfileId: string) => {
    const prev = coordinatorTalentIds;
    const next = prev.includes(talentProfileId)
      ? prev.filter((id) => id !== talentProfileId)
      : [...prev, talentProfileId];
    setCoordinatorTalentIds(next);
    setSavingCoordinators(true);
    try {
      const { setInquiryCoordinatorTalent } = await import("@/lib/server-actions/team-management");
      const r = await setInquiryCoordinatorTalent(next);
      if (r.ok) {
        toast(
          next.length === 0
            ? "Inquiry coordinators cleared. The workspace owner catches new inquiries."
            : `${next.length} inquiry coordinator${next.length === 1 ? "" : "s"} saved.`,
        );
      } else {
        toast(r.error);
        setCoordinatorTalentIds(prev); // revert on failure
      }
    } finally {
      setSavingCoordinators(false);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title="Team"
      description={`${team.length} members. Roles: viewer / editor / manager / admin / owner.`}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <Section title="Members">
        <div className="flex flex-col gap-2">
          {team.map((m) => {
            // Match team member by name to a payout receiver candidate
            // so the member row can show their payout connection state.
            const payoutCandidate = PAYOUT_RECEIVER_CANDIDATES.find(
              (c) => c.displayName === m.name,
            );
            const displayRole: Role = roleOverrides[m.id] ?? m.role;
            // Editable only on a live team, for admin+, and never the
            // owner row or your own row (owner = transfer-only; self =
            // foot-gun). Mock-mode rows stay read-only chips.
            const canEditThisRole =
              canManage && isLiveTeam && m.role !== "owner" && m.id !== selfUserId;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 10,
                }}
              >
                <Avatar initials={m.initials} tone={m.role === "owner" ? "ink" : "neutral"} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
                    {m.name}
                  </div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
                    {m.email}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {payoutCandidate && <PayoutStatusChip status={payoutCandidate.status} />}
                  {canEditThisRole ? (
                    <select
                      value={displayRole}
                      disabled={savingRoleId === m.id}
                      aria-label={`Role for ${m.name}`}
                      onChange={(e) =>
                        handleRoleChange(
                          m.id,
                          e.currentTarget.value as "viewer" | "editor" | "manager" | "admin",
                          m.role,
                        )
                      }
                      style={{
                        padding: "5px 8px",
                        fontFamily: FONTS.body,
                        fontSize: 12,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 7,
                        background: "#fff",
                        color: COLORS.ink,
                        textTransform: "capitalize",
                        cursor: savingRoleId === m.id ? "wait" : "pointer",
                      }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <RoleChip role={displayRole} />
                  )}
                  {m.status === "invited" && <StateChipMini label="Invited" tone="amber" />}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {canManage && (
        <Section title="Invite a teammate" description="They'll get a link to join the workspace at the role you set. Email delivery wires in Phase 8 — for now copy the link below and share it directly.">
          <FieldRow label="Email">
            <TextInput
              type="email"
              placeholder="someone@your-agency.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.currentTarget.value)}
            />
          </FieldRow>
          <FieldRow label="Role" hint="Owners change billing. Admins manage team and branding. Managers move work and message clients during events. Editors draft. Viewers watch.">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.currentTarget.value as typeof inviteRole)}
              style={{
                padding: "9px 12px",
                fontFamily: FONTS.body,
                fontSize: 13,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                background: "#fff",
                color: COLORS.ink,
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </FieldRow>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <PrimaryButton onClick={handleInvite} disabled={inviting}>
              {inviting ? "Creating invite…" : "Create invite link"}
            </PrimaryButton>
          </div>
          {inviteResult ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: "rgba(15,79,62,0.06)",
                border: "1px solid rgba(15,79,62,0.16)",
                borderRadius: 10,
                fontFamily: FONTS.body,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "#093328", marginBottom: 6 }}>
                Invite link ready
              </div>
              <div style={{ fontSize: 11, marginBottom: 8 }} className="text-admin-ink-muted">
                Expires {new Date(inviteResult.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.
                Share with your invitee — clicking takes them through sign-up and lands them on the workspace.
              </div>
              <code
                style={{
                  display: "block",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  padding: "6px 8px",
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 6,
                  overflowX: "auto",
                  whiteSpace: "nowrap",
                }}
              >
                {typeof window !== "undefined" ? window.location.origin : ""}
                {inviteResult.url}
              </code>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <GhostButton
                  size="sm"
                  onClick={() => {
                    const full = (typeof window !== "undefined" ? window.location.origin : "") + inviteResult.url;
                    navigator.clipboard
                      .writeText(full)
                      .then(() => toast("Link copied to clipboard."))
                      .catch(() => toast("Couldn't copy — select the link and copy manually."));
                  }}
                >
                  Copy link
                </GhostButton>
              </div>
            </div>
          ) : null}
        </Section>
      )}

      {canManage && isAgencyTier && (
        <Section
          title="Auto-coordinator"
          description="Pick the roster talent who auto-join every new inquiry as coordinators. They land on the message thread and can manage the inquiry → booking flow. Pick as many as you need."
        >
          {effectiveRoster.length === 0 ? (
            <div
              className="text-admin-ink-muted"
              style={{ fontSize: 12.5, fontFamily: FONTS.body }}
            >
              No talent on the roster yet. Add talent first, then designate
              coordinators here.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 260,
                  overflowY: "auto",
                  paddingRight: 2,
                }}
              >
                {effectiveRoster.map((tp) => {
                  const checked = coordinatorTalentIds.includes(tp.id);
                  return (
                    <label
                      key={tp.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        background: checked ? "rgba(15,79,62,0.05)" : "#fff",
                        border: `1px solid ${
                          checked ? "rgba(15,79,62,0.22)" : COLORS.borderSoft
                        }`,
                        borderRadius: 8,
                        cursor: savingCoordinators ? "wait" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={savingCoordinators}
                        onChange={() => handleToggleCoordinatorTalent(tp.id)}
                      />
                      <span
                        className="text-admin-ink"
                        style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }}
                      >
                        {tp.name}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div
                className="text-admin-ink-muted"
                style={{ fontSize: 11, marginTop: 8, fontFamily: FONTS.body }}
              >
                {coordinatorTalentIds.length === 0
                  ? "No coordinators set — the workspace owner catches new inquiries."
                  : `${coordinatorTalentIds.length} coordinator${
                      coordinatorTalentIds.length === 1 ? "" : "s"
                    } auto-join every new inquiry.`}
              </div>
            </>
          )}
        </Section>
      )}

      {canManage && !isAgencyTier && (
        <Section
          title="Auto-coordinator"
          description="On Agency-tier workspaces, you can pick a default coordinator for every new inquiry. Upgrade to enable."
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: 12,
              background: "rgba(11,11,13,0.025)",
              border: `1px dashed ${COLORS.borderSoft}`,
              borderRadius: 10,
              opacity: 0.78,
            }}
          >
            <div>
              <div className="text-admin-ink text-admin-13 font-semibold">Default coordinator</div>
              <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">Requires Agency tier</div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(146,64,14,0.10)",
                color: "#92400E",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Agency
            </span>
          </div>
        </Section>
      )}
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Phase 2 — Talent Types settings (workspace admin)
// Agency picks which parent groups talent can register / appear under.
// Plan tier limits how many parents can be enabled simultaneously.
// ════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════
// LiveCategoryFieldsPanel — read-only preview of the DB-resolved field
// catalog for a talent based on their primary + secondary taxonomy.
//
// Calls getFieldsForTalent(), which walks talent_profile_taxonomy →
// expands each term to its parent_category → unions universal/global/
// type-specific recommendations from profile_field_definitions, applies
// workspace overrides.
//
// What it proves:
//   - The taxonomy → field-recommendation pipeline works end-to-end.
//   - Adding a secondary type immediately surfaces that type's fields.
//   - The 1066 agency_taxonomy_settings rows + 171 recommendations
//     resolve into a clean per-talent field set the UI can render.
//
// What it deliberately doesn't do (yet):
//   - Edit values. Persistence to talent_profile_field_values is a
//     follow-up slice — it needs a setFieldValue server action plus
//     write-mode wiring in this panel.
// ════════════════════════════════════════════════════════════════════


export function TalentTypesDrawer() {
  const { state, closeDrawer, openDrawer, toast, bridgeTenantIdentity } = useAdminShell();
  const open = state.drawer.drawerId === "talent-types";

  // Live mode when we have a real tenant; legacy prototype when not.
  if (bridgeTenantIdentity?.tenantId) {
    return <LiveTalentTypesDrawer open={open} onClose={closeDrawer} />;
  }

  // Legacy prototype path (mock state) — preserved for design QA without
  // an authenticated tenant.
  return <LegacyTalentTypesDrawer />;
}

