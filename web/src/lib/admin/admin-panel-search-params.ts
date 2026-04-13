/** Query keys for URL-driven admin drawers (see `web/docs/admin-ux-architecture.md`). */
export const ADMIN_PANEL_APANEL = "apanel" as const;
export const ADMIN_PANEL_AID = "aid" as const;

/** Shared `apanel` value for booking and inquiry list previews. */
export const ADMIN_APANEL_PEEK = "peek" as const;

/** User/account edit drawer on staff list when URL sync is enabled. */
export const ADMIN_APANEL_USER = "user" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAdminPanelAid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value.trim()));
}

export type AdminPanelState = {
  apanel: string | null;
  aid: string | null;
};

export function parseAdminPanelParams(
  sp: Record<string, string | string[] | undefined>,
): AdminPanelState {
  const rawApanel = sp[ADMIN_PANEL_APANEL];
  const rawAid = sp[ADMIN_PANEL_AID];
  const apanel =
    typeof rawApanel === "string" ? rawApanel.trim() || null : Array.isArray(rawApanel)
      ? rawApanel[0]?.trim() || null
      : null;
  const aidRaw =
    typeof rawAid === "string" ? rawAid.trim() : Array.isArray(rawAid) ? rawAid[0]?.trim() : "";
  const aid = isAdminPanelAid(aidRaw) ? aidRaw : null;
  return { apanel, aid };
}

/** Clone params and set or remove panel keys. Preserves all other keys. */
export function mergeAdminPanelIntoSearchParams(
  source: URLSearchParams,
  next: { apanel: string | null; aid: string | null },
): URLSearchParams {
  const out = new URLSearchParams(source.toString());
  if (next.apanel && next.aid) {
    out.set(ADMIN_PANEL_APANEL, next.apanel);
    out.set(ADMIN_PANEL_AID, next.aid);
  } else {
    out.delete(ADMIN_PANEL_APANEL);
    out.delete(ADMIN_PANEL_AID);
  }
  return out;
}

export function stripAdminPanelParams(source: URLSearchParams): URLSearchParams {
  return mergeAdminPanelIntoSearchParams(source, { apanel: null, aid: null });
}

/** Build pathname + query for router.replace(..., { scroll: false }). */
export function buildPathWithAdminPanel(
  pathname: string,
  source: URLSearchParams,
  next: { apanel: string | null; aid: string | null },
): string {
  const qs = mergeAdminPanelIntoSearchParams(source, next).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
