"use client";

/**
 * C.8 — Admin actions panel for the platform user drawer.
 * Tier 1 (safe), Tier 2 (reversible), and Tier 3 (destructive) actions,
 * each with appropriate confirmation UI.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HQ, HQ_F, HQ_FM } from "../tenants/hq-kit";
import { useT } from "@/i18n/use-t";
import {
  resendPlatformUserConfirmation,
  sendPlatformUserPasswordReset,
  setPlatformUserTempPassword,
  forcePlatformUserSignOut,
  openPlatformSupportMode,
} from "./actions";
import {
  suspendPlatformUser,
  unsuspendPlatformUser,
  hideTalentGlobally,
  markPlatformUserAsTest,
} from "./actions-tier2";
import {
  deletePlatformUserAccount,
  gdprAnonymizePlatformUser,
  unclaimTalentProfile,
} from "./actions-tier3";
import { ConfirmDestructiveModal } from "./ConfirmDestructiveModal";
import type { PlatformUserRow } from "../../platform-data";

// ─── Shared button style helpers ─────────────────────────────────────────────

function ActionButton({
  label,
  onClick,
  pending,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
  variant?: "default" | "warn" | "danger";
  disabled?: boolean;
}) {
  const t = useT();
  const borderColor =
    variant === "danger"
      ? "rgba(229,99,99,0.35)"
      : variant === "warn"
        ? "rgba(229,181,103,0.35)"
        : HQ.borderSoft;
  const color =
    variant === "danger"
      ? "#e56363"
      : variant === "warn"
        ? HQ.amber
        : HQ.ink;

  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={onClick}
      style={{
        padding: "7px 12px",
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: "transparent",
        color: pending || disabled ? HQ.inkDim : color,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: HQ_F,
        cursor: pending || disabled ? "not-allowed" : "pointer",
        opacity: pending || disabled ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {pending ? t("dashboard.platform.users.actions.working") : label}
    </button>
  );
}

function StatusMessage({
  status,
  message,
}: {
  status: "ok" | "error";
  message?: string | null;
}) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 12,
        color: status === "ok" ? HQ.green : HQ.amber,
        fontWeight: 600,
      }}
    >
      {status === "ok" ? "✓ " : "✗ "}
      {message}
    </div>
  );
}

// ─── Tier 1 — Safe / reversible ──────────────────────────────────────────────

function Tier1Actions({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    action: string;
    ok: boolean;
    msg: string;
  } | null>(null);
  const [tempPwMode, setTempPwMode] = useState(false);
  const [tempPw, setTempPw] = useState("");

  const isHuman = user.kind === "human";

  function run(
    actionKey: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setActionPending(actionKey);
    setLastResult(null);
    startTransition(async () => {
      const res = await fn();
      setActionPending(null);
      if (res.ok) {
        setLastResult({ action: actionKey, ok: true, msg: t("dashboard.platform.users.actions.done") });
        router.refresh();
      } else {
        setLastResult({
          action: actionKey,
          ok: false,
          msg: res.error ?? t("dashboard.platform.users.actions.unknownError"),
        });
      }
    });
  }

  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: HQ.inkDim,
          marginBottom: 8,
        }}
      >
        {t("dashboard.platform.users.actions.tier1Title")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isHuman && (
          <ActionButton
            label={t("dashboard.platform.users.actions.resendConfirmation")}
            pending={pending && actionPending === "resend"}
            onClick={() =>
              run("resend", () =>
                resendPlatformUserConfirmation(user.id),
              )
            }
          />
        )}
        {isHuman && (
          <ActionButton
            label={t("dashboard.platform.users.actions.sendPasswordReset")}
            pending={pending && actionPending === "pwreset"}
            onClick={() =>
              run("pwreset", () => sendPlatformUserPasswordReset(user.id))
            }
          />
        )}
        {isHuman && (
          <ActionButton
            label={t("dashboard.platform.users.actions.setTempPassword")}
            onClick={() => {
              setTempPwMode(!tempPwMode);
              setTempPw("");
            }}
          />
        )}
        {isHuman && (
          <ActionButton
            label={t("dashboard.platform.users.actions.forceSignOut")}
            variant="warn"
            pending={pending && actionPending === "signout"}
            onClick={() =>
              run("signout", () => forcePlatformUserSignOut(user.id))
            }
          />
        )}
        <ActionButton
          label={t("dashboard.platform.users.actions.openSupportMode")}
          pending={pending && actionPending === "support"}
          onClick={() =>
            run("support", async () => {
              const res = await openPlatformSupportMode(
                user.id,
                user.kind === "unclaimed_talent"
                  ? "unclaimed_talent"
                  : "human",
              );
              if (res.ok && res.redirectUrl) {
                window.open(res.redirectUrl, "_blank");
              }
              return res;
            })
          }
        />
      </div>

      {/* Temp password inline form */}
      {isHuman && tempPwMode && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: HQ.inkDim,
              marginBottom: 8,
            }}
          >
            {t("dashboard.platform.users.actions.tempPasswordPrompt")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={tempPw}
              onChange={(e) => setTempPw(e.target.value)}
              placeholder={t("dashboard.platform.users.actions.tempPasswordPlaceholder")}
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: 8,
                border: `1px solid ${HQ.borderSoft}`,
                background: HQ.bg,
                color: HQ.ink,
                fontSize: 12,
                fontFamily: HQ_F,
                outline: "none",
              }}
            />
            <ActionButton
              label={t("dashboard.platform.users.actions.setPassword")}
              pending={pending && actionPending === "temppw"}
              disabled={tempPw.length < 8}
              onClick={() => {
                run("temppw", () =>
                  setPlatformUserTempPassword(user.id, tempPw),
                );
                setTempPwMode(false);
                setTempPw("");
              }}
            />
          </div>
        </div>
      )}

      {lastResult && (
        <StatusMessage
          status={lastResult.ok ? "ok" : "error"}
          message={lastResult.msg}
        />
      )}
    </div>
  );
}

