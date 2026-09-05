"use client";

/**
 * PurchaseSheet — the panel a customer actually touches.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS LAST
 * ───────────────────────────────────────
 * The cart, the totals, the step machine and the refusal copy all shipped
 * before this did. Every one of them is unit-testable, and this is the part
 * where "I have not clicked it" has to be said out loud. That ordering was a
 * mistake worth naming in the file it produced: for several days the Front Door
 * had a complete purchase engine and no way for a person to buy anything.
 *
 * WHAT THIS OWNS, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────
 * It owns what the customer sees and the order they see it in. It owns NO
 * rules. Every question of "may they proceed" is answered by `sheet-steps`, and
 * every price by `totals`. When this file and the machine disagree, the machine
 * is right — so this file never asks the same question a second way.
 *
 * Submission is a prop, not an import. The server pipeline re-validates
 * identity, policy and price regardless of anything here, and keeping the call
 * out of the component is what lets the whole panel be driven in a test.
 *
 * THE CURSOR IS DERIVED, NEVER STORED
 * ───────────────────────────────────
 * `viewing` is only ever a request. What renders is
 * `min(viewing, furthestReachableStep(state))`, recomputed from state on every
 * render. Empty the cart while standing on the pay step and the panel returns
 * to the lines step by itself, because the pay step's precondition stopped
 * holding. A stored cursor is how a checkout ends up submittable with nothing
 * in it.
 */

import { useMemo, useState } from "react";

import {
  allowedPaymentChoices,
  applicableSteps,
  canAdvance,
  canAskFirst,
  canSubmit,
  nextStep,
  stepNumber,
  visibleStep,
  type SheetPolicy,
  type SheetState,
  type SheetStep,
} from "@/lib/cart/sheet-steps";
import { cartTotals, depositDueCents, type CartLineInput } from "@/lib/cart/totals";
import { refusalCopy } from "@/lib/cart/refusal-copy";
import type { WordLocale } from "@/lib/words";
import { formatOrderMoney } from "@/lib/orders/money-format";

/**
 * Sheet chrome, en and es together so a missing translation is visible at the
 * point of writing rather than at runtime. The NOUNS are not here: what a line
 * is called ("dish", "ticket", "service") comes from the words engine via
 * `nouns`, because that is the tenant's word and not ours.
 */
const CHROME = {
  lines: { en: "Your order", es: "Tu pedido" },
  when: { en: "When", es: "Cuándo" },
  who: { en: "Who", es: "Quién" },
  pay: { en: "Payment", es: "Pago" },
  done: { en: "Confirmed", es: "Confirmado" },
  step: { en: "Step", es: "Paso" },
  of: { en: "of", es: "de" },
  back: { en: "Back", es: "Atrás" },
  continue: { en: "Continue", es: "Continuar" },
  askFirst: { en: "Ask a question first", es: "Primero, una pregunta" },
  email: { en: "Email", es: "Correo" },
  partySize: { en: "How many people", es: "Cuántas personas" },
  signedIn: { en: "You are signed in.", es: "Tu sesión está iniciada." },
  accountRequired: {
    en: "This one needs an account. Sign in to continue.",
    es: "Esto requiere una cuenta. Inicia sesión para continuar.",
  },
  payFull: { en: "Pay in full", es: "Pagar completo" },
  payDeposit: { en: "Pay a deposit", es: "Pagar un anticipo" },
  payInPerson: { en: "Pay in person", es: "Pagar en persona" },
  total: { en: "Total", es: "Total" },
  dueNow: { en: "Due now", es: "A pagar ahora" },
  submit: { en: "Confirm", es: "Confirmar" },
  working: { en: "Working", es: "Procesando" },
  empty: { en: "Nothing here yet.", es: "Aún no hay nada." },
} as const;

function t(key: keyof typeof CHROME, locale: WordLocale): string {
  return CHROME[key][locale === "es" ? "es" : "en"];
}

