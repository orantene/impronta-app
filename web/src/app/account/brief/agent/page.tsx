/**
 * /account/brief/agent — Account Strategist conversation.
 *
 * Post-signup only. The intake Agent at `/get-started/agent` is anonymous-first;
 * this one requires a session and a Brief, because it is reading an account that
 * already exists and evaluating upgrade triggers against it.
 */

import { redirect } from "next/navigation";
import Link from "next/link";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getRequestLocale } from "@/i18n/request-locale";
import { loadBrief } from "@/lib/tulala/brief-store.server";
import { StrategistChat } from "@/components/tulala/strategist-chat";

export const dynamic = "force-dynamic";

export default async function StrategistPage() {
  if (!isSupabaseConfigured()) redirect("/");

  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=%2Faccount%2Fbrief%2Fagent");

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    redirect("/account/brief");
  }
  if (!(await isResolvedAiChatConfigured())) {
    redirect("/account/brief");
  }

  const brief = await loadBrief({ kind: "profile", profileId: session.user.id });
  if (!brief) redirect("/account/brief");

  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const opening =
    locale === "es"
      ? "Soy tu estratega de cuenta. Cuéntame qué cambió en cómo trabajas: gente nueva, un lugar nuevo, o si ahora solo corres el negocio. Anoto lo que digas en tu brief y solo te propongo un plan pago si la condición ya se cumple."
      : "I am your account strategist. Tell me what changed in how you work: new people, a new place, or that you only run the business now. I will note it in your brief, and I will only raise a paid plan if the condition is already true.";

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-10 sm:py-14">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p
            className="plt-mono mb-2 text-[0.625rem] uppercase tracking-[0.14em]"
            style={{ color: "var(--plt-muted)" }}
          >
            Tulala Agent
          </p>
          <h1
            className="plt-display text-[1.75rem] leading-tight tracking-[-0.03em] sm:text-[2rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {locale === "es" ? "Estratega de cuenta" : "Account strategist"}
          </h1>
        </div>
        <Link
          href="/account/brief"
          className="text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-muted)" }}
        >
          {locale === "es" ? "Ver brief" : "View brief"}
        </Link>
      </div>

      <StrategistChat locale={locale} opening={opening} />
    </div>
  );
}
