"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import type { AddablePayoutWorkspace, OwnManualPayoutAccount } from "@/lib/payments/talent-bank-reference";
import { addMyManualPayoutAccount, loadMyManualPayoutAccounts, saveMyBankReference } from "./manual-bank-actions";

const field: CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  fontFamily: FONTS.body,
  fontSize: 13,
  color: COLORS.ink,
  background: COLORS.surface,
};

/**
 * The talent's own masked bank reference for each manual payout account (holder, bank, last 4
 * digits, never a full number). The workspace owner verifies it; this card never does. Renders
 * nothing when the talent has no manual payout account.
 */
export function ManualBankReferenceCard() {
  const copy = useDashboardText();
  const [accounts, setAccounts] = useState<OwnManualPayoutAccount[] | null>(null);
  const [addable, setAddable] = useState<AddablePayoutWorkspace[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () =>
    loadMyManualPayoutAccounts().then((r) => {
      setAccounts(r.ok ? r.accounts : []);
      setAddable(r.ok ? r.addable : []);
    });

  useEffect(() => {
    let cancelled = false;
    loadMyManualPayoutAccounts().then((r) => {
      if (cancelled) return;
      setAccounts(r.ok ? r.accounts : []);
      setAddable(r.ok ? r.addable : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = async (tenantId: string) => {
    setBusyId(tenantId);
    setAddError(null);
    const r = await addMyManualPayoutAccount({ tenantId });
    if (!r.ok) setAddError(r.code === "not_rostered" ? copy.t("You are not on this workspace's roster.") : copy.t("Could not save. Try again."));
    await reload();
    setBusyId(null);
  };

  if (!accounts || (accounts.length === 0 && addable.length === 0)) return null;
  return (
    <div style={{ marginTop: 26 }} data-manual-bank-reference>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: COLORS.inkDim, marginBottom: 6 }}>
        {copy.t("Bank details for manual payouts")}
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: COLORS.inkMuted, margin: "0 0 10px" }}>
        {copy.t("Add the bank name, the account holder and only the last 4 digits. Never enter your full account number. The workspace owner verifies it before payouts can start.")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {accounts.map((a) => (
          <BankReferenceForm key={a.id} account={a} onSaved={(next) => setAccounts((cur) => (cur ?? []).map((x) => (x.id === next.id ? next : x)))} />
        ))}
        {addable.map((w) => (
          <div key={w.tenantId} data-add-manual-payout style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", border: `1px dashed ${COLORS.border}`, borderRadius: 12, padding: 14 }}>
            <strong style={{ fontSize: 13, fontFamily: FONTS.body }}>{w.workspaceName}</strong>
            <button type="button" onClick={() => add(w.tenantId)} disabled={busyId === w.tenantId} style={{ ...field, fontWeight: 600, cursor: busyId === w.tenantId ? "wait" : "pointer" }}>
              {copy.t("Add a manual payout account")}
            </button>
          </div>
        ))}
      </div>
      {addError ? (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: COLORS.coralDeep }}>
          {addError}
        </p>
      ) : null}
    </div>
  );
}

function BankReferenceForm({ account, onSaved }: { account: OwnManualPayoutAccount; onSaved: (next: OwnManualPayoutAccount) => void }) {
  const copy = useDashboardText();
  const [holder, setHolder] = useState(account.bankHolder ?? "");
  const [bankName, setBankName] = useState(account.bankName ?? "");
  const [last4, setLast4] = useState(account.bankLast4 ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const errorText = (code: string) =>
    code === "holder"
      ? copy.t("Enter the account holder name.")
      : code === "bank"
        ? copy.t("Enter the bank name.")
        : code === "last4"
          ? copy.t("Enter exactly the last 4 digits. Never enter the full account number.")
          : copy.t("Could not save. Try again.");

  const submit = () =>
    startTransition(async () => {
      setMessage(null);
      const r = await saveMyBankReference({ accountId: account.id, holder, bankName, last4 });
      if (!r.ok) {
        setMessage({ tone: "error", text: errorText(r.code) });
        return;
      }
      onSaved({
        ...account,
        bankHolder: holder.trim(),
        bankName: bankName.trim(),
        bankLast4: last4.trim(),
        status: r.backToPending ? "pending_verification" : account.status,
      });
      setMessage({
        tone: "ok",
        text: r.backToPending
          ? copy.t("Saved. Because the details changed, the owner needs to verify them again.")
          : copy.t("Saved. The workspace owner will verify it."),
      });
    });

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, background: COLORS.surface }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8, fontFamily: FONTS.body }}>
        <strong style={{ fontSize: 13 }}>{account.workspaceName}</strong>
        <span style={{ fontSize: 12, color: account.status === "connected" ? COLORS.successDeep : COLORS.coralDeep }}>
          {account.status === "connected" ? copy.t("Verified") : copy.t("Waiting for the owner to verify")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} placeholder={copy.t("Account holder")} aria-label={copy.t("Account holder")} style={field} />
        <input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={120} placeholder={copy.t("Bank")} aria-label={copy.t("Bank")} style={field} />
        <input
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          placeholder={copy.t("Last 4 digits")}
          aria-label={copy.t("Last 4 digits")}
          style={{ ...field, width: 110 }}
        />
        <button type="button" onClick={submit} disabled={busy} style={{ ...field, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>
          {copy.t("Save bank details")}
        </button>
      </div>
      {message ? (
        <p role="status" style={{ margin: "8px 0 0", fontSize: 12.5, color: message.tone === "ok" ? COLORS.successDeep : COLORS.coralDeep }}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
