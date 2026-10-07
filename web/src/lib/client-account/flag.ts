/**
 * Client account rollout flag.
 *
 * `CLIENT_ACCOUNT_HOSTS` is a comma list of host kinds that get the client
 * account surface (e.g. `talent,agency`). Unset, empty or unrecognised means
 * OFF for every host kind.
 *
 * Deliberately no NODE_ENV branch and no dev default: a dev-only default once
 * left a flag silently hidden in production. The only way ON is to list the
 * host kind in the environment, in every environment.
 */
export type ClientAccountHostKind = "talent" | "agency" | "hub" | "app" | "marketing";

const KINDS: ReadonlySet<string> = new Set<ClientAccountHostKind>([
  "talent",
  "agency",
  "hub",
  "app",
  "marketing",
]);

function enabledKinds(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const kind = part.trim().toLowerCase();
    if (KINDS.has(kind)) out.add(kind);
  }
  return out;
}

export function clientAccountEnabledFor(hostKind: ClientAccountHostKind): boolean {
  return enabledKinds(process.env.CLIENT_ACCOUNT_HOSTS).has(hostKind);
}