function money(cents: number, currency: string, _locale: WordLocale): string {
  // Delegates to the ONE order money formatter. This was the FOURTH rendering
  // of the same money, and the most dangerous, because `Intl` with a locale
  // INVERTS the symbols:
  //
  //   es-MX + MXN  ->  $4,500.00      pesos wearing a dollar sign
  //   es-MX + USD  ->  USD 4,500.00   dollars wearing a code
  //
  // So on the Spanish checkout panel a peso amount looked like dollars while a
  // dollar amount looked like a code — the exact opposite of every other
  // surface, on the one panel a customer touches before paying.
  //
  // Locale is kept in the signature and ignored: an amount of money is not
  // translated, and having it here invited the locale-dependent formatting
  // that caused this.
  return formatOrderMoney(cents, currency);
}

/**
 * A line as the CUSTOMER sees it: what it is called, and how to remove it.
 *
 * Deliberately a superset of `CartLineInput` rather than a replacement for it.
 * `CartLineInput` is the PRICING input and carries only `unitCents` and
 * `units` — no id, no title — because money maths must not depend on display
 * text. This type adds the display half and hands the pricing half straight
 * through, so there is exactly one shape that money is computed from.
 */
export type SheetLine = CartLineInput & {
  readonly id: string;
  readonly title: string;
};

export type PurchaseSheetProps = {
  readonly locale: WordLocale;
  readonly policy: SheetPolicy;
  readonly lines: readonly SheetLine[];
  readonly currency: string;
  /** Integer cents already granted. Priced by the server; displayed here. */
  readonly discountCents?: number;
  /** The tenant's own words, already resolved. Never derived in here. */
  readonly nouns: { readonly item: string; readonly items: string };
  readonly signedIn: boolean;
  /**
   * Submit. Resolves to a refusal REASON CODE, or null when it succeeded. The
   * component never interprets the code; `refusalCopy` owns that mapping, and
   * an unknown code still produces honest copy rather than a blank panel.
   */
  readonly onSubmit: (state: SheetState) => Promise<string | null>;
  /** Opening the chat with this draft attached. Absent means no chat here. */
  readonly onAskFirst?: (state: SheetState) => void;
  readonly onRemoveLine?: (lineId: string) => void;
};