// ─── Tier 2 — Reversible admin actions ───────────────────────────────────────

function Tier2Actions({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const isHuman = user.kind === "human";
  const isSuspended =
    isHuman && user.accountStatus === "suspended";
  const hasTalent =
    user.kind === "unclaimed_talent" || user.talentProfileId !== null;
  const talentId = user.kind === "unclaimed_talent"
    ? user.id
    : user.talentProfileId;
  const isPublished = user.publishedGlobally === true;
  const isTest = user.isTestAccount;

  function run(
    actionKey: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setActionPending(actionKey);
    setLastResult(null);
    startTransition(async () => {
      const res = await fn();
      setActionPending(null);
      if (res.ok) {
        setLastResult({ ok: true, msg: t("dashboard.platform.users.actions.done") });
        router.refresh();
      } else {
        setLastResult({
          ok: false,
          msg: res.error ?? t("dashboard.platform.users.actions.unknownError"),
        });
      }
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: HQ.inkDim,
          marginBottom: 8,
        }}
      >
        {t("dashboard.platform.users.actions.tier2Title")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isHuman && (
          <ActionButton
            label={isSuspended ? t("dashboard.platform.users.actions.unsuspendAccount") : t("dashboard.platform.users.actions.suspendAccount")}
            variant={isSuspended ? "default" : "warn"}
            pending={
              pending &&
              (actionPending === "suspend" || actionPending === "unsuspend")
            }
            onClick={() =>
              run(
                isSuspended ? "unsuspend" : "suspend",
                () =>
                  isSuspended
                    ? unsuspendPlatformUser(user.id)
                    : suspendPlatformUser(user.id),
              )
            }
          />
        )}
        {hasTalent && talentId && (
          <ActionButton
            label={
              isPublished
                ? t("dashboard.platform.users.actions.hideTalentGlobally")
                : t("dashboard.platform.users.actions.unhideTalentGlobally")
            }
            variant={isPublished ? "warn" : "default"}
            pending={
              pending &&
              (actionPending === "hide" || actionPending === "unhide")
            }
            onClick={() =>
              run(
                isPublished ? "hide" : "unhide",
                () => hideTalentGlobally(talentId, isPublished),
              )
            }
          />
        )}
        <ActionButton
          label={isTest ? t("dashboard.platform.users.actions.unmarkTestAccount") : t("dashboard.platform.users.actions.markAsTestAccount")}
          variant={isTest ? "default" : "warn"}
          pending={pending && actionPending === "test"}
          onClick={() =>
            run("test", () =>
              markPlatformUserAsTest(
                user.id,
                user.kind === "unclaimed_talent" ? "unclaimed_talent" : "human",
                !isTest,
              ),
            )
          }
        />
      </div>
      {lastResult && (
        <StatusMessage
          status={lastResult.ok ? "ok" : "error"}
          message={lastResult.msg}
        />
      )}
    </div>
  );
}

// ─── Tier 3 — Destructive ────────────────────────────────────────────────────

function Tier3Actions({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<
    "none" | "delete" | "gdpr" | "unclaim"
  >("none");
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const isHuman = user.kind === "human";
  const hasTalentProfile =
    user.kind === "unclaimed_talent" || user.talentProfileId !== null;
  const talentId =
    user.kind === "unclaimed_talent" ? user.id : user.talentProfileId;
  const isClaimedTalent = isHuman && user.talentProfileId !== null;

  function confirm(fn: (name: string) => Promise<{ ok: boolean; error?: string }>) {
    return (name: string) => {
      setLastResult(null);
      startTransition(async () => {
        const res = await fn(name);
        setModal("none");
        if (res.ok) {
          setLastResult({ ok: true, msg: t("dashboard.platform.users.actions.done") });
          router.refresh();
        } else {
          setLastResult({ ok: false, msg: res.error ?? t("dashboard.platform.users.actions.unknownError") });
        }
      });
    };
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "#e56363",
          marginBottom: 8,
        }}
      >
        {t("dashboard.platform.users.actions.tier3Title")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isHuman && (
          <ActionButton
            label={t("dashboard.platform.users.actions.gdprAnonymize")}
            variant="danger"
            onClick={() => setModal("gdpr")}
          />
        )}
        {isHuman && (
          <ActionButton
            label={t("dashboard.platform.users.actions.deleteAccount")}
            variant="danger"
            onClick={() => setModal("delete")}
          />
        )}
        {isClaimedTalent && (
          <ActionButton
            label={t("dashboard.platform.users.actions.unclaimTalentProfile")}
            variant="danger"
            onClick={() => setModal("unclaim")}
          />
        )}
      </div>

      {lastResult && (
        <StatusMessage
          status={lastResult.ok ? "ok" : "error"}
          message={lastResult.msg}
        />
      )}

      {/* GDPR anonymize modal */}
      <ConfirmDestructiveModal
        isOpen={modal === "gdpr"}
        onClose={() => setModal("none")}
        onConfirm={confirm((name) =>
          gdprAnonymizePlatformUser(user.id, name),
        )}
        targetName={user.displayName}
        actionLabel={t("dashboard.platform.users.actions.gdprActionLabel")}
        warningText={t("dashboard.platform.users.actions.gdprWarning")}
        isPending={pending}
      />

      {/* Delete account modal */}
      <ConfirmDestructiveModal
        isOpen={modal === "delete"}
        onClose={() => setModal("none")}
        onConfirm={confirm((name) =>
          deletePlatformUserAccount(user.id, name),
        )}
        targetName={user.displayName}
        actionLabel={t("dashboard.platform.users.actions.deleteActionLabel")}
        warningText={t("dashboard.platform.users.actions.deleteWarning")}
        isPending={pending}
      />

      {/* Unclaim talent profile modal */}
      {isClaimedTalent && hasTalentProfile && talentId && (
        <ConfirmDestructiveModal
          isOpen={modal === "unclaim"}
          onClose={() => setModal("none")}
          onConfirm={confirm((name) =>
            unclaimTalentProfile(talentId, name),
          )}
          targetName={user.displayName}
          actionLabel={t("dashboard.platform.users.actions.unclaimActionLabel")}
          warningText={t("dashboard.platform.users.actions.unclaimWarning")}
          isPending={pending}
        />
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function AdminActionsSection({ user }: { user: PlatformUserRow }) {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section style={{ marginBottom: 18 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setIsOpen(!isOpen)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: HQ.ink,
          fontFamily: HQ_FM,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          marginBottom: isOpen ? 8 : 0,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 11 }}>{isOpen ? "▼" : "▶"}</span>
        {t("dashboard.platform.users.actions.title")}
        <span
          style={{
            fontSize: 10,
            color: "#e56363",
            fontWeight: 700,
            letterSpacing: 0.4,
          }}
        >
          · {t("dashboard.platform.users.actions.operatorOnly")}
        </span>
      </div>

      {isOpen && (
        <div
          style={{
            background: HQ.cardSoft,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            padding: "12px",
          }}
        >
          <Tier1Actions user={user} />
          <Tier2Actions user={user} />
          <Tier3Actions user={user} />
        </div>
      )}
    </section>
  );
}
