"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Plan } from "./capability-catalog";

/**
 * UpgradeModal — "Choose your plan" 4-card modal from the
 * site-control-center mockup. Click on a locked card body's "Upgrade
 * to X" button or the tier-chip to open. Each card has price, tagline,
 * feature list, and a contextual switch button.
 */

type Feature = { text: string; dim?: boolean };

type PlanCard = {
  key: Plan;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: Feature[];
  usage: string;
};

const PLANS: ReadonlyArray<PlanCard> = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline:
      "Start your roster, manage inquiries, run on a subdomain.",
    features: [
      { text: "Up to 10 talents" },
      { text: "Roster, directory, inquiries" },
      { text: "Branding & identity" },
      { text: "rostra.app subdomain only" },
      { text: "No widgets / API", dim: true },
      { text: "No custom branded site", dim: true },
    ],
    usage: "8 / 10 talents",
  },
  {
    key: "studio",
    name: "Studio",
    price: "$49",
    period: "per month",
    tagline:
      "Your data layer. Embed your roster into your existing site.",
    features: [
      { text: "Up to 50 talents" },
      { text: "Widgets (grid, shelf, inquiry form)" },
      { text: "Read-only public API" },
      { text: "Rostra subdomain for deep links" },
      { text: "Everything in Free" },
      { text: "No custom branded site", dim: true },
    ],
    usage: "34 / 50 talents",
  },
  {
    key: "agency",
    name: "Agency",
    price: "$149",
    period: "per month",
    tagline:
      "Full branded site on your own domain. The complete product.",
    features: [
      { text: "Up to 200 talents" },
      { text: "Custom domain + branded site" },
      { text: "Pages, posts, nav, footer" },
      { text: "Theme library + selective import" },
      { text: "Widgets + API" },
      { text: "SEO tooling + redirects" },
    ],
    usage: "87 / 200 talents",
  },
  {
    key: "network",
    name: "Network",
    price: "$499",
    period: "per month",
    tagline:
      "Multi-agency operator with hub publishing and federation.",
    features: [
      { text: "Unlimited talents" },
      { text: "Hub publishing to cross-agency discovery" },
      { text: "Multi-agency manager" },
      { text: "Priority support" },
      { text: "Everything in Agency" },
      { text: "Custom contract available" },
    ],
    usage: "unlimited",
  },
];

const RANK: Record<Plan, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

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
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/52 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2",
            "w-[min(960px,calc(100vw-32px))] max-h-[calc(100vh-48px)] overflow-hidden",
            "rounded-[18px] bg-white shadow-[0_30px_70px_-20px_rgba(0,0,0,0.45)]",
            "border border-[rgba(24,24,27,0.1)]",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-[rgba(24,24,27,0.08)] px-6 pb-3 pt-6">
            <div>
              <Dialog.Title className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">
                Choose your plan
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] text-muted-foreground">
                Every plan runs on the same product — higher tiers unlock more
                cards. Cancel or downgrade anytime.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:bg-[#f2efe6] hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </header>
          <div className="overflow-y-auto px-6 pb-6 pt-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => {
                const isCurrent = plan.key === activePlan;
                const isLower = RANK[plan.key] < RANK[activePlan];
                const isUpgrade = RANK[plan.key] > RANK[activePlan];
                let cta = "";
                if (isCurrent) cta = "Current plan";
                else if (isUpgrade)
                  cta = plan.key === "network" ? "Talk to sales" : `Upgrade to ${plan.name}`;
                else if (isLower) cta = `Downgrade to ${plan.name}`;
                return (
                  <div
                    key={plan.key}
                    className={cn(
                      "relative flex flex-col gap-3 rounded-2xl border bg-white p-4 transition-[border-color,box-shadow]",
                      isCurrent
                        ? "border-[#c9a227] shadow-[0_0_0_1px_rgba(201,162,39,0.4)]"
                        : "border-[rgba(24,24,27,0.1)] hover:border-[rgba(201,162,39,0.4)] hover:shadow-[0_14px_40px_-28px_rgba(0,0,0,0.55)]",
                    )}
                    style={
                      isCurrent
                        ? {
                            background:
                              "linear-gradient(180deg, rgba(201, 162, 39, 0.04), white 30%)",
                          }
                        : undefined
                    }
                  >
                    {isCurrent ? (
                      <span
                        className="absolute right-2.5 top-2.5 rounded-full px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em]"
                        style={{
                          color: "#c9a227",
                          backgroundColor: "rgba(201,162,39,0.12)",
                        }}
                      >
                        Current
                      </span>
                    ) : null}
                    <div>
                      <h3 className="text-[16px] font-semibold tracking-[-0.005em] text-foreground">
                        {plan.name}
                      </h3>
                      <div className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                        {plan.price}
                        <small className="ml-1 text-[12px] font-medium text-muted-foreground tracking-normal">
                          {plan.period}
                        </small>
                      </div>
                      <p className="mt-1 text-[12px] leading-[1.4] text-muted-foreground">
                        {plan.tagline}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-1.5 text-[12.5px]">
                      {plan.features.map((f) => (
                        <li
                          key={f.text}
                          className={cn(
                            "flex items-start gap-1.5 leading-[1.4]",
                            f.dim ? "text-muted-foreground/70" : "text-foreground",
                          )}
                        >
                          <Check
                            className={cn(
                              "mt-0.5 size-3 shrink-0",
                              f.dim
                                ? "text-muted-foreground/50"
                                : "text-[#146b3a]",
                            )}
                            aria-hidden
                          />
                          <span>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) return;
                          if (plan.key === "network") {
                            window.location.href = "mailto:hello@impronta.group";
                            return;
                          }
                          onSelect?.(plan.key);
                          onOpenChange(false);
                        }}
                        disabled={isCurrent}
                        className={cn(
                          "w-full rounded-full border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                          isCurrent
                            ? "cursor-default border-transparent bg-transparent text-muted-foreground"
                            : isUpgrade
                              ? "border-[#c9a227] bg-[#c9a227] text-[#0b0b0d] hover:bg-[#b8941e] hover:border-[#b8941e]"
                              : "border-[rgba(24,24,27,0.18)] bg-white text-foreground hover:border-foreground/40",
                        )}
                      >
                        {cta}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
