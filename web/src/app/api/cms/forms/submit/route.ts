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
import { improntaLog } from "@/lib/server/structured-log";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import { contactFormSchemaV1 } from "@/lib/site-admin/sections/contact_form/schema";
import { decideFormRouting } from "@/lib/site-admin/sections/contact_form/inquiry-routing";
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import { assertAllTalentOnTenantRoster } from "@/lib/saas/talent-roster";
import {
  exceedsRequestBudget,
  type ContactAttachmentAccepted,
} from "@/lib/site-admin/sections/contact_form/attachments";
import {
  respondAttachmentError,
  screenContactAttachments,
  storeContactAttachments,
} from "@/lib/site-admin/sections/contact_form/attachments-store";

/**
 * FORMS-1 — hard cap for file-size metadata enforcement.
 * No raw binary upload (Supabase free tier); we only record file name/size.
 *
 * FORMS-3 SUPERSEDES THIS for the internal lane: files now land in the private
 * `form-attachments` bucket, written by THIS route with the service role after
 * every anti-abuse gate. The effective per-file cap is
 * `effectiveAttachmentMaxBytes` (3 MB), which is well below this 10 MB number
 * — the platform's 4.5 MB request-body ceiling is the real constraint. The
 * constant is kept because the legacy client-declared-size guard below still
 * uses it as an upper bound; it is no longer the operative limit.
 */
