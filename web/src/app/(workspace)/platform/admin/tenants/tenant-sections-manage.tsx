"use client";

/**
 * Platform Admin — interactive tenant management sections.
 *
 * Members & roles + Plan override — the sections that call server actions.
 * Every async state is surfaced inline (pending, success, error).
 */

import { useState, useTransition } from "react";
import {
  HQ,
  HQ_FM,
  Chip,
  PlanChip,
  RoleChip,
  PLAN_TIER_LABEL_KEY,
  WORKSPACE_ROLE_LABEL_KEY,
} from "./hq-kit";
import {
  Accordion,
  Btn,
  ConfirmModal,
  Feedback,
  daysUntil,
  fmtDate,
  inputStyle,
  type OnChanged,
  type SectionProps,
} from "./tenant-section-kit";
import {
  OVERRIDE_DURATIONS,
  PLAN_TIER_LABEL,
  WORKSPACE_PLAN_TIERS,
  type WorkspacePlanOverride,
  type WorkspacePlanTier,
} from "@/lib/platform/plan-override";
import type {
  TenantManagementDetail,
  TenantManagementMember,
} from "../../tenant-management-data";
import {
  actionAddWorkspaceMember,
  actionApplyPlanOverride,
  actionAssignOwnerByEmail,
  actionChangeMemberRole,
  actionRemovePlanOverride,
  actionRemoveWorkspaceMember,
  actionTransferWorkspaceOwner,
} from "./actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

function planChipLabel(t: Translate, plan: string): string | undefined {
  const key = PLAN_TIER_LABEL_KEY[plan];
  return key ? t(key) : undefined;
}

function planText(t: Translate, plan: string): string {
  const key = PLAN_TIER_LABEL_KEY[plan];
  return key ? t(key) : PLAN_TIER_LABEL[plan as WorkspacePlanTier] ?? plan;
}

function roleChipLabel(t: Translate, role: string): string | undefined {
  const key = WORKSPACE_ROLE_LABEL_KEY[role];
  return key ? t(key) : undefined;
}

// ─── D + E. Members & admin role management ──────────────────────────────────

function MemberRow({
  detail,
  member,
  onChanged,
}: {
  detail: TenantManagementDetail;
  member: TenantManagementMember;
  onChanged: OnChanged;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<null | "remove" | "transfer">(null);
  const isOwner = member.role === "owner";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setConfirm(null);
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? t("dashboard.platform.tenants.actionFailed") });
        setConfirm(null);
      }
    });
  }

  return (
    <div
      style={{
        padding: "9px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: HQ.ink, fontWeight: 600 }}>
            {member.displayName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: HQ.inkMuted,
              fontFamily: HQ_FM,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {member.email}
          </div>
        </div>
        {isOwner ? (
          <RoleChip role="owner" label={roleChipLabel(t, "owner")} />
        ) : (
          <select
            aria-label={interpolate(t("dashboard.platform.tenants.roleForMember"), { name: member.displayName })}
            value={member.role}
            disabled={pending}
            onChange={(e) =>
              run(() =>
                actionChangeMemberRole({
                  membershipId: member.membershipId,
                  role: e.target.value,
                }),
              )
            }
            style={{ ...inputStyle, width: "auto", padding: "4px 6px" }}
          >
            {["admin", "manager", "editor", "viewer"].map((r) => (
              <option key={r} value={r}>
                {roleChipLabel(t, r) ?? r}
              </option>
            ))}
          </select>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 6,
          flexWrap: "wrap",
        }}
      >
        {member.status !== "active" && (
          <Chip bg={HQ.amberSoft} color={HQ.amber}>
            {member.status}
          </Chip>
        )}
        <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
          {interpolate(t("dashboard.platform.tenants.joined"), { when: member.joinedAtLabel })}
        </span>
        <span style={{ flex: 1 }} />
        {!isOwner && member.status === "active" && (
          <Btn size="sm" onClick={() => setConfirm("transfer")} disabled={pending}>
            {t("dashboard.platform.tenants.makeOwner")}
          </Btn>
        )}
        {!isOwner && (
          <Btn
            size="sm"
            tone="danger"
            onClick={() => setConfirm("remove")}
            disabled={pending}
          >
            {t("dashboard.platform.tenants.remove")}
          </Btn>
        )}
      </div>
      <Feedback msg={msg} />
      <ConfirmModal
        open={confirm === "remove"}
        title={t("dashboard.platform.tenants.removeMemberTitle")}
        body={interpolate(t("dashboard.platform.tenants.removeMemberBody"), {
          name: member.displayName,
          workspace: detail.name,
        })}
        confirmLabel={t("dashboard.platform.tenants.removeMemberConfirm")}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run(() =>
            actionRemoveWorkspaceMember({ membershipId: member.membershipId }),
          )
        }
      />
      <ConfirmModal
        open={confirm === "transfer"}
        title={t("dashboard.platform.tenants.transferOwnershipTitle")}
        body={interpolate(t("dashboard.platform.tenants.transferOwnershipBody"), {
          name: member.displayName,
          workspace: detail.name,
        })}
        confirmLabel={t("dashboard.platform.tenants.transferOwnershipConfirm")}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run(() =>
            actionTransferWorkspaceOwner({
              tenantId: detail.id,
              newOwnerMembershipId: member.membershipId,
            }),
          )
        }
      />
    </div>
  );
}

