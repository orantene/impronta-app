"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getAppUrl } from "@/lib/auth-flow";
import { sendEmail } from "@/lib/email";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { findAuthUserIdByEmail } from "@/lib/saas/find-auth-user-by-email";
import {
  findOwnedFreeWorkspaceForUser,
  type WorkspaceTierInterest,
} from "@/lib/saas/owned-free-workspace";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import {
  buildWorkspaceOnboardingPath,
  isReservedWorkspaceSlug,
  isSelfServeWorkspaceLeadEligible,
  WORKSPACE_SLUG_REGEX,
} from "@/lib/saas/workspace-signup";
import { logServerError } from "@/lib/server/safe-error";
import { isRetiredWorkspaceStatus } from "@/lib/saas/workspace-lifecycle";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { stampOpenGuestTicketsWithLeadId } from "@/lib/support/load-guest-leads";
import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { writeSignupBrief } from "@/lib/tulala/brief-from-signup";
import type { BriefOwner } from "@/lib/tulala/brief-store.server";

/**
 * Server action for /get-started signup capture.
 *
 * Persists the lead in `saas_marketing_signups`, checks subdomain
 * availability against `agency_domains`, fires lead confirmation + founder
 * digest emails, and returns a `lead_id` so the analytics funnel is
 * joinable. Honeypot + IP rate limit harden the public endpoint.
 */

