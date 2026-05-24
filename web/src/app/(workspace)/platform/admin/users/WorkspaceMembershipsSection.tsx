"use client";

/**
 * C.5 — Workspace & hub memberships section for the platform user drawer.
 * Shows each membership with a ⋯ menu to change role or remove.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HQ, HQ_F, HQ_FM, PlanChip, SectionLabel } from "../tenants/hq-kit";
import { MembershipRoleChip } from "./user-chips";
import {
  removeUserFromWorkspace,
  changePlatformUserWorkspaceRole,
} from "./actions-tier2";
import type { PlatformUserRow } from "../../platform-data";

type Membership = PlatformUserRow["memberships"][number];

const WORKSPACE_ROLES = ["owner", "admin", "manager", "editor", "viewer"] as const;

function MembershipRow({
  m,
  userId,
  onDone,
}: {
  m: Membership;
  userId: string;
  onDone: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "changeRole" | "removeConfirm">(
    "idle",
  );
  const [selectedRole, setSelectedRole] = useState(m.role);
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChangeRole() {
    if (selectedRole === m.role) {
      setMode("idle");
      return;
    }
    setStatus("pending");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await changePlatformUserWorkspaceRole(
        userId,
        m.tenantId,
        selectedRole,
      );
      if (res.ok) {
        setStatus("ok");
        setMode("idle");
        onDone();
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  }

  function handleRemove() {
    setStatus("pending");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await removeUserFromWorkspace(userId, m.tenantId);
      if (res.ok) {
        setStatus("ok");
        setMode("idle");
        onDone();
      } else {
        setStatus("error");
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <li
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Main row */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/platform/admin/tenants/${m.tenantId}`}
            style={{
              color: HQ.ink,
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            {m.name}
          </Link>
          <div style={{ color: HQ.inkDim, fontFamily: HQ_FM, fontSize: 10.5 }}>
            {m.slug}
          </div>
        </div>
        <PlanChip plan={m.plan} />
        <MembershipRoleChip role={m.role} />
        <button
          type="button"
          onClick={() => {
            setMenuOpen(!menuOpen);
            setMode("idle");
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: `1px solid ${HQ.borderSoft}`,
            background: menuOpen ? HQ.cardSoft : "transparent",
            color: HQ.inkMuted,
            cursor: "pointer",
            fontSize: 14,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Membership actions"
        >
          ⋯
        </button>
      </div>

      {/* Action menu */}
      {menuOpen && mode === "idle" && (
        <div
          style={{
            borderTop: `1px solid ${HQ.borderSoft}`,
            padding: "8px 12px",
            background: HQ.bg,
            display: "flex",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("changeRole");
              setSelectedRole(m.role);
              setStatus("idle");
              setErrorMsg(null);
            }}
            style={menuButtonStyle}
          >
            Change role
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("removeConfirm");
              setStatus("idle");
              setErrorMsg(null);
            }}
            style={{ ...menuButtonStyle, color: HQ.amber, borderColor: "rgba(229,181,103,0.35)" }}
          >
            Remove
          </button>
        </div>
      )}

      {/* Change role UI */}
      {menuOpen && mode === "changeRole" && (
        <div
          style={{
            borderTop: `1px solid ${HQ.borderSoft}`,
            padding: "10px 12px",
            background: HQ.bg,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: HQ.inkDim,
              marginBottom: 8,
            }}
          >
            Select new role for this workspace:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {WORKSPACE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRole(r)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${selectedRole === r ? HQ.ink : HQ.borderSoft}`,
                  background: selectedRole === r ? HQ.cardSoft : "transparent",
                  color: selectedRole === r ? HQ.ink : HQ.inkMuted,
                  fontSize: 11.5,
                  fontWeight: selectedRole === r ? 600 : undefined,
                  fontFamily: HQ_F,
                  cursor: "pointer",
                }}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          {errorMsg && (
            <div style={{ fontSize: 11.5, color: HQ.amber, marginBottom: 8 }}>
              {errorMsg}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={status === "pending" || selectedRole === m.role}
              onClick={handleChangeRole}
              style={{
                ...menuButtonStyle,
                opacity: status === "pending" || selectedRole === m.role ? 0.5 : 1,
                cursor: status === "pending" || selectedRole === m.role ? "not-allowed" : "pointer",
              }}
            >
              {status === "pending" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              style={{ ...menuButtonStyle, color: HQ.inkMuted }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Remove confirm UI */}
      {menuOpen && mode === "removeConfirm" && (
        <div
          style={{
            borderTop: `1px solid ${HQ.borderSoft}`,
            padding: "10px 12px",
            background: HQ.bg,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: HQ.amber,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Remove this user from <strong>{m.name}</strong>? This cannot be undone.
          </div>
          {errorMsg && (
            <div style={{ fontSize: 11.5, color: HQ.amber, marginBottom: 8 }}>
              {errorMsg}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={status === "pending"}
              onClick={handleRemove}
              style={{
                ...menuButtonStyle,
                color: HQ.amber,
                borderColor: "rgba(229,181,103,0.35)",
                opacity: status === "pending" ? 0.5 : 1,
                cursor: status === "pending" ? "not-allowed" : "pointer",
              }}
            >
              {status === "pending" ? "Removing…" : "Confirm remove"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              style={{ ...menuButtonStyle, color: HQ.inkMuted }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const menuButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${HQ.borderSoft}`,
  background: "transparent",
  color: HQ.ink,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: HQ_F,
  cursor: "pointer",
};

export function WorkspaceMembershipsSection({
  user,
}: {
  user: PlatformUserRow;
}) {
  const router = useRouter();
  const workspaces = user.memberships.filter((m) => m.kind === "agency");
  const hubs = user.memberships.filter((m) => m.kind === "hub");

  function onDone() {
    router.refresh();
  }

  return (
    <>
      {/* Workspaces */}
      <section style={{ marginBottom: 18 }}>
        <SectionLabel>Workspaces · {workspaces.length}</SectionLabel>
        {workspaces.length === 0 ? (
          <EmptyState text="Not a member of any workspace." />
        ) : (
          <ul
            style={{
              marginTop: 8,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: 6,
            }}
          >
            {workspaces.map((m) => (
              <MembershipRow
                key={m.tenantId}
                m={m}
                userId={user.id}
                onDone={onDone}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Hubs */}
      <section style={{ marginBottom: 18 }}>
        <SectionLabel>Hubs · {hubs.length}</SectionLabel>
        {hubs.length === 0 ? (
          <EmptyState text="Not a member of any hub." />
        ) : (
          <ul
            style={{
              marginTop: 8,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: 6,
            }}
          >
            {hubs.map((m) => (
              <MembershipRow
                key={m.tenantId}
                m={m}
                userId={user.id}
                onDone={onDone}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: "14px",
        background: HQ.cardSoft,
        border: `1px dashed ${HQ.borderSoft}`,
        borderRadius: 10,
        fontSize: 12.5,
        color: HQ.inkDim,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}
