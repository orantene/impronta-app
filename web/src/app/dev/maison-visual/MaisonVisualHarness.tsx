"use client";

/**
 * Client mount of shipped Maison setup screens for PDF visual compare.
 * Preview iframes may 401/empty without a real talent — chrome layout is the gate.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ChooseDesignScreen } from "@/components/talent/site/maison-setup/ChooseDesignScreen";
import { ThemeDetailScreen } from "@/components/talent/site/maison-setup/ThemeDetailScreen";
import { CustomColorsPanel } from "@/components/talent/site/maison-setup/CustomColorsPanel";
import { MyWebsiteCard } from "@/components/talent/site/maison-setup/MyWebsiteCard";
import { DesignOptionsPanel } from "@/components/talent/site/maison-setup/DesignOptionsPanel";
import {
  defaultMaisonChoices,
  type MaisonSetupChoices,
} from "@/components/talent/site/maison-setup/maison-choices";
import {
  MAISON_DEFAULT_PALETTE_KEY,
  MAISON_PALETTES,
} from "@/lib/talent-site/theme-catalog/maison/seed";
import { defaultCustomFieldsFromPalette } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";

const STUB_TALENT = "00000000-0000-4000-8000-0000000000mv";

type Screen =
  | "gallery"
  | "detail"
  | "detail-choices"
  | "detail-mine"
  | "detail-phone-colors"
  | "review-chrome"
  | "live-card"
  | "custom-colors"
  | "options-chrome"
  | "finish-card"
  | "unlocked-card";

export function MaisonVisualHarness({ screen }: { screen: string }) {
  const initial = useMemo((): MaisonSetupChoices => {
    const base = defaultMaisonChoices();
    switch (screen as Screen) {
      case "detail-choices":
        return {
          ...base,
          screen: "detail",
          paletteKey: "lilac",
          status: "Choices saved",
        };
      case "detail-mine":
        return {
          ...base,
          screen: "detail",
          contentMode: "mine",
          status: "Choices saved",
        };
      case "detail-phone-colors":
        return {
          ...base,
          screen: "detail",
          phoneSheet: "colors",
          previewDevice: "phone",
        };
      case "detail":
      case "custom-colors":
      case "options-chrome":
        return { ...base, screen: "detail" };
      default:
        return base;
    }
  }, [screen]);

  const [choices, setChoices] = useState<MaisonSetupChoices>(initial);
  const patch = (next: Partial<MaisonSetupChoices>) =>
    setChoices((prev) => ({ ...prev, ...next }));

  const shell = (body: ReactNode) => (
    <div
      data-maison-visual-harness=""
      data-screen={screen}
      className="min-h-screen bg-[var(--color-admin-surface,#FAFAF7)] font-admin-body text-admin-ink"
    >
      {body}
    </div>
  );

  if (screen === "gallery") {
    return shell(
      <ChooseDesignScreen
        locale="en"
        talentProfileId={STUB_TALENT}
        onExplore={() => undefined}
        onBack={() => undefined}
        onClose={() => undefined}
      />,
    );
  }

  if (
    screen === "detail" ||
    screen === "detail-choices" ||
    screen === "detail-mine" ||
    screen === "detail-phone-colors"
  ) {
    return shell(
      <ThemeDetailScreen
        locale="en"
        talentProfileId={STUB_TALENT}
        choices={choices}
        onChange={patch}
        onBackToGallery={() => undefined}
        onClose={() => undefined}
        onAppliedToReview={() => undefined}
      />,
    );
  }

  if (screen === "custom-colors") {
    const pink = MAISON_PALETTES[MAISON_DEFAULT_PALETTE_KEY];
    return shell(
      <div className="relative min-h-screen">
        <ThemeDetailScreen
          locale="en"
          talentProfileId={STUB_TALENT}
          choices={choices}
          onChange={patch}
          onBackToGallery={() => undefined}
          onClose={() => undefined}
          onAppliedToReview={() => undefined}
        />
        <CustomColorsPanel
          locale="en"
          initialFields={defaultCustomFieldsFromPalette(pink)}
          onPreviewFields={() => undefined}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      </div>,
    );
  }

  if (screen === "live-card" || screen === "options-chrome") {
    return shell(
      <div className="mx-auto max-w-[720px] px-4 py-8">
        <MyWebsiteCard
          locale="en"
          publicSiteUrl="https://valemontes.tulala.digital"
          siteSlug="valemontes"
          themeDesignSlug="maison"
          themeLookSlug="maison-lilac-plum"
          publishedAt="2026-09-23T10:40:00.000Z"
          contentModeLabel="mine"
          onChangeDesign={() => undefined}
        />
        {screen === "options-chrome" ? (
          <DesignOptionsPanel
            locale="en"
            open
            onClose={() => undefined}
            onRestoredToReview={() => undefined}
          />
        ) : null}
      </div>,
    );
  }

  if (screen === "review-chrome") {
    // Structural chrome stub matching ReviewWebsiteScreen layout (server
    // readiness needs a seeded talent — not available on this harness).
    return shell(
      <section
        data-testid="maison-review-chrome-stub"
        className="flex min-h-[70vh] flex-col font-admin-body"
      >
        <header className="flex items-center gap-3 border-b border-admin-border-soft px-4 py-3 md:min-h-16">
          <button type="button" className="min-h-11 text-[13.5px] font-semibold">
            ‹ Designs
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Review your website</p>
            <p className="truncate text-[12px] text-admin-ink-muted">
              Maison · Lilac & Plum · Your content
            </p>
          </div>
          <span className="text-[12.5px] font-semibold text-emerald-900">
            ✓ Draft saved
          </span>
          <button type="button" aria-label="Close" className="grid h-11 w-11 place-items-center">
            ✕
          </button>
        </header>
        <div className="flex flex-1 flex-col md:flex-row">
          <div className="min-h-[320px] flex-1 bg-admin-surface-alt p-4">
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-admin-border text-[13px] text-admin-ink-dim">
              Preview frame (requires seeded talent)
            </div>
            <div className="pointer-events-none fixed bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full bg-admin-ink px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg md:absolute md:bottom-6">
              ✓ Design applied to your draft ·{" "}
              <span className="underline">Undo</span>
            </div>
          </div>
          <aside className="flex w-full flex-col border-t border-admin-border-soft bg-white md:w-[360px] md:border-l md:border-t-0">
            <div className="flex-1 space-y-4 px-4 py-4">
              <div className="rounded-xl border border-admin-border-soft p-3">
                <p className="text-[14px] font-semibold">✓ Ready to publish</p>
                <p className="mt-1 text-[13px] text-admin-ink-muted">
                  Your services, photos and contact details are complete.
                </p>
              </div>
              <p className="text-[13px]">
                <span className="font-semibold">Design</span>
                <span className="text-admin-ink-muted"> · </span>
                Maison · Lilac & Plum · Your content
              </p>
              <p className="text-[13px]">
                <span className="font-semibold">Address</span>
                <span className="text-admin-ink-muted"> · </span>
                valemontes.tulala.digital
              </p>
              <p className="text-[12px] text-admin-ink-dim">
                Nothing is public until you publish. After publishing you can
                change the design at any time.
              </p>
            </div>
            <div className="sticky bottom-0 border-t border-admin-border-soft px-4 py-3">
              <button
                type="button"
                className="min-h-12 w-full rounded-xl bg-admin-ink text-[14px] font-semibold text-white"
              >
                Publish
              </button>
            </div>
          </aside>
        </div>
      </section>,
    );
  }

  if (screen === "finish-card") {
    return shell(
      <div className="mx-auto max-w-[480px] px-4 py-8">
        <section
          data-testid="website-finish-card"
          className="mb-3.5 rounded-[14px] border border-admin-border-soft bg-white px-4 py-3.5 font-admin-body"
        >
          <p className="text-[14px] font-bold text-admin-ink">5 of 6 done · 83%</p>
          <p className="mt-1 text-[12.5px] leading-snug text-admin-ink-muted">
            One thing left to unlock your free website: a short intro.
          </p>
          <ul className="mt-2 space-y-1 text-[13px] text-admin-ink">
            <li>✓ Your name and what you do</li>
            <li>✓ Photos of your work</li>
            <li>✓ Things clients can book or ask about</li>
            <li>· A short intro</li>
            <li>✓ When you are available</li>
            <li>✓ Where you work</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-[9px] bg-emerald-900 px-4 py-2.5 text-[12.5px] font-bold text-white"
            >
              ✦ Finish with AI
            </button>
            <button
              type="button"
              className="rounded-[9px] border border-admin-border-soft bg-white px-4 py-2.5 text-[12.5px] font-bold text-admin-ink"
            >
              Write it myself
            </button>
          </div>
        </section>
      </div>,
    );
  }

  if (screen === "unlocked-card") {
    return shell(
      <div className="mx-auto max-w-[480px] px-4 py-8">
        <section
          data-testid="website-unlocked-card"
          className="mb-3.5 rounded-[14px] border border-emerald-900/20 bg-emerald-900/[0.06] px-4 py-3.5 font-admin-body"
        >
          <p className="text-[14px] font-bold text-admin-ink">
            Your free website is unlocked
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-admin-ink-muted">
            Suggested address: valemontes.tulala.digital · checked when you publish
          </p>
          <button
            type="button"
            className="mt-3 rounded-[9px] bg-emerald-900 px-4 py-2.5 text-[12.5px] font-bold text-white"
          >
            Activate your free website
          </button>
        </section>
      </div>,
    );
  }

  return shell(
    <p className="p-8 text-sm text-admin-ink-muted">Unknown screen: {screen}</p>,
  );
}
