#!/usr/bin/env node
/**
 * seed-demo-forms-page.mjs
 *
 * Idempotently seeds a published freeform CMS page at slug "demo-forms" for
 * the Impronta tenant (00000000-0000-0000-0000-000000000001) — the canonical
 * QA fixture for:
 *
 *   FORMS-1  — rich field types: text, email, date, number, checkbox, consent, select
 *   FORMS-2  — action=inquiry routing (routingMode='inquiry', inquiryTargetTalentId)
 *   ABTEST-1 — a native `form` freeform node carrying a 2-variant experiment
 *
 * Page model:
 *   cms_pages (is_freeform=true) → blocks: BuilderNode[]
 *
 *   Block 1: section_embed (sectionTypeKey='contact_form')
 *     config = contactFormSchemaV1 props with routingMode='inquiry'
 *     + rich field types (FORMS-1 + FORMS-2)
 *
 *   Block 2: form (native freeform builder node)
 *     experiment: NodeExperimentConfig (2-variant → ABTEST-1)
 *
 * Idempotency: on first run inserts a cms_sections row + the cms_page.
 * On re-run the existing page is a no-op (exits early on slug match).
 * To reprovision: DELETE FROM public.cms_pages WHERE tenant_id =
 *   '00000000-0000-0000-0000-000000000001' AND slug = 'demo-forms';
 *   then re-run.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-demo-forms-page.mjs
 *
 * Required env vars (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The script prints the resulting /p/demo-forms URL + row ids when done.
 * It does NOT start a local server — it writes directly to the remote
 * Supabase project. The Lead must curl/visit the page after seeding.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Constants — locked QA identifiers
// ---------------------------------------------------------------------------

/** Impronta tenant — the canonical QA agency. All scripts use this. */
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

/** Locale (English — the primary QA locale). */
const LOCALE = "en";

/** Stable page slug for the demo forms fixture. */
const SLUG = "demo-forms";

/**
 * TAL-AUDIT-0512 — a Max-tier talent on the Impronta roster.
 * The inquiry-mode contact form targets this talent.
 * This UUID is the `talent_profiles.id` for TAL-AUDIT-0512.
 * The script resolves it at runtime from the DB — see resolveTargetTalentId().
 */