const SignupSchema = z.object({
  // "business" is the Website-tier front door: a local business (restaurant,
  // café, venue, studio) that wants its own site and books talent when it
  // needs to. It provisions `agencies.workspace_type = 'business'`; the other
  // three stay talent-shaped. See workspace-signup.server.ts.
  audience: z.enum(["operator", "agency", "organization", "business"]),
  businessName: z
    .string()
    .trim()
    .min(2, "Business name is too short.")
    .max(120, "Business name is too long."),
  businessDescription: z
    .string()
    .trim()
    .max(500, "Description is too long.")
    .optional()
    .or(z.literal("")),
  name: z.string().trim().min(2, "Name is too short.").max(120, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(32, "Subdomain is too long.")
    .optional()
    .or(z.literal("")),
  rosterSize: z.enum(["1-5", "6-20", "21-50", "50+"]),
  tierInterest: z.enum(["free", "website", "studio", "agency", "network"]).optional(),
  utm_source: z.string().max(120).optional(),
  utm_medium: z.string().max(120).optional(),
  utm_campaign: z.string().max(120).optional(),
  utm_term: z.string().max(120).optional(),
  utm_content: z.string().max(120).optional(),
  referrer: z.string().max(500).optional(),
  sourcePage: z.string().max(200).optional(),
  /** Validated on the page before it got here; re-validated at checkout. */
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(32)
    .regex(/^[A-Z0-9_-]*$/, "Invalid promo code.")
    .optional(),
});

export type GetStartedFieldErrors = Partial<
  Record<
    "businessName" | "name" | "email" | "subdomain" | "audience" | "rosterSize" | "form",
    string
  >
>;

export type GetStartedActionResult =
  | {
      ok: true;
      kind: "created" | "needs_signin";
      leadId: string;
      name: string;
      email: string;
      subdomain: string | null;
      workspaceSignupUrl: string | null;
      signInUrl?: string;
    }
  | { ok: false; errors: GetStartedFieldErrors };

/**
 * Why the verdict has three states instead of two:
 *
 * - `taken`: a real conflict with an existing tenant (agencies.slug or
 *                agency_domains.hostname). Permanent until the tenant is
 *                deleted. UI shows "already taken" with suggestions.
 * - `pending`: a still-active subdomain reservation held by another lead
 *                that hasn't finished provisioning yet (15-min TTL).
 *                Resolves itself if that lead abandons signup. UI explains
 *                this is a temporary hold so the user understands they can
 *                retry shortly.
 * - `available`: the slug is free to claim.
 *
 * The `excludeLeadId` parameter lets callers ignore reservations held by
 * the lead currently being processed (so re-submitting the form with the
 * same slug is idempotent rather than self-blocking).
 */
async function isRequestedLinkTaken(
  supabase: SupabaseClient,
  slug: string,
  excludeLeadId?: string,
): Promise<{ taken: boolean; pending: boolean; error: boolean }> {
  const hostCandidate = `${slug}.${PLATFORM_BRAND.domain}`;
  const nowIso = new Date().toISOString();
  const reservationQuery = supabase
    .from("saas_subdomain_reservations")
    .select("lead_id, expires_at")
    .eq("slug", slug)
    .gt("expires_at", nowIso)
    .maybeSingle();

  const [
    { data: existingDomain, error: domainError },
    { data: existingSlug, error: slugError },
    { data: existingReservation, error: reservationError },
  ] = await Promise.all([
    supabase.from("agency_domains").select("id").eq("hostname", hostCandidate).maybeSingle(),
    supabase.from("agencies").select("id, status").eq("slug", slug).maybeSingle(),
    reservationQuery,
  ]);

  if (domainError || slugError || reservationError) {
    if (domainError) logServerError("get-started/domain-check", domainError);
    if (slugError) logServerError("get-started/slug-check", slugError);
    if (reservationError) logServerError("get-started/reservation-check", reservationError);
    return { taken: false, pending: false, error: true };
  }

  // A RETIRED workspace does not hold its name. Platform admin's delete is a
  // soft delete (`agencies.status = 'cancelled'`), and this check had no status
  // filter, so deleting a workspace burned its slug permanently for everyone,
  // its own owner included. The provisioner keeps this promise honest: it
  // reclaims the name off the retired row (see `reclaimRetiredWorkspaceSlug`)
  // rather than silently handing the visitor `<slug>-2`.
  const slugHeldByLiveWorkspace =
    Boolean(existingSlug) &&
    !isRetiredWorkspaceStatus((existingSlug as { status?: unknown } | null)?.status);
  const taken = Boolean(existingDomain) || slugHeldByLiveWorkspace;
  const reservationBlocks =
    !!existingReservation &&
    (!excludeLeadId || existingReservation.lead_id !== excludeLeadId);

  return { taken, pending: !taken && reservationBlocks, error: false };
}

async function suggestAlternativeSlugs(
  supabase: SupabaseClient,
  base: string,
): Promise<string[]> {
  const year = new Date().getFullYear().toString().slice(-2);
  const candidates = [`${base}-studio`, `${base}-official`, `${base}-${year}`];
  const available: string[] = [];

  for (const candidate of candidates) {
    if (!WORKSPACE_SLUG_REGEX.test(candidate)) continue;
    if (isReservedWorkspaceSlug(candidate)) continue;
    const check = await isRequestedLinkTaken(supabase, candidate);
    // Suggestions exclude both hard-taken and currently-held-pending slugs;
    // we don't want to recommend something the user will hit a conflict on.
    if (!check.error && !check.taken && !check.pending) {
      available.push(candidate);
    }
    if (available.length >= 3) break;
  }

  return available;
}

export async function submitGetStartedSignup(
  _prev: GetStartedActionResult | null,
  formData: FormData,
): Promise<GetStartedActionResult> {
  const honey = String(formData.get("company_website") ?? "").trim();
  if (honey.length > 0) {
    return {
      ok: true,
      kind: "created",
      leadId: "filtered",
      name: "",
      email: "",
      subdomain: null,
      workspaceSignupUrl: null,
    };
  }

  const h = await headers();
  const ipHeader =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (!tryConsumeRateLimit(`get-started:${ipHeader}`, 5, 60_000)) {
    return {
      ok: false,
      errors: { form: "Too many attempts from this IP. Try again in a minute." },
    };
  }

  const raw = {
    audience: String(formData.get("audience") ?? ""),
    businessName: String(formData.get("businessName") ?? ""),
    businessDescription: String(formData.get("businessDescription") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    subdomain: String(formData.get("subdomain") ?? ""),
    rosterSize: String(formData.get("rosterSize") ?? ""),
    tierInterest: (formData.get("tierInterest") as string | null) || undefined,
    utm_source: (formData.get("utm_source") as string | null) || undefined,
    utm_medium: (formData.get("utm_medium") as string | null) || undefined,
    utm_campaign: (formData.get("utm_campaign") as string | null) || undefined,
    utm_term: (formData.get("utm_term") as string | null) || undefined,
    utm_content: (formData.get("utm_content") as string | null) || undefined,
    referrer: (formData.get("referrer") as string | null) || undefined,
    sourcePage: (formData.get("sourcePage") as string | null) || undefined,
    promoCode: (formData.get("promoCode") as string | null) || undefined,
  };
  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: GetStartedFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        field === "businessName" ||
        field === "name" ||
        field === "email" ||
        field === "subdomain"
      ) {
        errors[field] = issue.message;
      } else {
        errors.form = issue.message;
      }
    }
    return { ok: false, errors };
  }
  const input = parsed.data;

  const subdomain = input.subdomain && input.subdomain.length > 0 ? input.subdomain : null;

  if (subdomain) {
    if (!WORKSPACE_SLUG_REGEX.test(subdomain)) {
      return {
        ok: false,
        errors: {
          subdomain:
            "Use 1–32 lowercase letters, numbers, or hyphens. Must start and end with a letter or number.",
        },
      };
    }
    if (isReservedWorkspaceSlug(subdomain)) {
      return { ok: false, errors: { subdomain: "That one's already taken. Try another." } };
    }
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    logServerError("get-started/submit", new Error("service-role client unavailable"));
    return {
      ok: false,
      errors: { form: "Signup is temporarily unavailable. Try again in a minute." },
    };
  }

  if (subdomain) {
    const availability = await isRequestedLinkTaken(supabase, subdomain);
    if (availability.error) {
      return {
        ok: false,
        errors: { form: "Couldn't check subdomain right now. Try again." },
      };
    }
    if (availability.taken) {
      return { ok: false, errors: { subdomain: `${subdomain} is already taken.` } };
    }
    if (availability.pending) {
      return {
        ok: false,
        errors: {
          subdomain:
            `${subdomain} is being claimed by another signup right now. Try a different link, or check back in a few minutes.`,
        },
      };
    }
  }

  const ipSalt = process.env.SIGNUP_IP_SALT ?? "rostra-signup-v1";
  const ipHash = crypto
    .createHash("sha256")
    .update(`${ipHeader}|${ipSalt}`)
    .digest("hex")
    .slice(0, 32);
  const userAgent = h.get("user-agent")?.slice(0, 400) ?? null;

  // Trust the SESSION, never the hidden field: `actorUserId` is client-supplied
  // and only used as a hint that the form rendered in a signed-in state.
  const actorSession = await getCachedActorSession();
  const actorUserId = actorSession.user?.id ?? null;

  // "One Free workspace per owner" (messaging-shells-handoff.md §1.4). Refuse
  // BEFORE the lead row and the subdomain reservation are written, so we never
  // reserve a link the provisioner will not create and never show the
  // "link reserved, one step left" screen for a workspace that cannot exist.
  if (actorUserId && (!input.tierInterest || input.tierInterest === "free")) {
    const ownedFree = await findOwnedFreeWorkspaceForUser(actorUserId);
    if (ownedFree) {
      return {
        ok: false,
        errors: {
          form: `Your account already has a free workspace, ${ownedFree.displayName}. Each account gets one free workspace. Open the one you have, or pick a paid plan to add another.`,
        },
      };
    }
  }

  const existingAuth = await findAuthUserIdByEmail(input.email);
  if (existingAuth.error) {
    return {
      ok: false,
      errors: { form: "Couldn't verify that email right now. Try again in a minute." },
    };
  }

  const selfServeEligible = isSelfServeWorkspaceLeadEligible(input.tierInterest);
  const onboardingPath = (leadId: string) =>
    `${getAppUrl()}${buildWorkspaceOnboardingPath(leadId)}`;

  const { data: inserted, error: insertError } = await supabase
    .from("saas_marketing_signups")
    .insert({
      email: input.email,
      name: input.name.trim(),
      business_name: input.businessName.trim(),
      business_description:
        input.businessDescription && input.businessDescription.trim().length > 0
          ? input.businessDescription.trim()
          : null,
      audience: input.audience,
      roster_size: input.rosterSize,
      tier_interest: input.tierInterest ?? null,
      subdomain_wanted: subdomain,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_term: input.utm_term ?? null,
      utm_content: input.utm_content ?? null,
      referrer: input.referrer?.slice(0, 500) ?? null,
      source_page: input.sourcePage ?? "/get-started",
      // Carried, not trusted: the checkout resolver validates it again before
      // it can discount a single cent.
      promo_code: input.promoCode || null,
      ip_hash: ipHash,
      user_agent: userAgent,
      ...(actorUserId ? { claimed_by_profile_id: actorUserId } : {}),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    logServerError("get-started/insert", insertError);
    return { ok: false, errors: { form: "Couldn't save your signup. Try again?" } };
  }

  const leadId = inserted.id as string;

  // Cross-stamp any open guest support tickets that already captured this
  // email. Best-effort: never blocks signup.
  try {
    await stampOpenGuestTicketsWithLeadId(input.email, leadId);
  } catch (err) {
    logServerError("get-started/stampGuestTickets", err);
  }

  // Write what they just told us into a Tulala Brief, so the understanding
  // layer has real rows in it before the Agent conversation exists. Owned by
  // the profile when they are signed in, otherwise by the signed guest cookie,
  // which the post-signup claim then attaches to their new account.
  //
  // Best-effort by contract: a brief is an enrichment, and signup must not
  // fail because one could not be written.
  try {
    const briefOwner: BriefOwner | null = actorUserId
      ? { kind: "profile", profileId: actorUserId }
      : await (async () => {
          const guestSessionId = await resolveGuestSessionId();
          return guestSessionId ? { kind: "guest" as const, guestSessionId } : null;
        })();
    if (briefOwner) {
      await writeSignupBrief(briefOwner, {
        contactName: input.name,
        businessName: input.businessName,
        businessDescription: input.businessDescription ?? null,
        audience: input.audience,
        rosterSize: input.rosterSize,
        signupLeadId: leadId,
      });
    }
  } catch (err) {
    logServerError("get-started/writeSignupBrief", err);
  }

  // Reserve the subdomain for this lead so a parallel signup can't race
  // them to the same slug. Best-effort: a failed reservation does NOT block
  // signup; the lead still has subdomain_wanted set, and the provisioner
  // will surface a real conflict at workspace-creation time if it occurs.
  if (subdomain) {
    const { error: reservationError } = await supabase
      .from("saas_subdomain_reservations")
      .upsert(
        {
          slug: subdomain,
          lead_id: leadId,
          // Resetting reserved_at/expires_at on upsert effectively refreshes
          // the TTL if the same lead re-submits (rare but possible: e.g.
          // they hit a transient error and retried).
          reserved_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        { onConflict: "slug" },
      );
    if (reservationError) {
      logServerError("get-started/reserve", reservationError);
    }
  }

  const workspaceOnboardingUrl = selfServeEligible ? onboardingPath(leadId) : null;

  if (existingAuth.userId && !actorUserId) {
    const signInUrl = `${getAppUrl()}/login?next=${encodeURIComponent(
      buildWorkspaceOnboardingPath(leadId),
    )}`;
    try {
      await sendFounderDigest({
        leadId,
        businessName: input.businessName.trim(),
        businessDescription: input.businessDescription?.trim() || null,
        name: input.name.trim(),
        email: input.email,
        audience: input.audience,
        rosterSize: input.rosterSize,
        subdomain,
        tierInterest: input.tierInterest ?? null,
        utmSource: input.utm_source ?? null,
        referrer: input.referrer ?? null,
      });
    } catch (e) {
      logServerError("get-started/email-existing", e);
    }
    return {
      ok: true,
      kind: "needs_signin",
      leadId,
      name: input.name.trim(),
      email: input.email,
      subdomain,
      workspaceSignupUrl: workspaceOnboardingUrl,
      signInUrl,
    };
  }

  // The confirmation email follows the visitor's language; the founder digest
  // below stays English (internal ops mail to an English-reading operator).
  const leadLocale = await getRequestLocale();
  try {
    await Promise.all([
      sendEmail({
        to: input.email,
        subject: leadEmailCopy(leadLocale).subject(PLATFORM_BRAND.name),
        html: renderLeadConfirmationEmail({
          name: input.name.trim(),
          subdomain,
          workspaceSignupUrl: workspaceOnboardingUrl,
          locale: leadLocale,
        }),
        replyTo: process.env.EMAIL_REPLY_TO,
      }),
      sendFounderDigest({
        leadId,
        businessName: input.businessName.trim(),
        businessDescription: input.businessDescription?.trim() || null,
        name: input.name.trim(),
        email: input.email,
        audience: input.audience,
        rosterSize: input.rosterSize,
        subdomain,
        tierInterest: input.tierInterest ?? null,
        utmSource: input.utm_source ?? null,
        referrer: input.referrer ?? null,
      }),
    ]);
  } catch (e) {
    logServerError("get-started/email", e);
  }

  return {
    ok: true,
    kind: "created",
    leadId,
    name: input.name.trim(),
    email: input.email,
    subdomain,
    workspaceSignupUrl: actorUserId ? workspaceOnboardingUrl : workspaceOnboardingUrl,
  };
}

async function sendFounderDigest(params: {
  leadId: string;
  businessName: string;
  businessDescription: string | null;
  name: string;
  email: string;
  audience: "operator" | "agency" | "organization" | "business";
  rosterSize: string;
  subdomain: string | null;
  tierInterest: WorkspaceTierInterest | null;
  utmSource: string | null;
  referrer: string | null;
}): Promise<void> {
  const to = process.env.FOUNDER_NOTIFY_EMAIL;
  if (!to) return;
  await sendEmail({
    to,
    subject: `[${PLATFORM_BRAND.name}] Signup: ${params.businessName} · ${params.audience}${
      params.subdomain ? ` · ${params.subdomain}.${PLATFORM_BRAND.domain}` : ""
    }`,
    html: renderFounderDigestEmail(params),
  });
}

/**
 * Lead-confirmation email copy. This email goes to the SIGNUP VISITOR, so it
 * follows their locale. (The founder digest below is an internal ops email to
 * an English-reading operator and deliberately stays English.)
 */
function leadEmailCopy(locale: string) {
  return pickLocale(locale, {
    en: {
      subject: (brand: string) => `You're on the list at ${brand}`,
      eyebrow: "You're on the list",
      welcome: (name: string) => `Welcome, ${name}.`,
      thanks: (brand: string) => `Thanks for signing up to ${brand}.`,
      selfServe: "For Free-plan workspaces, you can finish signup right away.",
      reviewing:
        "We're reviewing signups in the order they arrive and sending setup links within a day, usually within an hour during working hours.",
      linkPreference: "Your link preference:",
      claimBlurb:
        "Your free workspace is ready to claim. Create your account and we'll open the tenant automatically.",
      claimCta: "Create my workspace",
      followupSelfServe:
        "If you'd rather have us help you shape the setup first, just reply to this email with a little context about your roster.",
      followupReview:
        "In the meantime, reply to this email if you'd like to tell us more about your roster or what you're trying to replace. The more context we have, the faster we can tailor your setup.",
      signoff: (brand: string) => `The ${brand} team`,
    },
    es: {
      subject: (brand: string) => `Ya estás en la lista de ${brand}`,
      eyebrow: "Ya estás en la lista",
      welcome: (name: string) => `Hola, ${name}.`,
      thanks: (brand: string) => `Gracias por registrarte en ${brand}.`,
      selfServe:
        "Si eliges el plan gratuito, puedes terminar tu registro ahora mismo.",
      reviewing:
        "Estamos revisando los registros en el orden en que llegan y enviamos los enlaces de configuración en menos de un día, normalmente en menos de una hora en horario laboral.",
      linkPreference: "Tu enlace preferido:",
      claimBlurb:
        "Tu espacio de trabajo gratuito está listo. Crea tu cuenta y lo abrimos automáticamente.",
      claimCta: "Crear mi espacio de trabajo",
      followupSelfServe:
        "Si prefieres que te ayudemos a definir la configuración primero, responde a este correo y cuéntanos un poco sobre tu roster.",
      followupReview:
        "Mientras tanto, responde a este correo si quieres contarnos más sobre tu roster o sobre lo que buscas reemplazar. Cuanto más contexto tengamos, más rápido podemos adaptar tu configuración.",
      signoff: (brand: string) => `El equipo de ${brand}`,
    },
  });
}

function renderLeadConfirmationEmail(args: {
  name: string;
  subdomain: string | null;
  workspaceSignupUrl: string | null;
  locale: string;
}): string {
  const c = leadEmailCopy(args.locale);
  const subdomainLine = args.subdomain
    ? `<p style="margin:20px 0 0;color:#3a4541;">${c.linkPreference} <strong style="color:#0f1714;">${escapeHtml(
        args.subdomain,
      )}.${PLATFORM_BRAND.domain}</strong></p>`
    : "";
  const selfServeBlock = args.workspaceSignupUrl
    ? `<div style="margin:28px 0 0;padding:20px;border-radius:16px;background:#f4f2e8;border:1px solid rgba(15,23,20,0.08);">
        <p style="margin:0;color:#3a4541;font-size:15px;line-height:1.6;">${c.claimBlurb}</p>
        <p style="margin:18px 0 0;">
          <a href="${escapeHtml(args.workspaceSignupUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f4a3a;color:#fffdf7;font-size:14px;font-weight:600;text-decoration:none;">${c.claimCta}</a>
        </p>
      </div>`
    : "";
  const followupCopy = args.workspaceSignupUrl
    ? c.followupSelfServe
    : c.followupReview;
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:'Geist',Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px 40px 32px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:#1f4a3a;">${c.eyebrow}</div>
      <h1 style="font-family:'Geist',Inter,system-ui,sans-serif;font-size:30px;line-height:1.1;font-weight:500;margin:16px 0 0;color:#0f1714;letter-spacing:-0.025em;">${escapeHtml(c.welcome(args.name))}</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${c.thanks(
        PLATFORM_BRAND.name,
      )} ${args.workspaceSignupUrl ? c.selfServe : c.reviewing}</p>
      ${subdomainLine}
      ${selfServeBlock}
      <p style="margin:28px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${followupCopy}</p>
      <hr style="border:none;border-top:1px solid rgba(15,23,20,0.08);margin:32px 0;"/>
      <p style="margin:0;color:#6b766f;font-size:13px;line-height:1.6;">${c.signoff(
        PLATFORM_BRAND.name,
      )}<br/>${getMarketingCopy(args.locale).footer.stageLine} · ${new Date().getFullYear()}</p>
    </td></tr>
  </table>
</body></html>`;
}

function renderFounderDigestEmail(params: {
  leadId: string;
  businessName: string;
  businessDescription: string | null;
  name: string;
  email: string;
  audience: string;
  rosterSize: string;
  subdomain: string | null;
  tierInterest: string | null;
  utmSource: string | null;
  referrer: string | null;
}): string {
  const row = (k: string, v: string | null | undefined) =>
    v
      ? `<tr><td style="padding:6px 12px 6px 0;color:#6b766f;font-size:13px;">${escapeHtml(
          k,
        )}</td><td style="padding:6px 0;color:#0f1714;font-size:13px;">${escapeHtml(v)}</td></tr>`
      : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fffdf7;font-family:'Geist',Inter,system-ui,sans-serif;color:#0f1714;">
  <h2 style="font-family:'Geist',Inter,system-ui,sans-serif;margin:0 0 16px;font-weight:500;letter-spacing:-0.02em;">New signup · ${escapeHtml(
    params.businessName,
  )}</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    ${row("Business", params.businessName)}
    ${row("Description", params.businessDescription)}
    ${row("Contact", params.name)}
    ${row("Email", params.email)}
    ${row("Audience", params.audience)}
    ${row("Roster size", params.rosterSize)}
    ${row("Subdomain", params.subdomain ? `${params.subdomain}.${PLATFORM_BRAND.domain}` : "N/A")}
    ${row("Tier interest", params.tierInterest ?? "N/A")}
    ${row("UTM source", params.utmSource ?? "N/A")}
    ${row("Referrer", params.referrer ?? "N/A")}
    ${row("Lead ID", params.leadId)}
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Lightweight availability check, called on subdomain input blur so the
 * user sees inline feedback before clicking submit. Returns a narrow,
 * JSON-safe verdict; final enforcement lives in `submitGetStartedSignup`.
 */
export async function checkSubdomainAvailability(
  candidate: string,
): Promise<{ available: boolean; reason?: string; suggestions?: string[] }> {
  const cleaned = candidate.trim().toLowerCase();
  if (!cleaned) return { available: false, reason: "empty" };
  if (!WORKSPACE_SLUG_REGEX.test(cleaned)) {
    return { available: false, reason: "format" };
  }
  if (isReservedWorkspaceSlug(cleaned)) {
    return { available: false, reason: "reserved" };
  }
  const supabase = createServiceRoleClient();
  if (!supabase) return { available: true };
  const availability = await isRequestedLinkTaken(supabase, cleaned);
  if (availability.error) return { available: true };
  if (availability.taken) {
    const suggestions = await suggestAlternativeSlugs(supabase, cleaned);
    return { available: false, reason: "taken", suggestions };
  }
  if (availability.pending) {
    // Another in-flight signup holds a 15-min reservation on this slug.
    // Surface suggestions so the user has something to act on now instead
    // of waiting; "pending" reason lets the UI explain it's temporary.
    const suggestions = await suggestAlternativeSlugs(supabase, cleaned);
    return { available: false, reason: "pending", suggestions };
  }
  return { available: true };
}
