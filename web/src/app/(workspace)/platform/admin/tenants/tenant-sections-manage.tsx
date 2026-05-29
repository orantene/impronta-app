"use client";

/**
 * Platform Admin — interactive tenant management sections.
 *
 * Members & roles + Plan override — the sections that call server actions.
 * Every async state is surfaced inline (pending, success, error).
 */

import { useState, useTransition } from "react";
import { HQ, HQ_FM, Chip, PlanChip, RoleChip } from "./hq-kit";
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
        setMsg({ tone: "err", text: res.error ?? "Action failed." });
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
          <RoleChip role="owner" />
        ) : (
          <select
            aria-label={`Role for ${member.displayName}`}
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
                {r}
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
          joined {member.joinedAtLabel}
        </span>
        <span style={{ flex: 1 }} />
        {!isOwner && member.status === "active" && (
          <Btn size="sm" onClick={() => setConfirm("transfer")} disabled={pending}>
            ⤴ Make owner
          </Btn>
        )}
        {!isOwner && (
          <Btn
            size="sm"
            tone="danger"
            onClick={() => setConfirm("remove")}
            disabled={pending}
          >
            Remove
          </Btn>
        )}
      </div>
      <Feedback msg={msg} />
      <ConfirmModal
        open={confirm === "remove"}
        title="Remove member"
        body={
          <>
            Remove <strong>{member.displayName}</strong> from{" "}
            <strong>{detail.name}</strong>? They lose all workspace access.
          </>
        }
        confirmLabel="Remove member"
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
        title="Transfer ownership"
        body={
          <>
            Make <strong>{member.displayName}</strong> the owner of{" "}
            <strong>{detail.name}</strong>? The current owner becomes an admin.
            Ownership carries billing responsibility.
          </>
        }
        confirmLabel="Transfer ownership"
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
        setMsg({ tone: "ok", text: "Member added." });
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
        Add staff member
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          type="email"
          placeholder="member@email.com"
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
              {r}
            </option>
          ))}
        </select>
        <Btn tone="primary" onClick={submit} disabled={pending || !email.trim()}>
          {pending ? "Adding…" : "Add"}
        </Btn>
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "8px 0 0" }}>
        The person must already have a Tulala account. Use Transfer ownership to
        assign the owner role.
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
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await actionAssignOwnerByEmail({ tenantId: detail.id, email });
      if (res.ok) {
        setEmail("");
        setMsg({ tone: "ok", text: "Owner assigned." });
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
        No owner — assign one
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          type="email"
          placeholder="owner@email.com"
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
          {pending ? "Assigning…" : "Assign as owner"}
        </Btn>
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "6px 0 0" }}>
        Creates a new membership at owner level. The person must have a Tulala account.
      </p>
      <Feedback msg={msg} />
    </div>
  );
}

export function MembersSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const hasOwner = detail.members.some((m) => m.role === "owner" && m.status === "active");
  return (
    <Accordion
      title="Members & roles"
      hint={`${detail.members.length}`}
      trailing={!hasOwner ? <span style={{ fontSize: 10.5, color: HQ.red, fontWeight: 600 }}>no owner</span> : null}
      defaultOpen={defaultOpen ?? true}
    >
      <div style={{ paddingTop: 4 }}>
        {!hasOwner && (
          <AssignOwnerForm detail={detail} onChanged={onChanged} />
        )}
        {detail.members.length === 0 ? (
          <div style={{ padding: "12px 0", fontSize: 12.5, color: HQ.inkMuted }}>
            No members yet.
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
  const d = daysUntil(override.expiresAt);
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
        <PlanChip plan={override.overridePlanTier} />
        <span style={{ fontSize: 12, color: HQ.ink, fontWeight: 600 }}>
          override active
        </span>
        <span style={{ flex: 1 }} />
        <Chip outline>from {PLAN_TIER_LABEL[override.basePlanTier]}</Chip>
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: HQ.inkMuted }}>
        {override.expiresAt ? (
          <>
            Expires {fmtDate(override.expiresAt)}
            {d !== null && d >= 0 ? ` · ${d} day${d === 1 ? "" : "s"} left` : ""}
          </>
        ) : (
          "No expiry — indefinite grant"
        )}
      </div>
      {override.reason && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: HQ.inkMuted }}>
          Reason: {override.reason}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 10.5, color: HQ.inkDim }}>
        Granted by {override.createdByName ?? "platform admin"} ·{" "}
        {fmtDate(override.createdAt)}
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: HQ.inkDim }}>
        On expiry the workspace returns to {PLAN_TIER_LABEL[override.basePlanTier]}{" "}
        unless a paid subscription exists.
      </div>
    </div>
  );
}

export function PlanOverrideSection({
  detail,
  onChanged,
  defaultOpen,
}: SectionProps) {
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
        setMsg({ tone: "ok", text: "Override applied." });
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
      title="Plan override"
      trailing={
        override ? <Chip bg={HQ.greenSoft} color={HQ.green}>Active</Chip> : null
      }
      defaultOpen={defaultOpen ?? Boolean(override)}
    >
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {override && (
          <>
            <OverrideCard override={override} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn tone="danger" onClick={() => setConfirmRemove(true)} disabled={pending}>
                Remove override
              </Btn>
              <Btn onClick={() => setShowForm((v) => !v)} disabled={pending}>
                {showForm ? "Cancel replace" : "Replace override"}
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
              {override ? "Replace with a new override" : "Grant a plan override"}
            </div>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Grant plan
              <select
                value={tier}
                disabled={pending}
                onChange={(e) => setTier(e.target.value as WorkspacePlanTier)}
                style={{ ...inputStyle, marginTop: 3 }}
              >
                {WORKSPACE_PLAN_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {PLAN_TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Grant type
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
                <option value="comp">Comp — silent courtesy grant</option>
                <option value="trial">Trial — countdown + upgrade nudge</option>
                <option value="promo">Promo — silent promotional grant</option>
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
                The workspace sees a live countdown in its plan badge, an
                &ldquo;expiring soon&rdquo; warning in the final week, and a
                restore-this-plan nudge for two weeks after it ends. Choose a
                bounded duration below — a trial can&rsquo;t be indefinite.
              </p>
            )}
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Duration
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
                Custom expiry date
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
              Reason
              <input
                type="text"
                placeholder="e.g. 6-month founder comp"
                value={reason}
                disabled={pending}
                onChange={(e) => setReason(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }}
              />
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              Internal note (optional)
              <input
                type="text"
                value={note}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }}
              />
            </label>
            <Btn tone="primary" onClick={apply} disabled={pending}>
              {pending ? "Applying…" : override ? "Replace override" : "Apply override"}
            </Btn>
            <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: 0 }}>
              The granted plan is mirrored onto the workspace immediately — its
              dashboard, billing page and plan gates all switch to the new tier.
              Base plan, expiry and author are recorded for a clean reversal.
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
              Override history
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
                <PlanChip plan={o.overridePlanTier} />
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
        title="Remove plan override"
        body={
          override ? (
            <>
              Remove the {PLAN_TIER_LABEL[override.overridePlanTier]} override on{" "}
              <strong>{detail.name}</strong>? It returns to{" "}
              {PLAN_TIER_LABEL[override.basePlanTier]} (or its paid subscription
              plan, if any).
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Remove override"
        pending={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}
      />
    </Accordion>
  );
}
