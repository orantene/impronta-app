import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveLinkedEventForPageSlug, type LinkedEvent } from "./event-page-link";
import { loadPublicEventProgram, type PublicEventProgram } from "./schedule/public-loader";

/**
 * event-program-page.ts — what a builder page needs from the Event Program
 * engine at render time (proposal §7, §11):
 *   - `linkedEventId` for the `event_program` island, when the page carries
 *     one and no node authored its own event;
 *   - the public program itself for `Event.subEvent[]` JSON-LD.
 *
 * COST DISCIPLINE. A page with no `event_program` node pays nothing here: no
 * link read, no program read. The event route already knows its event and
 * passes it in; only the editor's `?edit=1` view of a linked page (the one
 * case the catch-all renders a linked page without redirecting) resolves the
 * link from the slug.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when any `event_program` node is in the tree; `unbound` when one of them has no usable `eventId`. */
export function findEventProgramNodes(nodes: ReadonlyArray<BuilderNode>): { present: boolean; unbound: boolean } {
  let present = false;
  let unbound = false;
  const visit = (node: BuilderNode) => {
    if (node.kind === "event_program") {
      present = true;
      if (!UUID.test((node.props.eventId ?? "").trim())) unbound = true;
    }
    if ("children" in node && Array.isArray(node.children)) for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return { present, unbound };
}

export type EventProgramPageData = {
  /** For `dataSources.linkedEventId`; undefined when nothing on the page needs it. */
  linkedEventId: string | undefined;
  /** The program for JSON-LD, only when the page is an event's page and shows the block. */
  program: PublicEventProgram | null;
  event: LinkedEvent | null;
};

const NONE: EventProgramPageData = { linkedEventId: undefined, program: null, event: null };

export async function resolveEventProgramPageData(input: {
  supabase: SupabaseClient;
  tenantId: string;
  slugPath: string;
  blocks: ReadonlyArray<BuilderNode>;
  locale: string;
  /** The event the route already resolved (the event route renders its linked page). */
  linkedEvent: LinkedEvent | null;
}): Promise<EventProgramPageData> {
  const { present } = findEventProgramNodes(input.blocks);
  if (!present) return NONE;
  const event = input.linkedEvent ?? (await resolveLinkedEventForPageSlug(input.supabase, input.tenantId, input.slugPath));
  if (!event) return NONE;

  let program: PublicEventProgram | null = null;
  try {
    const admin = createServiceRoleClient();
    if (admin) {
      program = await loadPublicEventProgram(admin, {
        tenantId: input.tenantId,
        eventId: event.id,
        locale: input.locale.toLowerCase().startsWith("es") ? "es" : "en",
      });
    }
  } catch (err) {
    logServerError("events.program.page", err);
    program = null;
  }
  return { linkedEventId: event.id, program, event };
}
