/**
 * Phase 8 — public form-submission endpoint.
 *
 * The CMS contact_form section can either POST to the operator's own
 * URL (Formspree, mailto, etc.) or to this endpoint by setting
 * `action=internal:<sectionId>` in the schema. When this endpoint
 * receives a submission:
 *
 *   1. Validates the section exists + is contact_form + tenant-active
 *   2. Drops honeypot trips (still logs them)
 *   3. Lightweight rate-limit per IP (60 submissions/hr in-memory)
 *   4. Inserts into cms_form_submissions via service role
 *   5. Redirects to the section's `successUrl` if set, else returns JSON
 *
 * No CSRF token — these are intentionally public POSTs from cross-
 * domain visitors. Honeypot + rate-limit + section-id validation are
 * the layered defenses.
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";

export const runtime = "nodejs";

// Rate limit (per-instance, in-memory). 60 submissions per hour per IP.
// Survives only one warm runtime; absolute cap is the form's honeypot
// + the operator manually marking spam in admin.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number[]>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) return false;
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

export async function POST(req: Request) {
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server is missing service-role credentials." },
      { status: 500 },
    );
  }

  // Accept FormData OR application/json (FormData covers native HTML
  // form submissions; JSON covers any frontend that wants to hit this
  // programmatically).
  const contentType = req.headers.get("content-type") ?? "";
  let payload: Record<string, unknown> = {};
  let sectionId = "";
  let honeypotField = "website";

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    sectionId = String(body.__tulala_section ?? "");
    honeypotField = String(body.__tulala_honeypot ?? "website");
    payload = { ...body };
    delete payload.__tulala_section;
    delete payload.__tulala_honeypot;
  } else {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (k === "__tulala_section") sectionId = String(v);
      else if (k === "__tulala_honeypot") honeypotField = String(v);
      else payload[k] = typeof v === "string" ? v : v.name;
    }
  }

  if (!sectionId) {
    return NextResponse.json(
      { ok: false, error: "Missing section reference." },
      { status: 400 },
    );
  }

  // Basic IP extraction (Vercel sets x-forwarded-for; fall back to "unknown").
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRate(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions, slow down." },
      { status: 429 },
    );
  }

  // Section + tenant lookup. We don't require section.section_type_key
  // to be exactly contact_form — leave that flexibility for future
  // form-type sections — but we DO require the section row to exist
  // and be active.
  const { data: section } = await admin
    .from("cms_sections")
    .select("id, tenant_id, name, section_type_key, archived_at")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section || section.archived_at) {
    return NextResponse.json(
      { ok: false, error: "Form is no longer accepting submissions." },
      { status: 404 },
    );
  }

  // Honeypot trip — store the row marked as spam so it shows up in
  // admin counts, but don't notify or process further.
  const honeypotValue = payload[honeypotField];
  const tripped =
    typeof honeypotValue === "string" && honeypotValue.trim().length > 0;
  if (tripped) {
    delete payload[honeypotField];
  }

  // Phase 8 — captcha validation. Caller can include `h-captcha-response`
  // (hCaptcha) or `cf-turnstile-response` (Cloudflare Turnstile). We resolve
  // the SINGLE provider that is active for this tenant and verify against it,
  // failing CLOSED on a missing/empty token or a vault error. A captcha that
  // resolves to provider 'none' (no tenant config AND no platform secret) is
  // simply not enforced — honeypot + rate-limit remain the floor.
  const hcaptchaToken = typeof payload["h-captcha-response"] === "string" ? (payload["h-captcha-response"] as string) : "";
  const turnstileToken = typeof payload["cf-turnstile-response"] === "string" ? (payload["cf-turnstile-response"] as string) : "";
  delete payload["h-captcha-response"];
  delete payload["cf-turnstile-response"];

  // Resolve the RESOLVED provider + secret for this tenant. Tenant-owned
  // (their chosen provider + their secret) takes precedence; otherwise the
  // platform provider from env. When the tenant owns the captcha we ONLY honor
  // their chosen provider — the other provider's secret is nulled so an
  // attacker can't pass by solving the platform's other widget.
  const tenantCaptcha = await resolveTenantCaptcha(section.tenant_id);

  const captchaRejection = NextResponse.json(
    { ok: false, error: "Captcha failed — please try again." },
    { status: 400 },
  );

  if (tenantCaptcha.provider === "none") {
    // No tenant config AND no platform secret → captcha not enforced.
  } else {
    // Resolve the secret for the chosen provider.
    let secret: string | null = null;
    if (tenantCaptcha.tenantOwned) {
      // FAIL CLOSED on a vault decrypt error / missing secret — do NOT fall
      // through to the platform env secret (that would defeat tenant isolation
      // and let an attacker pass by solving a different secret's challenge).
      secret = await tenantCaptcha.getSecret();
    } else {
      secret =
        tenantCaptcha.provider === "hcaptcha"
          ? process.env.HCAPTCHA_SECRET?.trim() || null
          : process.env.TURNSTILE_SECRET?.trim() || null;
    }

    if (!secret) {
      // An active provider with no resolvable secret = misconfiguration; fail
      // closed rather than silently letting bots through.
      return captchaRejection;
    }

    // The token that matches the resolved provider. A missing/empty token for
    // an ACTIVE provider is a HARD REJECT — never skip verification.
    const token =
      tenantCaptcha.provider === "hcaptcha" ? hcaptchaToken : turnstileToken;
    if (!token) {
      return captchaRejection;
    }

    let captchaOk = false;
    try {
      if (tenantCaptcha.provider === "hcaptcha") {
        const r = await fetch("https://api.hcaptcha.com/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token }),
        });
        const j = (await r.json()) as { success?: boolean };
        captchaOk = j.success === true;
      } else {
        const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token, remoteip: ip === "unknown" ? "" : ip }),
        });
        const j = (await r.json()) as { success?: boolean };
        captchaOk = j.success === true;
      }
    } catch {
      captchaOk = false;
    }

    if (!captchaOk) {
      return captchaRejection;
    }
  }

  // Project email + name when present (cheap admin-list field).
  const contactEmail =
    typeof payload.email === "string"
      ? payload.email.slice(0, 320)
      : null;
  const contactName =
    typeof payload.name === "string"
      ? payload.name.slice(0, 200)
      : null;

  let submissionId: string | null = null;
  try {
    const { data: insertedRow, error } = await admin
      .from("cms_form_submissions")
      .insert({
        tenant_id: section.tenant_id,
        section_id: section.id,
        payload_jsonb: payload,
        contact_email: contactEmail,
        contact_name: contactName,
        source_url: req.headers.get("referer") ?? null,
        user_agent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
        ip_address: ip === "unknown" ? null : ip,
        honeypot_tripped: tripped,
        status: tripped ? "spam" : "new",
      })
      .select("id")
      .single();
    if (error) {
      logServerError("cms-forms/submit", error);
      return NextResponse.json(
        { ok: false, error: "Couldn't record submission." },
        { status: 500 },
      );
    }
    submissionId = (insertedRow as { id: string } | null)?.id ?? null;
  } catch (err) {
    logServerError("cms-forms/submit", err);
    return NextResponse.json(
      { ok: false, error: "Couldn't record submission." },
      { status: 500 },
    );
  }

  // Email-on-submit: fire-and-forget to workspace admins.
  // Only for genuine submissions (honeypot_tripped = false).
  // We need the tenant slug for the inbox URL — fetch it from agencies.
  if (!tripped && submissionId) {
    try {
      const { data: agencyRow } = await admin
        .from("agencies")
        .select("slug")
        .eq("id", section.tenant_id)
        .maybeSingle();
      const tenantSlug = (agencyRow as { slug: string } | null)?.slug ?? "admin";

      // Project the payload as label→value pairs (cap at 8, exclude reserved keys).
      const RESERVED_KEYS = new Set(["email", "name", "phone"]);
      const payloadFields: Array<{ label: string; value: string }> = Object.entries(payload)
        .filter(([k]) => !RESERVED_KEYS.has(k))
        .slice(0, 8)
        .map(([k, v]) => ({ label: k, value: String(v).slice(0, 500) }));

      const submittedAt = new Date().toISOString();
      void dispatchEventNotifications({
        type: "cms_form.submitted",
        tenantId: section.tenant_id,
        eventId: submissionId, // stable idempotency anchor = the row id
        payload: {
          formName: (section as { name: string }).name,
          sectionId: section.id,
          submissionId,
          contactName: contactName ?? null,
          contactEmail: contactEmail ?? null,
          submittedAt,
          tenantSlug,
          payloadFields,
        },
      });
    } catch (err) {
      // Notification dispatch is best-effort; never block the response.
      logServerError("cms-forms/notify", err);
    }
  }

  // Native HTML form submissions expect a redirect; programmatic
  // callers expect JSON. Honor `Accept` to pick.
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ ok: true });
  }
  // Redirect back to the page that submitted — query string carries a
  // success flag the section's renderer can pick up to show a thanks
  // message client-side.
  const referer = req.headers.get("referer");
  if (referer) {
    const url = new URL(referer);
    url.searchParams.set("__tulala_form", "ok");
    return NextResponse.redirect(url.toString(), 303);
  }
  return NextResponse.json({ ok: true });
}
