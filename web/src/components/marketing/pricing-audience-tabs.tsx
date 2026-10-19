"use client";

/**
 * pricing-audience-tabs.tsx: person / business tabs on /pricing (TUL-1192).
 * Both ladders are server-rendered and passed in; this only flips which panel
 * is visible, so switching never refetches or shifts the page. The first paint
 * follows `?for=` (parsed on the server), and the URL is kept in sync.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { PricingAudience } from "@/lib/pricing/pricing-audience";

export type AudienceTabsCopy = {
  tablist: string;
  person: string;
  business: string;
};

export function PricingAudienceTabs({
  copy,
  initialAudience = "person",
  person,
  business,
}: {
  copy: AudienceTabsCopy;
  initialAudience?: PricingAudience;
  person: ReactNode;
  business: ReactNode;
}) {
  const [audience, setAudience] = useState<PricingAudience>(initialAudience);
  const tabs: { id: PricingAudience; label: string; panel: ReactNode }[] = [
    { id: "person", label: copy.person, panel: person },
    { id: "business", label: copy.business, panel: business },
  ];
  function choose(next: PricingAudience) {
    setAudience(next);
    try {
      const url = new URL(window.location.href);
      if (next === "person") url.searchParams.delete("for");
      else url.searchParams.set("for", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* URL sync is best effort */
    }
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = audience === "person" ? "business" : "person";
    choose(next);
    document.getElementById(`pricing-tab-${next}`)?.focus();
  }
  return (
    <div data-testid="pricing-audience-root" data-audience={audience}>
      <div className="flex w-full justify-center">
        <div
          role="tablist"
          aria-label={copy.tablist}
          className="inline-flex max-w-full items-center gap-1 rounded-full p-1"
          style={{
            background: "var(--plt-bg-raised)",
            border: "1px solid var(--plt-hairline)",
          }}
        >
          {tabs.map((t) => {
            const active = t.id === audience;
            return (
              <button
                key={t.id}
                id={`pricing-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`pricing-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                data-testid={`pricing-tab-${t.id}`}
                onClick={() => choose(t.id)}
                onKeyDown={onKeyDown}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-6"
                style={{
                  background: active ? "var(--plt-ink)" : "transparent",
                  color: active ? "var(--plt-bg)" : "var(--plt-ink-soft)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`pricing-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`pricing-tab-${t.id}`}
          hidden={t.id !== audience}
          className="mt-10"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
