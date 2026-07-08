"use client";

/**
 * Typed-name confirmation modal for Tier-3 destructive platform actions.
 *
 * The operator must type the target's display name exactly (case-insensitive,
 * trimmed) before the confirm button enables. The server re-validates the
 * typed name as a defense-in-depth check — this modal is just the UX gate.
 *
 * Used by:
 *   - deletePlatformUserAccount
 *   - gdprAnonymizePlatformUser
 *   - unclaimTalentProfile
 */

import { useEffect, useState } from "react";
import { HQ, HQ_F, HQ_FD } from "../tenants/hq-kit";
import { useT } from "@/i18n/use-t";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (typedName: string) => void;
  targetName: string;
  actionLabel: string;
  warningText: string;
  isPending?: boolean;
}

export function ConfirmDestructiveModal({
  isOpen,
  onClose,
  onConfirm,
  targetName,
  actionLabel,
  warningText,
  isPending = false,
}: Props) {
  const t = useT();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!isOpen) setTyped("");
  }, [isOpen]);

  if (!isOpen) return null;

  const normalizedTyped = typed.trim().toLowerCase();
  const normalizedTarget = targetName.trim().toLowerCase();
  const matches = normalizedTyped.length > 0 && normalizedTyped === normalizedTarget;
  const canConfirm = matches && !isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={actionLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        fontFamily: HQ_FD,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: HQ.card,
          border: `1px solid ${HQ.border}`,
          borderRadius: 14,
          padding: 24,
          color: HQ.ink,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: -0.2,
            marginBottom: 12,
            fontFamily: HQ_F,
          }}
        >
          {actionLabel}
        </div>

        <div
          style={{
            background: HQ.amberSoft,
            border: `1px solid ${HQ.amber}`,
            borderRadius: 10,
            padding: "10px 12px",
            color: HQ.amber,
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 18,
            fontFamily: HQ_F,
          }}
        >
          {warningText}
        </div>

        <label
          style={{
            display: "block",
            fontSize: 11.5,
            color: HQ.inkMuted,
            marginBottom: 8,
            fontFamily: HQ_F,
            letterSpacing: 0.2,
          }}
        >
          {t("dashboard.platform.users.confirmModal.typePrefix")}{" "}
          <strong style={{ color: HQ.ink, fontWeight: 700 }}>{targetName}</strong>{" "}
          {t("dashboard.platform.users.confirmModal.typeSuffix")}
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          disabled={isPending}
          autoComplete="off"
          spellCheck={false}
          placeholder={targetName}
          style={{
            width: "100%",
            background: HQ.cardSoft,
            border: `1px solid ${matches ? HQ.green : HQ.borderSoft}`,
            borderRadius: 8,
            padding: "10px 12px",
            color: HQ.ink,
            fontSize: 13,
            fontFamily: HQ_F,
            outline: "none",
            marginBottom: 18,
          }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              background: "transparent",
              border: `1px solid ${HQ.borderSoft}`,
              color: HQ.inkMuted,
              padding: "9px 16px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              fontFamily: HQ_F,
              letterSpacing: 0.2,
            }}
          >
            {t("dashboard.platform.users.confirmModal.cancel")}
          </button>
          <button
            type="button"
            onClick={() => canConfirm && onConfirm(typed)}
            disabled={!canConfirm}
            style={{
              background: canConfirm ? HQ.red : HQ.redSoft,
              border: `1px solid ${HQ.red}`,
              color: canConfirm ? "#fff" : HQ.red,
              padding: "9px 16px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "not-allowed",
              opacity: canConfirm ? 1 : 0.6,
              fontFamily: HQ_F,
              letterSpacing: 0.2,
            }}
          >
            {isPending ? t("dashboard.platform.users.confirmModal.working") : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDestructiveModal;
