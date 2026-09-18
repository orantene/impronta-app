/**
 * event-program-json-ld.ts — `Event.subEvent[]` for a page that IS an event's
 * page (proposal §11: "JSON-LD subEvent"). Pure: the same `PublicEventProgram`
 * the block renders in, a document out.
 *
 * Two shapes, decided by the operator's own JSON-LD on the page:
 *   - the page document is an `Event` → its `subEvent` is REPLACED by the
 *     program (one script, the operator's fields kept);
 *   - anything else (none, an Organization, an array) → a second, minimal
 *     `Event` carrying only what the engine knows: the event's name, its URL
 *     and the sub-events.
 * Nothing is emitted when the program is off or has no public item, so a
 * page never advertises an empty schedule.
 */

import type { PublicEventProgram } from "./schedule/public-loader";
import type { JsonLdDocument, JsonLdValue } from "@/lib/site-admin/cms-seo";

type JsonLdObject = Record<string, JsonLdValue>;

export type EventJsonLdFacts = {
  title: string;
  /** Absolute canonical URL of the event page, when known. */
  url?: string | null;
};

function isEventObject(doc: JsonLdDocument | null | undefined): doc is JsonLdObject {
  return !!doc && !Array.isArray(doc) && doc["@type"] === "Event";
}

export function programSubEvents(program: PublicEventProgram): JsonLdObject[] {
  if (!program.enabled) return [];
  return program.items.map((item) => {
    const out: JsonLdObject = { "@type": "Event", name: item.title };
    if (item.startsAt) out.startDate = item.startsAt;
    if (item.endsAt) out.endDate = item.endsAt;
    if (item.description) out.description = item.description;
    if (item.coverUrl) out.image = item.coverUrl;
    if (item.performer && !item.performer.tba && item.performer.name) {
      out.performer = { "@type": "Person", name: item.performer.name };
    }
    const space = item.spaceId ? program.spaces.find((s) => s.id === item.spaceId) : null;
    if (space) out.location = { "@type": "Place", name: space.name };
    return out;
  });
}

/**
 * The document(s) to emit. `merged` is the page's own document with the
 * program folded in (when it was an Event) or unchanged; `extra` is the
 * standalone Event when the page document could not carry the program.
 * Both null-safe: `{ merged: base, extra: null }` when there is nothing to add.
 */
export function withEventProgramJsonLd(
  base: JsonLdDocument | null,
  program: PublicEventProgram,
  facts: EventJsonLdFacts,
): { merged: JsonLdDocument | null; extra: JsonLdDocument | null } {
  const subEvent = programSubEvents(program);
  if (subEvent.length === 0) return { merged: base, extra: null };
  if (isEventObject(base)) return { merged: { ...base, subEvent }, extra: null };
  const extra: JsonLdObject = { "@context": "https://schema.org", "@type": "Event", name: facts.title, subEvent };
  if (facts.url) extra.url = facts.url;
  return { merged: base, extra };
}
