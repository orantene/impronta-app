"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { trackProductEvent } from "@/lib/analytics/track-client";
import type { ProductAnalyticsEventName } from "@/lib/analytics/product-events";
import {
  checkSubdomainAvailability,
  submitGetStartedSignup,
  type GetStartedActionResult,
} from "@/app/(marketing)/get-started/actions";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { AudiencePicker, SuccessTick, TextField } from "./get-started-form-fields";
import { SubdomainHint, type SubdomainState } from "./get-started-form-subdomain-hint";

type AudienceKey = "operator" | "agency" | "organization";
type RosterBucket = "1-5" | "6-20" | "21-50" | "50+";
type TierKey = "free" | "studio" | "agency" | "network";

export type GetStartedSignedIn = {
  userId: string;
  email: string;
  displayName: string | null;
};

/**
 * Pre-formatted monthly prices per tier slug, in the visitor's resolved
 * currency. Plumbed from the server page (which calls
 * `loadMarketingTiers`) so the hint copy stays in sync with whatever
 * `/platform/admin/pricing` currently has set. Pass `undefined` to fall
 * back to USD defaults.
 */
export type {
  GetStartedTierPrices,
  GetStartedTierNames,
} from "./get-started-form-tier-copy";
import type {
  GetStartedTierPrices,
  GetStartedTierNames,
} from "./get-started-form-tier-copy";
import {
  PAID_TIER_PLAN_LABEL,
  formFinePrint,
  isPaidTier,
  preferredLinkLabel,
  preferredLinkPreview,
  submitCtaLabel,
} from "./get-started-form-tier-copy";
import { getAudienceOptions, getFormCopy } from "./get-started-form-copy";

type Props = {
  locale?: string;
  initialAudience?: AudienceKey;
  tier?: TierKey;
  variant?: "page" | "compact";
  initialSignedIn?: GetStartedSignedIn;
  sourcePage?: string;
  /** Live monthly prices from catalog (Phase 2). */
  tierPrices?: GetStartedTierPrices;
  /**
   * Live display names per tier from `product_tiers.name` in the catalog.
   * Plumbed in so `submitCtaLabel` and `formFinePrint` reflect admin
   * renames without a redeploy.
   */
  tierNames?: GetStartedTierNames;
  /** Pre-formatted promo label (Phase 3, appended to fine-print). */
  appliedDiscountLabel?: string;
};

// getAudienceOptions + getFormCopy live in ./get-started-form-copy.ts


// submitCtaLabel lives in get-started-form-tier-copy.ts (client-safe + keeps
// this file under the 800-line lint cap).

/**
 * Client-side slugify for the live "business name → link" preview. Mirrors
 * `normalizeWorkspaceSlugCandidate` (server) so the auto-filled slug matches
 * what the server would derive: NFKD strip diacritics, lowercase, non-alnum →
 * single hyphen, trim hyphens, cap at 32. Kept local so this client component
 * doesn't import the server slug module.
 */
function slugifyBusinessName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 32)
    .replace(/-+$/, "");
}

