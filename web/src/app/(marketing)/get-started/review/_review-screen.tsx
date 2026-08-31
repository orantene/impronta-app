"use client";

/**
 * The review screen's interactive shell.
 *
 * A client component because the shape control is a live choice — picking
 * "workspace only" has to hide the talent card immediately, and a server round
 * trip to re-render a radio group would make the screen feel broken.
 *
 * WHAT IS AND IS NOT EDITABLE HERE
 * ────────────────────────────────
 * Shape is editable: talent profile, workspace, or both, plus the workspace's
 * shape when one is included. Those are the decisions a person can reasonably
 * disagree with the engine about, and their disagreement is the most valuable
 * training signal the system collects.
 *
 * Plan is NOT editable here. Not because the visitor should not choose, but
 * because choosing a plan means seeing prices, trials and what each tier
 * includes, and that belongs on a checkout screen rather than squeezed into a
 * summary. The engine's pick is shown with its price and reasoning, and the
 * checkout that follows is where it can be changed.
 */

import { useActionState, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { pickLocale } from "@/lib/i18n/pick-locale";
import type { BriefFact } from "@/lib/tulala/brief-store";
import type { FactCategory } from "@/lib/tulala/fact-keys";
import { factLabel } from "@/lib/tulala/fact-keys";
import type { Recommendation } from "@/lib/tulala/engine";

import { acceptRecommendation, type ReviewActionState } from "./actions";

type PlanView = {
  displayName: string;
  price: string | null;
  trialDays: number | null;
  highlights: string[];
  rosterSeats: number | null;
};

type Shape = "talent_only" | "workspace_only" | "both";

export function ReviewScreen(props: {
  locale: "en" | "es";
  recommendation: Recommendation;
  groups: Array<{ category: FactCategory; facts: BriefFact[] }>;
  knownEmail: string | null;
  isAuthenticated: boolean;
  plans: {
    workspace: PlanView | null;
    talent: PlanView | null;
    sell: "talent" | "workspace" | null;
  };
  footer: ReactNode;
}) {
  const { locale, recommendation, plans } = props;
  const t = (en: string, es: string) => pickLocale(locale, { en, es });

  const recommendedShape = useMemo<Shape>(() => {
    if (recommendation.structure.talentProfile && recommendation.structure.workspace) {
      return "both";
    }
    return recommendation.structure.workspace ? "workspace_only" : "talent_only";
  }, [recommendation.structure.talentProfile, recommendation.structure.workspace]);

  const [shape, setShape] = useState<Shape>(recommendedShape);
  const [workspaceType, setWorkspaceType] = useState<"talent" | "business">(
    recommendation.structure.workspaceType === "talent" ? "talent" : "business",
  );
  const [state, formAction, pending] = useActionState<ReviewActionState, FormData>(
    acceptRecommendation,
    { error: null },
  );

  const wantsWorkspace = shape === "workspace_only" || shape === "both";
  const wantsTalent = shape === "talent_only" || shape === "both";

  // The visitor has not been asked for an email yet if the conversation ended
  // before the capture offer. A workspace needs one; a talent profile is created
  // through the authenticated onboarding flow and does not.
  const needsEmail = wantsWorkspace && !props.knownEmail && !props.isAuthenticated;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
      <header className="mb-10">
        <p
          className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--plt-forest)" }}
        >
          {t("Here is what I would do", "Esto es lo que haría")}
        </p>
        <h1
          className="plt-display text-[1.75rem] leading-[1.15] sm:text-[2.125rem]"
          style={{ color: "var(--plt-ink)", letterSpacing: "-0.03em", fontWeight: 600 }}
        >
          {headline(recommendation, t)}
        </h1>
      </header>

      {recommendation.unresolved ? (
        <UnresolvedNotice unresolved={recommendation.unresolved} t={t} />
      ) : null}

      <Section title={t("Why", "Por qué")}>
        <ul className="space-y-2.5">
          {recommendation.reasons.map((reason) => (
            <li
              key={reason.code}
              className="flex gap-2.5 text-[0.9375rem] leading-relaxed"
              style={{ color: "var(--plt-ink)" }}
            >
              <span aria-hidden style={{ color: "var(--plt-forest)" }}>
                ·
              </span>
              <span>{reason.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <form action={formAction}>
        <input type="hidden" name="shape" value={shape} />
        {wantsWorkspace ? (
          <input type="hidden" name="workspaceType" value={workspaceType} />
        ) : null}

        <Section title={t("What to set up", "Qué preparar")}>
          <div className="space-y-2">
            <ShapeOption
              checked={shape === "talent_only"}
              onSelect={() => setShape("talent_only")}
              label={t("Just my profile", "Solo mi perfil")}
              hint={t(
                "A page about me, in the directory, taking bookings under my own name.",
                "Una página sobre mí, en el directorio, con reservas a mi nombre.",
              )}
              recommended={recommendedShape === "talent_only"}
              recommendedLabel={t("Recommended", "Recomendado")}
            />
            <ShapeOption
              checked={shape === "workspace_only"}
              onSelect={() => setShape("workspace_only")}
              label={t("A workspace for the business", "Un espacio para el negocio")}
              hint={t(
                "A site and a back office under the business name.",
                "Un sitio y una administración con el nombre del negocio.",
              )}
              recommended={recommendedShape === "workspace_only"}
              recommendedLabel={t("Recommended", "Recomendado")}
            />
            <ShapeOption
              checked={shape === "both"}
              onSelect={() => setShape("both")}
              label={t("Both", "Ambos")}
              hint={t(
                "My own profile, and a workspace for the business I run.",
                "Mi perfil propio y un espacio para el negocio que dirijo.",
              )}
              recommended={recommendedShape === "both"}
              recommendedLabel={t("Recommended", "Recomendado")}
            />
          </div>

          {wantsWorkspace ? (
            <div
              className="mt-4 rounded-xl p-4"
              style={{
                background: "color-mix(in srgb, var(--plt-forest) 4%, transparent)",
                border: "1px solid var(--plt-hairline)",
              }}
            >
              <p
                className="mb-2.5 text-[0.8125rem] font-medium"
                style={{ color: "var(--plt-ink)" }}
              >
                {t(
                  "Do clients choose which person they see?",
                  "¿Los clientes eligen a qué persona ven?",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <TypeChip
                  active={workspaceType === "talent"}
                  onSelect={() => setWorkspaceType("talent")}
                  label={t("Yes, they pick a person", "Sí, eligen a una persona")}
                />
                <TypeChip
                  active={workspaceType === "business"}
                  onSelect={() => setWorkspaceType("business")}
                  label={t("No, they book the place", "No, reservan el lugar")}
                />
              </div>
              <p className="mt-2.5 text-[0.75rem] leading-relaxed" style={{ color: "var(--plt-muted)" }}>
                {t(
                  "This decides whether your site shows a team of named people or just the business.",
                  "Esto decide si tu sitio muestra un equipo de personas con nombre o solo el negocio.",
                )}
              </p>
            </div>
          ) : null}
        </Section>

        {(wantsWorkspace && plans.workspace) || (wantsTalent && plans.talent) ? (
          <Section title={t("The plan that fits", "El plan que encaja")}>
            <div className="space-y-3">
              {wantsWorkspace && plans.workspace ? (
                <PlanCard
                  plan={plans.workspace}
                  sold={plans.sell === "workspace"}
                  locale={locale}
                />
              ) : null}
              {wantsTalent && plans.talent ? (
                <PlanCard plan={plans.talent} sold={plans.sell === "talent"} locale={locale} />
              ) : null}
            </div>
            {recommendation.catalogDegraded ? (
              <p className="mt-3 text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
                {t(
                  "Prices are confirmed on the next screen before anything is charged.",
                  "Los precios se confirman en la siguiente pantalla antes de cobrar nada.",
                )}
              </p>
            ) : null}
          </Section>
        ) : null}

        <Section title={t("What I understood", "Lo que entendí")}>
          <dl className="space-y-1.5">
            {props.groups.flatMap((group) =>
              group.facts.map((fact) => (
                <div
                  key={`${group.category}:${fact.factKey}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1"
                  style={{ borderBottom: "1px solid var(--plt-hairline)" }}
                >
                  <dt className="text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
                    {factLabel(fact.factKey)}
                  </dt>
                  <dd
                    className="text-[0.8125rem] font-medium"
                    style={{ color: "var(--plt-ink)" }}
                  >
                    {formatValue(fact.value, locale)}
                    {fact.status !== "confirmed" ? (
                      <span
                        className="ml-1.5 text-[0.6875rem] font-normal"
                        style={{ color: "var(--plt-muted)" }}
                      >
                        {t("(my read)", "(mi lectura)")}
                      </span>
                    ) : null}
                  </dd>
                </div>
              )),
            )}
          </dl>
          <p className="mt-3 text-[0.75rem] leading-relaxed" style={{ color: "var(--plt-muted)" }}>
            {t(
              "All of this stays editable in your settings after you are set up.",
              "Todo esto se puede editar en tus ajustes después de la configuración.",
            )}
          </p>
        </Section>

        {needsEmail ? (
          <Section title={t("Where should this live?", "¿Dónde debe vivir esto?")}>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={t("you@example.com", "tu@ejemplo.com")}
              className="w-full rounded-xl px-3.5 py-2.5 text-[0.9375rem] outline-none"
              style={{
                background: "var(--plt-surface)",
                border: "1px solid var(--plt-hairline)",
                color: "var(--plt-ink)",
              }}
            />
          </Section>
        ) : null}

        {state.error ? (
          <p
            role="alert"
            className="mb-4 rounded-xl px-3.5 py-2.5 text-[0.8125rem]"
            style={{
              background: "color-mix(in srgb, #b42318 8%, transparent)",
              color: "#912018",
            }}
          >
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium transition-opacity disabled:opacity-60"
            style={{ background: "var(--plt-forest)", color: "#fff" }}
          >
            {pending
              ? t("Setting up…", "Preparando…")
              : ctaLabel({ wantsWorkspace, plans, t })}
          </button>
          {props.footer}
        </div>

        <p className="mt-4 text-[0.75rem] leading-relaxed" style={{ color: "var(--plt-muted)" }}>
          {t(
            "Nothing goes live until you say so. Everything we build starts as a draft you review.",
            "Nada se publica hasta que lo digas. Todo lo que construimos empieza como un borrador que revisas.",
          )}
        </p>
      </form>
    </div>
  );
}

function headline(recommendation: Recommendation, t: (en: string, es: string) => string): string {
  const { talentProfile, workspace, workspaceType } = recommendation.structure;
  if (talentProfile && workspace) {
    return t(
      "A profile for you, and a workspace for the business.",
      "Un perfil para ti y un espacio para el negocio.",
    );
  }
  if (workspace) {
    return workspaceType === "business"
      ? t("A workspace for the business.", "Un espacio para el negocio.")
      : t("A workspace with your team on it.", "Un espacio con tu equipo dentro.")
  }
  return t("A profile in your own name.", "Un perfil con tu propio nombre.");
}

function ctaLabel(args: {
  wantsWorkspace: boolean;
  plans: { workspace: PlanView | null; sell: "talent" | "workspace" | null };
  t: (en: string, es: string) => string;
}): string {
  const { wantsWorkspace, plans, t } = args;
  if (wantsWorkspace && plans.sell === "workspace" && plans.workspace?.trialDays) {
    return t(
      `Start my ${plans.workspace.trialDays}-day trial`,
      `Empezar mi prueba de ${plans.workspace.trialDays} días`,
    );
  }
  return t("Set this up", "Preparar esto");
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2
        className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function ShapeOption(props: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  recommended: boolean;
  recommendedLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-pressed={props.checked}
      className="block w-full rounded-xl p-4 text-left transition-colors"
      style={{
        background: props.checked
          ? "color-mix(in srgb, var(--plt-forest) 7%, transparent)"
          : "var(--plt-surface)",
        border: `1px solid ${props.checked ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
      }}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex size-[1.0625rem] shrink-0 items-center justify-center rounded-full"
          style={{
            border: `1.5px solid ${props.checked ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
            background: props.checked ? "var(--plt-forest)" : "transparent",
          }}
        >
          {props.checked ? (
            <span className="size-[0.375rem] rounded-full" style={{ background: "#fff" }} />
          ) : null}
        </span>
        <span className="text-[0.9375rem] font-medium" style={{ color: "var(--plt-ink)" }}>
          {props.label}
        </span>
        {props.recommended ? (
          <span
            className="rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em]"
            style={{
              background: "color-mix(in srgb, var(--plt-forest) 12%, transparent)",
              color: "var(--plt-forest)",
            }}
          >
            {props.recommendedLabel}
          </span>
        ) : null}
      </span>
      <span
        className="mt-1 block pl-[1.5625rem] text-[0.8125rem] leading-relaxed"
        style={{ color: "var(--plt-muted)" }}
      >
        {props.hint}
      </span>
    </button>
  );
}

function TypeChip(props: { active: boolean; onSelect: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-pressed={props.active}
      className="rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors"
      style={{
        background: props.active ? "var(--plt-forest)" : "var(--plt-surface)",
        color: props.active ? "#fff" : "var(--plt-ink)",
        border: `1px solid ${props.active ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
      }}
    >
      {props.label}
    </button>
  );
}

function PlanCard(props: { plan: PlanView; sold: boolean; locale: "en" | "es" }) {
  const { plan, sold, locale } = props;
  const t = (en: string, es: string) => pickLocale(locale, { en, es });

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--plt-surface)",
        border: `1px solid ${sold ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[1rem] font-medium" style={{ color: "var(--plt-ink)" }}>
          {plan.displayName}
        </p>
        <p className="text-[0.875rem]" style={{ color: "var(--plt-muted)" }}>
          {plan.price
            ? plan.trialDays
              ? t(
                  `${plan.trialDays} days free, then ${plan.price}/mo`,
                  `${plan.trialDays} días gratis, luego ${plan.price}/mes`,
                )
              : `${plan.price}${t("/mo", "/mes")}`
            : t("Free", "Gratis")}
        </p>
      </div>
      {plan.highlights.length > 0 ? (
        <ul className="mt-2.5 space-y-1">
          {plan.highlights.map((highlight) => (
            <li
              key={highlight}
              className="flex gap-2 text-[0.8125rem] leading-relaxed"
              style={{ color: "var(--plt-muted)" }}
            >
              <span aria-hidden style={{ color: "var(--plt-forest)" }}>
                ·
              </span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {plan.rosterSeats !== null && plan.rosterSeats > 0 ? (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
          {t(
            `Room for ${plan.rosterSeats} people on the roster`,
            `Espacio para ${plan.rosterSeats} personas en el equipo`,
          )}
        </p>
      ) : null}
    </div>
  );
}

function UnresolvedNotice(props: {
  unresolved: NonNullable<Recommendation["unresolved"]>;
  t: (en: string, es: string) => string;
}) {
  const { unresolved, t } = props;
  return (
    <div
      className="mb-8 rounded-xl p-4"
      style={{
        background: "color-mix(in srgb, var(--plt-forest) 5%, transparent)",
        border: "1px solid var(--plt-hairline)",
      }}
    >
      <p className="text-[0.875rem] leading-relaxed" style={{ color: "var(--plt-ink)" }}>
        {unresolved.kind === "insufficient_evidence"
          ? t(
              "I am working from less than I would like, so treat this as a starting point rather than a verdict. You can change any of it.",
              "Trabajo con menos información de la que me gustaría, así que tómalo como un punto de partida y no como un veredicto. Puedes cambiar cualquier parte.",
            )
          : t(
              "Your setup does not match anything I have seen before, which is interesting. Pick what looks closest and a person will follow up.",
              "Tu caso no coincide con nada que haya visto antes, lo cual es interesante. Elige lo más cercano y una persona te contactará.",
            )}
      </p>
    </div>
  );
}

/**
 * Facts rendered for a human, not for a debugger.
 *
 * Booleans become Yes/No rather than true/false, and enum values lose their
 * underscores. A screen that shows `own_premises` to a salon owner has stopped
 * being a summary and started being a database dump.
 */
function formatValue(value: unknown, locale: "en" | "es"): string {
  if (typeof value === "boolean") {
    return value ? pickLocale(locale, { en: "Yes", es: "Sí" }) : pickLocale(locale, { en: "No", es: "No" });
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string").map(humanize).join(", ");
  }
  if (typeof value === "string") return humanize(value);
  return "—";
}

function humanize(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) return value;
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
