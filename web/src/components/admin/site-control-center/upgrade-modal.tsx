"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Plan } from "./capability-catalog";

/**
 * UpgradeModal — premium "Choose your plan" dialog.
 *
 * Four tier cards arranged in a grid with a tier-accent header strip,
 * monthly/annual toggle (annual = 2 months free), "Most popular" badge
 * on Studio, and tier-coloured CTAs. Network routes to `mailto:` for
 * sales rather than self-service since it's contract-priced.
 *
 * Selecting a plan calls `onSelect` so the parent can update `?plan=`
 * (prototype) or trigger real billing later. The modal does NOT make a
 * server call directly.
 */

type Feature = { text: string; dim?: boolean };

type PlanCard = {
  key: Plan;
  name: string;
  monthly: number;
  annual: number;
  tagline: string;
  features: Feature[];
  /** Tier accent colour — drives the top strip + CTA. */
  accent: string;
  /** Foreground text colour to pair with accent backgrounds. */
  accentFg: string;
};

const PLANS: ReadonlyArray<PlanCard> = [
  {
    key: "free",
    name: "Free",
    monthly: 0,
    annual: 0,
    tagline: "Start your roster on a Rostra subdomain.",
    features: [
      { text: "Up to 10 talents" },
      { text: "Roster, directory, inquiries" },
      { text: "Branding & identity" },
      { text: "rostra.app subdomain" },
      { text: "Widgets & API", dim: true },
      { text: "Custom branded site", dim: true },
    ],
    accent: "#a1a1aa",
    accentFg: "#0b0b0d",
  },
  {
    key: "studio",
    name: "Studio",
    monthly: 49,
    annual: 490,
    tagline: "Embed your roster anywhere — your data layer.",
    features: [
      { text: "Up to 50 talents" },
      { text: "Widgets (grid, shelf, inquiry form)" },
      { text: "Read-only public API" },
      { text: "Rostra subdomain for deep links" },
      { text: "Everything in Free" },
      { text: "Custom branded site", dim: true },
    ],
    accent: "#3a7bff",
    accentFg: "#ffffff",
  },
  {
    key: "agency",
    name: "Agency",
    monthly: 149,
    annual: 1490,
    tagline: "Full branded site on your own domain.",
    features: [
      { text: "Up to 200 talents" },
      { text: "Custom domain + branded site" },
      { text: "Pages, posts, nav, footer" },
      { text: "Theme library + selective import" },
      { text: "Widgets + API" },
      { text: "SEO tooling + redirects" },
    ],
    accent: "#c9a227",
    accentFg: "#0b0b0d",
  },
  {
    key: "network",
    name: "Network",
    monthly: 499,
    annual: 4990,
    tagline: "Multi-agency operator with hub publishing.",
    features: [
      { text: "Unlimited talents" },
      { text: "Hub publishing — cross-agency" },
      { text: "Multi-agency manager" },
      { text: "Priority support" },
      { text: "Everything in Agency" },
      { text: "Custom contract available" },
    ],
    accent: "#146b3a",
    accentFg: "#ffffff",
  },
];

const RANK: Record<Plan, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

type Cycle = "monthly" | "annual";

function formatPrice(value: number, cycle: Cycle): string {
  if (value === 0) return "$0";
  if (cycle === "annual") {
    const monthlyEquivalent = Math.round(value / 12);
    return `$${monthlyEquivalent}`;
  }
  return `$${value}`;
}

