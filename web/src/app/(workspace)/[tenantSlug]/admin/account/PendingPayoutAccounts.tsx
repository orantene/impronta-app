import { C, FONT, SectionHead } from "./AccountPageParts";
import { markPayoutAccountVerifiedAction, savePayoutBankReferenceAction } from "./payout-verification-actions";
import type { PendingPayoutAccount } from "@/lib/payments/pending-payout-accounts";

/**
 * Owner-only section: manual payout accounts that cannot receive payouts yet. The page renders it
 * only for the owner capability; the actions re-check it, so hiding the buttons is not the guard.
 */
export function PendingPayoutAccounts({
  accounts,
  tenantSlug,
  t,
}: {
  accounts: PendingPayoutAccount[];
  tenantSlug: string;
  t: (key: string) => string;
}) {
  if (accounts.length === 0) return null;
  const input = {
    height: 32,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    fontFamily: FONT,
    fontSize: 12.5,
    background: C.cardBg,
    color: C.ink,
  } as const;
  const button = {
    height: 32,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.cardBg,
    color: C.ink,
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  return (
    <section id="pending-payouts">
      <SectionHead>{t("admin.account.payoutVerifyTitle")}</SectionHead>
      <p style={{ fontSize: 12.5, color: C.inkMuted, margin: "0 0 10px", fontFamily: FONT }}>{t("admin.account.payoutVerifyHint")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {accounts.map((a) => (
          <div key={a.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, fontFamily: FONT }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>{a.displayName}</strong>
              <span style={{ fontSize: 12, color: C.amber }}>{t("admin.account.payoutVerifyPending")}</span>
            </div>
            {a.bankLast4 ? (
              <p style={{ fontSize: 12.5, color: C.inkMuted, margin: "0 0 8px" }}>
                {a.bankHolder}, {a.bankName}, {t("admin.account.payoutVerifyEnding")} {a.bankLast4}
              </p>
            ) : null}
            <form action={savePayoutBankReferenceAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <input type="hidden" name="accountId" value={a.id} />
              <input name="holder" required minLength={2} maxLength={120} defaultValue={a.bankHolder ?? ""} placeholder={t("admin.account.payoutVerifyHolder")} aria-label={t("admin.account.payoutVerifyHolder")} style={input} />
              <input name="bankName" required minLength={2} maxLength={120} defaultValue={a.bankName ?? ""} placeholder={t("admin.account.payoutVerifyBank")} aria-label={t("admin.account.payoutVerifyBank")} style={input} />
              <input name="last4" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={a.bankLast4 ?? ""} placeholder={t("admin.account.payoutVerifyLast4")} aria-label={t("admin.account.payoutVerifyLast4")} style={{ ...input, width: 110 }} />
              <button type="submit" style={button}>{t("admin.account.payoutVerifySaveBank")}</button>
            </form>
            <form action={markPayoutAccountVerifiedAction} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <input type="hidden" name="accountId" value={a.id} />
              <button type="submit" disabled={!a.canMarkVerified} style={{ ...button, opacity: a.canMarkVerified ? 1 : 0.5, cursor: a.canMarkVerified ? "pointer" : "not-allowed" }}>
                {t("admin.account.payoutVerifyMark")}
              </button>
              {!a.canMarkVerified ? <span style={{ fontSize: 12, color: C.inkMuted }}>{t("admin.account.payoutVerifyNeedsBank")}</span> : null}
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
