import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SetupStep } from "@/components/onboarding/steps/setup-step";
import type { Essentials } from "@/lib/onboarding/essentials";
import type { FlowLocale } from "@/lib/onboarding/flow";
import type { SetupPayload } from "@/lib/server-actions/onboarding-setup";

export const baseEssentials = (over: Partial<Essentials> = {}): Essentials => ({
  name: "Ana", services: [], hours: null, timezone: null, place: null,
  firstProviderEmail: null, firstProviderName: null, ownerProvides: true, confirmed: false, source: "manual", ...over,
});

/** Server-render step 3 ("Set up the essentials") as the /start wizard shows it. */
export function renderSetup(locale: FlowLocale, setup: Partial<SetupPayload> & { essentials?: Essentials }): string {
  return renderToStaticMarkup(
    createElement(SetupStep, {
      locale, busy: false, saveFailed: false, onSave: () => {},
      setup: { choice: "myself", country: "US", tradeKey: null, saved: false, essentials: baseEssentials(), ...setup },
    }),
  );
}
