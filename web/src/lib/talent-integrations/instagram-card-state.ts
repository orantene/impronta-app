/**
 * What the talent Settings Instagram card shows, derived from the talent's
 * `talent_integrations` row plus two server facts. Pure so every branch is
 * unit-testable without a database or a vendor.
 *
 * Only an OAuth row counts as connected: a manual profile link saved from the
 * Connections drawer has no token, so it can never fill a feed.
 */

export type TalentInstagramCardState =
  | { kind: "upsell"; connectedHandle: string | null }
  | { kind: "unavailable" }
  | { kind: "connect" }
  | { kind: "connected"; handle: string | null; lastSyncAt: string | null }
  | { kind: "reconnect"; handle: string | null; reason: "expired" | "error" };

export type TalentInstagramRowFacts = {
  status: string;
  connection_method: string;
  provider_account_label: string | null;
  settings_json: Record<string, unknown> | null;
  last_sync_at: string | null;
  last_verified_at: string | null;
};

function isLiveOAuthRow(row: TalentInstagramRowFacts | null): row is TalentInstagramRowFacts {
  if (!row || row.connection_method !== "oauth") return false;
  return row.status === "connected" || row.status === "needs_reauth" || row.status === "error";
}

export function deriveTalentInstagramCardState(input: {
  row: TalentInstagramRowFacts | null;
  /** The talent's plan includes the paid site blocks. */
  paid: boolean;
  /** Instagram OAuth credentials exist on this deployment. */
  configured: boolean;
}): TalentInstagramCardState {
  const live = isLiveOAuthRow(input.row) ? input.row : null;
  const handle = live?.provider_account_label ?? null;

  if (!input.paid) return { kind: "upsell", connectedHandle: handle };

  if (live) {
    const needsReconnect =
      live.status === "needs_reauth" || live.settings_json?.needs_reconnect === true;
    if (needsReconnect) return { kind: "reconnect", handle, reason: "expired" };
    if (live.status === "error") return { kind: "reconnect", handle, reason: "error" };
    return {
      kind: "connected",
      handle,
      lastSyncAt: live.last_sync_at ?? live.last_verified_at,
    };
  }

  if (!input.configured) return { kind: "unavailable" };
  return { kind: "connect" };
}

/**
 * Marks a return URL as coming back from THIS card's flow, so a
 * `connection_error` left by another provider's connect on the same page is
 * never shown as an Instagram failure.
 */
export const TALENT_INSTAGRAM_RETURN_MARKER = "connect";

/** Where the Connect button sends the talent. Same route the YouTube connect uses. */
export function talentInstagramConnectHref(returnPath: string): string {
  const [path, query = ""] = returnPath.split("?");
  const returnParams = new URLSearchParams(query);
  for (const key of ["connection_success", "connection_account", "connection_error", "connection_message"]) {
    returnParams.delete(key);
  }
  returnParams.set(TALENT_INSTAGRAM_RETURN_MARKER, "instagram");
  const params = new URLSearchParams({
    owner: "talent",
    provider: "instagram",
    returnTo: `${path}?${returnParams.toString()}`,
  });
  return `/api/connections/oauth/start?${params.toString()}`;
}

export type TalentInstagramReturnNotice =
  | { tone: "ok"; key: "connected"; handle: string | null }
  | { tone: "error"; key: "cancelled" | "not_business" | "not_authorized" | "unavailable" | "generic" };

/**
 * Map the callback's query params (`connection_success` / `connection_error`)
 * to a notice the card renders in the talent's language. Returns null when the
 * URL carries no Instagram result.
 */
export function readTalentInstagramReturnNotice(
  search: URLSearchParams,
): TalentInstagramReturnNotice | null {
  if (search.get("connection_success") === "instagram") {
    return { tone: "ok", key: "connected", handle: search.get("connection_account") };
  }
  const error = search.get("connection_error");
  if (!error || search.get(TALENT_INSTAGRAM_RETURN_MARKER) !== "instagram") return null;
  if (error === "access_denied" || error === "user_denied") {
    return { tone: "error", key: "cancelled" };
  }
  if (error === "connect_failed") {
    return { tone: "error", key: "not_business" };
  }
  if (error === "not_authorized" || error === "invalid_state" || error === "provider_mismatch") {
    return { tone: "error", key: "not_authorized" };
  }
  if (error === "oauth_setup" || error === "unsupported_provider") {
    return { tone: "error", key: "unavailable" };
  }
  return { tone: "error", key: "generic" };
}
