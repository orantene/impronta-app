import { ArrowUpRight } from "lucide-react";

import { PLAN_COLOR, type ConversionHero, type Plan } from "./capability-catalog";

/**
 * Conversion hero shown above the tier bands when there's a "next plan up"
 * to upsell. Tier-colored gradient. The mockup uses three distinct gradients
 * keyed off `toPlan`; we generate them inline so the dashboard token system
 * stays clean.
 */

const GRADIENT: Record<Plan, string> = {
  free: "linear-gradient(135deg, #1f2024 0%, #3a3d44 100%)",
  studio: "linear-gradient(135deg, #1c3a8a 0%, #3a7bff 100%)",
  agency: "linear-gradient(135deg, #3a2c08 0%, #9e7d1b 55%, #c9a227 100%)",
  network: "linear-gradient(135deg, #0e3d23 0%, #146b3a 100%)",
};

export function ConvertHeroBanner({ hero }: { hero: ConversionHero }) {
  const gradient = GRADIENT[hero.toPlan];
  // Agency uses a lighter base; flip text color so contrast holds.
  const textColor = hero.toPlan === "agency" ? "#0b0b0d" : "#ffffff";
  const eyebrowAccent = PLAN_COLOR[hero.toPlan].fg;

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-5 shadow-[0_14px_40px_-20px_rgba(0,0,0,0.35)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-6"
      style={{ background: gradient, color: textColor }}
      role="region"
      aria-label={`Upgrade to ${hero.toPlan}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 100% 0%, rgba(255,255,255,0.12), transparent 45%)",
        }}
      />
      <div className="relative min-w-0 flex-1">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-75"
          style={{ color: eyebrowAccent }}
        >
          {hero.eyebrow}
        </div>
        <h2 className="mt-1.5 font-display text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
          {hero.headline}
        </h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed opacity-90">
          {hero.body}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] opacity-85">
          {hero.stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1.5">
              <strong className="text-[13px] font-semibold tracking-tight">
                {stat.value}
              </strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-4 flex shrink-0 flex-wrap items-center gap-2 sm:mt-0">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-[#0b0b0d] shadow-sm transition-transform hover:-translate-y-px hover:shadow-md"
        >
          {hero.primaryCta}
          <ArrowUpRight className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors"
          style={{
            backgroundColor:
              hero.toPlan === "agency"
                ? "rgba(0,0,0,0.08)"
                : "rgba(255,255,255,0.12)",
            borderColor:
              hero.toPlan === "agency"
                ? "rgba(0,0,0,0.12)"
                : "rgba(255,255,255,0.22)",
            color: textColor,
          }}
        >
          {hero.secondaryCta}
        </button>
      </div>
    </div>
  );
}
