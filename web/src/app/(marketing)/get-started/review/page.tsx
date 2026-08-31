/**
 * /get-started/review — what we understood, what we suggest, and why.
 *
 * The moment the conversation becomes a commitment. Decision L20 says AI output
 * stays a draft until a human approves it, and this screen IS that approval: the
 * facts are shown as facts, the recommendation is shown with its reasons, and
 * nothing is created until the button is pressed.
 *
 * THREE THINGS IT REFUSES TO DO
 * ─────────────────────────────
 * 1. It does not present the recommendation as a fait accompli. Every visitor
 *    can change the shape, and the change is recorded as telemetry rather than
 *    argued with. An intake that cannot be corrected is a form with extra steps.
 * 2. It does not quote a price from a degraded catalog. `catalogDegraded` means
 *    a source read failed and a default stood in; showing "$29" from a fallback
 *    would be quoting a number nobody will be charged.
 * 3. It does not hide the reasoning. The reasons come from the engine as
 *    user-addressed sentences with the fact keys that produced them, so what is
 *    on screen is the actual decision path and not marketing written next to it.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { loadBrief } from "@/lib/tulala/brief-store.server";
import { factsByCategory } from "@/lib/tulala/brief-store";
import { recommendForBrief } from "@/lib/tulala/engine.server";
import { loadTulalaEntitlements } from "@/lib/tulala/entitlements";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";
import { emailOnLead } from "@/lib/tulala/approve.server";

import { TulalaAgentChrome } from "@/components/tulala/agent-chrome";

import { ReviewScreen } from "./_review-screen";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, {
      en: "What we suggest",
      es: "Lo que sugerimos",
    }),
    robots: { index: false, follow: false },
  };
}

export default async function ReviewPage() {
  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    redirect("/get-started");
  }

  const resolved = await resolveBriefOwner();
  if (!resolved) redirect("/get-started/agent");

  const brief = await loadBrief(resolved.owner);
  // No brief, or a brief with nothing in it, means the visitor arrived here
  // directly. Send them to the conversation rather than showing an empty screen
  // that blames them for it.
  if (!brief || brief.facts.length === 0) redirect("/get-started/agent");

  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const [{ recommendation }, entitlements, knownEmail] = await Promise.all([
    recommendForBrief(brief, {
      scope: { sessionId: resolved.guestSessionId, userId: resolved.userId, locale },
    }),
    loadTulalaEntitlements(),
    emailOnLead(brief.signupLeadId),
  ]);

  const workspacePlan = recommendation.plans.workspace
    ? (entitlements.workspace.find((p) => p.planKey === recommendation.plans.workspace) ?? null)
    : null;
  const talentPlan = recommendation.plans.talent
    ? (entitlements.talent.find((p) => p.planKey === recommendation.plans.talent) ?? null)
    : null;

  return (
    <TulalaAgentChrome locale={locale}>
      <ReviewScreen
        locale={locale}
        recommendation={recommendation}
        groups={factsByCategory(brief)}
        knownEmail={knownEmail}
        isAuthenticated={resolved.isAuthenticated}
        plans={{
          workspace: workspacePlan
            ? {
                displayName: workspacePlan.displayName,
                // Suppressed on a degraded catalog: see the header comment.
                price: recommendation.catalogDegraded ? null : workspacePlan.formattedMonthly,
                trialDays: workspacePlan.trialEnabled ? workspacePlan.trialDays : null,
                highlights: workspacePlan.highlights.slice(0, 4),
                rosterSeats: workspacePlan.rosterSeats,
              }
            : null,
          talent: talentPlan
            ? {
                displayName: talentPlan.displayName,
                price: recommendation.catalogDegraded ? null : talentPlan.formattedMonthly,
                trialDays: talentPlan.trialEnabled ? talentPlan.trialDays : null,
                highlights: talentPlan.highlights.slice(0, 4),
                rosterSeats: talentPlan.rosterSeats,
              }
            : null,
          sell: recommendation.plans.sell,
        }}
        footer={
          <Link
            href={withLocaleHref("/get-started/agent", locale)}
            className="text-[0.8125rem] font-medium underline decoration-dotted underline-offset-4"
            style={{ color: "var(--plt-muted)" }}
          >
            {pickLocale(locale, {
              en: "Not quite right? Keep talking",
              es: "¿No es del todo correcto? Sigamos hablando",
            })}
          </Link>
        }
      />
    </TulalaAgentChrome>
  );
}
