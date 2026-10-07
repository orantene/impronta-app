import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { StartFlow } from "@/components/onboarding/start-flow";
import { defaultFlowLocale } from "@/lib/onboarding/flow";
import { isOnboardingChoice } from "@/lib/onboarding/module-state";
import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Tulala",
};

/**
 * Onboarding 1B: the in-app front door. One full-screen flow in 4 steps, in
 * Spanish for es-* browsers and Mexico. No cookie banner, chat bubble or edit
 * overlay: this route renders nothing but the flow.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ choice?: string; lang?: string; promo?: string }>;
}) {
  if (!(await getOnboardingFlags()).onboarding_module_enabled) redirect("/get-started");
  const sp = await searchParams;
  const h = await headers();
  const locale = defaultFlowLocale({
    saved: sp.lang ?? null,
    acceptLanguage: h.get("accept-language"),
    country: h.get("x-vercel-ip-country"),
  });
  const choice = isOnboardingChoice(sp.choice) ? sp.choice : null;
  return <StartFlow initialLocale={locale} startChoice={choice} />;
}
