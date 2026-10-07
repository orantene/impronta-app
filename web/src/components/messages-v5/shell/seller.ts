/**
 * Seller mode: the Messages v5 shell as a solo talent sees it (mockup
 * "Messages · direct client", "Messages · Actions menu", "Quote builder").
 *
 * A talent has no teammates, so owner, assign, resolve, rename, hand over,
 * history and close-lost are staff chrome whose talent engine writers all
 * refuse. Seller mode hides that chrome instead of showing buttons that would
 * always fail. The strings come in already translated from the talent page,
 * so the shell stays locale-agnostic and the shared catalogues do not grow.
 */

import type { ReactNode } from "react";

/** Translated strings the talent page hands the shell (EN or ES). */
export type SellerChrome = {
  /** Quote builder subtitle: what the client sees. */
  readonly quoteSubtitle: string;
  readonly summaryTitle: string;
  readonly summaryTotal: string;
  readonly summaryDeposit: string;
  readonly summaryBalance: string;
  /** Inbox title: "Messages" / "Mensajes" (mockup msg_d), not the staff "Inbox". */
  readonly inboxTitle?: string;
  readonly newConversation?: string;
  /** Her four inbox filters (mockup msg_d). When set they replace the staff segments and chips. */
  readonly filters?: { readonly all: string; readonly needs: string; readonly quotes: string; readonly agency: string };
  /** Under the title: "{total} conversations · {needs} need a reply". */
  readonly waitingOnYou?: string;
  /** First run (zero conversations): how clients reach her, plus a share action. */
  readonly firstRunTitle?: string;
  readonly firstRunBody?: string;
  readonly firstRunAction?: ReactNode;
  /** Every conversation she has, across segments; null while unknown. First run needs 0 (F54). */
  readonly totalConversations?: number | null;
};

/** Thread menu entries a talent can actually run (the rest refuse on her engine). */
const SELLER_MENU_IDS: ReadonlySet<string> = new Set(["copy_link"]);

export function sellerMenuItems<T extends { readonly id: string }>(items: readonly T[], seller: boolean): T[] {
  return seller ? items.filter((it) => SELLER_MENU_IDS.has(it.id)) : [...items];
}

export type QuoteSummary = {
  readonly totalCents: number;
  readonly depositCents: number | null;
  /** What is left after the deposit; null when there is no deposit. */
  readonly balanceCents: number | null;
};

/** Total, deposit to hold the time, and the balance paid at the appointment. */
export function quoteSummary(totalCents: number, depositCents: number | null | undefined): QuoteSummary {
  const total = Math.max(0, Math.round(totalCents));
  if (depositCents == null || depositCents <= 0) return { totalCents: total, depositCents: null, balanceCents: null };
  const deposit = Math.min(total, Math.round(depositCents));
  return { totalCents: total, depositCents: deposit, balanceCents: total - deposit };
}
