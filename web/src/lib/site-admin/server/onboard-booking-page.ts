/**
 * Seeded /book system page. Fenced slug `__book__`; public URL is the
 * `/book` route adapter (slug `book` is platform-reserved).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { logServerError } from "@/lib/server/safe-error";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { revalidateTag } from "next/cache";

export const RESERVED_BOOKING_SLUG = "__book__";
export const BOOKING_SYSTEM_KEY = "booking";

const BODY_FONT = '"Inter", var(--font-inter-body), system-ui, sans-serif';

export function bookingPageCapabilityEnabled(_args?: {
  appointmentsEnabled?: boolean | null;
}): boolean {
  // Page may exist before the master switch is flipped. Runtime policy
  // (resolveAppointmentPolicy) decides whether slots appear.
  return true;
}

export function buildBookingPageTree(): BuilderNodeTree {
  return [
    {
      id: "book-page",
      kind: "container",
      props: {
        layerLabel: "Book",
        layout: "stack",
        align: "center",
        style: {
          width: "100%",
          maxWidthFree: "720px",
          paddingTop: "72px",
          paddingRight: "24px",
          paddingBottom: "72px",
          paddingLeft: "24px",
          gap: "16px",
          fontFamily: BODY_FONT,
        },
      },
      children: [
        {
          id: "book-heading",
          kind: "heading",
          props: {
            text: "Reserve a time",
            level: 1,
            layerLabel: "Heading",
            style: { align: "center", fontSize: "36px", fontWeight: 600 },
          },
          i18n: { es: { text: "Reserva un horario" } },
        },
        {
          id: "book-body",
          kind: "paragraph",
          props: {
            text: "Pick a service below and choose a time. We will confirm shortly.",
            layerLabel: "Body",
            style: { align: "center", fontSize: "16px", opacity: 0.72 },
          },
          i18n: {
            es: { text: "Elige un servicio y un horario. Confirmamos enseguida." },
          },
        },
        {
          id: "book-cta",
          kind: "button",
          props: {
            label: "Book now",
            href: "/book",
            tone: "primary",
            layerLabel: "Book now",
          },
          i18n: { es: { label: "Reservar" } },
        },
      ],
    },
  ];
}

export type EnsureBookingResult =
  | { ok: true; pageId: string; action: "created" | "already_existed" }
  | { ok: false; error: string };

export async function ensureBookingPage(args: {
  admin: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
}): Promise<EnsureBookingResult> {
  const { admin, tenantId, actorProfileId } = args;
  const locale = DEFAULT_PLATFORM_LOCALE;

  try {
    const { data: existing } = await admin
      .from("cms_pages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("locale", locale)
      .eq("system_template_key", BOOKING_SYSTEM_KEY)
      .maybeSingle<{ id: string }>();

    if (existing?.id) {
      return { ok: true, pageId: existing.id, action: "already_existed" };
    }

    const nowIso = new Date().toISOString();
    const { data: page, error: pageErr } = await admin
      .from("cms_pages")
      .insert({
        tenant_id: tenantId,
        locale,
        slug: RESERVED_BOOKING_SLUG,
        template_key: "standard_page",
        template_schema_version: 1,
        system_template_key: BOOKING_SYSTEM_KEY,
        is_system_owned: true,
        title: "Book",
        is_freeform: true,
        blocks: buildBookingPageTree(),
        status: "published",
        published_at: nowIso,
        version: 1,
        created_by: actorProfileId,
        updated_by: actorProfileId,
      })
      .select("id")
      .single<{ id: string }>();

    if (pageErr || !page) {
      return { ok: false, error: pageErr?.message ?? "Could not seed the book page." };
    }

    try {
      revalidateTag(tagFor(tenantId, "pages-all"), "default");
      revalidateTag(tagFor(tenantId, "storefront"), "default");
    } catch {
      /* test contexts */
    }

    return { ok: true, pageId: page.id, action: "created" };
  } catch (error) {
    logServerError("onboard.ensureBookingPage", error);
    return { ok: false, error: "BOOKING_PAGE_SEED_FAILED" };
  }
}