function AddMemberForm({
  detail,
  onChanged,
}: {
  detail: TenantManagementDetail;
  onChanged: OnChanged;
}) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await actionAddWorkspaceMember({
        tenantId: detail.id,
        email,
        role,
      });
      if (res.ok) {
        setEmail("");
        setMsg({ tone: "ok", text: t("dashboard.platform.tenants.memberAdded") });
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        background: HQ.cardSofter,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: HQ.inkDim,
          marginBottom: 8,
        }}
      >
        {t("dashboard.platform.tenants.addStaffMember")}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          type="email"
          placeholder={t("dashboard.platform.tenants.addMemberPlaceholder")}
          value={email}
          disabled={pending}
          onChange={(e) => setEmail(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
        <select
          value={role}
          disabled={pending}
          onChange={(e) => setRole(e.target.value)}
          style={{ ...inputStyle, width: "auto" }}
        >
          {["admin", "manager", "editor", "viewer"].map((r) => (
            <option key={r} value={r}>
              {roleChipLabel(t, r) ?? r}
            </option>
          ))}
        </select>
        <Btn tone="primary" onClick={submit} disabled={pending || !email.trim()}>
          {pending ? t("dashboard.platform.tenants.adding") : t("dashboard.platform.tenants.add")}
        </Btn>
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "8px 0 0" }}>
        {t("dashboard.platform.tenants.addMemberNote")}
      </p>
      <Feedback msg={msg} />
    </div>
  );
}

function AssignOwnerForm({
  detail,
  onChanged,
}: {
  detail: TenantManagementDetail;
  onChanged: OnChanged;
}) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await actionAssignOwnerByEmail({ tenantId: detail.id, email });
      if (res.ok) {
        setEmail("");
        setMsg({ tone: "ok", text: t("dashboard.platform.tenants.ownerAssigned") });
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <div
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        background: "rgba(243,103,114,0.06)",
        border: "1px solid rgba(243,103,114,0.2)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: HQ.red,
          marginBottom: 6,
        }}
      >
        {t("dashboard.platform.tenants.noOwnerAssignOne")}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          type="email"
          placeholder={t("dashboard.platform.tenants.assignOwnerPlaceholder")}
          value={email}
          disabled={pending}
          onChange={(e) => setEmail(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
        <Btn
          tone="primary"
          onClick={submit}
          disabled={pending || !email.trim()}
        >
          {pending ? t("dashboard.platform.tenants.assigning") : t("dashboard.platform.tenants.assignAsOwner")}
        </Btn>
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "6px 0 0" }}>
        {t("dashboard.platform.tenants.assignOwnerNote")}
      </p>
      <Feedback msg={msg} />
    </div>
  );
}

export function MembersSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const t = useT();
  const hasOwner = detail.members.some((m) => m.role === "owner" && m.status === "active");
  return (
    <Accordion
      title={t("dashboard.platform.tenants.sectionMembers")}
      hint={`${detail.members.length}`}
      trailing={!hasOwner ? <span style={{ fontSize: 10.5, color: HQ.red, fontWeight: 600 }}>{t("dashboard.platform.tenants.noOwnerBadge")}</span> : null}
      defaultOpen={defaultOpen ?? true}
    >
      <div style={{ paddingTop: 4 }}>
        {!hasOwner && (
          <AssignOwnerForm detail={detail} onChanged={onChanged} />
        )}
        {detail.members.length === 0 ? (
          <div style={{ padding: "12px 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.noMembersYet")}
          </div>
        ) : (
          detail.members.map((m) => (
            <MemberRow
              key={m.membershipId}
              detail={detail}
              member={m}
              onChanged={onChanged}
            />
          ))
        )}
        <AddMemberForm detail={detail} onChanged={onChanged} />
      </div>
    </Accordion>
  );
}

