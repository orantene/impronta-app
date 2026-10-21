/**
 * The Catalog's two decided controls (DIS-5 type lifecycle, follow-up to
 * TUL-1329). Pure, no I/O, no client libraries.
 *
 * STATUS: Draft / Published / Stopped / Archived.
 *   "Stopped" = not for sale, bookings already made are honoured. It is stored
 *   as a DRAFT carrying `attributes.stopped`, so the one sellable rule
 *   (`lib/offerings/sellable.ts`) already refuses it in every context: Stopped
 *   cannot make anything sellable, by construction. The flag only matters while
 *   the status is `draft`; any other status ignores (and clears) it.
 *
 * WEBSITE PRESENCE: Own page / In lists only / Not on the site.
 *   "Not on the site" is the existing Website switch off (`visibility`
 *   agency_only, via `websiteSwitchPatch`, which keeps a price-on-request item
 *   on request: D-10a). "In lists only" is `attributes.presence = "lists_only"`:
 *   the item shows in lists and cards but has no page of its own (no page, no
 *   link, no sitemap entry, because `isServicePageEligible` reads the flag).
 *   Neither choice ever changes `visibility` or `priceDisplay` except through
 *   the website switch, so a price-on-request item never starts showing a price.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { websiteSwitchPatch } from "./catalog-website-switch";

export type StatusChoice = "draft" | "published" | "stopped" | "archived";
export type PresenceChoice = "own_page" | "lists_only" | "hidden";

type Attrs = Record<string, unknown>;

/** The visibility the Website switch writes when it is off. A label for the control, not a sell decision (that stays in sellable.ts). */
const OFF_SITE: TalentOffering["visibility"] = "agency_only";
type StatusItem = Pick<TalentOffering, "status" | "attributes">;
type PresenceItem = Pick<TalentOffering, "visibility" | "priceDisplay" | "attributes">;

function withoutKey(attributes: Attrs | undefined, key: string): Attrs {
  const { [key]: _dropped, ...rest } = attributes ?? {};
  void _dropped;
  return rest;
}

export function statusChoiceOf(item: StatusItem): StatusChoice {
  if (item.status === "published") return "published";
  if (item.status === "archived") return "archived";
  return item.attributes?.stopped === true ? "stopped" : "draft";
}

export function statusPatch(item: StatusItem, choice: StatusChoice): Partial<TalentOffering> {
  switch (choice) {
    case "published":
      return { status: "published", attributes: withoutKey(item.attributes, "stopped") };
    case "archived":
      return { status: "archived", attributes: withoutKey(item.attributes, "stopped") };
    case "stopped":
      return { status: "draft", attributes: { ...(item.attributes ?? {}), stopped: true } };
    case "draft":
    default:
      return { status: "draft", attributes: withoutKey(item.attributes, "stopped") };
  }
}

export function presenceChoiceOf(item: Pick<TalentOffering, "visibility" | "attributes">): PresenceChoice {
  if (item.visibility === OFF_SITE) return "hidden";
  return item.attributes?.presence === "lists_only" ? "lists_only" : "own_page";
}

export function presencePatch(item: PresenceItem, choice: PresenceChoice): Partial<TalentOffering> {
  if (choice === "hidden") return websiteSwitchPatch(item, false);
  const back = item.visibility === OFF_SITE ? websiteSwitchPatch(item, true) : {};
  const base = withoutKey(item.attributes, "presence");
  return { ...back, attributes: choice === "lists_only" ? { ...base, presence: "lists_only" } : base };
}
