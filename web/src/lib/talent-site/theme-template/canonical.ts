import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import { ensureDesignKeys, freezeDesignKeys } from "@/lib/talent-site/theme-releases/design-keys";

/** Canonical form of a design payload as the editor stores it. */
export function canonicalDesignPayload(payload: DesignPayload): DesignPayload {
  return payload;
}

/** Pin every node's design key when a draft is opened (S2). */
export function freezeDesignKeysHook(payload: DesignPayload): DesignPayload {
  return freezeDesignKeys(payload);
}

/** On save: keep keys of nodes that existed, mint keys for new/duplicated ones. */
export function rekeyOnSave(prev: DesignPayload, next: DesignPayload): DesignPayload {
  return ensureDesignKeys(prev, next);
}
