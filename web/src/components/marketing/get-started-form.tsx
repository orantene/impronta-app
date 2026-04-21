"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { trackProductEvent } from "@/lib/analytics/track-client";
import {
  checkSubdomainAvailability,
  submitGetStartedSignup,
  type GetStartedActionResult,
} from "@/app/(marketing)/get-started/actions";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

type AudienceKey = "operator" | "agency" | "organization";
type RosterBucket = "1-5" | "6-20" | "21-50" | "50+";
type TierKey = "free" | "studio" | "agency" | "network";

type Props = {
  initialAudience?: AudienceKey;
  tier?: TierKey;
};

const AUDIENCE_OPTIONS: { key: AudienceKey; label: string; description: string }[] = [
  {
    key: "operator",
    label: "Independent operator",
    description: "I coordinate a roster on my own.",
  },
  {
    key: "agency",
    label: "Agency / representation",
    description: "We run a branded representation business.",
  },
  {
    key: "organization",
    label: "Staffing / casting / placement",
    description: "We run a larger placement operation.",
  },
];

type SubdomainState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; value: string }
  | { status: "unavailable"; reason: "format" | "reserved" | "taken" | "empty" };

export function GetStartedForm({ initialAudience = "operator", tier }: Props) {
  const [state, formAction, isPending] = useActionState<
    GetStartedActionResult | null,
    FormData
  >(submitGetStartedSignup, null);

  const [audience, setAudience] = useState<AudienceKey>(initialAudience);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [rosterSize, setRosterSize] = useState<RosterBucket>("1-5");
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
  }, []);

  useEffect(() => {
    const trimmed = subdomain.trim();
    if (!trimmed) {
      setSubdomainState({ status: "idle" });
      return;
    }
    setSubdomainState({ status: "checking" });
    const handle = setTimeout(() => {
      startCheckTransition(async () => {
        try {
          const res = await checkSubdomainAvailability(trimmed);
          if (res.available) {
            setSubdomainState({ status: "available", value: trimmed });
          } else {
            setSubdomainState({
              status: "unavailable",
              reason: (res.reason as "format" | "reserved" | "taken" | "empty") ?? "format",
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok, state && "leadId" in state ? state.leadId : null]);

  const errors = state && !state.ok ? state.errors : {};

  if (state?.ok) {
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
          You&rsquo;re on the list
        </span>
        <h3
          className="plt-display mt-4 text-[1.75rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2rem]"
          style={{ color: "var(--plt-ink)" }}
        >
          Welcome, {state.name || "operator"}.
        </h3>
        <p
          className="mt-4 text-[0.9375rem] leading-[1.6]"
          style={{ color: "var(--plt-muted)" }}
        >
          We&rsquo;ll email{" "}
          <strong style={{ color: "var(--plt-ink)" }}>{state.email}</strong>{" "}
          with your setup link, usually within the hour. Check spam if you
          don&rsquo;t see it by tomorrow.
        </p>
        <ul
          className="mt-6 space-y-2.5 text-[0.9375rem]"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          <li className="flex items-start gap-2.5">
            <SuccessTick />
            Your subdomain:{" "}
            <strong>{(state.subdomain ?? "your-roster") + "." + PLATFORM_BRAND.domain}</strong>
          </li>
          <li className="flex items-start gap-2.5">
            <SuccessTick /> Free plan — no credit card on file
          </li>
          <li className="flex items-start gap-2.5">
            <SuccessTick /> Full export available from day one
          </li>
        </ul>
        <p
          className="plt-mono mt-6 text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          Reference: <code>{state.leadId.slice(0, 8)}</code>
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-[24px] border p-7 sm:p-8"
      style={{
        background: "var(--plt-bg-raised)",
        borderColor: "var(--plt-hairline-strong)",
        boxShadow: "0 28px 60px -30px rgba(15,23,20,0.22)",
      }}
    >
      {/* Honeypot — real humans skip this; labeled for screen readers but hidden visually. */}
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
      <input type="hidden" name="sourcePage" value="/get-started" />
      <input type="hidden" name="tierInterest" value={tier ?? ""} />
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="rosterSize" value={rosterSize} />

      <div className="flex items-center justify-between">
        <span
          className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.28em]"
          style={{ color: "var(--plt-forest)" }}
        >
          Claim your roster
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
          Free · no card
        </span>
      </div>

      <h3
        className="plt-display mt-3 text-[1.5rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[1.75rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        Start in under ten minutes.
      </h3>

      <fieldset className="mt-6">
        <legend
          className="text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-ink)" }}
        >
          Which describes you best?
        </legend>
        <div className="mt-3 grid gap-2">
          {AUDIENCE_OPTIONS.map((opt) => {
            const active = audience === opt.key;
            return (
              <label
                key={opt.key}
                className="relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all duration-200"
                style={{
                  background: active
                    ? "rgba(46,107,82,0.08)"
                    : "var(--plt-bg)",
                  borderColor: active
                    ? "var(--plt-forest)"
                    : "var(--plt-hairline)",
                  boxShadow: active
                    ? "0 0 0 3px rgba(46,107,82,0.12)"
                    : "none",
                }}
              >
                <input
                  type="radio"
                  name="audience-ui"
                  value={opt.key}
                  checked={active}
                  onChange={() => {
                    setAudience(opt.key);
                    trackProductEvent("marketing_audience_selected", {
                      source_page: "get-started",
                      audience: opt.key,
                    });
                  }}
                  className="sr-only"
                />
                <span
                  className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                  style={{
                    borderColor: active
                      ? "var(--plt-forest)"
                      : "var(--plt-hairline-strong)",
                    background: active ? "var(--plt-forest)" : "transparent",
                  }}
                  aria-hidden
                >
                  {active ? (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--plt-on-inverse)" }}
                    />
                  ) : null}
                </span>
                <div className="flex-1">
                  <span
                    className="block text-[0.9375rem] font-medium"
                    style={{ color: "var(--plt-ink)" }}
                  >
                    {opt.label}
                  </span>
                  <span
                    className="mt-0.5 block text-[0.8125rem]"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {opt.description}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TextField
          label="Your name"
          id="name"
          value={name}
          onChange={setName}
          placeholder="Sofía Morales"
          required
          error={errors.name}
        />
        <TextField
          label="Work email"
          id="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@roster.com"
          required
          error={errors.email}
        />
      </div>

      <div className="mt-4">
        <label
          htmlFor="subdomain"
          className="text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-ink)" }}
        >
          Pick your link
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
          <input
            id="subdomain"
            name="subdomain"
            type="text"
            value={subdomain}
            onChange={(e) =>
              setSubdomain(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "")
                  .slice(0, 32),
              )
            }
            placeholder="your-roster"
            className="h-12 flex-1 bg-transparent px-4 text-[0.9375rem] outline-none placeholder:text-[var(--plt-muted-soft)]"
            style={{ color: "var(--plt-ink)" }}
            autoComplete="off"
            spellCheck={false}
          />
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
        </div>
        <SubdomainHint state={subdomainState} serverError={errors.subdomain} />
      </div>

      <fieldset className="mt-6">
        <legend
          className="text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-ink)" }}
        >
          How many people are on your roster?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["1-5", "6-20", "21-50", "50+"] as const).map((r) => {
            const active = rosterSize === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRosterSize(r)}
                className="rounded-full border px-4 py-2 text-[0.8125rem] font-medium transition-all duration-200"
                style={{
                  background: active ? "var(--plt-forest)" : "var(--plt-bg)",
                  color: active ? "var(--plt-on-inverse)" : "var(--plt-ink-soft)",
                  borderColor: active ? "var(--plt-forest)" : "var(--plt-hairline-strong)",
                  boxShadow: active ? "0 10px 24px -16px rgba(31,74,58,0.5)" : "none",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </fieldset>

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
        {isPending ? "Reserving your link…" : "Claim your roster link"}
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

      <p
        className="mt-4 text-center text-[0.75rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        No credit card · Free plan forever · Upgrade when you&rsquo;re ready
      </p>
    </form>
  );
}

function SubdomainHint({
  state,
  serverError,
}: {
  state: SubdomainState;
  serverError?: string;
}) {
  if (serverError) {
    return (
      <p className="mt-2 text-[0.75rem]" style={{ color: "#8a3e2e" }}>
        {serverError}
      </p>
    );
  }
  switch (state.status) {
    case "idle":
      return (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
          Upgrade to your own domain any time.
        </p>
      );
    case "checking":
      return (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
          Checking availability…
        </p>
      );
    case "available":
      return (
        <p
          className="plt-mono mt-2 inline-flex items-center gap-1.5 text-[0.75rem]"
          style={{ color: "var(--plt-forest)" }}
        >
          <svg width="10" height="8" viewBox="0 0 11 9" fill="none" aria-hidden>
            <path
              d="M1 4.5L4 7.5L10 1.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <strong>
            {state.value}.{PLATFORM_BRAND.domain}
          </strong>{" "}
          is available.
        </p>
      );
    case "unavailable":
      return (
        <p className="mt-2 text-[0.75rem]" style={{ color: "#8a3e2e" }}>
          {state.reason === "taken"
            ? "That link is already in use — try another."
            : state.reason === "reserved"
              ? "That link is reserved — try another."
              : state.reason === "format"
                ? "Use lowercase letters, numbers, or hyphens (no leading/trailing hyphen)."
                : "Enter a link to continue."}
        </p>
      );
  }
}

function TextField({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  error,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  const fieldId = useId();
  const errId = error ? `${fieldId}-err` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[0.8125rem] font-medium"
        style={{ color: "var(--plt-ink)" }}
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={errId}
        className="mt-2 block h-12 w-full rounded-xl border bg-[var(--plt-bg)] px-4 text-[0.9375rem] outline-none transition-all duration-200 placeholder:text-[var(--plt-muted-soft)] focus:border-[var(--plt-forest)] focus:bg-[var(--plt-bg-raised)] focus:shadow-[0_0_0_3px_rgba(46,107,82,0.1)]"
        style={{
          borderColor: error ? "rgba(194,82,58,0.55)" : "var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
        }}
      />
      {error ? (
        <p id={errId} className="mt-1.5 text-[0.75rem]" style={{ color: "#8a3e2e" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SuccessTick() {
  return (
    <span
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(46,107,82,0.14)" }}
      aria-hidden
    >
      <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
        <path
          d="M1 4.5L4 7.5L10 1.5"
          stroke="var(--plt-forest)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
