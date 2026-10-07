import { clientAccountEnabledFor, type ClientAccountHostKind } from "./flag";

/**
 * What the client account surface may paint on a host kind. One function so the
 * dock mount, the header item and the API route cannot disagree. Flag unset
 * means nothing renders anywhere.
 */
export type ClientAccountMount = { dock: boolean; headerItem: boolean };

export function resolveClientAccountMount(hostKind: ClientAccountHostKind): ClientAccountMount {
  const on = clientAccountEnabledFor(hostKind);
  return { dock: on, headerItem: on };
}