const FILE_MAX_SIZE_MB_HARD_CAP = 10;

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

  // FORMS-3 — refuse an oversized body BEFORE buffering it. `content-length`
  // is attacker-controlled so this is not a security boundary (the platform's
  // own body cap is); it exists so an honest visitor with a 20 MB PDF gets our
  // localized "too large" message instead of an opaque platform error.
  if (exceedsRequestBudget(req.headers.get("content-length"))) {
    return respondAttachmentError(req, "too_large", 413);
  }

  // Accept FormData OR application/json (FormData covers native HTML
  // form submissions; JSON covers any frontend that wants to hit this
  // programmatically).
  const contentType = req.headers.get("content-type") ?? "";
  let payload: Record<string, unknown> = {};
  let sectionId = "";
  let honeypotField = "website";
  /**
   * FORMS-3 — the actual File parts, kept OUT of `payload` (which is stored
   * verbatim as payload_jsonb). `payload` still carries the filename string so
   * every existing reader — the admin list, the CSV export, the notification
   * email — keeps working unchanged.
   */
  const uploadedFiles = new Map<string, File>();

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
      else if (typeof v === "string") payload[k] = v;
      else {
        // A File part. An untouched <input type=file> still submits an empty
        // part (name "", size 0) — that is "no file", not an attachment.
        if (v.size > 0) uploadedFiles.set(k, v);
        payload[k] = v.name;
      }
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
    return respondFormError(req, "rate_limited", "Too many submissions, slow down.", 429);
  }

  // Section + tenant lookup. We don't require section.section_type_key
  // to be exactly contact_form — leave that flexibility for future
  // form-type sections — but we DO require the section row to exist
  // and be active.
  const { data: section } = await admin
    .from("cms_sections")
    .select("id, tenant_id, name, section_type_key, status, props_jsonb")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section || section.status === "archived") {
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

  // ── FORMS-1 — server-side field-type validation ──────────────────────────
  // Parse the section's saved props to discover field schema (type, required,
  // bounds). This lets us enforce consent + number coercion + file metadata
  // SERVER-SIDE — client-only required attributes are bypassable by bots.
  // Falls back gracefully (no 500) when props are absent or not a contact_form.
  // The parsed props are also reused by FORMS-2 inquiry routing below.
  const parsedProps =
    section.section_type_key === "contact_form"
      ? contactFormSchemaV1.safeParse(section.props_jsonb ?? {})
      : null;
  if (!tripped && parsedProps?.success) {
    {
      for (const field of parsedProps.data.fields) {
        const rawValue = payload[field.name];

        // consent — always required (server-enforced regardless of `required` flag).
        if (field.type === "consent") {
          const val = typeof rawValue === "string" ? rawValue.toLowerCase() : "";
          if (val !== "on" && val !== "true" && val !== "1" && val !== "yes") {
            return NextResponse.json(
              { ok: false, error: "Consent is required." },
              { status: 400 },
            );
          }
          // Normalise to a boolean-like string in the stored payload.
          payload[field.name] = "true";
          continue;
        }

        // checkbox — if required, must be checked.
        if (field.type === "checkbox" && field.required) {
          const val = typeof rawValue === "string" ? rawValue.toLowerCase() : "";
          if (val !== "on" && val !== "true" && val !== "1" && val !== "yes") {
            return NextResponse.json(
              { ok: false, error: `Field "${field.label}" is required.` },
              { status: 400 },
            );
          }
          payload[field.name] = "true";
          continue;
        }

        // number — coerce string to number and apply min/max bounds.
        if (field.type === "number") {
          const raw = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
          const coerced = Number(raw);
          if (!raw || Number.isNaN(coerced)) {
            if (field.required) {
              return NextResponse.json(
                { ok: false, error: `Field "${field.label}" must be a number.` },
                { status: 400 },
              );
            }
            // Optional number with no value — leave absent.
            delete payload[field.name];
            continue;
          }
          if (typeof field.numberMin === "number" && coerced < field.numberMin) {
            return NextResponse.json(
              {
                ok: false,
                error: `Field "${field.label}" must be at least ${field.numberMin}.`,
              },
              { status: 400 },
            );
          }
          if (typeof field.numberMax === "number" && coerced > field.numberMax) {
            return NextResponse.json(
              {
                ok: false,
                error: `Field "${field.label}" must be at most ${field.numberMax}.`,
              },
              { status: 400 },
            );
          }
          payload[field.name] = coerced;
          continue;
        }

        // file — FormData sends a File object; we captured `v.name` for string
        // fields already (see FormData parse above). For file inputs the payload
        // already holds the filename string (from the `else payload[k] = ... v.name`
        // branch). Enforce the hard-cap metadata check.
        if (field.type === "file") {
          const maxMb = Math.min(
            typeof field.fileMaxSizeMb === "number" ? field.fileMaxSizeMb : 5,
            FILE_MAX_SIZE_MB_HARD_CAP,
          );
          // The client sends size as a separate hidden field
          // `__tulala_file_size_<name>` (injected by the inline script in
          // Component.tsx) — only present if the client cooperates, so this is
          // a best-effort server guard on top of the client size guard.
          const sizeKey = `__tulala_file_size_${field.name}`;
          const sizeRaw = payload[sizeKey];
          delete payload[sizeKey]; // never store internal keys in payload_jsonb
          if (typeof sizeRaw === "string") {
            const sizeBytes = Number(sizeRaw);
            if (!Number.isNaN(sizeBytes) && sizeBytes > maxMb * 1024 * 1024) {
              return NextResponse.json(
                {
                  ok: false,
                  error: `File for "${field.label}" exceeds the ${maxMb} MB limit.`,
                },
                { status: 400 },
              );
            }
          }
          // FORMS-3 — a required file field must actually carry bytes. The
          // `required` attribute on the input is client-side only, and until
          // now nothing checked it here, so a bot (or a browser that skipped
          // the control) satisfied a "required" attachment with nothing at all.
          if (field.required && !uploadedFiles.has(field.name)) {
            return respondAttachmentError(req, "required", 400);
          }
          // The bytes themselves are validated and stored further down, after
          // the captcha gate — see the FORMS-3 block. `payload` keeps the
          // filename string exactly as before.
          continue;
        }
      }
    }
    // If the schema parse fails (malformed props), we degrade gracefully —
    // continue with the existing spam-protection-only path; don't 500.
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

  const captchaRejection = respondFormError(
    req,
    "captcha",
    "Captcha failed — please try again.",
    400,
  );

  // DEV-ONLY captcha bypass for localhost QA. A tenant-owned captcha secret is
  // encrypted with the production AI_CREDENTIALS_ENCRYPTION_KEY, which local
  // checkouts don't have — decryption fails and the fail-closed check below
  // rejects EVERY local submission, making the inquiry-routing path untestable
  // on localhost. Opt-in via CAPTCHA_DEV_BYPASS=1 AND NODE_ENV=development
  // (production builds always have NODE_ENV=production, so this can never run
  // there). Mirrors the dev-only fallback precedent in resolveGoogleMapsKey.
  const devCaptchaBypass =
    process.env.NODE_ENV === "development" &&
    process.env.CAPTCHA_DEV_BYPASS === "1";
  if (devCaptchaBypass) {
    // eslint-disable-next-line no-console -- dev-only diagnostic, never runs in prod
    console.warn(
      "[cms-forms/submit] CAPTCHA_DEV_BYPASS=1 — captcha verification skipped (dev only).",
    );
  }

  if (tenantCaptcha.provider === "none" || devCaptchaBypass) {
    // No tenant config AND no platform secret → captcha not enforced.
    // (Or the dev-only bypass above — local QA of the routing path.)
  } else {
    // Resolve the secret for the chosen provider.
    // ONE door for the secret, both branches. `resolveTenantCaptcha` already
    // implements the documented order (tenant-custom → HQ default → env), and
    // `getSecret()` returns the secret that matches the provider it resolved.
    //
    // Reading env directly in the inherited branch was a real bug: an operator
    // who set the platform captcha in HQ (secret stored ENCRYPTED IN THE DB,
    // not in env) gave every inheriting tenant a null secret here, which the
    // fail-closed check below turns into "reject every submission". The HQ
    // panel promised "tenants without their own captcha inherit this" while
    // the runtime could not honour it.
    //
    // FAIL CLOSED is preserved: a vault decrypt error or missing secret
    // resolves to null and is rejected below. Tenant isolation is preserved
    // too — a tenant-owned config never falls through to the platform secret,
    // because the resolver returns that tenant's own getSecret().
    const secret = await tenantCaptcha.getSecret();

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
    // Provider error codes are kept and logged on failure. They are the ONLY
    // way to tell a MISCONFIGURED SECRET ('invalid-input-secret') apart from an
    // ordinary bad/expired token ('invalid-input-response') — the visitor sees
    // the same "Captcha failed" either way, so without this an operator whose
    // secret is wrong watches every real enquiry get rejected with nothing to
    // debug. Codes are fixed provider strings and contain NO secret material.
    let captchaErrorCodes: string[] = [];
    try {
      if (tenantCaptcha.provider === "hcaptcha") {
        const r = await fetch("https://api.hcaptcha.com/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token }),
        });
        const j = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
        captchaOk = j.success === true;
        captchaErrorCodes = j["error-codes"] ?? [];
      } else {
        const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret, response: token, remoteip: ip === "unknown" ? "" : ip }),
        });
        const j = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
        captchaOk = j.success === true;
        captchaErrorCodes = j["error-codes"] ?? [];
      }
    } catch {
      captchaOk = false;
      captchaErrorCodes = ["verification_request_failed"];
    }
    if (!captchaOk) {
      void improntaLog("cms_forms.captcha_failed", {
        message: "[cms-forms/submit] captcha verification failed",
        tenantId: section.tenant_id,
        provider: tenantCaptcha.provider,
        tenantOwned: tenantCaptcha.tenantOwned,
        // e.g. 'invalid-input-secret' → the configured secret is wrong.
        errorCodes: captchaErrorCodes.join(","),
      });
    }

    if (!captchaOk) {
      return captchaRejection;
    }
  }

  // ── FORMS-3 — attachment gate ────────────────────────────────────────────
  // Runs ONLY here: after section validation, honeypot, rate limit, field
  // validation and captcha. Nothing above this line has written a byte, and
  // nothing below writes one until `validateContactAttachments` has accepted
  // every file, so a rejected submission leaves no object and no row to
  // compensate for.
  //
  // A honeypot trip never stores files — bot submissions are recorded as spam
  // rows and their payloads are not worth the storage.
  let acceptedAttachments: readonly ContactAttachmentAccepted[] = [];
  if (uploadedFiles.size > 0) {
    if (tripped) {
      uploadedFiles.clear();
    } else {
      const screened = await screenContactAttachments({
        files: uploadedFiles,
        fields: parsedProps?.success ? parsedProps.data.fields : [],
        routingMode: parsedProps?.success
          ? parsedProps.data.routingMode
          : undefined,
      });
      if (!screened.ok) {
        return respondAttachmentError(req, screened.code, 400);
      }
      acceptedAttachments = screened.accepted;
    }
  }

  // ── FORMS-2 — form-to-inquiry routing ────────────────────────────────────
  // When the section is set to routingMode='inquiry', funnel the submission
  // into the SHARED inquiry engine (createInquiryFromIntent) — the same entry
  // point the talent profile + guest chat use — instead of recording a generic
  // inbox row. Runs ONLY after every spam/consent/captcha guard above has
  // passed (honeypot trips never reach here — `tripped` short-circuits to the
  // inbox spam-row path below). A submission that can't form a valid intent
  // FAILS SAFE to the inbox insert (no orphan inquiries). The tenant is taken
  // strictly from the trusted section.tenant_id — never from payload — so this
  // public endpoint can't be turned into a cross-tenant inquiry-injection
  // vector.
  if (!tripped && parsedProps?.success) {
    const decision = decideFormRouting(parsedProps.data, payload, {
      referrerUrl: req.headers.get("referer"),
    });
    if (decision.mode === "inquiry") {
      const inquiryResult = await routeFormSubmissionToInquiry({
        admin,
        tenantId: section.tenant_id,
        originDomain: req.headers.get("host"),
        decision,
      });
      if (inquiryResult.ok) {
        // A real inquiry was created — do NOT also write a cms_form_submissions
        // row (the plan requires inquiry mode to REPLACE the inbox insert).
        return respondSuccess(req);
      }
      // Engine rejected with an honest visitor-facing reason (validation /
      // rate-limit / forbidden). Surface it; do not silently fall through to
      // the inbox, which would mask the failure from the visitor.
      if (inquiryResult.reason === "rate_limited") {
        return NextResponse.json(
          { ok: false, error: "Too many submissions, slow down." },
          { status: 429 },
        );
      }
      if (
        inquiryResult.reason === "forbidden" ||
        inquiryResult.reason === "target_not_on_roster"
      ) {
        return NextResponse.json(
          { ok: false, error: "This form can't accept submissions right now." },
          { status: 400 },
        );
      }
      if (inquiryResult.reason === "validation_failed") {
        return NextResponse.json(
          { ok: false, error: "Please complete the required fields." },
          { status: 400 },
        );
      }
      // engine_error / unknown — record to the inbox as a durable fallback so
      // the visitor's message is never lost, then succeed.
      logServerError(
        "cms-forms/submit/inquiry-fallback",
        new Error(inquiryResult.reason),
      );
      // fall through to the inbox insert below.
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

  // ── FORMS-3 — write the accepted files ───────────────────────────────────
  // Everything is already validated, so this is the only step that can still
  // fail, and it fails LOUDLY: the visitor's message is durably recorded above
  // either way, but we never claim the attachment landed when it didn't.
  let attachmentStoreFailed = false;
  if (acceptedAttachments.length > 0 && submissionId) {
    attachmentStoreFailed = !(await storeContactAttachments({
      admin,
      tenantId: section.tenant_id,
      submissionId,
      accepted: acceptedAttachments,
      files: uploadedFiles,
    }));
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

  // The message is saved; only the file didn't make it. Say exactly that
  // rather than showing an unqualified "Thanks, we'll be in touch."
  if (attachmentStoreFailed) {
    return respondAttachmentError(req, "store_failed", 502);
  }

  return respondSuccess(req);
}

/**
 * Success response shared by the inbox path AND the FORMS-2 inquiry path.
 *
 * Native HTML form submissions expect a redirect back to the originating page
 * (with the `__tulala_form=ok` flag the section renderer reads to show its
 * thanks message); programmatic callers expect JSON. Honor `Accept` to pick.
 */
/**
 * Referer-aware error response for the two rejections a REAL VISITOR can hit:
 * a failed captcha and the rate limit.
 *
 * Both used to return bare JSON. For a programmatic caller that is right; for
 * a native HTML form post it meant the visitor's browser NAVIGATED to a page
 * showing `{"ok":false,"error":"Captcha failed - please try again."}` - their
 * typed brief gone, no way back but the browser button. A visitor who fumbles
 * a captcha checkbox is the most ordinary failure a form has, and it was the
 * worst-handled one.
 *
 * Mirrors respondAttachmentError: JSON stays for Accept: application/json and
 * for requests with no usable referer, so nothing programmatic changes shape.
 */
function respondFormError(
  req: Request,
  code: "captcha" | "rate_limited",
  message: string,
  status: number,
): NextResponse {
  const accept = req.headers.get("accept") ?? "";
  const referer = req.headers.get("referer");
  if (!accept.includes("application/json") && referer) {
    try {
      const url = new URL(referer);
      url.searchParams.delete("__tulala_form");
      url.searchParams.set("__tulala_form_err", code);
      return NextResponse.redirect(url.toString(), 303);
    } catch {
      // Unparseable referer - fall through to JSON.
    }
  }
  return NextResponse.json({ ok: false, error: message }, { status });
}

function respondSuccess(req: Request): NextResponse {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ ok: true });
  }
  const referer = req.headers.get("referer");
  if (referer) {
    const url = new URL(referer);
    url.searchParams.set("__tulala_form", "ok");
    return NextResponse.redirect(url.toString(), 303);
  }
  return NextResponse.json({ ok: true });
}