// ─── F. Plan override ────────────────────────────────────────────────────────

function OverrideCard({ override }: { override: WorkspacePlanOverride }) {
  const t = useT();
  const d = daysUntil(override.expiresAt);
  const expiresLine = override.expiresAt
    ? `${interpolate(t("dashboard.platform.tenants.overrideExpires"), { date: fmtDate(override.expiresAt) })}${
        d !== null && d >= 0
          ? ` · ${interpolate(
              t(
                d === 1
                  ? "dashboard.platform.tenants.overrideDaysLeftOne"
                  : "dashboard.platform.tenants.overrideDaysLeftOther",
              ),
              { count: d },
            )}`
          : ""
      }`
    : t("dashboard.platform.tenants.overrideNoExpiry");
  return (
    <div
      style={{
        background: HQ.greenSoft,
        border: "1px solid rgba(93,211,160,0.25)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PlanChip plan={override.overridePlanTier} label={planChipLabel(t, override.overridePlanTier)} />
        <span style={{ fontSize: 12, color: HQ.ink, fontWeight: 600 }}>
          {t("dashboard.platform.tenants.overrideActiveShort")}
        </span>
        <span style={{ flex: 1 }} />
        <Chip outline>{interpolate(t("dashboard.platform.tenants.overrideFrom"), { plan: planText(t, override.basePlanTier) })}</Chip>
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: HQ.inkMuted }}>
        {expiresLine}
      </div>
      {override.reason && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: HQ.inkMuted }}>
          {interpolate(t("dashboard.platform.tenants.overrideReason"), { reason: override.reason })}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 10.5, color: HQ.inkDim }}>
        {interpolate(t("dashboard.platform.tenants.overrideGrantedBy"), {
          name: override.createdByName ?? t("dashboard.platform.tenants.overridePlatformAdmin"),
          date: fmtDate(override.createdAt),
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: HQ.inkDim }}>
        {interpolate(t("dashboard.platform.tenants.overrideReturnsTo"), { plan: planText(t, override.basePlanTier) })}
      </div>
    </div>
  );
}