export function PurchaseSheet(props: PurchaseSheetProps) {
  const { locale, policy, lines, nouns } = props;

  const [email, setEmail] = useState("");
  const [partySize, setPartySize] = useState<number | null>(
    policy.needsWhen ? 2 : null,
  );
  const [whenChosen, setWhenChosen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [paymentChoice, setPaymentChoice] =
    useState<SheetState["paymentChoice"]>(null);
  const [viewing, setViewing] = useState<SheetStep>("lines");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const state: SheetState = useMemo(
    () => ({
      lineCount: lines.length,
      whenChosen,
      partySize,
      email,
      signedIn: props.signedIn,
      captchaToken,
      honeypot,
      paymentChoice,
    }),
    [
      lines.length, whenChosen, partySize, email, props.signedIn,
      captchaToken, honeypot, paymentChoice,
    ],
  );

  const steps = applicableSteps(policy);
  // The pricing shape, not the display shape. `cartTotals` takes a discount in
  // cents; the deposit is a separate question answered below.
  const totals = cartTotals(lines, props.discountCents ?? 0);
  const dueNowCents =
    paymentChoice === "deposit" ? depositDueCents(totals, policy.depositPct) : totals.totalCents;

  // THE DERIVED CURSOR. `viewing` is a request; `visibleStep` decides. The rule
  // lives in the machine, not here, so that it is testable and so that this
  // component cannot answer a question about proceeding a second way.
  const current: SheetStep = confirmed ? "done" : visibleStep(viewing, state, policy);

  const number = stepNumber(current, policy);
  const advanceable = canAdvance(current, state, policy);

  async function submit() {
    if (!canSubmit(state, policy) || submitting) return;
    setSubmitting(true);
    setRefusal(null);
    try {
      const reason = await props.onSubmit(state);
      if (reason === null) {
        setConfirmed(true);
        setViewing("done");
      } else {
        // Refusals are shown where the customer is standing. Sending them back
        // to step one to re-enter everything is how a recoverable refusal
        // becomes an abandoned purchase.
        setRefusal(reason);
      }
    } catch {
      setRefusal("unknown");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="purchase-sheet" aria-label={t("lines", locale)}>
      <header className="purchase-sheet__head">
        <h2>{t(current, locale)}</h2>
        {number !== null && current !== "done" ? (
          <p className="purchase-sheet__progress">
            {t("step", locale)} {number} {t("of", locale)} {steps.length - 1}
          </p>
        ) : null}
      </header>

      {refusal !== null ? (
        // One place, one mapping. `refusalCopy` answers for an unknown code
        // too, so a reason we have never seen still reads as a sentence.
        <p className="purchase-sheet__refusal" role="alert">
          {refusalCopy(refusal, locale)}
        </p>
      ) : null}

      {current === "lines" ? (
        <div className="purchase-sheet__lines">
          {lines.length === 0 ? (
            <p>{t("empty", locale)}</p>
          ) : (
            <ul>
              {lines.map((line) => (
                <li key={line.id}>
                  <span>
                    {line.units} × {line.title || nouns.item}
                  </span>
                  <span>{money(line.unitCents * line.units, props.currency, locale)}</span>
                  {props.onRemoveLine ? (
                    <button type="button" onClick={() => props.onRemoveLine?.(line.id)}>
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="purchase-sheet__total">
            {t("total", locale)} {money(totals.totalCents, props.currency, locale)}
          </p>
          {/* Available from the FIRST step with lines and nothing else. Gating
              this behind the who step removes the reason it exists. */}
          {props.onAskFirst && canAskFirst(state) ? (
            <button type="button" onClick={() => props.onAskFirst?.(state)}>
              {t("askFirst", locale)}
            </button>
          ) : null}
        </div>
      ) : null}

      {current === "when" ? (
        <div className="purchase-sheet__when">
          <label>
            {t("partySize", locale)}
            <input
              type="number"
              min={1}
              value={partySize ?? 1}
              onChange={(e) => setPartySize(Number(e.target.value) || null)}
            />
          </label>
          {/* The slot picker itself belongs to Reservations and is passed in by
              the caller in the real surface; this proves the step's gate. */}
          <button type="button" onClick={() => setWhenChosen(true)}>
            {t("continue", locale)}
          </button>
        </div>
      ) : null}

      {current === "who" ? (
        <div className="purchase-sheet__who">
          {props.signedIn ? (
            <p>{t("signedIn", locale)}</p>
          ) : policy.requireAccount ? (
            <p>{t("accountRequired", locale)}</p>
          ) : (
            <>
              <label>
                {t("email", locale)}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {/* Honeypot. Hidden from people, offered to bots. */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="purchase-sheet__hp"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
              {policy.captchaRequired ? (
                <input
                  type="hidden"
                  value={captchaToken}
                  onChange={(e) => setCaptchaToken(e.target.value)}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {current === "pay" ? (
        <div className="purchase-sheet__pay">
          {allowedPaymentChoices(policy).map((choice) => (
            <label key={choice}>
              <input
                type="radio"
                name="payment"
                checked={paymentChoice === choice}
                onChange={() => setPaymentChoice(choice)}
              />
              {choice === "full"
                ? t("payFull", locale)
                : choice === "deposit"
                  ? t("payDeposit", locale)
                  : t("payInPerson", locale)}
            </label>
          ))}
          <p>
            {t("dueNow", locale)}{" "}
            {money(dueNowCents, props.currency, locale)}
          </p>
        </div>
      ) : null}

      {current === "done" ? <p>{t("done", locale)}</p> : null}

      {current !== "done" ? (
        <footer className="purchase-sheet__foot">
          {steps.indexOf(current) > 0 ? (
            <button
              type="button"
              onClick={() => setViewing(steps[steps.indexOf(current) - 1] ?? "lines")}
            >
              {t("back", locale)}
            </button>
          ) : null}
          {current === "pay" ? (
            <button type="button" disabled={!canSubmit(state, policy) || submitting} onClick={submit}>
              {submitting ? t("working", locale) : t("submit", locale)}
            </button>
          ) : (
            <button
              type="button"
              disabled={!advanceable}
              onClick={() => {
                const next = nextStep(current, policy);
                if (next) setViewing(next);
              }}
            >
              {t("continue", locale)}
            </button>
          )}
        </footer>
      ) : null}
    </section>
  );
}
