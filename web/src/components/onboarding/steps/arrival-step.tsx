"use client";

/**
 * Step 5 · Arrival. One headline, one fact line (only what the stamp
 * proves), one button into the product. The failed variant keeps the
 * person's words and offers a retry.
 */

import type { ArrivalPayload } from "@/lib/onboarding/arrival";

import { PrimaryButton, Sub, Title } from "../ui";

export function ArrivalStep({ t, arrival }: { t: (key: string) => string; arrival: ArrivalPayload }) {
  const facts: string[] = [];
  if (arrival.fact.services > 0) facts.push(t("public.onboarding.arrival.factServices").replace("{n}", String(arrival.fact.services)));
  if (arrival.fact.city) facts.push(t("public.onboarding.arrival.factCity").replace("{city}", arrival.fact.city));
  if (arrival.fact.logo) facts.push(t("public.onboarding.arrival.factLogo"));
  if (arrival.fact.hours) facts.push(t("public.onboarding.arrival.factHours"));
  if (arrival.fact.whatsapp) facts.push(t("public.onboarding.arrival.factWhatsapp"));
  if (arrival.fact.menuItems > 0) facts.push(t("public.onboarding.arrival.factMenu").replace("{n}", String(arrival.fact.menuItems)));
  if (arrival.fact.photos) facts.push(t("public.onboarding.arrival.factPhotos"));

  const sub =
    arrival.variant === "talent" ? t("public.onboarding.arrival.talentSub")
    : arrival.variant === "both" ? t("public.onboarding.arrival.bothSub").replace("{business}", arrival.businessName ?? "")
    : arrival.variant === "business" ? t("public.onboarding.arrival.businessSub").replace("{business}", arrival.businessName ?? "")
    : arrival.variant === "existing_workspace" ? t("public.onboarding.arrival.existingSub")
    : arrival.fallbackReason === "copy" ? t("public.onboarding.arrival.fallbackCopySub")
    : arrival.fallbackReason === "photos" ? t("public.onboarding.arrival.fallbackPhotosSub").replace("{business}", arrival.businessName ?? "")
    : arrival.fallbackReason === "failed" ? t("public.onboarding.arrival.fallbackSub")
    : t("public.onboarding.arrival.businessSub").replace("{business}", arrival.businessName ?? "");
  const cta =
    arrival.primary.label === "finish_my_page" ? t("public.onboarding.arrival.finishMyPage")
    : arrival.primary.label === "open_my_website" ? t("public.onboarding.arrival.openMyWebsite")
    : t("public.onboarding.arrival.openMyWorkspace");

  const business = arrival.variant === "business" || arrival.variant === "both" || arrival.variant === "fallback";
  const title = arrival.variant === "talent" ? t("public.onboarding.arrival.readyTalent") : business ? t("public.onboarding.arrival.readyBusiness") : t("public.onboarding.arrival.youreIn");
  const nextSteps = business
    ? [t("public.onboarding.arrival.nextVisit"), t("public.onboarding.arrival.nextCustomize"), t("public.onboarding.arrival.nextPhotos"), t("public.onboarding.arrival.nextDomain"), t("public.onboarding.arrival.nextPremium")]
    : [t("public.onboarding.arrival.nextTalentPhotos"), t("public.onboarding.arrival.nextTalentBio"), t("public.onboarding.arrival.nextTalentShare")];

  return (
    <div data-testid="onb-arrival" data-variant={arrival.variant}>
      <div className="mb-3 flex justify-center" aria-hidden>
        <span className="grid size-12 place-items-center rounded-full text-[1.25rem]" style={{ background: "var(--tl-forest-soft)", color: "var(--tl-forest)" }}>✓</span>
      </div>
      <Title size={30}>{title}</Title>
      <Sub>{sub}</Sub>
      {facts.length ? (
        <p className="mt-3 text-[0.9375rem]" style={{ color: "var(--tl-ink)" }} data-testid="onb-arrival-fact">
          {facts.join(" · ")}
        </p>
      ) : null}

      {arrival.link ? (
        <div className="mt-5 overflow-hidden rounded-[18px]" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid="onb-arrival-link">
          {/* The site itself, framed. A tenant site that refuses framing shows the address card only. */}
          <div className={business ? "relative aspect-[4/3] w-full" : "relative h-28 w-full"} style={{ background: "var(--tl-stone-soft)" }}>
            {/* Under the frame: the site's name, so a slow or refused load never reads as a blank box. */}
            <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="tl-display text-[1.375rem] font-semibold leading-[1.15]" style={{ color: "var(--tl-ink)" }}>{arrival.businessName ?? arrival.headlineName ?? arrival.link.display}</span>
              <span className="text-[0.75rem] uppercase tracking-[0.12em]" style={{ color: "var(--tl-muted)" }}>{arrival.link.display}</span>
            </div>
            {/* A business site is live at once; a talent page goes live after three photos, so it is not framed. */}
            {business ? <iframe title={arrival.link.display} src={arrival.link.href} className="absolute inset-0 h-full w-full border-0 bg-transparent" loading="lazy" sandbox="allow-same-origin allow-scripts" /> : null}
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.arrival.link")}</span>
              <span className="block truncate text-[0.9375rem] font-semibold" style={{ color: "var(--tl-ink)" }}>{arrival.link.display}</span>
            </span>
            <a href={arrival.link.href} target="_blank" rel="noreferrer" className="shrink-0 text-[0.8125rem] font-semibold underline underline-offset-2" style={{ color: "var(--tl-ink-soft)" }} data-testid="onb-arrival-visit">
              {t("public.onboarding.arrival.visit")}
            </a>
          </div>
        </div>
      ) : null}

      {/* A business lands on its site, never in edit mode (owner ruling
          2026-09-17); the builder is the second button. A talent's primary is
          "Finish my page" (the page goes live after three photos). */}
      <div className="mt-5 flex flex-col gap-2">
        {business && arrival.link ? (
          <>
            <a href={arrival.link.href} data-testid="onb-arrival-view" className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold" style={{ background: "var(--tl-forest)", color: "var(--tl-forest-on)" }}>
              {t("public.onboarding.arrival.viewMyWebsite")}
            </a>
            <a href={arrival.primary.href} data-testid="onb-arrival-cta" className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold" style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline-strong)" }}>
              {t("public.onboarding.arrival.customizeInBuilder")}
            </a>
          </>
        ) : (
          <a href={arrival.primary.href} data-testid="onb-arrival-cta" className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold" style={{ background: "var(--tl-forest)", color: "var(--tl-forest-on)" }}>
            {cta}
          </a>
        )}
      </div>

      <div className="mt-6" data-testid="onb-next-steps">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.arrival.nextSteps")}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {nextSteps.map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-[0.9375rem]" style={{ color: "var(--tl-ink)" }}>
              <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem]" style={{ background: i === 0 ? "var(--tl-positive)" : "transparent", color: i === 0 ? "#fff" : "var(--tl-muted)", border: i === 0 ? "none" : "1px solid var(--tl-hairline-strong)" }}>{i === 0 ? "✓" : ""}</span>
              {step}
            </li>
          ))}
        </ul>
      </div>
      {arrival.quiet === "own_page_drafted" ? (
        <p className="mt-4 text-center text-[0.75rem]" style={{ color: "var(--tl-muted)" }} data-testid="onb-arrival-quiet">
          {t("public.onboarding.arrival.ownPageDrafted")}
        </p>
      ) : null}
    </div>
  );
}

export function ArrivalFailed({ t, message, onRetry, busy }: { t: (key: string) => string; message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div data-testid="onb-arrival-failed">
      <Title>{t("public.onboarding.arrival.failedTitle")}</Title>
      <Sub>{t("public.onboarding.arrival.failedSub")}</Sub>
      <p className="mt-3 text-[0.8125rem]" style={{ color: "var(--tl-error)" }}>{message}</p>
      <div className="mt-6">
        <PrimaryButton onClick={onRetry} disabled={busy} testId="onb-arrival-retry">{t("public.onboarding.arrival.retry")}</PrimaryButton>
      </div>
    </div>
  );
}