/**
 * FORMS-2 — provision the guest client, roster-validate the target talent, and
 * funnel the built intent through the SHARED inquiry engine. This is the ONLY
 * inquiry-creation path the form uses — it never INSERTs into public.inquiries
 * directly (engine spec forbids it).
 *
 * SECURITY: `tenantId` is the trusted section.tenant_id (caller-supplied from
 * the DB row, never the payload). The decision's `targetTalentId` is the only
 * client-influenced input and is roster-validated against this tenant BEFORE
 * the engine call, so a crafted form can't file an inquiry naming an off-roster
 * or cross-tenant talent.
 */
async function routeFormSubmissionToInquiry(args: {
  admin: ReturnType<typeof createServiceRoleClient>;
  tenantId: string;
  originDomain: string | null;
  decision: Extract<
    ReturnType<typeof decideFormRouting>,
    { mode: "inquiry" }
  >;
}): Promise<
  | { ok: true; inquiryId: string }
  | {
      ok: false;
      reason:
        | "validation_failed"
        | "rate_limited"
        | "forbidden"
        | "engine_error"
        | "target_not_on_roster";
    }
> {
  const { admin, tenantId, originDomain, decision } = args;
  if (!admin) return { ok: false, reason: "engine_error" };

  // Roster gate — a configured target MUST be on THIS tenant's visible roster.
  if (decision.targetTalentId) {
    const roster = await assertAllTalentOnTenantRoster(admin, tenantId, [
      decision.targetTalentId,
    ]);
    if (!roster.ok) {
      logServerError(
        "cms-forms/submit/inquiry-roster",
        new Error(`target not on roster: ${roster.missingIds.join(",")}`),
      );
      return { ok: false, reason: "target_not_on_roster" };
    }
  }

  // Provision (or match) a guest client by email so the inquiry has a real
  // client participant + the visitor can claim it later via magic link. An
  // "unlinked" result (email belongs to a privileged account) keeps
  // clientUserId null — the inquiry is still created. Email is required for
  // inquiry mode (decideFormRouting only emits inquiry mode with a contact).
  const provisioned = await ensureGuestClientByEmail({
    email: decision.contactEmail,
    name: decision.contactName,
    company: "",
    phone: decision.contactPhone ?? "",
  });

  const created = await createInquiryFromIntent(admin, decision.intent, {
    tenant_id: tenantId,
    actor_user_id: null,
    client_user_id: provisioned.clientUserId,
    origin_domain: originDomain,
  });

  if (!created.ok) return { ok: false, reason: created.reason };
  return { ok: true, inquiryId: created.inquiryId };
}