export function GetStartedForm({
  locale = "en",
  initialAudience = "operator",
  tier,
  variant = "page",
  initialSignedIn,
  sourcePage = "/get-started",
  tierPrices,
  tierNames,
  appliedDiscountLabel,
}: Props) {
  const audienceOptions = getAudienceOptions(locale);
  const t = getFormCopy(locale);
  const [state, formAction, isPending] = useActionState<
    GetStartedActionResult | null,
    FormData
  >(submitGetStartedSignup, null);

  const [audience, setAudience] = useState<AudienceKey>(initialAudience);
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [name, setName] = useState(initialSignedIn?.displayName ?? "");
  const [email, setEmail] = useState(initialSignedIn?.email ?? "");
  const [subdomain, setSubdomain] = useState("");
  // Once the user hand-edits the link, stop auto-syncing it from the business
  // name (Shopify/Linear pattern): the slug is theirs to own from then on.
  const [slugDirty, setSlugDirty] = useState(false);
  const [rosterSize] = useState<RosterBucket>("1-5");
  const [subdomainState, setSubdomainState] = useState<SubdomainState>({ status: "idle" });
  const [, startCheckTransition] = useTransition();

  const attributionRef = useRef<{
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    referrer?: string;
  }>({});

  // Funnel-step tracking: fire each event AT MOST ONCE per form session.
  // We track these with refs (not state) so React doesn't re-render on
  // ref mutation and the events don't double-fire under StrictMode.
  const firedRef = useRef<Record<string, boolean>>({});
  function trackOnce(name: ProductAnalyticsEventName, payload: Record<string, unknown>) {
    if (firedRef.current[name]) return;
    firedRef.current[name] = true;
    trackProductEvent(name, payload as Parameters<typeof trackProductEvent>[1]);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const p = new URLSearchParams(window.location.search);
      attributionRef.current = {
        utm_source: p.get("utm_source") || undefined,
        utm_medium: p.get("utm_medium") || undefined,
        utm_campaign: p.get("utm_campaign") || undefined,
        utm_term: p.get("utm_term") || undefined,
        utm_content: p.get("utm_content") || undefined,
        referrer: document.referrer || undefined,
      };
    } catch {
      /* no-op */
    }
    // Step 1: visitor reached the form. `trackOnce` is idempotent (guards
    // via firedRef) so deps changing won't cause double-fire; including
    // the props in deps satisfies the exhaustive-deps rule.
    trackOnce("marketing_funnel_viewed", {
      source_page: "get-started",
      audience_initial: initialAudience,
      tier_interest: tier ?? null,
    });
  }, [initialAudience, tier]);

  useEffect(() => {
    const trimmed = subdomain.trim();
    if (!trimmed) {
      setSubdomainState({ status: "idle" });
      return;
    }
    // Step 3: visitor started typing in the subdomain field.
    trackOnce("marketing_subdomain_typed", { audience });
    setSubdomainState({ status: "checking" });
    const handle = setTimeout(() => {
      startCheckTransition(async () => {
        try {
          const res = await checkSubdomainAvailability(trimmed);
          // Step 3b: subdomain availability check result.
          trackProductEvent("marketing_subdomain_checked", {
            available: res.available,
            audience,
            length: trimmed.length,
          });
          if (res.available) {
            setSubdomainState({ status: "available", value: trimmed });
          } else {
            setSubdomainState({
              status: "unavailable",
              reason:
                (res.reason as
                  | "format"
                  | "reserved"
                  | "taken"
                  | "empty"
                  | "pending") ?? "format",
              suggestions: res.suggestions,
            });
          }
        } catch {
          setSubdomainState({ status: "idle" });
        }
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [subdomain]);

  useEffect(() => {
    if (state?.ok && state.leadId && state.leadId !== "filtered") {
      trackProductEvent("marketing_waitlist_submitted", {
        source_page: "get-started",
        audience,
        roster_size: rosterSize,
        has_subdomain: Boolean(state.subdomain),
        tier_interest: tier ?? null,
        lead_id: state.leadId,
      });
    } else if (state && !state.ok) {
      // Server-side rejection: fire the failure event so we can see which
      // step the funnel actually breaks on (validation, rate-limit, etc.).
      const firstErrorKey = Object.keys(state.errors ?? {})[0] ?? "unknown";
      trackProductEvent("marketing_submit_failed", {
        audience,
        error_code: firstErrorKey,
      });
    }
    // `audience`/`rosterSize`/`tier` are the submitted values; including
    // them in the dep array is correct and stable since they only change
    // via user interaction (which is what triggers a new submission anyway).
  }, [state, audience, rosterSize, tier]);

  const errors = state && !state.ok ? state.errors : {};

  if (state?.ok && state.kind === "needs_signin") {
    const paidTier = isPaidTier(tier);
    const planLabel = paidTier ? PAID_TIER_PLAN_LABEL[tier] : null;
    return (
      <div
        className="rounded-[24px] border p-8 sm:p-10"
        style={{
          background: "var(--plt-bg-raised)",
          borderColor: "var(--plt-hairline-strong)",
          boxShadow: "0 28px 60px -30px rgba(15,23,20,0.22)",
        }}
      >
        <h3
          className="plt-display text-[1.5rem] font-medium leading-[1.1] tracking-[-0.02em]"
          style={{ color: "var(--plt-ink)" }}
        >
          {paidTier ? `Sign in to continue to ${planLabel} checkout` : "Sign in to claim your link"}
        </h3>
        <p className="mt-4 text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-muted)" }}>
          An account already exists for{" "}
          <strong style={{ color: "var(--plt-ink)" }}>{state.email}</strong>. Sign in to finish
          {paidTier ? " setting up " : " creating "}
          <strong style={{ color: "var(--plt-ink)" }}>
            {preferredLinkPreview(state.subdomain ?? "your-business", tier)}
          </strong>
          {paidTier ? ". Payment is the last step." : "."}
        </p>
        {state.signInUrl ? (
          <a
            href={state.signInUrl}
            className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 text-[0.875rem] font-medium transition-colors hover:opacity-90"
            style={{
              background: "var(--plt-forest)",
              color: "var(--plt-on-inverse)",
            }}
          >
            {paidTier ? "Sign in and continue to checkout" : "Sign in and claim workspace"}
          </a>
        ) : null}
      </div>
    );
  }

  if (state?.ok) {
    const signedInContinue =
      initialSignedIn && state.workspaceSignupUrl ? state.workspaceSignupUrl : null;
    const paidTier = isPaidTier(tier);
    const planLabel = paidTier ? PAID_TIER_PLAN_LABEL[tier] : null;

    return (
      <div
        className="rounded-[24px] border p-8 sm:p-10"
        style={{
          background: "var(--plt-bg-raised)",
          borderColor: "var(--plt-hairline-strong)",
          boxShadow: "0 28px 60px -30px rgba(15,23,20,0.22)",
        }}
      >
        <span
          className="plt-mono inline-flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.28em]"
          style={{ color: "var(--plt-forest)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--plt-forest)" }}
            aria-hidden
          />
          {state.workspaceSignupUrl ? "Link reserved · one step left" : "You’re on the list"}
        </span>
        <h3
          className="plt-display mt-4 text-[1.75rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2rem]"
          style={{ color: "var(--plt-ink)" }}
        >
          Welcome, {state.name || "there"}.
        </h3>
        <p
          className="mt-4 text-[0.9375rem] leading-[1.6]"
          style={{ color: "var(--plt-muted)" }}
        >
          {state.workspaceSignupUrl ? (
            paidTier ? (
              <>
                Finish account setup with{" "}
                <strong style={{ color: "var(--plt-ink)" }}>{state.email}</strong>{" "}
                and we&apos;ll take you to {planLabel} checkout. Payment is the last step
                before your workspace is ready.
              </>
            ) : (
              <>
                Finish account setup with{" "}
                <strong style={{ color: "var(--plt-ink)" }}>{state.email}</strong>{" "}
                and we&apos;ll create your free workspace and its public Tulala URL
                automatically.
              </>
            )
          ) : (
            <>
              We&apos;ll email{" "}
              <strong style={{ color: "var(--plt-ink)" }}>{state.email}</strong>{" "}
              with your setup link, usually within the hour. Check spam if you
              don&apos;t see it by tomorrow.
            </>
          )}
        </p>
        {signedInContinue || state.workspaceSignupUrl ? (
          <a
            href={signedInContinue ?? state.workspaceSignupUrl ?? "#"}
            className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 text-[0.875rem] font-medium transition-colors hover:opacity-90"
            style={{
              background: "var(--plt-forest)",
              color: "var(--plt-on-inverse)",
            }}
          >
            {signedInContinue
              ? paidTier
                ? `Continue to ${planLabel} checkout`
                : "Open my workspace"
              : paidTier
                ? `Create account and continue to ${planLabel} checkout`
                : "Create account and open workspace"}
          </a>
        ) : null}
        {tier === "network" && (
          <p
            className="mt-5 rounded-xl border px-4 py-3 text-[0.875rem] leading-[1.55]"
            style={{ borderColor: "rgba(46,107,82,0.25)", background: "rgba(46,107,82,0.06)", color: "var(--plt-ink-soft)" }}
          >
            {tierPrices?.network
              ? `Your free workspace is ready to explore now. Upgrade to Network (${tierPrices.network}/mo) when you’re ready: SSO, custom domain, and dedicated onboarding unlock at checkout.`
              : <>Your free workspace is ready to explore now. We&apos;ll email <strong style={{ color: "var(--plt-ink)" }}>{state.email}</strong> separately to set up the Network plan: pricing, SSO, and a custom domain.</>}
          </p>
        )}
        <ul
          className="mt-6 space-y-2.5 text-[0.9375rem]"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          <li className="flex items-start gap-2.5">
            <SuccessTick />
            {preferredLinkLabel(tier)}:{" "}
            <strong>{preferredLinkPreview(state.subdomain ?? "your-business", tier)}</strong>
          </li>
          <li className="flex items-start gap-2.5">
            <SuccessTick />{" "}
            {state.workspaceSignupUrl
              ? paidTier
                ? `${planLabel} plan: full feature set unlocks after checkout`
                : "Free plan: no credit card on file"
              : "We'll confirm the right plan and launch path with you by email"}
          </li>
          <li className="flex items-start gap-2.5">
            <SuccessTick />{" "}
            {state.workspaceSignupUrl
              ? paidTier
                ? "Cancel any time, managed from your workspace billing settings"
                : "Upgrade later to branded subdomains or custom domains"
              : "Your preferred link name is saved with this signup"}
          </li>
        </ul>
        {state.subdomain ? (
          <p
            className="mt-6 text-[0.75rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t.savedSpot}{" "}
            <strong className="plt-mono" style={{ color: "var(--plt-ink-soft)" }}>
              {preferredLinkPreview(state.subdomain, tier)}
            </strong>
          </p>
        ) : null}
      </div>
    );
  }

  // Step 5: submit attempted. Fires the moment the form action is invoked,
  // BEFORE the server-side validation/persistence runs. Pairs with
  // marketing_waitlist_submitted (success) and marketing_submit_failed (server error).
  function handleFormAction(formData: FormData) {
    trackProductEvent("marketing_submit_attempted", {
      audience,
      has_subdomain: Boolean(subdomain.trim()),
      roster_size: rosterSize,
      tier_interest: tier ?? null,
    });
    return formAction(formData);
  }

  return (
    <form
      action={handleFormAction}
      className="rounded-[24px] border p-7 sm:p-8"
      style={{
        background: "var(--plt-bg-raised)",
        borderColor: "var(--plt-hairline-strong)",
        boxShadow: "0 28px 60px -30px rgba(15,23,20,0.22)",
      }}
    >
      {/* Honeypot: real humans skip this; labeled for screen readers but hidden visually. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor="company_website">Company website (leave empty)</label>
        <input
          type="text"
          id="company_website"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <input type="hidden" name="utm_source" value={attributionRef.current.utm_source ?? ""} />
      <input type="hidden" name="utm_medium" value={attributionRef.current.utm_medium ?? ""} />
      <input type="hidden" name="utm_campaign" value={attributionRef.current.utm_campaign ?? ""} />
      <input type="hidden" name="utm_term" value={attributionRef.current.utm_term ?? ""} />
      <input type="hidden" name="utm_content" value={attributionRef.current.utm_content ?? ""} />
      <input type="hidden" name="referrer" value={attributionRef.current.referrer ?? ""} />
      <input type="hidden" name="sourcePage" value={sourcePage} />
      <input type="hidden" name="tierInterest" value={tier ?? ""} />
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="rosterSize" value={rosterSize} />
      {initialSignedIn ? (
        <input type="hidden" name="actorUserId" value={initialSignedIn.userId} />
      ) : null}

      {initialSignedIn ? (
        <div
          className="mb-5 rounded-xl border px-4 py-3 text-[0.8125rem] leading-[1.5]"
          style={{
            borderColor: "var(--plt-hairline)",
            background: "rgba(46,107,82,0.06)",
            color: "var(--plt-ink-soft)",
          }}
        >
          You&apos;re signed in as{" "}
          <strong style={{ color: "var(--plt-ink)" }}>{initialSignedIn.email}</strong>. This
          workspace will be added to your account.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <span
          className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.28em]"
          style={{ color: "var(--plt-forest)" }}
        >
          {t.eyebrow}
        </span>
        <span
          className="plt-mono inline-flex items-center gap-2 text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--plt-forest-bright)" }}
            aria-hidden
          />
          {t.freeNoCard}
        </span>
      </div>

      <h3
        className={`plt-display mt-3 font-medium leading-[1.1] tracking-[-0.02em] ${
          variant === "compact"
            ? "text-[1.35rem] sm:text-[1.5rem]"
            : "text-[1.5rem] sm:text-[1.75rem]"
        }`}
        style={{ color: "var(--plt-ink)" }}
      >
        {variant === "compact" ? t.headingCompact : t.heading}
      </h3>

      {/* Business name: the one input that matters. It seeds the link below. */}
      <div className="mt-6">
        <TextField
          label={t.businessName}
          id="businessName"
          value={businessName}
          onChange={(v) => {
            if (!businessName && v) {
              trackOnce("marketing_business_name_typed", { audience });
            }
            setBusinessName(v);
            // Auto-fill the link from the business name until the user takes
            // the slug over by hand-editing it (slugDirty).
            if (!slugDirty) setSubdomain(slugifyBusinessName(v));
          }}
          placeholder={t.businessNamePlaceholder}
          required
          error={errors.businessName}
        />
        <p
          className="mt-1.5 text-[0.75rem] leading-[1.5]"
          style={{ color: "var(--plt-muted)" }}
        >
          {t.businessNameHint}
        </p>
      </div>

      {/* Link: auto-filled from the business name, editable. */}
      <div className="mt-4">
        <label
          htmlFor="subdomain"
          className="text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-ink)" }}
        >
          {t.pickLink}
        </label>
        <div
          className="mt-2 flex items-stretch overflow-hidden rounded-xl border transition-colors"
          style={{
            borderColor:
              subdomainState.status === "unavailable"
                ? "rgba(194,82,58,0.55)"
                : subdomainState.status === "available"
                  ? "var(--plt-forest)"
                  : "var(--plt-hairline-strong)",
            background: "var(--plt-bg)",
            boxShadow:
              subdomainState.status === "available"
                ? "0 0 0 3px rgba(46,107,82,0.1)"
                : "none",
          }}
        >
          {tier === "studio" || tier === "agency" || tier === "network" ? null : (
            <span
              className="plt-mono inline-flex items-center border-r px-4 text-[0.8125rem]"
              style={{
                borderColor: "var(--plt-hairline)",
                color: "var(--plt-muted)",
                background: "var(--plt-bg-deep)",
              }}
            >
              {PLATFORM_BRAND.domain}/
            </span>
          )}
          <input
            id="subdomain"
            name="subdomain"
            type="text"
            value={subdomain}
            onChange={(e) => {
              // Hand-editing the link claims it; stop auto-syncing from name.
              setSlugDirty(true);
              setSubdomain(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 32),
              );
            }}
            placeholder="your-business"
            className="h-12 flex-1 bg-transparent px-4 text-[0.9375rem] outline-none placeholder:text-[var(--plt-muted-soft)]"
            style={{ color: "var(--plt-ink)" }}
            autoComplete="off"
            spellCheck={false}
          />
          {tier === "studio" || tier === "agency" || tier === "network" ? (
            <span
              className="plt-mono inline-flex items-center border-l px-4 text-[0.8125rem]"
              style={{
                borderColor: "var(--plt-hairline)",
                color: "var(--plt-muted)",
                background: "var(--plt-bg-deep)",
              }}
            >
              .{PLATFORM_BRAND.domain}
            </span>
          ) : null}
        </div>
        <SubdomainHint
          state={subdomainState}
          serverError={errors.subdomain}
          tier={tier}
          onPickSuggestion={(s) => {
            setSlugDirty(true);
            setSubdomain(s);
          }}
        />
      </div>

      {/* Optional short description, collapsed by default so an empty box
          never depresses completion. Value rides a hidden input so it
          survives collapsing. */}
      <input type="hidden" name="businessDescription" value={businessDescription} />
      <div className="mt-4">
        {descriptionOpen ? (
          <div>
            <label
              htmlFor="businessDescription-ui"
              className="text-[0.8125rem] font-medium"
              style={{ color: "var(--plt-ink)" }}
            >
              {t.businessDescription}
            </label>
            <textarea
              id="businessDescription-ui"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value.slice(0, 500))}
              placeholder={t.businessDescriptionPlaceholder}
              rows={2}
              className="mt-2 block w-full rounded-xl border bg-[var(--plt-bg)] px-4 py-3 text-[0.9375rem] outline-none transition-all duration-200 placeholder:text-[var(--plt-muted-soft)] focus:border-[var(--plt-forest)] focus:bg-[var(--plt-bg-raised)] focus:shadow-[0_0_0_3px_rgba(46,107,82,0.1)]"
              style={{ borderColor: "var(--plt-hairline-strong)", color: "var(--plt-ink)" }}
            />
            <button
              type="button"
              onClick={() => setDescriptionOpen(false)}
              className="mt-1.5 text-[0.75rem] font-medium"
              style={{ color: "var(--plt-muted)" }}
            >
              {t.hideDescription}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDescriptionOpen(true)}
            className="text-[0.8125rem] font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--plt-forest)" }}
          >
            + {t.addDescription}
          </button>
        )}
      </div>

      {/* Contact: signed-in users come from the session (hidden); guests type
          their name + email. */}
      {initialSignedIn ? (
        <>
          <input type="hidden" name="name" value={name.trim() || businessName.trim()} />
          <input type="hidden" name="email" value={initialSignedIn.email} />
        </>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label={t.yourName}
            id="name"
            value={name}
            onChange={setName}
            placeholder="Sofía Morales"
            required
            error={errors.name}
          />
          <TextField
            label={t.workEmail}
            id="email"
            type="email"
            value={email}
            onChange={(v) => {
              // Step 2: visitor showed intent by typing in email (first keystroke only).
              if (!email && v) trackOnce("marketing_email_focused", { audience });
              setEmail(v);
            }}
            placeholder="you@business.com"
            required
            error={errors.email}
          />
        </div>
      )}

      {/* Demoted, optional self-identification. Everyone lands on Free, so this
          only routes onboarding flavor + segments leads; it sits last and
          reads as optional. */}
      <AudiencePicker
        legend={t.whichDescribesOptional}
        options={audienceOptions}
        value={audience}
        onSelect={(key) => {
          setAudience(key);
          trackProductEvent("marketing_audience_selected", {
            source_page: "get-started",
            audience: key,
          });
        }}
      />

      {errors.form ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border px-4 py-3 text-[0.8125rem]"
          style={{
            borderColor: "rgba(194,82,58,0.3)",
            background: "rgba(194,82,58,0.06)",
            color: "#8a3e2e",
          }}
        >
          {errors.form}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending || subdomainState.status === "unavailable"}
        className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full text-[0.95rem] font-medium transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0"
        style={{
          background: "var(--plt-forest)",
          color: "var(--plt-on-inverse)",
          boxShadow: "0 18px 40px -18px rgba(31,74,58,0.55)",
        }}
      >
        {isPending
          ? t.reserving
          : tier
            ? submitCtaLabel(tier, audience, tierPrices, tierNames)
            : t.createWorkspace}
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
          <path
            d="M1 5H13M13 5L9 1M13 5L9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <p className="mt-4 text-center text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
        {tier ? formFinePrint(tier, tierPrices, tierNames) : t.ctaFinePrint}
        {appliedDiscountLabel && <span style={{ color: "var(--plt-forest)", fontWeight: 500 }}> · {appliedDiscountLabel}</span>}
      </p>
    </form>
  );
}