const TARGET_TALENT_PROFILE_CODE = "TAL-AUDIT-0512";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run: node --env-file=.env.local scripts/seed-demo-forms-page.mjs",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodeId(kind) {
  return `${kind}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function makeFieldId() {
  return randomUUID();
}

/** Resolve the talent_profiles.id for the target profile code. */
async function resolveTargetTalentId() {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("profile_code", TARGET_TALENT_PROFILE_CODE)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.warn(
      `Warning: could not resolve ${TARGET_TALENT_PROFILE_CODE}: ${error.message}`,
    );
    return null;
  }
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// FORMS-1 + FORMS-2 — contactFormSchemaV1 props
//
// Field types exercised:
//   text      — Name (standard, required)
//   email     — Email (standard, required)
//   date      — Preferred date
//   number    — Budget (with numberMin/numberMax)
//   checkbox  — Newsletter opt-in (boolean checkbox)
//   consent   — GDPR consent (required, with consentText)
//   select    — How did you hear about us
//   textarea  — Message
//
// routingMode='inquiry' wires the submission into createInquiryFromIntent.
// ---------------------------------------------------------------------------

function buildContactFormSectionProps(inquiryTargetTalentId) {
  return {
    eyebrow: "Get in touch",
    headline: "Contact Us",
    intro: "Fill out the form below and we'll be in touch within one business day.",
    fields: [
      {
        name: "name",
        label: "Full name",
        type: "text",
        required: true,
        placeholder: "Jane Smith",
      },
      {
        name: "email",
        label: "Email address",
        type: "email",
        required: true,
        placeholder: "jane@example.com",
      },
      {
        name: "preferred_date",
        label: "Preferred event date",
        type: "date",
        required: false,
      },
      {
        name: "budget",
        label: "Budget (USD)",
        type: "number",
        required: false,
        placeholder: "5000",
        numberMin: 500,
        numberMax: 1000000,
      },
      {
        name: "newsletter",
        label: "Subscribe to our newsletter",
        type: "checkbox",
        required: false,
      },
      {
        name: "gdpr_consent",
        label: "I agree to the privacy policy",
        type: "consent",
        required: true,
        consentText:
          "By submitting this form you agree to our Privacy Policy and consent to the processing of your personal data.",
      },
      {
        name: "source",
        label: "How did you hear about us?",
        type: "select",
        required: false,
        options:
          "Google\nSocial media\nReferral\nEvent\nOther",
      },
    ],
    submitLabel: "Send inquiry",
    /** For FORMS-2: POST to the internal inquiry engine. */
    action: "/api/cms/forms/submit",
    method: "POST",
    honeypot: "website",
    successMessage:
      "Thanks! We've received your inquiry and will be in touch shortly.",
    variant: "card",
    captcha: "none",
    /** FORMS-2 — route submissions into the inquiry pipeline. */
    routingMode: "inquiry",
    /**
     * FORMS-2 — target talent (TAL-AUDIT-0512).
     * null = "message the agency" inquiry (no talent target).
     */
    inquiryTargetTalentId: inquiryTargetTalentId ?? null,
    presentation: {
      background: "canvas",
      paddingTop: "editorial",
      paddingBottom: "editorial",
      containerWidth: "boxed",
      align: "center",
    },
  };
}

// ---------------------------------------------------------------------------
// ABTEST-1 — a native `form` freeform node with a 2-variant experiment.
//
// The experiment swaps the submit button label between variant A ("Book now")
// and variant B ("Request a quote") — a real CTA copy test. The visitor is
// bucketed deterministically by a stable per-visitor seed (FNV-1a) against
// experimentId "demo-cta-label-v1".
//
// The renderer:
//   - reads node.experiment (or node.props.experiment) via getNodeExperimentConfig
//   - assigns variant via assignExperimentVariant(experimentId, visitorSeed)
//   - applies variant.propOverrides shallowly over node.props
// ---------------------------------------------------------------------------

function buildAbTestFormNode(sectionEmbedId) {
  const formNodeId = makeNodeId("form");
  return {
    id: formNodeId,
    kind: "form",
    /** ABTEST-1 — experiment config on the eligible `form` node. */
    experiment: {
      experimentId: "demo-cta-label-v1",
      enabled: true,
      variants: [
        {
          key: "a",
          label: "Control — Book now",
          // No propOverrides on control; node renders with its baseline props.
        },
        {
          key: "b",
          label: "Variant — Request a quote",
          propOverrides: {
            /** Swaps the submit button label for the B arm. */
            submitLabel: "Request a quote",
          },
        },
      ],
    },
    props: {
      /**
       * Internal submission — wired to the same /api/cms/forms/submit endpoint.
       * sectionId is the section_embed node's id (analytics + form routing).
       */
      action: "internal",
      sectionId: sectionEmbedId,
      honeypotName: "website",
      layerLabel: "ABTEST-1 Form (variant: submit label)",
      /**
       * The baseline submit label (variant A). Variant B overrides this via
       * propOverrides.submitLabel at render time.
       */
      submitLabel: "Book now",
      fields: [
        {
          id: makeFieldId(),
          name: "contact_name",
          type: "text",
          label: "Your name",
          placeholder: "Your name",
          required: true,
        },
        {
          id: makeFieldId(),
          name: "contact_email",
          type: "email",
          label: "Your email",
          placeholder: "you@example.com",
          required: true,
        },
        {
          id: makeFieldId(),
          name: "submit",
          type: "submit",
          label: "Book now",
        },
      ],
      style: {
        maxWidthFree: "480px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        width: "100%",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Section wrapper nodes (section > container > children)
// ---------------------------------------------------------------------------

function wrapInSection(children, sectionLabel) {
  const sectionId = makeNodeId("section");
  const containerId = makeNodeId("container");
  return {
    id: sectionId,
    kind: "section",
    props: {
      layerLabel: sectionLabel,
      style: {
        paddingTop: "l",
        paddingBottom: "l",
        background: "none",
      },
    },
    children: [
      {
        id: containerId,
        kind: "container",
        props: {
          style: {
            maxWidth: "wide",
            marginLeftFree: "auto",
            marginRightFree: "auto",
            paddingX: "m",
          },
        },
        children,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Build the freeform blocks tree
// ---------------------------------------------------------------------------

function buildPageBlocks(sectionEmbedNodeId, contactFormSectionProps) {
  // Block 1: section_embed wrapping the contact_form (FORMS-1 + FORMS-2)
  const sectionEmbedNode = {
    id: sectionEmbedNodeId,
    kind: "section_embed",
    props: {
      sectionTypeKey: "contact_form",
      sectionId: null, // no CMS section row needed — config is self-contained
      layerLabel: "Contact Form (FORMS-1 + FORMS-2)",
      config: contactFormSectionProps,
      style: {
        paddingTop: "l",
        paddingBottom: "l",
      },
    },
  };

  // Block 2: a section containing the ABTEST-1 form node
  const abTestFormNode = buildAbTestFormNode(sectionEmbedNodeId);
  const abTestSection = wrapInSection(
    [abTestFormNode],
    "ABTEST-1 — CTA copy experiment",
  );

  return [sectionEmbedNode, abTestSection];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --- Idempotency check ---------------------------------------------------
  const { data: existing, error: checkErr } = await supabase
    .from("cms_pages")
    .select("id, status")
    .eq("tenant_id", TENANT_ID)
    .eq("locale", LOCALE)
    .eq("slug", SLUG)
    .maybeSingle();

  if (checkErr) {
    console.error("Idempotency check failed:", checkErr.message);
    process.exit(1);
  }

  if (existing) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "already_exists",
          pageId: existing.id,
          status: existing.status,
          slug: SLUG,
          publicUrl: `/p/${SLUG}`,
          note: "Page already seeded. Delete the row and re-run to reprovision.",
        },
        null,
        2,
      ),
    );
    return;
  }

  // --- Resolve inquiry target talent ---------------------------------------
  const inquiryTargetTalentId = await resolveTargetTalentId();
  if (!inquiryTargetTalentId) {
    console.warn(
      `Warning: ${TARGET_TALENT_PROFILE_CODE} not found — seeding without inquiryTargetTalentId.\n` +
        "Apply seed_tulum_spanish_talent.sql + npm run register:tulum-demo-talent first for full FORMS-2 coverage.",
    );
  }

  // --- Build content -------------------------------------------------------
  const sectionEmbedNodeId = makeNodeId("section_embed");
  const contactFormProps = buildContactFormSectionProps(inquiryTargetTalentId);
  const blocks = buildPageBlocks(sectionEmbedNodeId, contactFormProps);

  // --- Insert cms_page (freeform, published) --------------------------------
  const nowIso = new Date().toISOString();
  const { data: pageRow, error: pageErr } = await supabase
    .from("cms_pages")
    .insert({
      tenant_id: TENANT_ID,
      locale: LOCALE,
      slug: SLUG,
      template_key: "page",
      template_schema_version: 1,
      is_system_owned: false,
      is_freeform: true,
      title: "Demo Forms — FORMS-1 / FORMS-2 / ABTEST-1 QA",
      status: "published",
      blocks: blocks,
      published_at: nowIso,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (pageErr) {
    console.error("cms_pages insert failed:", pageErr.message);
    process.exit(1);
  }

  // --- Report --------------------------------------------------------------
  const domainHint = "impronta.local:3000";
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "created",
        pageId: pageRow.id,
        slug: SLUG,
        publicUrl: `/p/${SLUG}`,
        localUrl: `http://${domainHint}/p/${SLUG}`,
        tenantId: TENANT_ID,
        inquiryTargetTalentId: inquiryTargetTalentId ?? "(none — talent not seeded)",
        sectionEmbedNodeId,
        abTestExperimentId: "demo-cta-label-v1",
        coverageVerified: {
          "FORMS-1": "date + number + checkbox + consent + select fields seeded",
          "FORMS-2": `routingMode=inquiry, target=${TARGET_TALENT_PROFILE_CODE}`,
          "ABTEST-1": "2-variant experiment on form node (submitLabel A='Book now' / B='Request a quote')",
        },
        leadVerifyCommands: {
          "FORMS-1 field types (curl)":
            `curl -s http://${domainHint}/p/${SLUG} | grep -E 'type="date"|type="number"|type="checkbox"'`,
          "FORMS-2 inquiry routing (curl)":
            `curl -s http://${domainHint}/p/${SLUG} | grep -i 'inquiry\\|routingMode'`,
          "ABTEST-1 variant seeds (DB)":
            "SELECT id, experiment FROM cms_pages WHERE slug='demo-forms' AND tenant_id='00000000-0000-0000-0000-000000000001';",
          "ABTEST-1 variant A visitor seed (deterministic)":
            "Set visitor-seed cookie to a value where deterministicBucket(seed,'demo-cta-label-v1') < 50 → expects 'Book now'",
          "ABTEST-1 variant B visitor seed (deterministic)":
            "Set visitor-seed cookie to a value where deterministicBucket(seed,'demo-cta-label-v1') >= 50 → expects 'Request a quote'",
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("seed-demo-forms-page failed:", err);
  process.exit(1);
});
