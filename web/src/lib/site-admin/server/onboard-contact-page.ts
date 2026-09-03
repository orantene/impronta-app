/**
 * onboard-contact-page.ts — the seeded `/contact` page, D7.
 *
 * THE DECISION THIS IMPLEMENTS
 * ────────────────────────────
 * #1395 removed the seeded contact page on the owner's call: a published
 * placeholder from minute one is a worse first impression than a shorter nav,
 * and it undercuts the AI-draft moment. That was right about placeholders and
 * it left a different hole, because every seeded CTA was then repointed at
 * `/directory`, which 404s on a business workspace.
 *
 * D7 resolves it a third way: seed a contact page ONLY when
 * `agency_business_identity` has real details to render, and otherwise seed
 * nothing and let the header verb point at Ask. A page built from the
 * operator's own email, phone and address is not a placeholder, and when there
 * is nothing to build one from, the chat is a working front door that needs no
 * page at all.
 *
 * The gate is `shouldSeedContactPage`, which asks for a real CHANNEL and treats
 * a row of empty strings as absent. See that module for why "row exists" would
 * rebuild the placeholder with extra steps.
 *
 * Unlike `/book`, the slug is NOT fenced: `contact` is deliberately unreserved
 * (see `reserved-routes.ts`), so the middleware clean-URL rewrite serves this
 * page at `/contact` directly.
 *
 * Idempotent and non-fatal, like every other seeder here: a workspace that
 * fills in its phone number later gets the page on that write, and a failure
 * never blocks signup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";

import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import {
  shouldSeedContactPage,
  type ContactDetailFields,
} from "./contact-details-presence";

export const CONTACT_SLUG = "contact";
export const CONTACT_SYSTEM_KEY = "contact";

const BODY_FONT = '"Inter", var(--font-inter-body), system-ui, sans-serif';

function text(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Build the page from the operator's OWN details. Every line here exists
 * because the tenant supplied it; nothing is invented, and a field they left
 * empty produces no row rather than an empty one.
 */
export function buildContactPageTree(identity: ContactDetailFields): BuilderNodeTree {
  const lines: Array<{ id: string; label: string; labelEs: string; value: string }> = [];

  const email = text(identity.contact_email);
  if (email) lines.push({ id: "contact-email", label: "Email", labelEs: "Correo", value: email });

  const phone = text(identity.contact_phone);
  if (phone) lines.push({ id: "contact-phone", label: "Phone", labelEs: "Teléfono", value: phone });

  const whatsapp = text(identity.whatsapp);
  if (whatsapp)
    lines.push({ id: "contact-whatsapp", label: "WhatsApp", labelEs: "WhatsApp", value: whatsapp });

  const place = [text(identity.address_city), text(identity.address_country)]
    .filter(Boolean)
    .join(", ");
  if (place) lines.push({ id: "contact-place", label: "Where", labelEs: "Dónde", value: place });

  const area = text(identity.service_area);
  if (area)
    lines.push({ id: "contact-area", label: "Service area", labelEs: "Zona de servicio", value: area });

  return [
    {
      id: "contact-page",
      kind: "container",
      props: {
        layerLabel: "Contact",
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
          id: "contact-heading",
          kind: "heading",
          props: {
            text: "Get in touch",
            level: 1,
            layerLabel: "Heading",
            style: { align: "center", fontSize: "36px", fontWeight: 600 },
          },
          i18n: { es: { text: "Contáctanos" } },
        },
        ...lines.map((line) => ({
          id: line.id,
          kind: "paragraph" as const,
          props: {
            text: `${line.label}: ${line.value}`,
            layerLabel: line.label,
            style: { align: "center", fontSize: "16px" },
          },
          i18n: { es: { text: `${line.labelEs}: ${line.value}` } },
        })),
        {
          // Always present, and the reason this page can never be a dead end:
          // the chat needs no route and no seeded page, so even a contact page
          // built from one email still offers a live way to start a
          // conversation. `?inquiry=open` is path-relative and prefix-safe.
          id: "contact-cta",
          kind: "button",
          props: {
            label: "Send a message",
            href: "?inquiry=open",
            tone: "primary",
            layerLabel: "Send a message",
          },
          i18n: { es: { label: "Enviar un mensaje" } },
        },
      ],
    },
  ];
}

export type EnsureContactResult =
  | { ok: true; pageId: string; action: "created" | "already_existed" }
  | { ok: true; skipped: true; reason: "no_details" }
  | { ok: false; error: string };

/**
 * Ensure the contact page exists IF this workspace has details to render.
 *
 * Fails toward NOT seeding: a failed identity read, a null row, or a row of
 * blanks all skip. Seeding wrongly publishes an empty page to the public
 * internet; not seeding costs a visitor nothing, because the chat is there.
 */
export async function ensureContactPageIfDetailsExist(args: {
  admin: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
}): Promise<EnsureContactResult> {
  const { admin, tenantId, actorProfileId } = args;
  const locale = DEFAULT_PLATFORM_LOCALE;

  try {
    const { data: identity } = await admin
      .from("agency_business_identity")
      .select(
        "contact_email, contact_phone, whatsapp, address_city, address_country, service_area",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle<ContactDetailFields>();

    if (!shouldSeedContactPage(identity)) {
      return { ok: true, skipped: true, reason: "no_details" };
    }

    const { data: existing } = await admin
      .from("cms_pages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("locale", locale)
      .eq("system_template_key", CONTACT_SYSTEM_KEY)
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
        slug: CONTACT_SLUG,
        template_key: "standard_page",
        template_schema_version: 1,
        system_template_key: CONTACT_SYSTEM_KEY,
        is_system_owned: true,
        title: "Contact",
        is_freeform: true,
        blocks: buildContactPageTree(identity as ContactDetailFields),
        status: "published",
        published_at: nowIso,
        version: 1,
        created_by: actorProfileId,
        updated_by: actorProfileId,
      })
      .select("id")
      .single<{ id: string }>();

    if (pageErr || !page) {
      return { ok: false, error: pageErr?.message ?? "Could not seed the contact page." };
    }

    try {
      revalidateTag(tagFor(tenantId, "pages-all"), "default");
      revalidateTag(tagFor(tenantId, "storefront"), "default");
    } catch {
      /* test contexts */
    }

    return { ok: true, pageId: page.id, action: "created" };
  } catch (error) {
    logServerError("onboard.ensureContactPageIfDetailsExist", error);
    return { ok: false, error: "CONTACT_PAGE_SEED_FAILED" };
  }
}
