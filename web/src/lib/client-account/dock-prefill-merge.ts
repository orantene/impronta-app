/**
 * TUL-965: the dock's first-message form is prefilled from the resumed draft row, else from the
 * signed-in viewer. A resumed DRAFT row holds the seeded placeholder contact ("Guest" and
 * pending-...@guest.impronta), which counted as a prefill and hid the signed-in client's own
 * name and email, so the form asked a signed-in client for contact fields again. Each field now
 * takes the row's value only when it is real, otherwise the viewer's.
 */
export type DockPrefill = {
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  phone: string | null;
};

export type DockViewerPrefill = { name: string | null; email: string };

const isRealName = (v: string | null | undefined): v is string => {
  const t = (v ?? "").trim();
  return t.length > 0 && t !== "Guest";
};
const isRealEmail = (v: string | null | undefined): v is string => {
  const t = (v ?? "").trim();
  return t.length > 0 && !/^pending-.*@guest\.impronta$/i.test(t);
};

export function mergeDockPrefill(active: DockPrefill | null | undefined, viewer: DockViewerPrefill | null): DockPrefill | null {
  if (!viewer) return active ?? null;
  const rowName = isRealName(active?.name) ? active.name : null;
  const useRowName = Boolean(rowName) || isRealName(active?.firstName);
  return {
    name: useRowName ? rowName : viewer.name,
    firstName: useRowName && isRealName(active?.firstName) ? active.firstName : undefined,
    lastName: useRowName ? active?.lastName ?? undefined : undefined,
    email: isRealEmail(active?.email) ? active.email : viewer.email,
    phone: active?.phone ?? null,
  };
}
