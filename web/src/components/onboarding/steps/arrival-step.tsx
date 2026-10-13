"use client";

/**
 * Step 5 · Arrival. One headline, one fact line (only what the stamp
 * proves), one button into the product. The failed variant keeps the
 * person's words and offers a retry.
 */

import type { ArrivalPayload } from "@/lib/onboarding/arrival";
import { ARRIVAL_THUMB_FRAME_NAME } from "@/components/edit-chrome/embedded-frame";

import { finishPlan, type FinishPlan } from "@/lib/onboarding/finish-plan";

import { PrimaryButton, Sub, Title } from "../ui";

/**
 * TUL-16 / TUL-525 · Studio with no provider yet: honest "ready for requests",
 * then the same clear CTA stack as Para mí — Abrir mi panel first, site /
 * customize, then add-member and also-book as real options (not footnotes).
 * Never says "bookable".
 */
function InquiryOnlyArrival({ t, arrival, plan }: { t: (key: string) => string; arrival: ArrivalPayload; plan: Extract<FinishPlan, { kind: "inquiry_only" }> }) {
  return (
    <div data-testid="onb-arrival" data-variant={arrival.variant} data-finish="inquiry_only">
      <div className="mb-3 flex justify-center" aria-hidden>
        <span className="grid size-12 place-items-center rounded-full text-[1.25rem]" style={{ background: "var(--tl-forest-soft)", color: "var(--tl-forest)" }}>✓</span>
      </div>
      <Title size={30}>{t(plan.titleKey)}</Title>
      <Sub>{t(plan.subKey)}</Sub>
      <div className="mt-5 flex flex-col gap-2">
        <a
          href={plan.primary.href}
          data-testid="onb-arrival-panel"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 py-2 text-center text-[0.9375rem] font-semibold"
          style={{ background: "var(--tl-forest)", color: "var(--tl-forest-on)" }}
        >
          {t(plan.primary.labelKey)}
        </a>
        {arrival.link ? (
          <a
            href={arrival.link.href}
            target="_blank"
            rel="noreferrer"
            data-testid="onb-arrival-view"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold"
            style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline-strong)" }}
          >
            {t("public.onboarding.arrival.viewMyWebsite")}
          </a>
        ) : null}
        {arrival.editorHref ? (
          <a
            href={arrival.editorHref}
            data-testid="onb-arrival-cta"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 text-[0.875rem] font-semibold"
            style={{ background: "transparent", color: "var(--tl-ink-soft)" }}
          >
            {t("public.onboarding.arrival.customizeInBuilder")}
          </a>
        ) : null}
        <a
          href={plan.addMember.href}
          data-testid="onb-arrival-add-member"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 text-[0.875rem] font-semibold"
          style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline)" }}
        >
          {t(plan.addMember.labelKey)}
        </a>
        <a
          href={plan.secondary.href}
          data-testid="onb-arrival-also-book"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-6 text-[0.875rem] font-semibold"
          style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline)" }}
        >
          {t(plan.secondary.labelKey)}
        </a>
      </div>
      {arrival.link ? (
        <p className="mt-6 text-center text-[0.8125rem]" style={{ color: "var(--tl-muted)" }} data-testid="onb-arrival-link">
          <a href={arrival.link.href} target="_blank" rel="noreferrer" className="underline underline-offset-2" data-testid="onb-arrival-visit">
            {arrival.link.display}
          </a>
        </p>
      ) : null}
    </div>
  );
}

