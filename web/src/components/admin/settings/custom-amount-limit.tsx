"use client";

/**
 * CustomAmountLimit — Settings › Roles & limits: the one per-workspace limit
 * the engine enforces today. A custom amount typed at the counter above
 * `agencies.settings.pos.approval.custom_amount_limit_cents` stays locked
 * until a manager's PIN approves it (`POSCustomAmount`, `POSManagerApproval`);
 * at 0 every custom amount needs a manager.
 *
 * WIRED to `posSetCustomAmountLimit` (`pos_set_custom_amount_limit`, owner /
 * admin / manager only); the current value is read once on mount through
 * `posReadCustomAmountLimit`, so the box shows the setting and not a guess.
 * Money is typed in major units and stored in minor units.
 */

import { useEffect, useState, useTransition } from "react";

import { posReadCustomAmountLimit, posSetCustomAmountLimit } from "@/app/(workspace)/[tenantSlug]/admin/pos/actions";
import { useT } from "@/i18n/use-t";
import { formatOrderMoney, minorUnitDivisor } from "@/lib/orders/money-format";

const K = "dashboard.adminWorkspace.rolesLimits.customAmount";

const REFUSAL: Record<string, string> = {
  not_manager: "dashboard.pos.engine.refusal.not_manager",
  invalid: "dashboard.pos.engine.refusal.invalid",
  not_found: "dashboard.pos.engine.refusal.not_found",
  unavailable: "dashboard.pos.engine.refusal.unavailable",
  not_allowed: "dashboard.pos.engine.refusal.not_allowed",
};

export function CustomAmountLimit({ currency = "USD" }: { currency?: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<{ kind: "saved" } | { kind: "refusal"; key: string } | null>(null);
  const divisor = minorUnitDivisor(currency);

  useEffect(() => {
    let cancelled = false;
    void posReadCustomAmountLimit().then((r) => {
      if (cancelled || !r.ok) return;
      setCurrent(r.limitCents);
      setText((r.limitCents / divisor).toFixed(divisor === 1 ? 0 : 2));
    });
    return () => {
      cancelled = true;
    };
  }, [divisor]);

  const parsed = /^\d+(\.\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim()) * divisor) : null;

  return (
    <div className="border-t border-admin-border-soft pt-[10px]" data-testid="custom-amount-limit">
      <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.heading`)}</div>
      <div className="mt-[2px] text-[11.5px] leading-relaxed text-admin-ink-muted">
        {current === null ? t(`${K}.loading`) : current === 0 ? t(`${K}.everyAmount`) : t(`${K}.current`).replace("{amount}", formatOrderMoney(current, currency))}
      </div>
      <form
        className="mt-[8px] flex flex-wrap items-center gap-[8px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed === null) return;
          setOutcome(null);
          startTransition(async () => {
            const r = await posSetCustomAmountLimit(parsed);
            if (!r.ok) {
              setOutcome({ kind: "refusal", key: REFUSAL[r.reason] ?? "dashboard.pos.engine.refusal.unavailable" });
              return;
            }
            setCurrent(r.limitCents);
            setOutcome({ kind: "saved" });
          });
        }}
      >
        <label className="sr-only" htmlFor="custom-amount-limit">
          {t(`${K}.label`)}
        </label>
        <input
          id="custom-amount-limit"
          inputMode="decimal"
          className="h-[34px] w-[10rem] rounded-[9px] border border-admin-border bg-admin-card px-[10px] text-admin-13 text-admin-ink"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending || current === null}
        />
        <button
          type="submit"
          data-testid="custom-amount-limit-save"
          disabled={pending || parsed === null || parsed === current}
          className="inline-flex h-[34px] items-center rounded-[9px] border border-admin-brand bg-admin-brand px-[14px] text-admin-13 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? t(`${K}.saving`) : t(`${K}.save`)}
        </button>
      </form>
      {outcome?.kind === "saved" ? (
        <p role="status" className="m-0 mt-[6px] text-[11.5px] text-admin-ink-muted">
          {t(`${K}.saved`)}
        </p>
      ) : outcome?.kind === "refusal" ? (
        <p role="alert" className="m-0 mt-[6px] text-[11.5px] text-admin-red">
          {t(outcome.key)}
        </p>
      ) : null}
    </div>
  );
}
