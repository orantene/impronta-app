/**
 * entry-permissions.ts — who may do what on the owner's service hub, and what a
 * change to one entry may contain (TUL-1369). Pure.
 *
 * Team roles (approved): Editors edit entries, Managers coordinate and send
 * offers, Admins change terms and money settings. Roles ADD UP (one person can
 * hold several); admin implies everything. Money (hub price) and terms (who is
 * shown, who talks to the client) are admin-only fields.
 */

export type HubRole = "editor" | "manager" | "admin";
export type HubAction = "entry_edit" | "group_edit" | "queue_decide" | "send_offer" | "terms_edit" | "money_edit";

const BY_ROLE: Record<Exclude<HubRole, "admin">, readonly HubAction[]> = {
  editor: ["entry_edit", "group_edit", "queue_decide"],
  manager: ["send_offer"],
};

export function can(roles: readonly HubRole[], action: HubAction): boolean {
  if (roles.includes("admin")) return true;
  return roles.some((r) => r !== "admin" && BY_ROLE[r]?.includes(action));
}

export const ENTRY_SETTING_FIELDS = [
  "name",
  "categoryId",
  "photoMediaId",
  "bookingType",
  "featured",
  "hidden",
  "hubPriceCents",
  "showWho",
  "clientContact",
] as const;
export type EntryField = (typeof ENTRY_SETTING_FIELDS)[number];

/** field → the action needed to change it */
const FIELD_ACTION: Record<EntryField, HubAction> = {
  name: "entry_edit",
  categoryId: "entry_edit",
  photoMediaId: "entry_edit",
  bookingType: "entry_edit",
  featured: "entry_edit",
  hidden: "entry_edit",
  hubPriceCents: "money_edit",
  showWho: "terms_edit",
  clientContact: "terms_edit",
};

export function fieldsAllowed(roles: readonly HubRole[]): EntryField[] {
  return ENTRY_SETTING_FIELDS.filter((f) => can(roles, FIELD_ACTION[f]));
}

export type EntryPatch = Partial<{
  name: string;
  categoryId: string | null;
  photoMediaId: string | null;
  bookingType: "request" | "instant";
  featured: boolean;
  hidden: boolean;
  hubPriceCents: number | null;
  showWho: "name" | "portfolio" | "hidden";
  clientContact: "workspace" | "talent";
}>;

export type PatchResult =
  | { ok: true; patch: EntryPatch }
  | { ok: false; reason: "not_allowed" | "invalid" | "unknown_field" | "empty"; fields: string[] };

export function validateEntryPatch(input: Record<string, unknown>, roles: readonly HubRole[]): PatchResult {
  const keys = Object.keys(input);
  if (keys.length === 0) return { ok: false, reason: "empty", fields: [] };
  const unknown = keys.filter((k) => !(ENTRY_SETTING_FIELDS as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, reason: "unknown_field", fields: unknown };
  const allowed = new Set<string>(fieldsAllowed(roles));
  const denied = keys.filter((k) => !allowed.has(k));
  if (denied.length > 0) return { ok: false, reason: "not_allowed", fields: denied };

  const patch: EntryPatch = {};
  const bad: string[] = [];
  const uuidish = (v: unknown) => v === null || (typeof v === "string" && v.length > 0 && v.length <= 64);
  for (const k of keys as EntryField[]) {
    const v = input[k];
    switch (k) {
      case "name": {
        const t = typeof v === "string" ? v.trim() : "";
        if (t.length === 0 || t.length > 120) bad.push(k);
        else patch.name = t;
        break;
      }
      case "categoryId":
      case "photoMediaId":
        if (uuidish(v)) patch[k] = v as string | null;
        else bad.push(k);
        break;
      case "bookingType":
        if (v === "request" || v === "instant") patch.bookingType = v;
        else bad.push(k);
        break;
      case "featured":
      case "hidden":
        if (typeof v === "boolean") patch[k] = v;
        else bad.push(k);
        break;
      case "hubPriceCents":
        if (v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000_000_000)) patch.hubPriceCents = v as number | null;
        else bad.push(k);
        break;
      case "showWho":
        if (v === "name" || v === "portfolio" || v === "hidden") patch.showWho = v;
        else bad.push(k);
        break;
      case "clientContact":
        if (v === "workspace" || v === "talent") patch.clientContact = v;
        else bad.push(k);
        break;
    }
  }
  if (patch.featured === true && patch.hidden === true) return { ok: false, reason: "invalid", fields: ["featured", "hidden"] };
  if (bad.length > 0) return { ok: false, reason: "invalid", fields: bad };
  return { ok: true, patch };
}