export function ArrivalStep({ t, arrival, onRetry, busy = false }: { t: (key: string) => string; arrival: ArrivalPayload; onRetry?: () => void; busy?: boolean }) {
  if (arrival.variant === "draft_saved") {
    return <DraftSaved t={t} arrival={arrival} onRetry={onRetry} busy={busy} />;
  }
  const plan = finishPlan(arrival);
  if (plan.kind === "inquiry_only") return <InquiryOnlyArrival t={t} arrival={arrival} plan={plan} />;
  const facts: string[] = [];
  if (arrival.fact.services > 0) facts.push(t("public.onboarding.arrival.factServices").replace("{n}", String(arrival.fact.services)));
  if (arrival.fact.city) facts.push(t("public.onboarding.arrival.factCity").replace("{city}", arrival.fact.city));
  if (arrival.fact.logo) facts.push(t("public.onboarding.arrival.factLogo"));
  if (arrival.fact.hours) facts.push(t("public.onboarding.arrival.factHours"));
  if (arrival.fact.whatsapp) facts.push(t("public.onboarding.arrival.factWhatsapp"));
  if (arrival.fact.menuItems > 0) facts.push(t("public.onboarding.arrival.factMenu").replace("{n}", String(arrival.fact.menuItems)));
  if (arrival.fact.photos) facts.push(t("public.onboarding.arrival.factPhotos"));

  const sub =
    arrival.siteLive ? t("public.onboarding.arrival.talentLiveSub")
    : arrival.variant === "talent" ? t("public.onboarding.arrival.talentSub")
    : arrival.variant === "both" ? t("public.onboarding.arrival.bothSub").replace("{business}", arrival.businessName ?? "")
    : arrival.variant === "business" ? t("public.onboarding.arrival.businessSub").replace("{business}", arrival.businessName ?? "")
    : arrival.variant === "existing_workspace" ? t("public.onboarding.arrival.existingSub")
    : arrival.fallbackReason === "copy" ? t("public.onboarding.arrival.fallbackCopySub")
    : arrival.fallbackReason === "photos" ? t("public.onboarding.arrival.fallbackPhotosSub").replace("{business}", arrival.businessName ?? "")
    : arrival.fallbackReason === "failed" ? t("public.onboarding.arrival.fallbackSub")
    : t("public.onboarding.arrival.businessSub").replace("{business}", arrival.businessName ?? "");
  const cta =
    arrival.primary.label === "open_my_site" ? t("public.onboarding.arrival.openMySite")
    : arrival.primary.label === "finish_my_page" ? t("public.onboarding.arrival.finishMyPage")
    : arrival.primary.label === "open_my_website" ? t("public.onboarding.arrival.openMyWebsite")
    : t("public.onboarding.arrival.openMyWorkspace");

  const business = arrival.variant === "business" || arrival.variant === "both" || arrival.variant === "fallback";
  const title = arrival.variant === "talent" ? t("public.onboarding.arrival.readyTalent") : business ? t("public.onboarding.arrival.readyBusiness") : t("public.onboarding.arrival.youreIn");
  const nextSteps = arrival.siteLive
    ? [t("public.onboarding.arrival.nextTalentLive"), t("public.onboarding.arrival.nextTalentPhotos"), t("public.onboarding.arrival.nextTalentBio")]
    : business
    ? [t("public.onboarding.arrival.nextVisit"), t("public.onboarding.arrival.nextCustomize"), t("public.onboarding.arrival.nextPhotos"), t("public.onboarding.arrival.nextDomain"), t("public.onboarding.arrival.nextPremium")]
    : [t("public.onboarding.arrival.nextTalentPhotos"), t("public.onboarding.arrival.nextTalentBio"), t("public.onboarding.arrival.nextTalentShare")];

  return (
    <div data-testid="onb-arrival" data-variant={arrival.variant}>
      <div className="mb-3 flex justify-center" aria-hidden>
        <span className="grid size-12 place-items-center rounded-full text-[1.25rem]" style={{ background: "var(--tl-forest-soft)", color: "var(--tl-forest)" }}>✓</span>
      </div>
      <Title size={30}>{title}</Title>
      <Sub>{sub}</Sub>
      {arrival.variant === "business" && !arrival.ownerBookable ? (
        <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }} data-testid="onb-arrival-bookings-note">{t("public.onboarding.arrival.bookingsStartStudio")}</p>
      ) : null}
      {arrival.urlDiffers ? (
        <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }} data-testid="onb-arrival-url-differs">{t("public.onboarding.arrival.urlDiffers")}</p>
      ) : null}
      {facts.length ? (
        <p className="mt-3 text-[0.9375rem]" style={{ color: "var(--tl-ink)" }} data-testid="onb-arrival-fact">
          {facts.join(" · ")}
        </p>
      ) : null}

      {arrival.link ? (
        <div className="mt-5 overflow-hidden rounded-[18px]" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid="onb-arrival-link">
          {/* The site itself, framed. A tenant site that refuses framing shows the address card only. Thumbnail only: no pointer events and no inner scrollbar (the link below opens the real page); the site hides its owner bar when framed. */}
          <div className={business ? "relative aspect-[4/3] w-full" : "relative h-28 w-full"} style={{ background: "var(--tl-stone-soft)" }}>
            {/* Under the frame: the site's name, so a slow or refused load never reads as a blank box. */}
            <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="tl-display text-[1.375rem] font-semibold leading-[1.15]" style={{ color: "var(--tl-ink)" }}>{arrival.businessName ?? arrival.headlineName ?? arrival.link.display}</span>
              <span className="text-[0.75rem] uppercase tracking-[0.12em]" style={{ color: "var(--tl-muted)" }}>{arrival.link.display}</span>
            </div>
            {/* A business site is live at once; a talent page goes live after three photos, so it is not framed. */}
            {business ? <iframe name={ARRIVAL_THUMB_FRAME_NAME} title={arrival.link.display} src={arrival.link.href} className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden border-0 bg-transparent" scrolling="no" tabIndex={-1} loading="lazy" sandbox="allow-same-origin allow-scripts" /> : null}
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

      {arrival.firstService && arrival.verified && (arrival.variant === "talent" || arrival.variant === "both") ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid="onb-arrival-service">
          <span className="min-w-0 truncate text-[0.9375rem] font-semibold" style={{ color: "var(--tl-ink)" }}>{arrival.firstService}</span>
          <span aria-hidden className="shrink-0 rounded-full px-3 py-1 text-[0.75rem] font-semibold" style={{ background: "var(--tl-forest)", color: "var(--tl-forest-on)" }}>{t("public.onboarding.arrival.bookPreview")}</span>
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
          <>
            <a href={arrival.primary.href} {...(arrival.siteLive ? { target: "_blank", rel: "noreferrer" } : {})} data-testid="onb-arrival-cta" className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold" style={{ background: "var(--tl-forest)", color: "var(--tl-forest-on)" }}>
              {cta}
            </a>
            {arrival.siteLive ? (
              <a href={arrival.editorHref ?? arrival.finishHref ?? "/talent/today"} data-testid="onb-arrival-finish" className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold" style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline-strong)" }}>
                {t("public.onboarding.arrival.customizeInBuilder")}
              </a>
            ) : null}
          </>
        )}
        {arrival.panelHref ? (
          <a href={arrival.panelHref} data-testid="onb-arrival-panel" className="inline-flex h-11 w-full items-center justify-center rounded-full px-6 text-[0.875rem] font-semibold" style={{ background: "transparent", color: "var(--tl-ink-soft)" }}>
            {t("public.onboarding.arrival.goToPanel")}
          </a>
        ) : null}
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