export function PlanOverrideSection({
  detail,
  onChanged,
  defaultOpen,
}: SectionProps) {
  const t = useT();
  const { override } = detail;
  const [tier, setTier] = useState<WorkspacePlanTier>("studio");
  const [grantKind, setGrantKind] = useState<"comp" | "trial" | "promo">("comp");
  const [duration, setDuration] = useState("6m");
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showForm, setShowForm] = useState(!override);

  function apply() {
    setMsg(null);
    start(async () => {
      const res = await actionApplyPlanOverride({
        tenantId: detail.id,
        overridePlanTier: tier,
        grantKind,
        durationKey: duration,
        customExpiresAt: duration === "custom" ? customDate : null,
        reason,
        note,
      });
      if (res.ok) {
        setMsg({ tone: "ok", text: t("dashboard.platform.tenants.overrideApplied") });
        setReason("");
        setNote("");
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error });
      }
    });
  }

  function remove() {
    setMsg(null);
    start(async () => {
      const res = await actionRemovePlanOverride({ tenantId: detail.id });
      if (res.ok) {
        setConfirmRemove(false);
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error });
        setConfirmRemove(false);
      }
    });
  }

  return (
    <Accordion
      title={t("dashboard.platform.tenants.sectionPlanOverride")}
      trailing={
        override ? <Chip bg={HQ.greenSoft} color={HQ.green}>{t("dashboard.platform.tenants.active")}</Chip> : null
      }
      defaultOpen={defaultOpen ?? Boolean(override)}
    >
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {override && (
          <>
            <OverrideCard override={override} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn tone="danger" onClick={() => setConfirmRemove(true)} disabled={pending}>
                {t("dashboard.platform.tenants.removeOverride")}
              </Btn>
              <Btn onClick={() => setShowForm((v) => !v)} disabled={pending}>
                {showForm ? t("dashboard.platform.tenants.cancelReplace") : t("dashboard.platform.tenants.replaceOverride")}
              </Btn>
            </div>
          </>
        )}

        {showForm && (
          <div
            style={{
              padding: "10px 12px",
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: HQ.inkDim,
              }}
            >
              {override ? t("dashboard.platform.tenants.replaceWithNew") : t("dashboard.platform.tenants.grantOverride")}
            </div>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.grantPlan")}
              <select
                value={tier}
                disabled={pending}
                onChange={(e) => setTier(e.target.value as WorkspacePlanTier)}
                style={{ ...inputStyle, marginTop: 3 }}
              >
                {WORKSPACE_PLAN_TIERS.map((pt) => (
                  <option key={pt} value={pt}>
                    {planText(t, pt)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.grantType")}
              <select
                value={grantKind}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.value as "comp" | "trial" | "promo";
                  setGrantKind(next);
                  // A trial must be time-boxed; nudge an indefinite pick to 1mo.
                  if (next === "trial" && duration === "indefinite") {
                    setDuration("1m");
                  }
                }}
                style={{ ...inputStyle, marginTop: 3 }}
              >
                <option value="comp">{t("dashboard.platform.tenants.grantComp")}</option>
                <option value="trial">{t("dashboard.platform.tenants.grantTrial")}</option>
                <option value="promo">{t("dashboard.platform.tenants.grantPromo")}</option>
              </select>
            </label>
            {grantKind === "trial" && (
              <p
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.5,
                  color: HQ.inkDim,
                  margin: "-2px 0 0",
                }}
              >
                {t("dashboard.platform.tenants.trialHint")}
              </p>
            )}
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.duration")}
              <select
                value={duration}
                disabled={pending}
                onChange={(e) => setDuration(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }}
              >
                {OVERRIDE_DURATIONS.map((dur) => (
                  <option key={dur.key} value={dur.key}>
                    {dur.label}
                  </option>
                ))}
              </select>
            </label>
            {duration === "custom" && (
              <label style={{ fontSize: 11, color: HQ.inkMuted }}>
                {t("dashboard.platform.tenants.customExpiryDate")}
                <input
                  type="date"
                  value={customDate}
                  disabled={pending}
                  onChange={(e) => setCustomDate(e.target.value)}
                  style={{ ...inputStyle, marginTop: 3 }}
                />
              </label>
            )}
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.reason")}
              <input
                type="text"
                placeholder={t("dashboard.platform.tenants.reasonPlaceholder")}
                value={reason}
                disabled={pending}
                onChange={(e) => setReason(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }}
              />
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.internalNoteOptional")}
              <input
                type="text"
                value={note}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }}
              />
            </label>
            <Btn tone="primary" onClick={apply} disabled={pending}>
              {pending ? t("dashboard.platform.tenants.applying") : override ? t("dashboard.platform.tenants.replaceOverride") : t("dashboard.platform.tenants.applyOverride")}
            </Btn>
            <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: 0 }}>
              {t("dashboard.platform.tenants.overrideMirrorNote")}
            </p>
          </div>
        )}

        {detail.overrideHistory.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: HQ.inkDim,
                margin: "4px 0 4px",
              }}
            >
              {t("dashboard.platform.tenants.overrideHistory")}
            </div>
            {detail.overrideHistory.map((o) => (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontSize: 11.5,
                  color: HQ.inkMuted,
                }}
              >
                <PlanChip plan={o.overridePlanTier} label={planChipLabel(t, o.overridePlanTier)} />
                <span>{o.status}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: HQ.inkDim }}>
                  {fmtDate(o.createdAt)} → {fmtDate(o.endedAt)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Feedback msg={msg} />
      </div>

      <ConfirmModal
        open={confirmRemove}
        title={t("dashboard.platform.tenants.removeOverrideTitle")}
        body={
          override
            ? interpolate(t("dashboard.platform.tenants.removeOverrideBody"), {
                plan: planText(t, override.overridePlanTier),
                workspace: detail.name,
                base: planText(t, override.basePlanTier),
              })
            : ""
        }
        confirmLabel={t("dashboard.platform.tenants.removeOverride")}
        pending={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}
      />
    </Accordion>
  );
}
