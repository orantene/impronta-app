/** Signed-in quick links of the client account entry (TUL-694). Targets are the real /account tabs. */
export type AccountQuickLink = { key: "visits" | "messages" | "payments" | "settings"; href: string; label: string };

export function accountQuickLinks(t: (key: string) => string, accountHref = "/account"): AccountQuickLink[] {
  return [
    { key: "visits", href: accountHref, label: t("public.clientAccount.quickBookings") },
    { key: "messages", href: `${accountHref}?tab=messages`, label: t("public.clientAccount.quickMessages") },
    { key: "payments", href: `${accountHref}?tab=payments`, label: t("public.clientAccount.quickReceipts") },
    { key: "settings", href: `${accountHref}?tab=settings`, label: t("public.clientAccount.myAccount") },
  ];
}