function DraftSaved({ t, arrival, onRetry, busy }: { t: (key: string) => string; arrival: ArrivalPayload; onRetry?: () => void; busy: boolean }) {
  const studio = arrival.variant === "draft_saved" && arrival.businessName !== null;
  return (
    <DraftBody
      t={t}
      sub={studio ? t("public.onboarding.arrival.draftSubStudio") : t("public.onboarding.arrival.draftSub")}
      onRetry={onRetry}
      busy={busy}
      editorHref={arrival.editorHref}
      panelHref={arrival.panelHref}
      variant="draft_saved"
    />
  );
}

/** The honest state: nothing is claimed live. Retry, open the editor, or leave. */
function DraftBody({ t, sub, message, onRetry, busy, editorHref, panelHref, variant }: { t: (key: string) => string; sub: string; message?: string; onRetry?: () => void; busy: boolean; editorHref?: string; panelHref?: string; variant: string }) {
  return (
    <div data-testid="onb-arrival-failed" data-variant={variant}>
      <Title>{t("public.onboarding.arrival.draftTitle")}</Title>
      <Sub>{sub}</Sub>
      {message ? <p className="mt-3 text-[0.8125rem]" style={{ color: "var(--tl-error)" }}>{message}</p> : null}
      <div className="mt-6 flex flex-col gap-2">
        {onRetry ? <PrimaryButton onClick={onRetry} disabled={busy} testId="onb-arrival-retry">{t("public.onboarding.arrival.retry")}</PrimaryButton> : null}
        {editorHref ? (
          <a href={editorHref} data-testid="onb-arrival-editor" className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold" style={{ background: "transparent", color: "var(--tl-ink)", border: "1px solid var(--tl-hairline-strong)" }}>
            {t("public.onboarding.arrival.openEditor")}
          </a>
        ) : null}
        {panelHref ? (
          <a href={panelHref} data-testid="onb-arrival-panel" className="inline-flex h-11 w-full items-center justify-center rounded-full px-6 text-[0.875rem] font-semibold" style={{ color: "var(--tl-ink-soft)" }}>
            {t("public.onboarding.arrival.goToPanel")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function ArrivalFailed({ t, message, onRetry, busy, editorHref }: { t: (key: string) => string; message: string; onRetry: () => void; busy: boolean; editorHref?: string }) {
  return <DraftBody t={t} sub={t("public.onboarding.arrival.draftSub")} message={message} onRetry={onRetry} busy={busy} editorHref={editorHref} variant="failed" />;
}