export function UpgradeModal({
  open,
  onOpenChange,
  activePlan,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePlan: Plan;
  onSelect?: (plan: Plan) => void;
}) {
  const [cycle, setCycle] = React.useState<Cycle>("monthly");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2",
            "w-[min(1080px,calc(100vw-32px))] max-h-[calc(100vh-48px)]",
            "overflow-hidden rounded-[20px]",
            "bg-[#fbfaf5] shadow-[0_40px_90px_-25px_rgba(11,11,13,0.55)]",
            "border border-[rgba(24,24,27,0.08)]",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          {/* Header */}
          <header className="relative flex flex-col gap-4 border-b border-[rgba(24,24,27,0.06)] bg-white px-7 pb-5 pt-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-[#c9a227]">
                Plans & billing
              </span>
              <Dialog.Title
                className="mt-1.5 font-display text-[24px] font-semibold tracking-[-0.015em] sm:text-[26px]"
                style={{ color: "#0b0b0d" }}
              >
                Choose your plan
              </Dialog.Title>
              <Dialog.Description
                className="mt-1 text-[13px] leading-[1.5]"
                style={{ color: "#5b5b62" }}
              >
                Every plan runs on the same product — higher tiers unlock more
                cards. Switch or cancel anytime.
              </Dialog.Description>
            </div>

            {/* Billing cycle toggle */}
            <div className="flex shrink-0 items-center gap-2">
              <div
                className="inline-flex items-center rounded-full border border-[rgba(24,24,27,0.1)] bg-[#f2efe6] p-0.5 text-[12px] font-semibold"
                role="tablist"
                aria-label="Billing cycle"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cycle === "monthly"}
                  onClick={() => setCycle("monthly")}
                  className={cn(
                    "rounded-full px-3 py-1 transition-colors",
                    cycle === "monthly"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cycle === "annual"}
                  onClick={() => setCycle("annual")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors",
                    cycle === "annual"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Annual
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.1em]",
                      cycle === "annual"
                        ? "bg-[rgba(201,162,39,0.2)] text-[#c9a227]"
                        : "bg-[rgba(20,107,58,0.12)] text-[#146b3a]",
                    )}
                  >
                    −2 months
                  </span>
                </button>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[rgba(24,24,27,0.1)] bg-white text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </Dialog.Close>
            </div>
          </header>

          {/* Cards */}
          <div className="overflow-y-auto px-5 pb-6 pt-5 sm:px-7">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => {
                const isCurrent = plan.key === activePlan;
                const isLower = RANK[plan.key] < RANK[activePlan];
                const isUpgrade = RANK[plan.key] > RANK[activePlan];
                const isPopular = plan.key === "studio";
                const price = formatPrice(
                  cycle === "annual" ? plan.annual : plan.monthly,
                  cycle,
                );
                const period =
                  plan.monthly === 0
                    ? "forever"
                    : cycle === "annual"
                      ? "/ month, billed yearly"
                      : "/ month";

                let cta = "";
                if (isCurrent) cta = "Current plan";
                else if (isUpgrade)
                  cta =
                    plan.key === "network"
                      ? "Talk to sales"
                      : `Upgrade to ${plan.name}`;
                else if (isLower) cta = `Downgrade to ${plan.name}`;

                return (
                  <div
                    key={plan.key}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-[16px] border bg-white transition-[border-color,box-shadow,transform] duration-200",
                      isCurrent
                        ? "border-[rgba(201,162,39,0.55)] shadow-[0_0_0_1px_rgba(201,162,39,0.3),0_18px_40px_-30px_rgba(201,162,39,0.45)]"
                        : "border-[rgba(24,24,27,0.08)] hover:-translate-y-0.5 hover:border-[rgba(24,24,27,0.18)] hover:shadow-[0_18px_40px_-26px_rgba(0,0,0,0.4)]",
                    )}
                  >
                    {/* Tier accent strip */}
                    <span
                      aria-hidden
                      className="block h-[3px] w-full"
                      style={{ backgroundColor: plan.accent }}
                    />

                    {/* Status badge — Current OR Most popular */}
                    {isCurrent ? (
                      <span
                        className="absolute right-3 top-[14px] inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.14em]"
                        style={{
                          color: "#c9a227",
                          backgroundColor: "rgba(201,162,39,0.12)",
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: "#c9a227" }}
                          aria-hidden
                        />
                        Current
                      </span>
                    ) : isPopular ? (
                      <span
                        className="absolute right-3 top-[14px] rounded-full px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.14em]"
                        style={{
                          color: plan.accent,
                          backgroundColor: `${plan.accent}1f`,
                        }}
                      >
                        Most popular
                      </span>
                    ) : null}

                    <div className="flex flex-1 flex-col gap-4 p-5">
                      <div>
                        <h3
                          className="font-display text-[17px] font-semibold tracking-[-0.005em]"
                          style={{ color: "#0b0b0d" }}
                        >
                          {plan.name}
                        </h3>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span
                            className="font-display text-[28px] font-semibold tracking-[-0.02em]"
                            style={{ color: "#0b0b0d" }}
                          >
                            {price}
                          </span>
                          <span
                            className="text-[11.5px] font-medium"
                            style={{ color: "#6b6b72" }}
                          >
                            {period}
                          </span>
                        </div>
                        <p
                          className="mt-2 text-[12.5px] leading-[1.45]"
                          style={{ color: "#5b5b62" }}
                        >
                          {plan.tagline}
                        </p>
                      </div>

                      <div className="h-px w-full bg-[rgba(24,24,27,0.06)]" />

                      <ul className="flex flex-1 flex-col gap-2 text-[12.5px]">
                        {plan.features.map((f) => (
                          <li
                            key={f.text}
                            className="flex items-start gap-2 leading-[1.45]"
                            style={{ color: f.dim ? "#9b9ba0" : "#1f1f24" }}
                          >
                            {f.dim ? (
                              <Minus
                                className="mt-[3px] size-3 shrink-0 text-muted-foreground/50"
                                aria-hidden
                              />
                            ) : (
                              <Check
                                className="mt-[3px] size-3 shrink-0"
                                style={{ color: "#146b3a" }}
                                aria-hidden
                              />
                            )}
                            <span>{f.text}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrent) return;
                            if (plan.key === "network") {
                              window.location.href =
                                "mailto:hello@impronta.group?subject=Network%20plan%20enquiry";
                              return;
                            }
                            onSelect?.(plan.key);
                            onOpenChange(false);
                          }}
                          disabled={isCurrent}
                          className={cn(
                            "inline-flex w-full items-center justify-center rounded-full px-3 py-2.5 text-[12.5px] font-semibold transition-[background-color,border-color,color,box-shadow] duration-150",
                            isCurrent
                              ? "cursor-default border border-[rgba(24,24,27,0.08)] bg-transparent text-muted-foreground"
                              : isUpgrade
                                ? "border border-transparent text-[var(--cta-fg)] shadow-[0_8px_24px_-12px_var(--cta-shadow)] hover:brightness-95"
                                : "border border-[rgba(24,24,27,0.18)] bg-white text-foreground hover:border-foreground/40",
                          )}
                          style={
                            isUpgrade
                              ? ({
                                  backgroundColor: plan.accent,
                                  ["--cta-fg" as string]: plan.accentFg,
                                  ["--cta-shadow" as string]: `${plan.accent}80`,
                                } as React.CSSProperties)
                              : undefined
                          }
                        >
                          {cta}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footnote */}
            <p className="mt-5 text-center text-[11.5px] leading-[1.5] text-muted-foreground">
              Plans switch on the next billing cycle. VAT calculated at
              checkout. Need something custom?{" "}
              <a
                href="mailto:hello@impronta.group"
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Talk to us
              </a>
              .
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
