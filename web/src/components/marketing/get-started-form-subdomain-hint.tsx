"use client";

import {
  reservedBrandedSubdomainHost,
  workspacePathHost,
} from "@/lib/saas/workspace-public-url";

type TierKey = "free" | "studio" | "agency" | "network";

export type SubdomainState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; value: string }
  | {
      status: "unavailable";
      reason: "format" | "reserved" | "taken" | "empty" | "pending";
      suggestions?: string[];
    };

function preferredLinkPreview(slug: string, tier?: TierKey): string {
  if (tier === "studio" || tier === "agency") {
    return reservedBrandedSubdomainHost(slug);
  }
  return workspacePathHost(slug);
}

export function SubdomainHint({
  state,
  serverError,
  tier,
  onPickSuggestion,
}: {
  state: SubdomainState;
  serverError?: string;
  tier?: TierKey;
  onPickSuggestion?: (slug: string) => void;
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
          <strong>{preferredLinkPreview(state.value, tier)}</strong> is available.
        </p>
      );
    case "unavailable":
      return (
        <div className="mt-2">
          <p className="text-[0.75rem]" style={{ color: "#8a3e2e" }}>
            {state.reason === "taken"
              ? "That link is already in use — try another."
              : state.reason === "pending"
                ? "Someone else is claiming that link right now. Try another, or check back in a few minutes."
                : state.reason === "reserved"
                  ? "That link is reserved — try another."
                  : state.reason === "format"
                    ? "Use lowercase letters, numbers, or hyphens (no leading/trailing hyphen)."
                    : "Enter a link to continue."}
          </p>
          {state.suggestions && state.suggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {state.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full border px-3 py-1 text-[0.75rem] font-medium transition-colors hover:border-[var(--plt-forest)]"
                  style={{
                    borderColor: "var(--plt-hairline-strong)",
                    color: "var(--plt-forest)",
                  }}
                  onClick={() => onPickSuggestion?.(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
  }
}
