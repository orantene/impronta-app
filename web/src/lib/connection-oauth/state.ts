import "server-only";

import { randomBytes } from "node:crypto";

import { signToken, verifyToken } from "@/lib/crypto/signed-token";
import { getConnectionOAuthStateSecret } from "./providers";

export type ConnectionOAuthOwner = "talent" | "client";

export type ConnectionOAuthState = {
  v: 1;
  owner: ConnectionOAuthOwner;
  provider: "youtube";
  actorUserId: string;
  subjectId: string;
  tenantSlug: string | null;
  returnTo: string;
  nonce: string;
  exp: number;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function normalizeReturnTo(value: string | null | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw.slice(0, 500);
}

export async function createConnectionOAuthState(input: {
  owner: ConnectionOAuthOwner;
  provider: "youtube";
  actorUserId: string;
  subjectId: string;
  tenantSlug?: string | null;
  returnTo?: string | null;
  fallbackReturnTo: string;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const stateSecret = getConnectionOAuthStateSecret();
  if (!stateSecret.ok) return stateSecret;

  const payload: ConnectionOAuthState = {
    v: 1,
    owner: input.owner,
    provider: input.provider,
    actorUserId: input.actorUserId,
    subjectId: input.subjectId,
    tenantSlug: input.tenantSlug ?? null,
    returnTo: normalizeReturnTo(input.returnTo, input.fallbackReturnTo),
    nonce: randomBytes(16).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  };

  return {
    ok: true,
    token: await signToken(stateSecret.secret, JSON.stringify(payload)),
  };
}

export async function verifyConnectionOAuthState(
  raw: string | null | undefined,
): Promise<
  | { ok: true; state: ConnectionOAuthState }
  | { ok: false; error: string; returnTo: string }
> {
  const stateSecret = getConnectionOAuthStateSecret();
  if (!stateSecret.ok) {
    return { ok: false, error: stateSecret.error, returnTo: "/" };
  }

  const verified = await verifyToken(raw ?? undefined, stateSecret.secret);
  if (!verified.ok) {
    return { ok: false, error: "Invalid connection state.", returnTo: "/" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(verified.payload);
  } catch {
    return { ok: false, error: "Invalid connection state.", returnTo: "/" };
  }

  const state = parsed as Partial<ConnectionOAuthState>;
  const returnTo = normalizeReturnTo(state.returnTo, "/");
  if (
    state.v !== 1 ||
    state.provider !== "youtube" ||
    (state.owner !== "talent" && state.owner !== "client") ||
    typeof state.actorUserId !== "string" ||
    typeof state.subjectId !== "string" ||
    typeof state.returnTo !== "string" ||
    typeof state.exp !== "number"
  ) {
    return { ok: false, error: "Invalid connection state.", returnTo };
  }
  if (state.exp < Date.now()) {
    return { ok: false, error: "Connection session expired. Please try again.", returnTo };
  }

  return { ok: true, state: state as ConnectionOAuthState };
}
